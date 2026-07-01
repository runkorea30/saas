/**
 * 공용 타입 (도메인 열거형). Phase 3에서 Supabase 자동생성 타입과 교차 정렬.
 */

export type Role = 'owner' | 'admin' | 'member';

export type PlanId = 'free' | 'starter' | 'pro' | 'business';

export type CompanyStatus = 'trial' | 'active' | 'suspended';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

// 🔴 주문 상태 4단계 체계 (2026-07 개편):
//   received  → 파트너시스템 주문서 전송 시 자동
//   confirmed → OPS 주문내역 행 클릭 시 자동 (또는 수동 입력)
//   processing → 거래명세서 출력 시 자동
//   shipped   → 송장번호 저장 시 자동
// 레거시 값(draft/done/canceled) 은 기존 데이터 보존 목적으로 유지.
export type OrderStatus =
  | 'received'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'draft'
  | 'done'
  | 'canceled';

export type OrderSource = 'manual' | 'portal' | 'ai';

/** ISO8601 날짜(YYYY-MM-DD) 기반 기간 */
export type Period = {
  start: string;
  end: string;
};
