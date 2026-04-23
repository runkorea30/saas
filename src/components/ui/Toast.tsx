/**
 * 라이트웨이트 토스트 — Portal 기반, 2.5s 자동 닫힘, 호버 시 타이머 일시정지.
 *
 * 전역 사용 (권장):
 * 1) `main.tsx`에서 `<ToastProvider>` 로 앱을 감싸준다.
 * 2) 컴포넌트에서 `const { showToast } = useToast()` 후
 *    `showToast({ kind: 'success', text: '완료' })` 로 호출.
 *
 * 저수준(`<Toast />`) 은 Provider 내부에서만 사용. 페이지에서 직접 렌더하지 말 것.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMsg {
  kind: ToastKind;
  text: string;
  duration?: number;
}

interface Props extends ToastMsg {
  onClose: () => void;
}

const META: Record<
  ToastKind,
  { icon: typeof CheckCircle; color: string; bg: string; border: string }
> = {
  success: {
    icon: CheckCircle,
    color: 'var(--success)',
    bg: 'var(--success-wash)',
    border: 'var(--success)',
  },
  error: {
    icon: XCircle,
    color: 'var(--danger)',
    bg: 'var(--danger-wash)',
    border: 'var(--danger)',
  },
  info: {
    icon: Info,
    color: 'var(--info)',
    bg: 'var(--info-wash)',
    border: 'var(--info)',
  },
};

export function Toast({ kind, text, duration = 2500, onClose }: Props) {
  const [hover, setHover] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (hover) return;
    timerRef.current = window.setTimeout(() => onClose(), duration);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [hover, duration, onClose]);

  const m = META[kind];
  const Icon = m.icon;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: m.bg,
        color: m.color,
        border: `1px solid ${m.border}`,
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        fontSize: 13,
        fontFamily: 'var(--font-kr)',
        fontWeight: 500,
        maxWidth: 420,
      }}
    >
      <Icon size={15} strokeWidth={1.8} />
      <span>{text}</span>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────── Provider / hook ─────────────────────────────── */

interface ToastContextValue {
  showToast: (msg: ToastMsg) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * 전역 Toast Provider. `main.tsx`에서 앱 루트 바깥쪽에 래핑한다.
 *
 * 단일 슬롯(한 번에 하나) 정책. 새 토스트 호출 시 기존 것을 즉시 교체하고 타이머도 재시작한다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  // 동일 메시지 연속 호출 시에도 Toast 를 remount 해서 타이머를 재시작하기 위한 키.
  const [seq, setSeq] = useState(0);

  const showToast = useCallback((msg: ToastMsg) => {
    setToast(msg);
    setSeq((n) => n + 1);
  }, []);

  const handleClose = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && <Toast key={seq} {...toast} onClose={handleClose} />}
    </ToastContext.Provider>
  );
}

/**
 * 전역 Toast 훅.
 *
 * 사용 예:
 * ```tsx
 * const { showToast } = useToast();
 * showToast({ kind: 'success', text: '저장했습니다' });
 * ```
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return ctx;
}
