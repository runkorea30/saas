/**
 * Orders 테이블 조회 훅 (TanStack Query).
 *
 * 🔴 CLAUDE.md §1: 모든 쿼리에 company_id 필터 적용 (RLS + 프론트 이중 방어).
 * 🔴 CLAUDE.md §5: fetchAllRows 경유로 1000건 제한 우회.
 * 🟠 CLAUDE.md §5: 날짜 필터는 .gte(start).lt(end) 형식.
 *
 * 기간(period)만 서버 필터링, 나머지 필터(status/source/customer/검색)는
 * 호출부(Orders 페이지)에서 useMemo로 클라이언트 필터링. 주문 수 수천 건 이내 가정.
 */
import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { DateRange, Order } from '@/types/orders';

const ORDER_SELECT = `
  id,
  order_date,
  total_amount,
  status,
  source,
  memo,
  created_by,
  customer:customers ( id, name, grade ),
  creator:user_profiles ( id, name ),
  items:order_items (
    id, product_id, quantity, unit_price, amount, is_return,
    product:products ( id, code, name )
  )
`;

export interface UseOrdersParams {
  companyId: string | null;
  range: DateRange;
}

export function useOrders({ companyId, range }: UseOrdersParams) {
  return useQuery<Order[]>({
    queryKey: ['orders', companyId, range.start, range.end],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<Order>(() =>
        // Supabase select 문자열로 nested join 사용 → 타입 추론 한계로 any 캐스팅.
        // Phase 3 `supabase gen types`에서 제네릭이 생기면 제거.
        supabase
          .from('orders')
          .select(ORDER_SELECT)
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .gte('order_date', range.start)
          .lt('order_date', range.end)
          .order('order_date', { ascending: false }) as unknown as {
          range(
            from: number,
            to: number,
          ): PromiseLike<{ data: Order[] | null; error: PostgrestError | null }>;
        },
      );
      return rows;
    },
  });
}
