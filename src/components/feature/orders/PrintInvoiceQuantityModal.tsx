/**
 * 송장인쇄(다중) 수량 지정 모달.
 *
 * `buildShippingInvoiceRows()` 결과를 리스트로 표시하고 각 행에 몇 개의
 * 별도 운송장 라벨을 만들지 수량 입력. "확인" 시 그 수만큼 복제되어 저장됨.
 *
 * 규칙 4(런코리아 승인):
 * - 수량은 "동일 배송정보로 몇 개의 별도 행(운송장)을 만들 것인가"
 * - 즉 저장 시 한 원본 행 → labelCount 개의 DB 행으로 복제 INSERT
 */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { ShippingInvoiceRow } from '@/utils/shippingInvoiceBuilder';

// ConfirmDialog primary 버튼과 동일 스타일 (var(--brand) + #FDFAF4).
// 이 앱의 다른 확인/저장 버튼과 시각적으로 일관되도록.
const primaryBtn: React.CSSProperties = {
  padding: '0 14px',
  height: 32,
  border: '1px solid var(--brand)',
  borderRadius: 8,
  background: 'var(--brand)',
  color: '#FDFAF4',
  fontFamily: 'var(--font-kr)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  padding: '0 14px',
  height: 32,
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--ink-2)',
  fontFamily: 'var(--font-kr)',
  fontSize: 12.5,
  cursor: 'pointer',
};

function truncateAddress(addr: string, max = 40): string {
  if (!addr) return '';
  if (addr.length <= max) return addr;
  return addr.slice(0, max) + '…';
}

interface Props {
  open: boolean;
  rows: ShippingInvoiceRow[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (labelCounts: number[]) => void;
}

export function PrintInvoiceQuantityModal({
  open,
  rows,
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const [counts, setCounts] = useState<number[]>([]);

  // 모달 열릴 때 rows 길이에 맞춰 기본값 1 로 초기화.
  useEffect(() => {
    if (open) setCounts(rows.map(() => 1));
  }, [open, rows]);

  const total = counts.reduce((s, n) => s + Math.max(1, n || 1), 0);

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="송장인쇄(다중) — 라벨 수량 지정"
      width={720}
      footer={
        <>
          <button type="button" onClick={onClose} style={ghostBtn} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit(counts.map((n) => Math.max(1, n || 1)))}
            style={{
              ...primaryBtn,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            disabled={submitting || rows.length === 0}
          >
            {submitting ? '저장 중…' : `확인 (송장 ${total}장 생성)`}
          </button>
        </>
      }
    >
      {rows.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
          선택된 주문이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 2fr 96px',
              gap: 10,
              padding: '8px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ink-3)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div>수취인명</div>
            <div>거래처명</div>
            <div>주소</div>
            <div style={{ textAlign: 'right' }}>라벨 수량</div>
          </div>
          {rows.map((r, idx) => (
            <div
              key={`${r.sourceOrderIds.join('_')}_${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 2fr 96px',
                gap: 10,
                padding: '8px 10px',
                alignItems: 'center',
                fontSize: 12.5,
                color: 'var(--ink)',
                borderBottom: '1px solid var(--line-2, var(--line))',
              }}
            >
              <div>
                {r.recipientName || <span style={{ color: 'var(--ink-3)' }}>(미지정)</span>}
                {r.isDirect && (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '1px 6px',
                      background: 'var(--warning-soft, #fef3c7)',
                      color: 'var(--warning-ink, #92400e)',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    직송
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--ink-2)' }}>{r.customerName || '-'}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>
                {truncateAddress(r.address)}
              </div>
              <div style={{ textAlign: 'right' }}>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={counts[idx] ?? 1}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setCounts((prev) => {
                      const next = prev.slice();
                      next[idx] = Number.isFinite(v) && v > 0 ? v : 1;
                      return next;
                    });
                  }}
                  disabled={submitting}
                  style={{
                    width: 80,
                    height: 28,
                    padding: '4px 8px',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    textAlign: 'right',
                    fontFamily: 'var(--font-num)',
                    fontSize: 13,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    colorScheme: 'light dark',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
