/**
 * 날짜 임계값 유틸 — 유효기간·만료일 등 "며칠 남았는지" 판정용.
 *
 * 🔴 프로젝트 원칙: `toISOString().slice(0,10)` 금지.
 *    로컬 Date 산술로 오늘(자정 기준)과의 일수 차이만 계산.
 */

export interface DaysLeftResult {
  /** 오늘~만료일 사이의 일수 (음수면 이미 지남). */
  daysLeft: number;
  /** dateStr 이 파싱 불가면 true. */
  invalid: boolean;
}

/**
 * dateStr(YYYY-MM-DD 또는 Date 파싱 가능한 문자열) 과 오늘의 일수 차이.
 * 로컬 시간대 자정 기준으로 비교.
 */
export function daysUntil(dateStr: string | null | undefined): DaysLeftResult {
  if (!dateStr) return { daysLeft: Number.POSITIVE_INFINITY, invalid: true };
  const expiry = new Date(dateStr);
  if (Number.isNaN(expiry.getTime())) {
    return { daysLeft: Number.POSITIVE_INFINITY, invalid: true };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diff = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  return { daysLeft: diff, invalid: false };
}

/**
 * dateStr 이 오늘 기준 thresholdDays 이내(만료 포함)에 도래하는지.
 * - daysLeft <= thresholdDays 이면 true (음수·0 포함).
 * - 값이 없거나 파싱 실패면 false.
 */
export function isWithinExpiryThreshold(
  dateStr: string | null | undefined,
  thresholdDays: number,
): boolean {
  const { daysLeft, invalid } = daysUntil(dateStr);
  if (invalid) return false;
  return daysLeft <= thresholdDays;
}

/**
 * dateStr 이 오늘 기준 months 개월 이내(만료 포함)에 도래하는지.
 * setMonth 기반 정확한 개월 계산 — "3개월 이내" 는 오늘 + 3개월 캘린더 날짜까지.
 * - 값이 없거나 파싱 실패면 false.
 */
export function isWithinExpiryMonths(
  dateStr: string | null | undefined,
  months: number,
): boolean {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  if (Number.isNaN(expiry.getTime())) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setMonth(cutoff.getMonth() + months);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() <= cutoff.getTime();
}
