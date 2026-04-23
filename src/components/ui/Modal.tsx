/**
 * 공용 모달.
 *
 * - Portal 로 `document.body` 에 렌더.
 * - ESC / backdrop 클릭으로 닫힘 (busy 시에는 onClose 호출 주체가 무시할 것).
 * - 오픈 시 body scroll 잠금, 닫힘 시 복원.
 * - 오픈 시 모달 콘텐츠에 자동 포커스. 닫히면 원래 포커스로 복귀.
 * - 한글 레이블(닫기 aria-label).
 *
 * props:
 *   - open: 열림 여부
 *   - onClose: 닫기 요청 (ESC / backdrop / X 버튼)
 *   - title: 헤더 제목
 *   - footer: 하단 액션 영역 (옵션)
 *   - width: 컨텐츠 최대 폭 (기본 480)
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    contentRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(20, 15, 12, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '8vh',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: width,
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '84vh',
          outline: 'none',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h2
            className="disp"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {children}
        </div>
        {footer && (
          <footer
            style={{
              padding: '12px 18px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
