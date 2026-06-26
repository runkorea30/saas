/**
 * 택배비 자동추가 4규칙 — 거래처 포털 주문 전송 시 호출.
 *
 * 규칙 (한 거래처 / 같은 날짜 KST 기준):
 *  1. 직송 → 금액 무관 항상 추가
 *  2. 비-직송 + 오늘 기존 비-직송 주문과 합산 >= 10만원 → 새 주문 미추가 + 기존 택배비 제거
 *  3. 비-직송 + 합산 < 10만원 + 기존 주문에 택배비 없음 → 새 주문에 1건 추가
 *  4. 비-직송 + 합산 < 10만원 + 기존 주문에 이미 택배비 있음 → 새 주문 미추가 (중복 방지)
 *
 * 🔴 CLAUDE.md §1: 모든 쿼리에 company_id 필터.
 * 🟠 orders.is_direct_shipping 컬럼이 자동생성 타입에 미반영 → .returns&lt;T&gt;() 로 응답 타입 강제.
 * 🟠 order_items 는 soft delete 정책 → 제거 시 deleted_at = NOW(). total_amount 재계산 시
 *    deleted_at IS NULL 행만 합산.
 */
import { supabase } from '@/lib/supabase';
import { syncOrderTotal } from '@/utils/orderTotal';

export const DELIVERY_FEE_PRODUCT_ID = 'cf9040dd-c363-469d-99d4-bb7eaec6264a';
export const DELIVERY_FEE_AMOUNT = 4000;
export const DELIVERY_FEE_THRESHOLD = 100_000;

export interface DeliveryFeeDecision {
  /** 새 주문에 택배비 행을 추가해야 하는가 */
  addDeliveryFee: boolean;
  /** 기존 주문 중 택배비를 제거할 주문 id (없으면 null) */
  removeDeliveryFeeFromOrderId: string | null;
}

interface TodayOrderRow {
  id: string;
  is_direct_shipping: boolean | null;
  order_items: Array<{ product_id: string; amount: number }>;
}

/**
 * 새 주문의 택배비 추가 여부 + 기존 주문의 택배비 제거 여부를 판단.
 * 외부 부수효과 없음 — 호출자가 결정에 따라 후속 INSERT/UPDATE 수행.
 */
export async function calcDeliveryFee(args: {
  companyId: string;
  customerId: string;
  newOrderAmount: number;
  isDirectShipping: boolean;
}): Promise<DeliveryFeeDecision> {
  // 규칙 1 — 직송은 무조건 추가.
  if (args.isDirectShipping) {
    return { addDeliveryFee: true, removeDeliveryFeeFromOrderId: null };
  }

  // KST 오늘 범위 — 브라우저 로컬타임을 그대로 사용 (포털은 KST 사용자 가정).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('orders')
    .select('id, is_direct_shipping, order_items(product_id, amount)')
    .eq('company_id', args.companyId)
    .eq('customer_id', args.customerId)
    .gte('order_date', todayStart.toISOString())
    .lte('order_date', todayEnd.toISOString())
    .is('deleted_at', null)
    .returns<TodayOrderRow[]>();

  if (error) {
    // 보수적 폴백 — 합산을 확인 못 했으니 새 주문 단독 금액 기준 단순 판단.
    // eslint-disable-next-line no-console
    console.error('[deliveryFee] today orders fetch failed', error);
    return {
      addDeliveryFee: args.newOrderAmount < DELIVERY_FEE_THRESHOLD,
      removeDeliveryFeeFromOrderId: null,
    };
  }

  let existingAmount = 0;
  let deliveryFeeOrderId: string | null = null;

  for (const o of data ?? []) {
    if (o.is_direct_shipping) continue; // 직송 주문은 합산에서 제외
    for (const item of o.order_items ?? []) {
      if (item.product_id === DELIVERY_FEE_PRODUCT_ID) {
        deliveryFeeOrderId = o.id;
      } else {
        existingAmount += Number(item.amount) || 0;
      }
    }
  }

  const total = existingAmount + args.newOrderAmount;

  // 규칙 2 — 합산 >= 임계값 → 추가 안 함 + 기존 택배비 제거.
  if (total >= DELIVERY_FEE_THRESHOLD) {
    return {
      addDeliveryFee: false,
      removeDeliveryFeeFromOrderId: deliveryFeeOrderId,
    };
  }
  // 규칙 3 — 기존 택배비 없으면 추가.
  // 규칙 4 — 기존 택배비 있으면 추가 안 함.
  return {
    addDeliveryFee: deliveryFeeOrderId === null,
    removeDeliveryFeeFromOrderId: null,
  };
}

/**
 * 기존 주문에서 택배비 행을 soft delete 하고 orders.total_amount 재계산.
 * 실패해도 새 주문 INSERT 는 진행하도록 throw 하지 않고 콘솔 로그만 남김.
 */
export async function removeDeliveryFeeFromOrder(args: {
  companyId: string;
  orderId: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  const { error: delErr } = await supabase
    .from('order_items')
    .update({ deleted_at: nowIso })
    .eq('order_id', args.orderId)
    .eq('company_id', args.companyId)
    .eq('product_id', DELIVERY_FEE_PRODUCT_ID)
    .is('deleted_at', null);
  if (delErr) {
    // eslint-disable-next-line no-console
    console.error('[deliveryFee] soft delete failed', delErr);
    return;
  }

  // 🔴 orders.total_amount 재동기화 — 공용 유틸 사용 (SUM 로직 단일화).
  try {
    await syncOrderTotal({
      companyId: args.companyId,
      orderId: args.orderId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[deliveryFee] syncOrderTotal failed', e);
  }
}
