/**
 * 거래처 포털 신규 주문 도착 알림 모달.
 *
 * - 화면 중앙 dim + "확인" 버튼 하나.
 * - 짧은 시간에 여러 건이 연속으로 들어오면 카운트로 묶어
 *   "[첫업체] 외 N건의 주문이 접수되었습니다" 로 표시 (모달 중첩/스택 회피).
 * - 확인 시 onConfirm 호출 — 부모(Shell)가 주문 목록 캐시 무효화 + 모달 닫기 책임.
 */
import { Modal } from './ui/Modal';
import { PackagePlus } from 'lucide-react';

interface Props {
  open: boolean;
  firstCustomerName: string;
  additionalCount: number;
  onConfirm: () => void;
}

export function PortalOrderArrivalModal({
  open,
  firstCustomerName,
  additionalCount,
  onConfirm,
}: Props) {
  const message =
    additionalCount > 0
      ? `${firstCustomerName} 외 ${additionalCount}건의 주문이 접수되었습니다`
      : `${firstCustomerName}의 주문이 접수되었습니다`;

  return (
    <Modal
      open={open}
      onClose={onConfirm}
      title="신규 주문 도착"
      width={420}
      footer={
        <button
          type="button"
          style={{
            height: 36,
            fontSize: 13.5,
            padding: '0 24px',
            borderRadius: 8,
            border: '1px solid var(--brand)',
            background: 'var(--brand)',
            color: '#FDFAF4',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-kr)',
          }}
          onClick={onConfirm}
          autoFocus
        >
          확인
        </button>
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '8px 0',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--success-wash)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PackagePlus size={22} strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.55 }}>
          {message}
        </div>
      </div>
    </Modal>
  );
}
