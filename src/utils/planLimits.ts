/**
 * 🟠 모든 요금제 한도 체크는 이 파일에만 존재한다 (CLAUDE.md §6).
 * 🔴 subscriptions 상태는 Edge Function 웹훅만 갱신. 프론트에서 직접 수정 금지.
 * 🔴 체험 만료 판정은 서버 시간 기준. 프론트 `new Date()` 신뢰 금지.
 *
 * 구현은 Phase 3에서 완성. 지금은 시그니처만.
 */
import type { PlanId } from '@/types/common';

export type PlanLimits = {
  planId: PlanId;
  maxUsers: number;
  maxProducts: number;
  maxOrdersPerMonth: number;
  hasApiAccess: boolean;
};

/** 현재 회사의 요금제 한도 조회 (plans 테이블 기반). */
export async function getPlanLimits(_companyId: string): Promise<PlanLimits> {
  throw new Error('getPlanLimits: Phase 3에서 구현 예정');
}

/** 사용자 추가 가능 여부 (현재 멤버 수 < maxUsers). */
export async function canAddUser(_companyId: string): Promise<boolean> {
  throw new Error('canAddUser: Phase 3에서 구현 예정');
}

/** 제품 추가 가능 여부 (현재 제품 수 < maxProducts). */
export async function canAddProduct(_companyId: string): Promise<boolean> {
  throw new Error('canAddProduct: Phase 3에서 구현 예정');
}

/** 이번 달 주문 추가 가능 여부 (당월 주문 수 < maxOrdersPerMonth). */
export async function canAddOrderThisMonth(_companyId: string): Promise<boolean> {
  throw new Error('canAddOrderThisMonth: Phase 3에서 구현 예정');
}

/**
 * 체험 기간 만료 여부.
 * 🔴 서버 시간(companies.trial_ends_at + NOW()) 기준으로만 판정.
 */
export async function isTrialExpired(_companyId: string): Promise<boolean> {
  throw new Error('isTrialExpired: Phase 3에서 구현 예정');
}
