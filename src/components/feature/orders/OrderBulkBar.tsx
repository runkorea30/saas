/**
 * 체크박스 선택된 주문이 1건 이상일 때 하단에 고정되는 일괄 액션 바.
 * 현재는 버튼만 렌더, 실제 액션은 다음 태스크에서 연결.
 */
import { Download, FileText, Printer, Truck, X } from 'lucide-react';

const bulkBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  height: 30,
  border: 'none',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.08)',
  color: 'var(--surface)',
  fontFamily: 'var(--font-kr)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
};

export function OrderBulkBar({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--ink)',
        color: 'var(--surface)',
        padding: '10px 12px 10px 16px',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 60,
        fontFamily: 'var(--font-kr)',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 600 }}>
          {count}
        </span>
        개 선택됨
      </span>
      <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />
      <button type="button" style={bulkBtn}>
        <Truck size={13} /> 일괄 출고
      </button>
      <button type="button" style={bulkBtn}>
        <Printer size={13} /> 송장 인쇄
      </button>
      <button type="button" style={bulkBtn}>
        <Download size={13} /> 엑셀
      </button>
      <button type="button" style={bulkBtn}>
        <FileText size={13} /> 세금계산서
      </button>
      <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />
      <button
        type="button"
        onClick={onClear}
        style={{ ...bulkBtn, color: 'rgba(255,255,255,0.7)' }}
      >
        <X size={13} /> 해제
      </button>
    </div>
  );
}
