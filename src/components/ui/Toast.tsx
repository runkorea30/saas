/**
 * 간단한 토스트 (페이지 로컬 상태 기반).
 *
 * - 페이지에서 `const [toast, setToast] = useState<ToastMsg|null>(null)` 로 쓰고,
 *   렌더: `{toast && <Toast {...toast} onClose={() => setToast(null)} />}`.
 * - `duration` ms 후 자동 닫힘 (기본 2500). 호버 시 타이머 일시정지.
 * - 🟡 추후 전역 Toast Provider 로 승격 고려 (SESSION_HANDOFF TODO).
 */
import { useEffect, useRef, useState } from 'react';
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
