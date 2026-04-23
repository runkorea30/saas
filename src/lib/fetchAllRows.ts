/**
 * Supabase의 기본 1000건 페이지네이션 한도를 우회하여
 * 쿼리 빌더의 모든 결과를 한 번에 가져오는 유틸.
 *
 * 🔴 CLAUDE.md 규칙: 모든 Supabase 목록 조회는 이 함수를 경유할 것.
 *
 * 사용 예:
 *   const orders = await fetchAllRows<OrderRow>(() =>
 *     supabase
 *       .from('orders')
 *       .select('id, customer_id, total_amount, order_date')
 *       .eq('company_id', companyId)
 *       .gte('order_date', startDate)
 *       .lt('order_date', endDate)
 *   );
 */
import type { PostgrestError } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

/** range(from, to)를 지원하는 최소 쿼리 인터페이스. Supabase PostgrestFilterBuilder와 호환. */
type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

export async function fetchAllRows<T>(
  buildQuery: () => RangeableQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  // 1000건씩 반복. 마지막 페이지가 PAGE_SIZE보다 작으면 종료.
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return rows;
}
