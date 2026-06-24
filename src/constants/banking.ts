/**
 * 은행거래/정산 도메인 상수.
 *
 * PAYMENT_TOLERANCE_AMOUNT — 차액 허용 오차 (원).
 *   매출-입금 차액의 절대값이 이 값 이하이면 '정산완료'로 간주.
 *   기본 100원 → 십원 단위 절사(최대 90원) 자동 흡수.
 *   추후 회사별 설정 페이지에서 변경 가능하도록 단일 상수로 관리.
 */
export const PAYMENT_TOLERANCE_AMOUNT = 100;
