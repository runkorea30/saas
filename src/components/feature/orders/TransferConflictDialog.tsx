/**
 * 송장대장 이관 시 이미 이관되어 출력 대기 중인 주문이 감지되면 표시하는 확인 모달.
 *
 * §48-확장: 기존에는 error 토스트로 전체 차단만 했으나,
 * 이제 사용자에게 "이미 이관된 항목을 제외하고 나머지만 진행" 옵션을 제공한다.
 *
 * - 취소: 아무 처리 안 함
 * - 이미 이관된 항목 제외하고 진행: 겹치는 주문 id 를 제외 후 나머지만 이관
 *
 * 색상/폰트는 CSS 변수(var(--brand), var(--surface-2), var(--line), var(--ink*))만 사용.
 * 다크모드 3종 테마 자동 대응.
 */
import { Modal } from '@/components/ui/Modal';
import type { ShippingInvoiceDbRow } from '@/hooks/useShippingInvoices';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 이미 미출력 대기 중인 shipping_invoices 행들 (미리보기 표시용) */
  conflicts: ShippingInvoiceDbRow[];
  /** 이관 대상에서 제외될 주문 개수 */
  excludedCount: number;
  /** 이관 대상에서 제외 후 실제 진행될 주문 개수 */
  remainingCount: number;
  /** "제외하고 진행" 클릭 콜백 */
  onProceed: () => void;
  busy?: boolean;
}

export function TransferConflictDialog({
  open,
  onClose,
  conflicts,
  excludedCount,
  remainingCount,
  onProceed,
  busy,
}: Props) {
  const previewLines = conflicts
    .slice(0, 3)
    .map((c) => `${c.customer_name ?? '(?)'} · ${c.recipient_name ?? '(?)'}`);
  const more = conflicts.length > 3 ? conflicts.length - 3 : 0;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="이미 이관된 주문이 포함되어 있습니다"
      width={480}
      footer={
        <>
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            style={{
              height: 32,
              fontSize: 12.5,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid var(--brand)',
              background: 'var(--brand)',
              color: '#FDFAF4',
              fontWeight: 500,
              cursor: busy || remainingCount === 0 ? 'not-allowed' : 'pointer',
              opacity: busy || remainingCount === 0 ? 0.6 : 1,
              fontFamily: 'var(--font-kr)',
            }}
            disabled={busy || remainingCount === 0}
            onClick={onProceed}
          >
            {busy ? '처리 중…' : '이미 이관된 항목 제외하고 진행'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        <p style={{ margin: '0 0 10px' }}>
          선택하신 주문 중{' '}
          <strong style={{ color: 'var(--ink)' }}>{excludedCount}건</strong>이
          이미 송장대장에 이관되어 출력 대기 중입니다.
        </p>
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            fontSize: 12.5,
            color: 'var(--ink-2)',
            marginBottom: 10,
          }}
        >
          {previewLines.map((line, i) => (
            <div key={i} style={{ padding: '2px 0' }}>
              · {line}
            </div>
          ))}
          {more > 0 && (
            <div style={{ padding: '2px 0', color: 'var(--ink-3)' }}>
              · 외 {more}건
            </div>
          )}
        </div>
        <p style={{ margin: 0 }}>
          이미 이관된 항목을 제외하고{' '}
          <strong style={{ color: 'var(--ink)' }}>{remainingCount}건</strong>만
          이관하시겠습니까?
        </p>
      </div>
    </Modal>
  );
}
