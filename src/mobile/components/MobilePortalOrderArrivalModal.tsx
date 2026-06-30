/**
 * 모바일 PWA — 거래처 포털 신규 주문 도착 알림 모달.
 *
 * - 화면 중앙 컴팩트 다이얼로그(데스크톱과 달리 모바일 뷰포트 폭에 맞춤).
 * - 연속 도착은 카운트로 묶음 — "[첫업체] 외 N건의 주문이 접수되었습니다".
 * - 확인 시 onConfirm — 부모(MobileLayout)가 주문 목록 캐시 무효화 + 모달 닫기.
 * - 모바일 토큰(var(--m-*)) 만 사용해 OPS 글로벌 토큰과 격리.
 */

interface Props {
  open: boolean;
  firstCustomerName: string;
  additionalCount: number;
  onConfirm: () => void;
}

export function MobilePortalOrderArrivalModal({
  open,
  firstCustomerName,
  additionalCount,
  onConfirm,
}: Props) {
  if (!open) return null;
  const message =
    additionalCount > 0
      ? `${firstCustomerName} 외 ${additionalCount}건의 주문이 접수되었습니다`
      : `${firstCustomerName}의 주문이 접수되었습니다`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onConfirm}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--m-surface)',
          border: '1px solid var(--m-border)',
          borderRadius: 14,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
          padding: '20px 18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--m-text-secondary)',
            letterSpacing: '0.02em',
          }}
        >
          신규 주문 도착
        </div>
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--m-text)',
            fontWeight: 500,
          }}
        >
          {message}
        </div>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          style={{
            height: 42,
            width: '100%',
            borderRadius: 10,
            border: 0,
            background: 'var(--m-primary)',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}
