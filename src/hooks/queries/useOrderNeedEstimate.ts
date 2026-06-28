/**
 * 발주 필요 금액 실시간 추정 — TopNav 우측 고정 위젯용.
 *
 * 🔴 계산식은 발주서 페이지 "1단계 발주서 생성" + 푸터 totalUsd 와 완전 일치:
 *    Σ calcOrderQty(baseQty, unit_order || unit) × unit_price_usd
 *    (재고 차감 없음 — 추천 발주수량 그대로 곱함)
 *
 * 🔴 company_id 는 useCompany() 에서만.
 * 🔴 calcOrderQty / calcSalesQty1m / calcSalesQty3m 은 calculations.ts 경유.
 * 🟠 usePurchaseOrder 캐시 재활용 — 추가 쿼리 없음.
 * 🟠 excludedCategories 는 호출자(TopNav)에서 localStorage 로 관리.
 */
import { useMemo } from 'react';
import { usePurchaseOrder } from './usePurchaseOrder';
import {
  calcSalesQty1m,
  calcSalesQty3m,
  calcOrderQty,
} from '@/utils/calculations';

export type OrderBasis = '1m' | '3m';

export interface OrderNeedEstimate {
  estimatedUsd: number;
  needCount: number;
  /** 활성 제품 중 distinct 카테고리 목록 (정렬됨) — 헤더 위젯 카테고리 필터용. */
  categories: string[];
  isLoading: boolean;
}

export function useOrderNeedEstimate(
  companyId: string | null,
  basis: OrderBasis,
  excludedCategories: ReadonlySet<string>,
): OrderNeedEstimate {
  const { products, salesMap, categories, isLoading } =
    usePurchaseOrder(companyId);

  const estimate = useMemo(() => {
    if (isLoading || products.length === 0) {
      return { estimatedUsd: 0, needCount: 0 };
    }

    let totalUsd = 0;
    let needCount = 0;

    for (const p of products) {
      if (excludedCategories.has(p.category)) continue;
      if (!p.unit_price_usd || Number(p.unit_price_usd) <= 0) continue;

      const qty6m = salesMap.get(p.id) ?? 0;
      const qty3m = calcSalesQty3m(qty6m);
      const baseQty = basis === '1m' ? calcSalesQty1m(qty3m) : qty3m;
      const needDz = calcOrderQty(baseQty, p.unit_order || p.unit);
      if (needDz <= 0) continue;

      totalUsd += needDz * Number(p.unit_price_usd);
      needCount++;
    }

    return {
      estimatedUsd: parseFloat(totalUsd.toFixed(2)),
      needCount,
    };
  }, [products, salesMap, basis, excludedCategories, isLoading]);

  return { ...estimate, categories, isLoading };
}
