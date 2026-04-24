/**
 * 수입/매입 계산 유틸 — DB 접근 없는 순수 함수 9종.
 *
 * 🔴 CLAUDE.md §2: 계산 로직은 계산 전용 파일(utils)에만 존재. 페이지/컴포넌트
 *    에서 직접 산술식 금지.
 *
 * 대시 제거 규칙: `normalizeSourceCode("720-01-001") === "72001001"`,
 *                `normalizeSourceCode("992E-20-PAX") === "992E20PAX"`.
 *
 * 0 나누기 방지: `adjustedQty / quantity / exchangeRate / invoiceActualTotalUsd`
 * 중 하나라도 0 이하면 해당 계산은 0 을 반환 → UI 에서 "—" 로 표시.
 *
 * 소숫점 정책: USD 계산은 float 그대로 (표시 단계에서 toFixed(2)),
 *              KRW 는 `inventory_lots.cost_krw` 가 INTEGER 이므로 `Math.round` 로 정수화.
 */
import type { ImportUnit, ImportRow } from '@/types/import';

/** 원본 코드에서 대시(-)를 제거. */
export function normalizeSourceCode(src: string): string {
  return src.replace(/-/g, '');
}

/**
 * 입고수량 기본값. 단위 DZ 면 ×12, EA 면 그대로.
 * 사용자가 UI 에서 override 가능 (그 경우 이 함수는 호출되지 않음).
 */
export function computeAdjustedQuantityDefault(
  qty: number,
  unit: ImportUnit,
): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return unit === 'DZ' ? qty * 12 : qty;
}

/**
 * 수입원가 USD = 합계 USD / (원본) 수량. PDF PRICE 칸과 일치. 표시 전용.
 */
export function computeSourceUnitPriceUsd(
  totalUsd: number,
  quantity: number,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!Number.isFinite(totalUsd)) return 0;
  return totalUsd / quantity;
}

/**
 * 낱개 단가 USD = 합계 USD / 입고수량.
 * DB `inventory_lots.cost_usd` 계산의 기반값.
 */
export function computeUnitPriceUsd(
  totalUsd: number,
  adjustedQty: number,
): number {
  if (!Number.isFinite(adjustedQty) || adjustedQty <= 0) return 0;
  if (!Number.isFinite(totalUsd)) return 0;
  return totalUsd / adjustedQty;
}

/**
 * 운송비 배분 USD — 이 행 전체 몫 (낱개 아님).
 * 공식: (이 행 합계 / 전체 실제 합계) × 운송비 총액.
 * 분모 0 또는 음수일 때 0 반환 → UI 에서 "—".
 */
export function computeShippingAllocationUsd(
  rowTotalUsd: number,
  invoiceActualTotalUsd: number,
  shippingCostUsd: number,
): number {
  if (!Number.isFinite(invoiceActualTotalUsd) || invoiceActualTotalUsd <= 0)
    return 0;
  if (!Number.isFinite(shippingCostUsd) || shippingCostUsd <= 0) return 0;
  if (!Number.isFinite(rowTotalUsd)) return 0;
  return (rowTotalUsd / invoiceActualTotalUsd) * shippingCostUsd;
}

/**
 * 낱개 원가 KRW (정수).
 * 공식: round((unitPriceUsd + shippingAllocatedUsd / adjustedQty) × exchangeRate).
 * 🟠 `inventory_lots.cost_krw` 가 INTEGER 제약이라 반드시 반올림.
 */
export function computeCostKrw(
  unitPriceUsd: number,
  shippingAllocatedUsd: number,
  adjustedQty: number,
  exchangeRate: number,
): number {
  if (!Number.isFinite(adjustedQty) || adjustedQty <= 0) return 0;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return 0;
  const shippingPerUnit = shippingAllocatedUsd / adjustedQty;
  const raw = (unitPriceUsd + shippingPerUnit) * exchangeRate;
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw);
}

/** 행 원가합계 KRW = 입고수량 × 낱개원가KRW. */
export function computeLineTotalKrw(
  adjustedQty: number,
  costKrw: number,
): number {
  if (!Number.isFinite(adjustedQty) || adjustedQty <= 0) return 0;
  return adjustedQty * costKrw;
}

/**
 * 인보이스 실제 합계 USD. EA 행도 그대로 포함 ($92.40 이슈 해결).
 * ImportRow 기반이지만 유효한 건 `totalUsd` 필드뿐 → `Pick` 으로 좁게 받는다.
 */
export function computeInvoiceActualTotalUsd(
  rows: ReadonlyArray<Pick<ImportRow, 'totalUsd'>>,
): number {
  let sum = 0;
  for (const r of rows) {
    if (Number.isFinite(r.totalUsd)) sum += r.totalUsd;
  }
  return sum;
}

/**
 * PDF 합계와 실제 합계의 의미 있는 차이 여부 (0.5 USD 초과).
 * pdfTotalUsd 가 0 이하이면 사용자 미입력으로 간주 → `false` (검증 스킵).
 */
export function hasSignificantTotalDiff(
  pdfTotalUsd: number,
  actualTotalUsd: number,
): boolean {
  if (!Number.isFinite(pdfTotalUsd) || pdfTotalUsd <= 0) return false;
  if (!Number.isFinite(actualTotalUsd)) return false;
  return Math.abs(pdfTotalUsd - actualTotalUsd) > 0.5;
}
