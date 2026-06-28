/**
 * 발주 필요 금액 실시간 추정 — TopNav 우측 고정 위젯용.
 *
 * ⚠️ 발주서 페이지 totalUsd 와 완전히 동일한 계산 방식:
 *   - orderQ = calcOrderQty(baseQty, unit_order || unit)  → 발주 단위 (DZ면 ÷12)
 *   - 재고  = stockMap.current(EA) ÷ 12  (unit_order = 'DZ' 일 때)
 *   - 금액  = 부족량 × unit_price_usd  (unit_price_usd 는 발주단위 = DZ당 단가)
 *
 * 🔴 company_id 는 useCompany() 에서만.
 * 🔴 calcOrderQty / calcSalesQty1m / calcSalesQty3m 은 calculations.ts 경유.
 * 🟠 usePurchaseOrder 캐시 재활용 — 추가 쿼리 없음.
 * 🟠 해상(선박) 수입 카테고리(레더다이/스웨이드다이/디글레이저)는 발주 예상 제외.
 */
import { useMemo } from 'react';
import { usePurchaseOrder } from './usePurchaseOrder';
import {
  calcSalesQty1m,
  calcSalesQty3m,
  calcOrderQty,
} from '@/utils/calculations';

export type OrderBasis = '1m' | '3m';

/** 해상(선박) 수입 카테고리 — 발주 예상에서 제외. */
const SEA_IMPORT_CATEGORIES: ReadonlySet<string> = new Set([
  '2-1.레더다이',
  '2-2.스웨이드다이',
  '3-1.디글레이저',
]);

export interface OrderNeedEstimate {
  estimatedUsd: number;
  needCount: number;
  isLoading: boolean;
}

export function useOrderNeedEstimate(
  companyId: string | null,
  basis: OrderBasis,
): OrderNeedEstimate {
  const { products, salesMap, stockMap, isLoading } = usePurchaseOrder(companyId);

  const estimate = useMemo(() => {
    if (isLoading || products.length === 0) {
      return { estimatedUsd: 0, needCount: 0 };
    }

    let totalUsd = 0;
    let needCount = 0;

    for (const p of products) {
      if (SEA_IMPORT_CATEGORIES.has(p.category)) continue;
      if (!p.unit_price_usd || Number(p.unit_price_usd) <= 0) continue;

      const qty6m = salesMap.get(p.id) ?? 0;
      const qty3m = calcSalesQty3m(qty6m);
      const baseQty = basis === '1m' ? calcSalesQty1m(qty3m) : qty3m;
      const orderUnit = p.unit_order || p.unit || '';
      const needDz = calcOrderQty(baseQty, orderUnit);
      if (needDz <= 0) continue;

      const currentEa = stockMap.get(p.id) ?? 0;
      const currentDz =
        orderUnit.toUpperCase() === 'DZ' ? currentEa / 12 : currentEa;

      const shortfall = needDz - currentDz;
      if (shortfall <= 0) continue;

      // unit_price_usd 는 발주단위(DZ) 당 단가 — 발주서 totalUsd 와 동일하게 그대로 곱함.
      totalUsd += shortfall * Number(p.unit_price_usd);
      needCount++;
    }

    return {
      estimatedUsd: parseFloat(totalUsd.toFixed(2)),
      needCount,
    };
  }, [products, salesMap, stockMap, basis, isLoading]);

  return { ...estimate, isLoading };
}
