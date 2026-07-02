/**
 * 발주서 "3단계 최종결정" 패널 — OPS/모바일 공용.
 *
 * - 이번 달 저장된 발주서 전체(카테고리 무관) 에서 발주수량 > 0 인 품목만 표시.
 * - 발주수량 수정 시 onBlur 로 즉시 자동저장 (별도 저장 버튼 없음).
 * - "복구" 버튼 — 2단계(카테고리 저장) 시점의 원래 수량으로 되돌림.
 * - variant='desktop' | 'mobile' 로 스타일만 분기, 로직은 동일.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { RotateCcw, ArrowLeft } from 'lucide-react';
import {
  useFinalReviewItems,
  updateFinalReviewItemQuantity,
  restoreFinalReviewItems,
  type FinalReviewItem,
} from '@/hooks/queries/useFinalReviewItems';
import { useToast } from '@/components/ui/Toast';
import { calcSalesQty1m, calcSalesQty3m } from '@/utils/calculations';

export interface FinalReviewProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface Props {
  companyId: string | null;
  products: FinalReviewProduct[];
  stockMap: Map<string, number>;
  /** product_id → qty6mExcl (usePurchaseOrder.salesMap 과 동일 정의) */
  salesMap: Map<string, number>;
  onBack: () => void;
  variant: 'desktop' | 'mobile';
}

export function FinalReviewPanel({
  companyId,
  products,
  stockMap,
  salesMap,
  onBack,
  variant,
}: Props) {
  const { showToast } = useToast();
  const { items, isLoading, invalidate } = useFinalReviewItems(companyId);
  const [localQty, setLocalQty] = useState<Map<string, number>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState(false);

  // items 가 (재)로드될 때마다 로컬 편집값을 서버값으로 동기화.
  useEffect(() => {
    const next = new Map<string, number>();
    for (const it of items) next.set(it.id, it.quantity);
    setLocalQty(next);
  }, [items]);

  const productMap = new Map(products.map((p) => [p.id, p]));

  const rows = items
    .map((it) => {
      const p = productMap.get(it.productId);
      if (!p) return null;
      return { item: it, product: p };
    })
    .filter(
      (r): r is { item: FinalReviewItem; product: FinalReviewProduct } => !!r,
    )
    .sort((a, b) => a.product.code.localeCompare(b.product.code));

  const isDesktop = variant === 'desktop';

  const handleChange = (itemId: string, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw)));
    const next = new Map(localQty);
    next.set(itemId, !raw.trim() || !Number.isFinite(n) ? 0 : n);
    setLocalQty(next);
  };

  const handleBlur = async (item: FinalReviewItem) => {
    const newQty = localQty.get(item.id) ?? 0;
    if (newQty === item.quantity) return;
    setSavingIds((prev) => new Set(prev).add(item.id));
    try {
      await updateFinalReviewItemQuantity(item.id, item.purchaseOrderId, newQty);
      await invalidate();
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '수량 저장 실패',
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleRestore = async () => {
    if (
      !window.confirm(
        '카테고리 저장 시점의 원래 발주수량으로 되돌리시겠습니까? 최종결정에서 수정한 내용은 사라집니다.',
      )
    )
      return;
    setRestoring(true);
    try {
      await restoreFinalReviewItems(items);
      await invalidate();
      showToast({ kind: 'success', text: '복구 완료' });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '복구 실패',
      });
    } finally {
      setRestoring(false);
    }
  };

  const grandTotal = rows.reduce((s, r) => {
    const qty = localQty.get(r.item.id) ?? r.item.quantity;
    return s + qty * (r.item.unitPriceUsd ?? 0);
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-base"
          style={{ height: 32 }}
        >
          <ArrowLeft size={13} /> 뒤로
        </button>
        <h2
          style={{
            fontSize: isDesktop ? 18 : 15,
            fontWeight: 600,
            margin: 0,
            color: 'var(--ink, #1a1a1a)',
          }}
        >
          3단계 · 최종결정
        </h2>
        <span style={{ fontSize: 12, color: 'var(--ink-3, #888)' }}>
          발주수량이 입력된 품목만 표시 · 수정하면 자동 저장됩니다
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleRestore}
          disabled={restoring || items.length === 0}
          className="btn-base"
          style={{ height: 32 }}
          title="2단계(카테고리 저장) 시점의 원래 수량으로 되돌립니다"
        >
          <RotateCcw size={13} /> {restoring ? '복구 중…' : '복구'}
        </button>
      </div>

      {isLoading && (
        <div style={{ padding: 20, textAlign: 'center' }}>불러오는 중…</div>
      )}

      {!isLoading && rows.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--ink-3, #888)',
          }}
        >
          발주수량이 입력된 저장 품목이 없습니다. 2단계에서 먼저 카테고리를
          저장해주세요.
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid var(--line, #e5e5e5)',
            borderRadius: 8,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: isDesktop ? 13 : 12,
            }}
          >
            <thead>
              <tr style={{ background: 'var(--surface-2, #fafafa)' }}>
                <th style={thStyle}>코드</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>제품명</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>발주수량</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>재고수량</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>판매량(1개월)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>판매량(3개월)</th>
                <th style={thStyle}>단위</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, product }) => {
                const qty6mExcl = salesMap.get(product.id) ?? 0;
                const qty3m = calcSalesQty3m(qty6mExcl);
                const qty1m = calcSalesQty1m(qty3m);
                const stock = stockMap.get(product.id) ?? 0;
                const qty = localQty.get(item.id) ?? item.quantity;
                const lineTotal = qty * (item.unitPriceUsd ?? 0);
                const saving = savingIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    style={{ borderTop: '1px solid var(--line, #e5e5e5)' }}
                  >
                    <td style={tdStyle}>{product.code}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {product.name}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={qty === 0 ? '' : qty}
                        onChange={(e) => handleChange(item.id, e.target.value)}
                        onBlur={() => handleBlur(item)}
                        disabled={saving}
                        style={{
                          width: 72,
                          height: 26,
                          padding: '0 6px',
                          border: '1px solid var(--line-strong, #ccc)',
                          borderRadius: 4,
                          textAlign: 'right',
                          fontSize: 12.5,
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                        }}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {stock.toLocaleString('ko-KR')}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {qty1m.toLocaleString('ko-KR')}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {qty3m.toLocaleString('ko-KR')}
                    </td>
                    <td style={tdStyle}>{product.unit}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontWeight: 600,
                      }}
                    >
                      ${lineTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div
          style={{
            textAlign: 'right',
            fontSize: 12.5,
            color: 'var(--ink-3, #888)',
          }}
        >
          총 {rows.length}품목 · 합계 ${grandTotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  color: 'var(--ink-2, #333)',
};

const tdStyle: CSSProperties = {
  padding: '6px 10px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  color: 'var(--ink)',
};
