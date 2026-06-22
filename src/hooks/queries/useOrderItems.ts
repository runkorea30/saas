/**
 * 단일 주문의 order_items 평탄화 조회 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §5: fetchAllRows 콜백 경유.
 * 🟠 useOrders JOIN과 별도 캐시 (편집 후 ['order-items', orderId] 만 invalidate).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface OrderItemRow {
  id: string;
  company_id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  deleted_at: string | null;
  product_code: string;
  product_name: string;
  /** products.supply_price (참고용. 등급별 공급가는 grade_X × unit_price 로 계산). */
  supply_price: number;
  /** 거래처 등급(A~E)별 제품 공급율. unit_price × grade_X = 공급가(원). */
  grade_a: number;
  grade_b: number;
  grade_c: number;
  grade_d: number;
  grade_e: number;
}

interface OrderItemJoinRow {
  id: string;
  company_id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  deleted_at: string | null;
  products: {
    code: string;
    name: string;
    supply_price: number;
    grade_a: number | null;
    grade_b: number | null;
    grade_c: number | null;
    grade_d: number | null;
    grade_e: number | null;
  } | null;
}

const ORDER_ITEM_SELECT = `
  id,
  company_id,
  order_id,
  product_id,
  quantity,
  unit_price,
  amount,
  is_return,
  deleted_at,
  products (
    code,
    name,
    supply_price,
    grade_a,
    grade_b,
    grade_c,
    grade_d,
    grade_e
  )
`;

export function useOrderItems(orderId: string | null, companyId: string | null) {
  return useQuery<OrderItemRow[]>({
    queryKey: ['order-items', orderId, companyId],
    enabled: Boolean(orderId) && Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<OrderItemJoinRow>(() =>
        supabase
          .from('order_items')
          .select(ORDER_ITEM_SELECT)
          .eq('company_id', companyId!)
          .eq('order_id', orderId!)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .returns<OrderItemJoinRow[]>(),
      );
      return rows.map((r) => ({
        id: r.id,
        company_id: r.company_id,
        order_id: r.order_id,
        product_id: r.product_id,
        quantity: r.quantity,
        unit_price: r.unit_price,
        amount: r.amount,
        is_return: r.is_return,
        deleted_at: r.deleted_at,
        product_code: r.products?.code ?? '',
        product_name: r.products?.name ?? '',
        supply_price: r.products?.supply_price ?? 0,
        grade_a: r.products?.grade_a ?? 0,
        grade_b: r.products?.grade_b ?? 0,
        grade_c: r.products?.grade_c ?? 0,
        grade_d: r.products?.grade_d ?? 0,
        grade_e: r.products?.grade_e ?? 0,
      }));
    },
  });
}
