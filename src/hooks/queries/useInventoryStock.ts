/**
 * 재고현황 페이지용 집계 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §2: 계산식은 calculations.ts 경유. 페이지 직접 집계 금지.
 * 🟠 N+1 방지: `calcCurrentStockByProduct` 단일 호출(쿼리 3회)로 전 제품 스냅샷 획득.
 * 🟡 lots 총 건수는 "재고 데이터 없음" 배너 노출 판단용 (lots 0건일 때 안내).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  calcCurrentStockByProduct,
  type ProductStockInfo,
} from '@/utils/calculations';

export interface InventoryStockSummary {
  stockByProduct: Map<string, ProductStockInfo>;
  lotsCount: number;
}

export function useInventoryStock(companyId: string | null) {
  return useQuery<InventoryStockSummary>({
    queryKey: ['inventory-stock', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const [stockByProduct, lotsCountResult] = await Promise.all([
        calcCurrentStockByProduct(companyId!),
        supabase
          .from('inventory_lots')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId!)
          .is('deleted_at', null),
      ]);
      if (lotsCountResult.error) throw lotsCountResult.error;
      return {
        stockByProduct,
        lotsCount: lotsCountResult.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}
