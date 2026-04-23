/**
 * 🟠 모든 프론트 권한 체크는 이 파일에만 존재한다 (CLAUDE.md §3).
 * 🔴 RLS 정책이 백엔드 1차 방어, 이 파일은 UI 가드 (이중 방어).
 *
 * docs/pages.md의 "권한별 접근" 표를 소스로 한다.
 */
import type { Role } from '@/types/common';

/** 읽기: 모든 역할 허용 (로그인 + 회사 멤버십 전제). */
export function canRead(role: Role | null): boolean {
  return role !== null;
}

/** 일반 쓰기(주문·제품·거래처 생성/수정): 모든 역할 허용. */
export function canWrite(role: Role | null): boolean {
  return role !== null;
}

/** 주문/리소스 삭제: owner, admin만 (member 불가). 감사 로그 필수. */
export function canDelete(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** 팀원 초대: owner, admin. */
export function canInviteTeam(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** 요금제 변경·해지: owner 전용. */
export function canChangePlan(role: Role | null): boolean {
  return role === 'owner';
}

/** 회사 정보 수정: owner, admin. */
export function canEditCompany(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** 세금계산서 발행: owner, admin. */
export function canIssueTaxInvoice(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** 거래처 포털 계정 발급: owner, admin. */
export function canIssuePortalAccount(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}
