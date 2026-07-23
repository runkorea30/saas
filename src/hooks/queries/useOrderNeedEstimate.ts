/**
 * 발주 필요 금액 실시간 추정 — TopNav 우측 고정 위젯용.
 *
 * 🔴 계산식은 발주서 페이지 "1단계 발주서 생성" + 푸터 totalUsd 와 완전 일치:
 *    Σ calcOrderQty(baseQty, stock, unit_order || unit) × unit_price_usd
 *    (재고 차감 포함 — calcOrderQty 내부에서 max(0, baseQty-stock) 처리.
 *    🔴 버그수정 이력: 과거엔 재고 차감이 아예 없었으나, 발주서 페이지
 *    쪽 계산식이 재고 차감하도록 고쳐지면서 "완전 일치" 원칙에 따라
 *    이 위젯도 함께 수정함.)
 *
 * 🔴 company_id 는 useCompany() 에서만.
 * 🔴 calcOrderQty / calcSalesQty3m / calcSalesQtyByBasis 은 calculations.ts 경유.
 * 🟠 usePurchaseOrder 캐시 재활용 — 추가 쿼리 없음.
 * 🟠 excludedCategories 는 호출자(TopNav)에서 localStorage 로 관리.
 */
import { useMemo } from 'react';
import { usePurchaseOrder } from './usePurchaseOrder';
import { useIncomingQuantities } from './useIncomingQuantities';
import { usePurchaseForecast } from './usePurchaseForecast';
import {
  calcSalesQty3m,
  calcSalesQtyByBasis,
  calcOrderQty,
  type SalesBasis,
} from '@/utils/calculations';

export type OrderBasis = SalesBasis;

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
  const { products, salesMap, stockMap, categories, isLoading } =
    usePurchaseOrder(companyId);
  // 🔴 (2026-07-05) 이미 발주해서 오고 있는 "입고예정" 수량은 재고에 미리 더해서
  //    calcOrderQty 가 그만큼 덜 주문하게 함. 발주서 페이지 handleGenerate 와 정합.
  const incomingQ = useIncomingQuantities(companyId);
  const incomingByProduct =
    incomingQ.data?.totalByProduct ?? new Map<string, number>();
  // 🔴 (2026-07-05) usePurchaseForecast 의 ForecastRow.{daily_avg, lead_time_days} 재사용.
  //    "리드타임 기간 소진분(dailyAvg × leadDays)" 을 재고에서 미리 빼고 발주수량을 계산해
  //    발주 → 도착 사이의 자연 소진까지 감안한다.
  const { rows: forecastRows } = usePurchaseForecast(companyId);
  const forecastById = useMemo(() => {
    const map = new Map<
      string,
      { daily_avg: number; lead_time_days: number }
    >();
    for (const r of forecastRows) {
      map.set(r.id, {
        daily_avg: r.daily_avg,
        lead_time_days: r.lead_time_days,
      });
    }
    return map;
  }, [forecastRows]);

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
      const baseQty = calcSalesQtyByBasis(basis, qty3m);
      const stock = stockMap.get(p.id) ?? 0;
      const incoming = incomingByProduct.get(p.id) ?? 0;
      // 리드타임 감안: 발주 → 입고 사이에 자연 소진될 재고만큼 미리 뺌.
      // 재고가 리드타임 소진량 미만이면 0 으로 clamp (사실상 credit 없음).
      const f = forecastById.get(p.id);
      const leadTimeQty = (f?.daily_avg ?? 0) * (f?.lead_time_days ?? 0);
      const depletionAdjustedStock = Math.max(0, stock - leadTimeQty);
      const needDz = calcOrderQty(
        baseQty,
        depletionAdjustedStock + incoming,
        p.unit_order || p.unit,
      );
      if (needDz <= 0) continue;

      totalUsd += needDz * Number(p.unit_price_usd);
      needCount++;
    }

    return {
      estimatedUsd: parseFloat(totalUsd.toFixed(2)),
      needCount,
    };
  }, [
    products,
    salesMap,
    stockMap,
    incomingByProduct,
    forecastById,
    basis,
    excludedCategories,
    isLoading,
  ]);

  return { ...estimate, categories, isLoading };
}
