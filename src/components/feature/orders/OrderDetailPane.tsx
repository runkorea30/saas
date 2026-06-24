/**
 * Orders 우측 상세 패널. 선택된 주문이 없으면 placeholder.
 * VAT 역산 + 공급가는 calcSupplyAmount(utils/calculations) 사용 — 부가세 포함 금액 ÷ 1.1.
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany()에서만 조달.
 * 🔴 CLAUDE.md §2: 공급가/VAT 계산은 calcSupplyAmount 단일 진입점.
 * 🟠 편집 모드: useOrderItems 별도 fetch + draft 임시 모델. 저장 후 ['order-items', orderId] / ['orders'] 양쪽 invalidate.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, MoreHorizontal, Tag } from 'lucide-react';
import {
  GradeBadge,
  SourceIcon,
  StatusBadge,
  fmtDateTime,
} from './primitives';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useOrderItems, type OrderItemRow } from '@/hooks/queries/useOrderItems';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
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
  /** 자동완성: { draftId: { col: 'code'|'name', query } } — 현재 포커스된 셀만 드롭다운 표시. */
  const [autoFocus, setAutoFocus] = useState<{
    draftId: string;
    col: 'code' | 'name';
  } | null>(null);

  const { data: orderItems = [], isLoading: itemsLoading } = useOrderItems(
    order?.id ?? null,
    companyId,
  );
  const { data: products = [] } = useProducts(companyId);

  // 자동완성 후보 — 코드/이름 모두 대소문자 무시 부분일치 (includes).
  const suggestions: Product[] = useMemo(() => {
    if (!autoFocus) return [];
    const draft = draftItems.find((d) => d.id === autoFocus.draftId);
    if (!draft) return [];
    if (autoFocus.col === 'code') {
      const q = draft.product_code.trim().toLowerCase();
      if (!q) return [];
      return products
        .filter((p) => p.code.toLowerCase().includes(q))
        .slice(0, 10);
    }
    const q = draft.product_name.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [autoFocus, draftItems, products]);

  if (!order) return <DetailEmpty />;

  const d = new Date(order.order_date);

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

  const applyProductToDraft = (draftId: string, p: Product) => {
    const customerGrade = order?.customer?.grade ?? null;
    const supplyPrice = calcSupplyPriceByCustomerGrade(p.sell_price, customerGrade, {
      grade_a: p.grade_a ?? null,
      grade_b: p.grade_b ?? null,
      grade_c: p.grade_c ?? null,
      grade_d: p.grade_d ?? null,
      grade_e: p.grade_e ?? null,
    });
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
              supply_price: supplyPrice,
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
    setAutoFocus(null);
  };

  const handleCodeQueryChange = (draftId: string, value: string) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? {
              ...item,
              product_code: value,
              // 코드를 직접 수정하면 기존 선택 무효화.
              product_id: null,
              product_name: '',
              sell_price: 0,
              unit_price: 0,
              supply_price: 0,
              amount: 0,
            }
          : item,
      ),
    );
    setAutoFocus({ draftId, col: 'code' });
  };

  const handleNameQueryChange = (draftId: string, value: string) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? {
              ...item,
              product_name: value,
              product_id: null,
              product_code: '',
              sell_price: 0,
              unit_price: 0,
              supply_price: 0,
              amount: 0,
            }
          : item,
      ),
    );
    setAutoFocus({ draftId, col: 'name' });
  };

  /**
   * Enter/Tab 으로 자동완성 확정 — OrderEntryPage 패턴.
   *  1) 정확히 일치하는 제품이 있으면 즉시 적용.
   *  2) 단일 후보 매칭이면 그것을 적용.
   *  3) 아니면 그냥 통과 (블러 효과).
   */
  const handleAutocompleteKeyDown = (
    draftId: string,
    col: 'code' | 'name',
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const draft = draftItems.find((d) => d.id === draftId);
    if (!draft) return;
    const q = (col === 'code' ? draft.product_code : draft.product_name)
      .trim()
      .toLowerCase();
    if (!q) return;
    const field = col === 'code' ? 'code' : 'name';
    const exact = products.find((p) => p[field].toLowerCase() === q);
    const matches = products.filter((p) => p[field].toLowerCase().includes(q));
    const target = exact ?? (matches.length === 1 ? matches[0] : null);
    if (target) {
      e.preventDefault();
      applyProductToDraft(draftId, target);
    }
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

    const newRows = draftItems.filter((item) => item._isNew);
    const unselected = newRows.filter((item) => !item.product_id);
    if (unselected.length > 0) {
      alert('제품을 선택해주세요');
      return;
    }
    const zeroQty = newRows.filter((item) => !item.quantity || item.quantity <= 0);
    if (zeroQty.length > 0) {
      alert('수량을 입력해주세요');
      return;
    }

    setIsSaving(true);
    try {
      const dirtyItems = draftItems.filter((item) => item._dirty);

      for (const item of dirtyItems) {
        if (item._isNew) {
          // 🔴 반품은 quantity/amount 모두 음수로 저장 — calculations.ts 정합성
          //    (OrderEntry RPC와 동일 패턴).
          const sign = item.is_return ? -1 : 1;
          const absQty = Math.abs(item.quantity);
          const { error } = await supabase.from('order_items').insert({
            id: item.id,
            company_id: companyId,
            order_id: item.order_id,
            product_id: item.product_id!,
            quantity: sign * absQty,
            unit_price: item.unit_price,
            amount: sign * absQty * item.unit_price,
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

      // orders.total_amount 재계산: 기존 orderItems + 신규 draft (반품 부호 적용 후).
      const existingTotal = orderItems.reduce((s, it) => s + it.amount, 0);
      const newTotal = newRows.reduce((s, it) => {
        const sign = it.is_return ? -1 : 1;
        return s + sign * Math.abs(it.quantity) * it.unit_price;
      }, 0);
      const { error: totalErr } = await supabase
        .from('orders')
        .update({ total_amount: existingTotal + newTotal })
        .eq('id', order.id)
        .eq('company_id', companyId);
      if (totalErr) throw totalErr;

      await queryClient.invalidateQueries({ queryKey: ['order-items', order.id] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditMode(false);
      setDraftItems([]);
      setAutoFocus(null);
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
            flexWrap: 'wrap',
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
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink)',
              fontFamily: 'var(--font-num)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {order.total_amount.toLocaleString('ko-KR')}원
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleAddReturn}
            className="px-2.5 py-1 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            반품추가
          </button>
          <button
            type="button"
            onClick={handleAddOrderItem}
            className="px-2.5 py-1 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            주문추가
          </button>
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

        {/* 편집 모드 액션 — 행 추가는 헤더 우측 버튼에서. 수량은 항상 인라인 편집(blur autosave). */}
        {editMode && (
          <div className="flex gap-2 mb-3">
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
          </div>
        )}

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

                  const draft = item as OrderItemDraft;
                  const showSuggestForCode =
                    isNewRow &&
                    autoFocus?.draftId === item.id &&
                    autoFocus.col === 'code' &&
                    suggestions.length > 0;
                  const showSuggestForName =
                    isNewRow &&
                    autoFocus?.draftId === item.id &&
                    autoFocus.col === 'name' &&
                    suggestions.length > 0;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-[var(--line-subtle)] hover:bg-[var(--surface-2)] transition-colors ${
                        item.is_return ? 'text-red-500' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 font-mono relative">
                        {isNewRow ? (
                          <>
                            <input
                              type="text"
                              value={draft.product_code}
                              onChange={(e) =>
                                handleCodeQueryChange(item.id, e.target.value)
                              }
                              onFocus={() =>
                                setAutoFocus({ draftId: item.id, col: 'code' })
                              }
                              onBlur={() =>
                                setTimeout(() => {
                                  setAutoFocus((cur) =>
                                    cur?.draftId === item.id && cur.col === 'code'
                                      ? null
                                      : cur,
                                  );
                                }, 120)
                              }
                              onKeyDown={(e) =>
                                handleAutocompleteKeyDown(item.id, 'code', e)
                              }
                              placeholder="코드"
                              className="w-full border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                            />
                            {showSuggestForCode && (
                              <SuggestionList
                                items={suggestions}
                                onPick={(p) => applyProductToDraft(item.id, p)}
                              />
                            )}
                          </>
                        ) : (
                          (item as OrderItemRow).product_code
                        )}
                      </td>
                      <td className="py-1.5 px-2 relative">
                        {isNewRow ? (
                          <>
                            <input
                              type="text"
                              value={draft.product_name}
                              onChange={(e) =>
                                handleNameQueryChange(item.id, e.target.value)
                              }
                              onFocus={() =>
                                setAutoFocus({ draftId: item.id, col: 'name' })
                              }
                              onBlur={() =>
                                setTimeout(() => {
                                  setAutoFocus((cur) =>
                                    cur?.draftId === item.id && cur.col === 'name'
                                      ? null
                                      : cur,
                                  );
                                }, 120)
                              }
                              onKeyDown={(e) =>
                                handleAutocompleteKeyDown(item.id, 'name', e)
                              }
                              placeholder="제품명 검색"
                              className="w-full border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                            />
                            {showSuggestForName && (
                              <SuggestionList
                                items={suggestions}
                                onPick={(p) => applyProductToDraft(item.id, p)}
                              />
                            )}
                          </>
                        ) : (
                          (item as OrderItemRow).product_name
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <input
                          type="number"
                          min={isNewRow ? 1 : 0}
                          value={displayQty === 0 ? '' : displayQty}
                          placeholder={isNewRow ? '수량' : undefined}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const num = raw === '' ? 0 : Number(raw);
                            const safe = Number.isFinite(num) && num >= 0 ? num : 0;
                            if (isNewRow) handleQtyChange(item.id, safe);
                            else handleQtyInput(item.id, safe);
                          }}
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
                        {item.sell_price > 0
                          ? item.sell_price.toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-num">
                        {isNewRow
                          ? draft.supply_price > 0
                            ? draft.supply_price.toLocaleString()
                            : '—'
                          : item.unit_price.toLocaleString()}
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

    </div>
  );
}

function SuggestionList({
  items,
  onPick,
}: {
  items: Product[];
  onPick: (p: Product) => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 2,
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
        zIndex: 20,
        maxHeight: 240,
        overflowY: 'auto',
        minWidth: 280,
      }}
    >
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => {
            // input blur 보다 먼저 발화 — autoFocus 초기화 방지.
            e.preventDefault();
            onPick(p);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--line-subtle)',
            cursor: 'pointer',
            fontSize: 11.5,
            textAlign: 'left',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--brand-wash)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'transparent')
          }
        >
          <span
            style={{
              fontFamily: 'monospace',
              color: 'var(--ink-3)',
              minWidth: 90,
            }}
          >
            {p.code}
          </span>
          <span style={{ color: 'var(--ink)', flex: 1 }}>{p.name}</span>
          <span
            style={{
              fontFamily: 'var(--font-num)',
              color: 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {p.sell_price.toLocaleString()}
          </span>
        </button>
      ))}
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
    quantity: 0,
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

