/**
 * 주문 합계 동기화 유틸 — `orders.total_amount = SUM(order_items.amount WHERE deleted_at IS NULL)`.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 (RLS + 프론트 이중 방어).
 * 🟠 아이템(order_items)을 INSERT/UPDATE/DELETE 한 직후 반드시 호출해서
 *    `orders.total_amount` 와 `SUM(items.amount)` 의 불일치를 차단한다.
 *    (이전 코드는 클라이언트 상태로 산술 계산해 staleness/부분실패 시 어긋남.)
 * 🟡 캐시 무효화(`['orders']` 등)는 호출 측에서 자체 처리.
 */
import { supabase } from '@/lib/supabase';

export interface SyncOrderTotalArgs {
  companyId: string;
  orderId: string;
}

/**
 * 지정 주문의 `total_amount` 를 현재 `order_items.amount` 합계로 재계산해 UPDATE.
 * 실패 시 Error throw — 호출자가 trycatch 로 처리.
 */
export async function syncOrderTotal(args: SyncOrderTotalArgs): Promise<number> {
  const { companyId, orderId } = args;

  const { data: items, error: selErr } = await supabase
    .from('order_items')
    .select('amount')
    .eq('order_id', orderId)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (selErr) throw selErr;

  const total = (items ?? []).reduce(
    (sum, it) => sum + (Number(it.amount) || 0),
    0,
  );

  const { error: updErr } = await supabase
    .from('orders')
    .update({ total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('company_id', companyId);
  if (updErr) throw updErr;

  return total;
}
