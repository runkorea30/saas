/**
 * 거래처 정보 팝업 (읽기 전용) — 주문내역 우클릭 "거래처 정보보기"에서 사용.
 *
 * 🟠 수정 기능 없음(빠른 확인용). 설정>거래처의 상세 편집은 CustomerDetailPane 담당.
 * 🟠 body 직속 포털 오버레이. Escape/배경 클릭으로 닫힘.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { GradeBadge } from '@/components/feature/orders/primitives';
import type { Customer } from '@/hooks/queries/useCustomers';

interface Props {
  customer: Customer | null;
  onClose: () => void;
}

export function CustomerInfoDialog({ customer, onClose }: Props) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!customer) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <GradeBadge grade={customer.grade} size="md" />
          <h2
            className="disp"
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ink)',
              flex: 1,
            }}
          >
            {customer.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="닫기"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              display: 'inline-flex',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 — 라벨/값 리스트 */}
        <div style={{ padding: '14px 20px 20px' }}>
          <InfoRow label="사업자등록번호" value={customer.business_registration_number} />
          <InfoRow label="대표자" value={customer.ceo_name} />
          <InfoRow label="업태" value={customer.business_type} />
          <InfoRow label="종목" value={customer.business_category} />
          <InfoRow label="사업장주소" value={customer.business_address} />
          <InfoRow label="연락처1" value={customer.contact1} />
          <InfoRow label="연락처2" value={customer.contact2} />
          <InfoRow label="이메일" value={customer.email} />
          <InfoRow label="배송지" value={customer.delivery_address} />
          <InfoRow label="정산주기" value={customer.settlement_cycle} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '7px 0',
        borderBottom: '1px solid var(--line)',
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 110,
          flexShrink: 0,
          color: 'var(--ink-3)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span style={{ color: value ? 'var(--ink)' : 'var(--ink-3)', wordBreak: 'break-word' }}>
        {value || '—'}
      </span>
    </div>
  );
}
