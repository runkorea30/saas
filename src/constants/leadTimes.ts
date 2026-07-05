/**
 * 리드타임 & 해상수입 카테고리 상수.
 *
 * - 해상 수입(선박) 카테고리: 90일
 * - 그 외 (FedEx 항공): 15일
 *
 * 🔴 재주문점 재계산 RPC(`recalculate_reorder_points`) SQL 과 값이 완전히 일치해야
 *    한다. 카테고리를 추가/변경할 땐 반드시 이 파일과 SQL 마이그레이션을 동시에 갱신.
 * 🟠 발주 예상 위젯(TopNav)·발주서 페이지의 `DEFAULT_EXCLUDED` 도 이 목록과 같아야
 *    한다 (`usePurchaseOrderExcluded.ts`).
 */

export const SEA_IMPORT_CATEGORIES = [
  '2-1.레더다이',
  '2-2.스웨이드다이',
  '3-1.디글레이저',
] as const;

export const SEA_LEAD_TIME_DAYS = 90;
export const FEDEX_LEAD_TIME_DAYS = 15;

/** 최근 6개월(180일) 판매합계 → 일평균 판매 계산의 분모. */
export const SALES_LOOKBACK_DAYS = 180;

/** 카테고리 문자열 → 리드타임(일). */
export function getLeadTimeDays(category: string | null | undefined): number {
  if (!category) return FEDEX_LEAD_TIME_DAYS;
  return (SEA_IMPORT_CATEGORIES as readonly string[]).includes(category)
    ? SEA_LEAD_TIME_DAYS
    : FEDEX_LEAD_TIME_DAYS;
}
