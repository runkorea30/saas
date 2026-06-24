/**
 * Orders 우측 상세 패널. 선택된 주문이 없으면 placeholder.
 * VAT 역산 + 공급가는 calcSupplyAmount(utils/calculations) 사용 — 부가세 포함 금액 ÷ 1.1.
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany()에서만 조달.
 * 🔴 CLAUDE.md §2: 공급가/VAT 계산은 calcSupplyAmount 단일 진입점.
 * 🟠 편집 모드: useOrderItems 별도 fetch + draft 임시 모델. 저장 후 ['order-items', orderId] / ['orders'] 양쪽 invalidate.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, MoreHorizontal, Printer, Tag, Truck } from 'lucide-react';
import {
  GradeBadge,
  SourceIcon,
  StatusBadge,
  fmtDateTime,
} from './primitives';
import { calcSupplyAmount } from '@/utils/calculations';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useOrderItems, type OrderItemRow } from '@/hooks/queries/useOrderItems';
import { useProducts } from '@/hooks/queries/useProducts';
import type { Order, OrderItemDraft } from '@/types/orders';

export function OrderDetailPane({ order }: { order: Order | null }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  /** 새 행 추가 모드 — 반품추가/주문추가 클릭 시 활성. */
  const [editMode, setEditMode] = useState(false);
  const [draftItems, setDraftItems] = useState<OrderItemDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  /** 수량 인라인 편집의 임시 오버라이드 — blur 시 DB 반영 + 클리어. */
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

  const { data: orderItems = [], isLoading: itemsLoading } = useOrderItems(
    order?.id ?? null,
    companyId,
  );
  const { data: products = [] } = useProducts(companyId);

  if (!order) return <DetailEmpty />;

  const d = new Date(order.order_date);
  const saleSubtotal = order.items.reduce(
    (s, it) => s + (it.is_return ? 0 : it.amount),
    0,
  );
  const returnTotal = order.items.reduce(
    (s, it) => s + (it.is_return ? it.amount : 0),
    0,
  );
  const total = saleSubtotal + returnTotal;
  // 🔴 CLAUDE.md §4: 매출금액은 이미 부가세 포함. 공급가액은 ÷ 1.1로 역산.
  const { vat } = calcSupplyAmount(saleSubtotal);

  // ───── 인라인 수량 편집 (기존 행) — blur 시 자동저장 ─────
  const handleQtyInput = (id: string, raw: number) => {
    setQtyOverrides((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(raw)) }));
  };

  const handleQtyBlur = async (id: string) => {
    if (!order || !companyId) return;
    const nextQty = qtyOverrides[id];
    if (nextQty === undefined) return;
    const item = orderItems.find((i) => i.id === id);
    if (!item || item.quantity === nextQty) {
      // 변경 없음 — 오버라이드만 제거
      setQtyOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const { error } = await supabase
        .from('order_items')
        .update({
          quantity: nextQty,
          amount: nextQty * item.unit_price,
        })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['order-items', order.id] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      console.error('수량 자동저장 실패:', err);
      alert('수량 저장 중 오류가 발생했습니다.');
    } finally {
      setQtyOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // ───── 새 행 추가 모드 ─────
  const handleCancel = () => {
    setDraftItems([]);
    setEditMode(false);
  };

  const handleQtyChange = (id: string, qty: number) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: qty,
              amount: qty * item.unit_price,
              _dirty: true,
            }
          : item,
      ),
    );
  };

  const handleProductSelect = (draftId: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? {
              ...item,
              product_id: p.id,
              product_code: p.code,
              product_name: p.name,
              sell_price: p.sell_price,
              unit_price: p.sell_price,
              supply_price: p.supply_price,
              grade_a: p.grade_a ?? 0,
              grade_b: p.grade_b ?? 0,
              grade_c: p.grade_c ?? 0,
              grade_d: p.grade_d ?? 0,
              grade_e: p.grade_e ?? 0,
              amount: item.quantity * p.sell_price,
              _dirty: true,
            }
          : item,
      ),
    );
  };

  const handleAddReturn = () => {
    if (!companyId || !order) return;
    setEditMode(true);
    setDraftItems((prev) => [
      ...prev,
      createNewDraft({ orderId: order.id, companyId, isReturn: true }),
    ]);
  };

  const handleAddOrderItem = () => {
    if (!companyId || !order) return;
    setEditMode(true);
    setDraftItems((prev) => [
      ...prev,
      createNewDraft({ orderId: order.id, companyId, isReturn: false }),
    ]);
  };

  const handleSave = async () => {
    if (!order || !companyId) return;

    const unselected = draftItems.filter((item) => item._isNew && !item.product_id);
    if (unselected.length > 0) {
      alert(`제품이 선택되지 않은 행이 ${unselected.length}개 있습니다.`);
      return;
    }

    setIsSaving(true);
    try {
      const dirtyItems = draftItems.filter((item) => item._dirty);

      for (const item of dirtyItems) {
        if (item._isNew) {
          const { error } = await supabase.from('order_items').insert({
            id: item.id,
            company_id: companyId,
            order_id: item.order_id,
            product_id: item.product_id!,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.quantity * item.unit_price,
            is_return: item.is_return,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('order_items')
            .update({
              quantity: item.quantity,
              amount: item.quantity * item.unit_price,
            })
            .eq('id', item.id)
            .eq('company_id', companyId);
          if (error) throw error;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['order-items', order.id] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditMode(false);
      setDraftItems([]);
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 일반 모드: orderItems 만 표시 (수량은 인라인 편집).
  // 새 행 추가 모드: orderItems + draftItems (신규 행만 별도 INSERT).
  const displayRows: Array<OrderItemRow | OrderItemDraft> = editMode
    ? [...orderItems, ...draftItems]
    : orderItems;
  const tableTotal = displayRows.reduce((sum, it) => {
    if ((it as OrderItemDraft)._isNew) {
      return sum + (it as OrderItemDraft).quantity * it.unit_price;
    }
    return sum + (it as OrderItemRow).amount;
  }, 0);

  return (
    <div
      className="card-surface"
      style={{ padding: 0, position: 'sticky', top: 24, overflow: 'hidden' }}
    >
      {/* Header — 압축형 */}
      <div
        style={{
          padding: '8px 12px 6px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            ORDER
          </span>
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {order.id.slice(0, 8)}
          </span>
          <StatusBadge status={order.status} />
          <SourceIcon source={order.source} />
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-base ghost"
            style={{ height: 24, fontSize: 11, padding: '0 6px' }}
          >
            <MoreHorizontal size={12} />
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
          }}
        >
          <GradeBadge grade={order.customer?.grade ?? null} size="sm" />
          <h2
            className="disp"
            style={{
              fontSize: 15,
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
            }}
          >
            {order.customer?.name ?? '—'}
          </h2>
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
            }}
          >
            {fmtDateTime(d)}
            {order.creator && ` · ${order.creator.name}`}
          </span>
        </div>
        {order.memo && (
          <div
            style={{
              marginTop: 6,
              padding: '5px 8px',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: 'var(--ink-2)',
            }}
          >
            <Tag size={10} color="var(--ink-3)" strokeWidth={1.6} />
            <span>{order.memo}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {[
          { label: '라인', v: `${order.items.length}건`, bold: false },
          {
            label: '수량',
            v: `${order.items.reduce((s, it) => s + Math.abs(it.quantity), 0)} ea`,
            bold: false,
          },
          {
            label: '총액',
            v: `${order.total_amount.toLocaleString('ko-KR')}원`,
            bold: true,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '6px 12px',
              borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 1,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-num)',
                fontSize: s.bold ? 14 : 12,
                fontWeight: s.bold ? 600 : 500,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* Items: 편집 가능한 6컬럼 테이블 */}
      <div style={{ padding: '14px 20px 8px' }}>
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-num)',
            marginBottom: 8,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>주문 품목</span>
          <span>{displayRows.length}개 라인</span>
        </div>

        {/* 버튼 행 — 수량은 항상 인라인 편집(blur autosave). 행 추가만 별도 모드. */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={handleAddReturn}
            className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            반품추가
          </button>
          <button
            type="button"
            onClick={handleAddOrderItem}
            className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            주문추가
          </button>
          {editMode && (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isSaving ? '저장 중...' : '저장하기'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-3)] hover:bg-[var(--surface-2)] transition-colors ml-auto"
              >
                취소
              </button>
            </>
          )}
        </div>

        {itemsLoading ? (
          <div className="text-xs text-[var(--ink-3)] py-4 text-center">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--line-default)]">
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)] w-20">코드</th>
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)]">제품명</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-14">수량</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">판매가</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">공급가</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">합계</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((item) => {
                  const isNewRow = (item as OrderItemDraft)._isNew === true;
                  // 신규 행: draft.quantity 직접 사용 + handleQtyChange (저장 전 임시)
                  // 기존 행: orderItems.quantity 가 base, qtyOverrides 가 우선
                  const displayQty = isNewRow
                    ? (item as OrderItemDraft).quantity
                    : (qtyOverrides[item.id] ?? item.quantity);
                  const rowAmount = isNewRow
                    ? (item as OrderItemDraft).quantity * item.unit_price
                    : (qtyOverrides[item.id] !== undefined
                        ? qtyOverrides[item.id] * item.unit_price
                        : (item as OrderItemRow).amount);
                  // 🟠 거래처 포털 INSERT 정책: unit_price = 공급가.
                  //    OPS 수동주문입력 INSERT 정책: unit_price = 판매가.
                  //    혼재 가능하나 dogfooding 단계에서는 unit_price 를 공급가로 표시.

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-[var(--line-subtle)] hover:bg-[var(--surface-2)] transition-colors ${
                        item.is_return ? 'text-red-500' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 font-mono">
                        {(item as OrderItemDraft).product_code ??
                          (item as OrderItemRow).product_code}
                      </td>
                      <td className="py-1.5 px-2">
                        {isNewRow ? (
                          <select
                            value={(item as OrderItemDraft).product_id ?? ''}
                            onChange={(e) => handleProductSelect(item.id, e.target.value)}
                            className="w-full border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                          >
                            <option value="">제품 선택</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.code})
                              </option>
                            ))}
                          </select>
                        ) : (
                          (item as OrderItemDraft).product_name ??
                          (item as OrderItemRow).product_name
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={displayQty}
                          onChange={(e) =>
                            isNewRow
                              ? handleQtyChange(item.id, Number(e.target.value))
                              : handleQtyInput(item.id, Number(e.target.value))
                          }
                          onBlur={
                            isNewRow ? undefined : () => handleQtyBlur(item.id)
                          }
                          onFocus={(e) => {
                            e.currentTarget.style.border =
                              '1px solid var(--brand)';
                          }}
                          onBlurCapture={(e) => {
                            e.currentTarget.style.border =
                              '1px solid transparent';
                          }}
                          style={{
                            width: 52,
                            textAlign: 'right',
                            border: '1px solid transparent',
                            borderRadius: 4,
                            padding: '2px 4px',
                            fontSize: 12,
                            background: 'transparent',
                            outline: 'none',
                            color: 'var(--ink)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-num">
                        {(item as OrderItemRow).sell_price > 0
                          ? (item as OrderItemRow).sell_price.toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-num">
                        {item.unit_price.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-2 text-right font-num font-medium">
                        {rowAmount.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--line-strong)]">
                  <td
                    colSpan={5}
                    className="py-2 px-2 text-right text-xs font-medium text-[var(--ink-2)]"
                  >
                    합계
                  </td>
                  <td className="py-2 px-2 text-right text-xs font-medium font-num">
                    {tableTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Totals (뷰 모드 전용) */}
      {!editMode && (
        <div
          style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid var(--line)',
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <TotalRow label="판매 소계" value={saleSubtotal} />
            {returnTotal < 0 && (
              <TotalRow label="반품" value={returnTotal} tone="danger" />
            )}
            <TotalRow label="VAT 포함분 (10%)" value={vat} faded />
            <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>합계</span>
              <span
                style={{
                  fontFamily: 'var(--font-num)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {total.toLocaleString('ko-KR')}
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    fontWeight: 500,
                    marginLeft: 3,
                  }}
                >
                  KRW
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <button
          type="button"
          className="btn-base primary"
          style={{ height: 32, fontSize: 12.5 }}
        >
          <Truck size={13} /> 출고 처리
        </button>
        <button type="button" className="btn-base" style={{ height: 32, fontSize: 12.5 }}>
          <FileText size={13} /> 거래명세서
        </button>
        <button type="button" className="btn-base" style={{ height: 32, fontSize: 12.5 }}>
          <Printer size={13} /> 송장 인쇄
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn-base ghost"
          style={{ height: 32, fontSize: 12.5 }}
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  );
}

function createNewDraft(args: {
  orderId: string;
  companyId: string;
  isReturn: boolean;
}): OrderItemDraft {
  return {
    id: crypto.randomUUID(),
    company_id: args.companyId,
    order_id: args.orderId,
    product_id: null,
    quantity: 1,
    unit_price: 0,
    amount: 0,
    is_return: args.isReturn,
    deleted_at: null,
    product_code: '',
    product_name: '',
    sell_price: 0,
    supply_price: 0,
    grade_a: 0,
    grade_b: 0,
    grade_c: 0,
    grade_d: 0,
    grade_e: 0,
    _dirty: true,
    _isNew: true,
  };
}

function DetailEmpty() {
  return (
    <div
      className="card-surface"
      style={{
        padding: '60px 28px',
        position: 'sticky',
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        color: 'var(--ink-3)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <FileText size={20} color="var(--ink-3)" strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
        주문을 선택해 주세요
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center' }}>
        왼쪽 목록에서 주문을 클릭하면 상세 내용이 여기에 표시됩니다.
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  tone,
  faded,
}: {
  label: string;
  value: number;
  tone?: 'danger';
  faded?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        color: faded ? 'var(--ink-3)' : 'var(--ink-2)',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-num)',
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'danger' ? 'var(--danger)' : 'inherit',
        }}
      >
        {value.toLocaleString('ko-KR')}원
      </span>
    </div>
  );
}
