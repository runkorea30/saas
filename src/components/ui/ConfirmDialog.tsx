/**
 * 공용 확인 다이얼로그 — Modal 위에 빌드.
 *
 * - variant='danger' 는 확인 버튼을 danger 색으로 표시(삭제 플로우).
 * - busy=true 면 버튼 disabled + 로딩 레이블로 전환, 닫기도 무시(onClose 주체 책임).
 * - 한글 레이블 기본값 제공.
 */
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'default' | 'danger';
  onConfirm: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmVariant = 'default',
  onConfirm,
  busy,
}: Props) {
  const danger = confirmVariant === 'danger';
  const confirmBg = danger ? 'var(--danger)' : 'var(--brand)';

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      width={420}
      footer={
        <>
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            style={{
              height: 32,
              fontSize: 12.5,
              padding: '0 14px',
              borderRadius: 8,
              border: `1px solid ${confirmBg}`,
              background: confirmBg,
              color: '#FDFAF4',
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              fontFamily: 'var(--font-kr)',
            }}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </>
      }
    >
      <div
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        {body}
      </div>
    </Modal>
  );
}
