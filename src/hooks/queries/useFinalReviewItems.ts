/**
 * 발주서 "3단계 최종결정" 화면 전용 훅.
 *
 * 이번 달 draft 발주서(모든 카테고리 통합)의 아이템을 purchase_order_items 원본
 * 그대로(id, purchase_order_id, product_id, quantity, original_quantity,
 * unit_price_usd) 조회한다.
 * 2단계 저장 시점에 quantity > 0 이었던 품목만 애초에 insert 되므로 화면에는
 * "발주된 이력이 있는 품목"만 나타나며, 이후 사용자가 최종결정에서 0 으로 바꿔도
 * 행이 유지되도록 quantity 필터는 걸지 않는다.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §5: fetchAllRows 경유 (품목 많을 때 페이지네이션 누락 방지).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface FinalReviewItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  quantity: number;
  originalQuantity: number | null;
  unitPriceUsd: number | null;
}

const FINAL_REVIEW_QUERY_KEY = 'purchase-order-final-review-items';

async function fetchFinalReviewItems(
  companyId: string,
): Promise<FinalReviewItem[]> {
  const now = new Date();
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const orderRows = await fetchAllRows<{ id: string }>(() =>
    supabase
      .from('purchase_orders')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .is('deleted_at', null)
      .gte('po_date', currentMonthStart.toISOString())
      .lt('po_date', nextMonthStart.toISOString()),
  );
  if (orderRows.length === 0) return [];
  const poIds = orderRows.map((r) => r.id);

  // 그 발주서들의 아이템 전체. (quantity=0 도 포함 — 최종결정 화면에서 수량을
  // 0 으로 바꿔도 행이 사라지지 않고 남아있어야 하기 때문. 애초에 이 테이블에는
  // 2단계 저장 시점에 quantity>0 이었던 품목만 insert 되므로 여기서 0 을 걸러내지
  // 않아도 "한 번도 발주 안 한 품목" 이 섞여 들어올 일은 없다.)
  const itemRows = await fetchAllRows<{
    id: string;
    purchase_order_id: string;
    product_id: string;
    quantity: number;
    original_quantity: number | null;
    unit_price_usd: number | null;
  }>(() =>
    supabase
      .from('purchase_order_items')
      .select(
        'id, purchase_order_id, product_id, quantity, original_quantity, unit_price_usd',
      )
      .eq('company_id', companyId)
      .in('purchase_order_id', poIds),
  );

  return itemRows.map((r) => ({
    id: r.id,
    purchaseOrderId: r.purchase_order_id,
    productId: r.product_id,
    quantity: r.quantity,
    originalQuantity: r.original_quantity,
    unitPriceUsd: r.unit_price_usd != null ? Number(r.unit_price_usd) : null,
  }));
}

export function useFinalReviewItems(companyId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery<FinalReviewItem[]>({
    queryKey: [FINAL_REVIEW_QUERY_KEY, companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchFinalReviewItems(companyId!),
    staleTime: 5_000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: [FINAL_REVIEW_QUERY_KEY, companyId],
    });
    // 상단 KPI(savedTotalUsd/savedItemCount) 도 함께 갱신.
    await queryClient.invalidateQueries({
      queryKey: ['purchase-order-saved-categories', companyId],
    });
  };

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    invalidate,
  };
}

/**
 * 특정 purchase_order 의 전체 아이템으로 total_amount 재계산 + 저장.
 * quantity 0 인 행도 합계엔 0 으로 기여하므로 그대로 포함.
 */
async function recomputePurchaseOrderTotal(
  purchaseOrderId: string,
): Promise<void> {
  const { data: items, error: selErr } = await supabase
    .from('purchase_order_items')
    .select('quantity, unit_price_usd')
    .eq('purchase_order_id', purchaseOrderId);
  if (selErr) throw selErr;

  const total = (items ?? []).reduce(
    (s, it) => s + Number(it.quantity ?? 0) * Number(it.unit_price_usd ?? 0),
    0,
  );

  const { error: updErr } = await supabase
    .from('purchase_orders')
    .update({ total_amount: total })
    .eq('id', purchaseOrderId);
  if (updErr) throw updErr;
}

/**
 * 아이템 하나의 quantity 를 갱신하고, 해당 purchase_order 의 total_amount 도
 * 재계산해서 함께 갱신한다.
 * 🔴 최종결정 화면의 자동저장(onBlur) 에서 호출.
 */
export async function updateFinalReviewItemQuantity(
  itemId: string,
  purchaseOrderId: string,
  newQuantity: number,
): Promise<void> {
  const { error: updErr } = await supabase
    .from('purchase_order_items')
    .update({ quantity: newQuantity })
    .eq('id', itemId);
  if (updErr) throw updErr;

  await recomputePurchaseOrderTotal(purchaseOrderId);
}

/**
 * 복구 — 전달된 아이템들을 quantity = original_quantity 로 되돌리고,
 * 영향받은 모든 purchase_order 의 total_amount 를 재계산한다.
 * original_quantity 가 null 인 아이템은 건드리지 않는다.
 */
export async function restoreFinalReviewItems(
  items: FinalReviewItem[],
): Promise<void> {
  const targets = items.filter(
    (it) => it.originalQuantity != null && it.originalQuantity !== it.quantity,
  );
  if (targets.length === 0) return;

  for (const it of targets) {
    // targets 필터에서 originalQuantity != null 이 이미 보장됨.
    const { error } = await supabase
      .from('purchase_order_items')
      .update({ quantity: it.originalQuantity as number })
      .eq('id', it.id);
    if (error) throw error;
  }

  const affectedPoIds = Array.from(
    new Set(targets.map((it) => it.purchaseOrderId)),
  );
  for (const poId of affectedPoIds) {
    await recomputePurchaseOrderTotal(poId);
  }
}
