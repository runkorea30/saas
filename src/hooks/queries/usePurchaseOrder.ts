/**
 * 발주서 페이지 전용 통합 쿼리 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §2: 집계 로직은 calculations.ts 와 동일 패턴(전 회사 1회 fetch → Map).
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 fetchAllRows 경유.
 *
 * 제공하는 데이터:
 * - `products` : 활성 제품 목록 (is_active=true, deleted_at IS NULL)
 * - `salesMap` : product_id → { qty_3m, qty_1m } (반품 제외, 최근 3/1개월 판매수량)
 * - `stockMap` : product_id → 현재 재고 수량 (useInventoryStock 재활용)
 * - `categories` : 중복 제거된 분류 배열 (정렬됨)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';

export interface SalesAggregate {
  qty_3m: number;
  qty_1m: number;
}

interface SoldRow {
  product_id: string;
  quantity: number;
  order: { order_date: string; deleted_at: string | null } | null;
}

/**
 * 최근 6개월 판매수량을 product_id 별 3개월/1개월 합계로 집계.
 * 반품(is_return=true) 제외, soft-deleted 주문 제외.
 */
async function fetchSalesAggregate(
  companyId: string,
): Promise<Map<string, SalesAggregate>> {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);

  const rows = await fetchAllRows<SoldRow>(() =>
    supabase
      .from('order_items')
      .select(
        'product_id, quantity, order:orders!inner(order_date, company_id, deleted_at)',
      )
      .eq('company_id', companyId)
      .eq('is_return', false)
      .is('deleted_at', null)
      .gte('order.order_date', sixMonthsAgo.toISOString())
      .lt('order.order_date', now.toISOString()),
  );

  const threeMs = threeMonthsAgo.toISOString();
  const oneMs = oneMonthAgo.toISOString();
  const map = new Map<string, SalesAggregate>();
  for (const r of rows) {
    const od = r.order?.order_date;
    if (!od) continue;
    const cur = map.get(r.product_id) ?? { qty_3m: 0, qty_1m: 0 };
    if (od >= threeMs) cur.qty_3m += r.quantity;
    if (od >= oneMs) cur.qty_1m += r.quantity;
    map.set(r.product_id, cur);
  }
  return map;
}

export interface UsePurchaseOrderResult {
  products: Product[];
  salesMap: Map<string, SalesAggregate>;
  stockMap: Map<string, number>;
  categories: string[];
  isLoading: boolean;
  error: Error | null;
}

export function usePurchaseOrder(
  companyId: string | null,
): UsePurchaseOrderResult {
  const productsQuery = useProducts(companyId);
  const stockQuery = useInventoryStock(companyId);
  const salesQuery = useQuery<Map<string, SalesAggregate>>({
    queryKey: ['purchase-order-sales', companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSalesAggregate(companyId!),
    staleTime: 60_000,
  });

  const products = (productsQuery.data ?? []).filter((p) => p.is_active);

  const stockMap = new Map<string, number>();
  if (stockQuery.data?.stockByProduct) {
    for (const [pid, info] of stockQuery.data.stockByProduct) {
      stockMap.set(pid, info.current);
    }
  }

  const categorySet = new Set<string>();
  for (const p of products) {
    if (p.category) categorySet.add(p.category);
  }
  const categories = Array.from(categorySet).sort();

  const error =
    (productsQuery.error as Error | null) ??
    (stockQuery.error as Error | null) ??
    (salesQuery.error as Error | null);

  return {
    products,
    salesMap: salesQuery.data ?? new Map(),
    stockMap,
    categories,
    isLoading:
      productsQuery.isLoading || stockQuery.isLoading || salesQuery.isLoading,
    error,
  };
}
