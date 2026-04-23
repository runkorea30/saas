/**
 * 공용 타입 (도메인 열거형). Phase 3에서 Supabase 자동생성 타입과 교차 정렬.
 */

export type Role = 'owner' | 'admin' | 'member';

export type PlanId = 'free' | 'starter' | 'pro' | 'business';

export type CompanyStatus = 'trial' | 'active' | 'suspended';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

export type OrderStatus = 'draft' | 'confirmed' | 'shipped' | 'done';

export type OrderSource = 'manual' | 'portal' | 'ai';

/** ISO8601 날짜(YYYY-MM-DD) 기반 기간 */
export type Period = {
  start: string;
  end: string;
};
