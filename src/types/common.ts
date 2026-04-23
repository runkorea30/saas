/**
 * 공용 타입 (도메인 열거형). Phase 3에서 Supabase 자동생성 타입과 교차 정렬.
 */

export type Role = 'owner' | 'admin' | 'member';

export type PlanId = 'free' | 'starter' | 'pro' | 'business';

export type CompanyStatus = 'trial' | 'active' | 'suspended';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

// 🔴 Phase 2: 'canceled' 추가. DB check constraint도 동시 갱신됨
// (migration: phase2_orders_status_canceled_and_dev_anon_select).
export type OrderStatus = 'draft' | 'confirmed' | 'shipped' | 'done' | 'canceled';

export type OrderSource = 'manual' | 'portal' | 'ai';

/** ISO8601 날짜(YYYY-MM-DD) 기반 기간 */
export type Period = {
  start: string;
  end: string;
};
