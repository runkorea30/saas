/**
 * 발주서 페이지 전용 통합 쿼리 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §2: 계산식은 calculations.ts 의 calcSalesQty3m / calcSalesQty1m / calcOrderQty.
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 fetchAllRows 경유.
 *
 * 제공하는 데이터:
 * - `products` : 활성 제품 목록 (is_active=true, deleted_at IS NULL)
 * - `salesMap` : product_id → 당월 제외 최근 6개월 판매수량 합 (qty6mExcl)
 * - `stockMap` : product_id → 현재 재고 수량 (useInventoryStock 재활용)
 * - `savedCategories` : 이번 달 draft 발주서로 저장된 카테고리 Set
 *     (purchase_orders.template_id 컬럼을 카테고리명 저장 용도로 재활용)
 * - `categories` : products 의 distinct 카테고리 배열 (정렬됨)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';

interface SoldRow {
  product_id: string;
  quantity: number;
  order: { order_date: string } | null;
}

/**
 * 당월 제외 최근 6개월 윈도우의 product_id 별 판매수량 합.
 * 반품(is_return=true) 제외.
 *
 * 윈도우: [DATE_TRUNC('month', NOW()) - INTERVAL '6 months', DATE_TRUNC('month', NOW()))
 */
async function fetchSalesQty6mExcluding(
  companyId: string,
): Promise<Map<string, number>> {
  const now = new Date();
  // UTC 기준 1일을 사용해 양쪽 경계를 정확히 맞춤 (정확한 월 구분이 목적).
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const sixMonthsBack = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1),
  );

  const rows = await fetchAllRows<SoldRow>(() =>
    supabase
      .from('order_items')
      .select(
        'product_id, quantity, order:orders!inner(order_date, company_id)',
      )
      .eq('company_id', companyId)
      .eq('is_return', false)
      .gte('order.order_date', sixMonthsBack.toISOString())
      .lt('order.order_date', currentMonthStart.toISOString()),
  );

  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.order?.order_date) continue;
    map.set(r.product_id, (map.get(r.product_id) ?? 0) + r.quantity);
  }
  return map;
}

interface POHeaderRow {
  id: string;
  template_id: string | null;
  total_amount: number | null;
}

export interface SavedSnapshot {
  /** 이번 달 draft 발주서로 저장된 카테고리 distinct 셋. */
  categories: Set<string>;
  /** 저장된 발주서들의 total_amount 합 (USD). */
  totalUsd: number;
  /** 저장된 발주서 아이템 중 quantity > 0 인 행 개수. */
  itemCount: number;
}

/**
 * 이번 달 draft 발주서 + 그 아이템 카운트 + total_amount 합산 스냅샷.
 * 🔴 상단 KPI (발주 품목 / 총합계 USD / 저장된 분류) 는 모두 이 함수 결과에서 산출 —
 *    사용자가 입력 중인 미저장 수량은 카운트되지 않는다.
 */
async function fetchSavedSnapshot(companyId: string): Promise<SavedSnapshot> {
  const now = new Date();
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  // 1) 저장된 발주서 헤더 — id / template_id / total_amount
  const orderRows = await fetchAllRows<POHeaderRow>(() =>
    supabase
      .from('purchase_orders')
      .select('id, template_id, total_amount')
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .is('deleted_at', null)
      .gte('po_date', currentMonthStart.toISOString())
      .lt('po_date', nextMonthStart.toISOString()),
  );

  const categories = new Set<string>();
  let totalUsd = 0;
  for (const r of orderRows) {
    if (r.template_id) categories.add(r.template_id);
    totalUsd += Number(r.total_amount ?? 0);
  }

  // 2) 저장된 아이템 중 quantity > 0 카운트 — 발주 품목 수.
  let itemCount = 0;
  if (orderRows.length > 0) {
    const ids = orderRows.map((r) => r.id);
    const { count, error } = await supabase
      .from('purchase_order_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('purchase_order_id', ids)
      .gt('quantity', 0);
    if (error) throw error;
    itemCount = count ?? 0;
  }

  return { categories, totalUsd, itemCount };
}

export interface UsePurchaseOrderResult {
  products: Product[];
  /** product_id → 당월 제외 6개월 판매수량 합. */
  salesMap: Map<string, number>;
  /** product_id → 현재 재고 수량. */
  stockMap: Map<string, number>;
  /** 이번 달 저장된 카테고리 셋. */
  savedCategories: Set<string>;
  /** 🔴 저장된 발주서 아이템 중 quantity > 0 개수 — 상단 KPI "발주 품목" 용. */
  savedItemCount: number;
  /** 🔴 저장된 발주서들의 total_amount 합 (USD) — 상단 KPI "총합계 USD" 용. */
  savedTotalUsd: number;
  categories: string[];
  isLoading: boolean;
  error: Error | null;
}

export function usePurchaseOrder(
  companyId: string | null,
): UsePurchaseOrderResult {
  const productsQuery = useProducts(companyId);
  const stockQuery = useInventoryStock(companyId);
  const salesQuery = useQuery<Map<string, number>>({
    queryKey: ['purchase-order-sales', companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSalesQty6mExcluding(companyId!),
    staleTime: 60_000,
  });
  // 🟠 queryKey 는 호환성 유지를 위해 기존 'saved-categories' 그대로 둔다.
  //    페이지의 invalidate 호출과 동일 키를 공유.
  const savedQuery = useQuery<SavedSnapshot>({
    queryKey: ['purchase-order-saved-categories', companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSavedSnapshot(companyId!),
    staleTime: 15_000,
  });

  const products = (productsQuery.data ?? []).filter((p) => p.is_active);

  const stockMap = new Map<string, number>();
  if (stockQuery.data?.stockByProduct) {
    for (const [pid, info] of stockQuery.data.stockByProduct) {
      stockMap.set(pid, info.current);
    }
  }

  const categorySet = new Set<string>();
  for (const p of products) if (p.category) categorySet.add(p.category);
  const categories = Array.from(categorySet).sort();

  const error =
    (productsQuery.error as Error | null) ??
    (stockQuery.error as Error | null) ??
    (salesQuery.error as Error | null) ??
    (savedQuery.error as Error | null);

  const saved = savedQuery.data;
  return {
    products,
    salesMap: salesQuery.data ?? new Map(),
    stockMap,
    savedCategories: saved?.categories ?? new Set(),
    savedItemCount: saved?.itemCount ?? 0,
    savedTotalUsd: saved?.totalUsd ?? 0,
    categories,
    isLoading:
      productsQuery.isLoading ||
      stockQuery.isLoading ||
      salesQuery.isLoading ||
      savedQuery.isLoading,
    error,
  };
}
