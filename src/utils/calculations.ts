/**
 * 🔴 모든 비즈니스 계산식은 이 파일에만 존재한다 (CLAUDE.md §2).
 * 🔴 첫 인자는 반드시 `companyId` (calcSupplyAmount는 순수 산술 예외).
 * 🟠 페이지 파일에서 계산 로직을 직접 작성하지 말 것.
 *
 * 구현은 Phase 3에서 완성. 지금은 시그니처만 확정하여
 * 호출부가 미리 import 경로를 고정할 수 있게 한다.
 */
import type { Period } from '@/types/common';

/**
 * 제품별 현재 재고.
 * 공식: 기초재고 + 수입/매입 + 반품 - 파손 - 판매수량(올해 1/1 ~ 현재)
 */
export async function calcCurrentStock(
  _companyId: string,
  _productId: string,
): Promise<number> {
  throw new Error('calcCurrentStock: Phase 3에서 구현 예정');
}

/**
 * 특정 연월의 총매출.
 * 공식: SUM(order_items.quantity × unit_price) WHERE 해당 기간
 */
export async function calcMonthlySales(
  _companyId: string,
  _year: number,
  _month: number,
): Promise<number> {
  throw new Error('calcMonthlySales: Phase 3에서 구현 예정');
}

/**
 * 거래처별 미수금.
 * 공식: 거래처 총매출 - 거래처 총입금
 */
export async function calcReceivables(
  _companyId: string,
  _customerId: string,
): Promise<number> {
  throw new Error('calcReceivables: Phase 3에서 구현 예정');
}

/**
 * 매출원가 (부가세 포함).
 * 공식: (기초 + 반품 - 파손 + 수입/매입 - 기말) × 1.1
 * 🔴 반품(+), 파손(-) 방향 주의.
 */
export async function calcCostOfSales(
  _companyId: string,
  _period: Period,
): Promise<number> {
  throw new Error('calcCostOfSales: Phase 3에서 구현 예정');
}

/**
 * 현재 재고 자산가치 (부가세 포함).
 * 공식: 현재재고수량 × 가중평균단가 × 1.1
 */
export async function calcInventoryValue(_companyId: string): Promise<number> {
  throw new Error('calcInventoryValue: Phase 3에서 구현 예정');
}

/**
 * 매출금액 → 공급가액 + 부가세 역산.
 * 🔴 주의: 매출금액은 이미 부가세 포함. × 1.1 절대 금지, ÷ 1.1만 사용.
 * 순수 산술이므로 companyId 불필요 (CLAUDE.md 예외).
 *
 * @param totalAmount 부가세 포함 매출금액 (정수 원화)
 * @returns { supply: 공급가액, vat: 부가세 }
 */
export function calcSupplyAmount(totalAmount: number): {
  supply: number;
  vat: number;
} {
  const supply = Math.round(totalAmount / 1.1);
  const vat = totalAmount - supply;
  return { supply, vat };
}

/**
 * 발주 추천 수량 (DZ 단위).
 * 공식: (과거 6개월 판매 합 / 6 × 3개월) / 12
 */
export async function calcOrderSuggestion(
  _companyId: string,
  _productId: string,
): Promise<number> {
  throw new Error('calcOrderSuggestion: Phase 3에서 구현 예정');
}

/**
 * MRR (월간 반복 수익).
 * 공식: SUM(plans.price_krw) WHERE subscriptions.status='active'
 * 🟠 Super Admin 페이지 전용. `companyId`는 호출자 감사 로깅 용도.
 */
export async function calcMRR(_companyId: string): Promise<number> {
  throw new Error('calcMRR: Phase 3에서 구현 예정');
}
