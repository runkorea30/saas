/**
 * 구매 예측 화면 전용 훅.
 *
 * 구성:
 *  - `usePurchaseForecast`  : 제품 마스터 + 현재재고 + 일평균판매(6개월) 를 합쳐
 *                              화면 rows 로 반환. 계산식은 `calculations.ts` 재사용.
 *  - `useRecalcReorderPoints`: RPC `recalculate_reorder_points` 뮤테이션.
 *
 * 🔴 CLAUDE.md §1: company_id 는 상위(useCompany)에서만.
 * 🔴 CLAUDE.md §2: 계산은 calculations.ts 진입점만 사용. 페이지에서 직접 SQL 금지.
 * 🟠 daily_avg 는 화면 표시용으로 매번 다시 계산(30초 캐시). DB 저장 reorder_point
 *    와 값이 다를 수 있음(재계산 버튼 미실행 상태) — 화면상 명확히 구분.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * 신규 RPC(`recalculate_reorder_points`) 는 자동 생성 Database 타입에 미반영이므로
 * (memory: supabase_types_desync) 타입 우회. from/eq 는 그대로 두고 rpc 만 우회.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntypedRpc = supabase as unknown as {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useIncomingQuantities } from '@/hooks/queries/useIncomingQuantities';
import {
  calcSalesPerDayByProduct,
  type DailySalesEntry,
} from '@/utils/calculations';
import { SALES_LOOKBACK_DAYS } from '@/constants/leadTimes';
import {
  resolveLeadTimeDays,
  useLeadTimeSettings,
} from '@/hooks/useLeadTimeSettings';

export interface ForecastRow extends Product {
  /** 현재재고 (StockPage 와 동일 방식). */
  current_stock: number;
  /** 최근 180일 일평균판매량. 0 이면 판매이력 없음으로 분류. */
  daily_avg: number;
  /** 원본 순판매수량(EA, 180일 기준) — 계산검증 팝오버 노출용. */
  net_qty_180d: number;
  /** 일평균 계산 분모(일). 그대로 180. 계산검증 팝오버 노출용. */
  sales_lookback_days: number;
  /** 카테고리 기준 리드타임(일). 90(해상) 또는 15(FedEx). */
  lead_time_days: number;
  /** 화면 표기용 재주문점 = ROUND(daily_avg × lead_time_days). */
  reorder_point_calc: number;
  /**
   * 이미 발주됐지만 아직 입고확정 안 된 EA 수량 (invoice_verifications.transfer_rows).
   * 권장구매수량에서 차감되며, 그리드에 "입고예정" 컬럼으로 노출.
   */
  incoming_qty: number;
  /** 권장구매수량 = MAX(0, 재주문점 - 현재재고 - incoming_qty). */
  recommended_qty: number;
  /**
   * 재고소진예상일(YYYY-MM-DD). daily_avg=0 이면 null (판매이력 없음).
   */
  depletion_date: string | null;
  /**
   * 발주필요일(YYYY-MM-DD). depletion - lead_time. daily_avg=0 이면 null.
   */
  reorder_date: string | null;
  /**
   * 상태:
   *  - 'no_history' : 6개월 판매이력 없음
   *  - 'now'        : reorder_date <= 오늘 → 지금 발주 필요
   *  - 'later'      : D-n (n>0)
   */
  status: 'no_history' | 'now' | 'later';
  /** 오늘까지 남은 여유일수. 'later' 상태에서만 유효. */
  days_until_reorder: number | null;
}

/** ymd 로컬(KST 가정) → YYYY-MM-DD. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 오늘 00:00 로컬 Date. */
function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * 화면 rows 계산. 서버에 저장된 products.reorder_point 는 참고용으로 함께 노출하되,
 * 화면의 "상태/발주필요일/권장구매수량" 은 항상 최신 daily_avg 로 다시 계산.
 * (재계산 버튼 미클릭 상태에서도 화면은 최신값으로 안내.)
 */
export function usePurchaseForecast(companyId: string | null) {
  const productsQ = useProducts(companyId);
  const stockQ = useInventoryStock(companyId);
  const incomingQ = useIncomingQuantities(companyId);
  const leadTimeSettings = useLeadTimeSettings(companyId);
  const salesQ = useQuery({
    queryKey: ['sales-per-day-by-product', companyId, SALES_LOOKBACK_DAYS],
    enabled: Boolean(companyId),
    queryFn: () => calcSalesPerDayByProduct(companyId!, SALES_LOOKBACK_DAYS),
    staleTime: 60_000,
  });

  const rows: ForecastRow[] = useMemo(() => {
    if (!productsQ.data || !stockQ.data || !salesQ.data) return [];
    // incomingQ 는 아직 로딩 중이라도 진행 — 빈 Map 이면 0 으로 취급.
    const incomingMap =
      incomingQ.data?.totalByProduct ?? new Map<string, number>();
    const today = todayLocal();
    const todayMs = today.getTime();
    const activeProducts = productsQ.data.filter((p) => p.is_active);
    const list: ForecastRow[] = activeProducts.map((p) => {
      const current = stockQ.data.stockByProduct.get(p.id)?.current ?? 0;
      const incoming = incomingMap.get(p.id) ?? 0;
      const salesEntry: DailySalesEntry | undefined = salesQ.data.get(p.id);
      const dailyAvg = salesEntry?.daily_avg ?? 0;
      const netQty180 = salesEntry?.net_qty ?? 0;
      const lookback = salesEntry?.lookback_days ?? 180;
      // 🔴 리드타임은 사용자 설정(useLeadTimeSettings) 값을 사용. 기본은 90/15.
      //    카테고리→리드타임 매핑은 resolveLeadTimeDays 단일 진입점.
      const lead = resolveLeadTimeDays(p.category, leadTimeSettings);
      const reorderPoint = Math.round(dailyAvg * lead);
      // 권장 = 재주문점 - 현재재고 - 입고예정. 셋 다 EA.
      const recommended = Math.max(0, reorderPoint - current - incoming);

      if (dailyAvg <= 0) {
        return {
          ...p,
          current_stock: current,
          incoming_qty: incoming,
          daily_avg: 0,
          net_qty_180d: netQty180,
          sales_lookback_days: lookback,
          lead_time_days: lead,
          reorder_point_calc: 0,
          recommended_qty: recommended,
          depletion_date: null,
          reorder_date: null,
          status: 'no_history' as const,
          days_until_reorder: null,
        };
      }

      // 🔴 (2026-07-05) 상태·재고소진예상일 계산 시 "유효재고" 사용.
      //    유효재고 = 현재재고 + 이미 발주해서 오고 있는 입고예정 수량.
      //    권장 발주수량(handleGenerate) 도 stock+incoming 을 쓰므로 두 값이 정합.
      //    이 반영 이전에는 현재재고만 보고 "지금 발주 필요" 배지가 뜨는 오탐이
      //    있었음(예: 72001001 재고 75 + 입고예정 288 이 재주문점 113 을 이미 초과).
      const effectiveStock = current + incoming;
      const daysToDepletion = Math.floor(effectiveStock / dailyAvg);
      const depletion = new Date(today);
      depletion.setDate(depletion.getDate() + daysToDepletion);
      const reorder = new Date(depletion);
      reorder.setDate(reorder.getDate() - lead);
      const daysUntil = Math.floor((reorder.getTime() - todayMs) / 86_400_000);
      const status: ForecastRow['status'] = daysUntil <= 0 ? 'now' : 'later';
      return {
        ...p,
        current_stock: current,
        incoming_qty: incoming,
        daily_avg: dailyAvg,
        net_qty_180d: netQty180,
        sales_lookback_days: lookback,
        lead_time_days: lead,
        reorder_point_calc: reorderPoint,
        recommended_qty: recommended,
        depletion_date: ymd(depletion),
        reorder_date: ymd(reorder),
        status,
        days_until_reorder: daysUntil,
      };
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    productsQ.data,
    stockQ.data,
    salesQ.data,
    incomingQ.data,
    leadTimeSettings.sea,
    leadTimeSettings.fedex,
  ]);

  return {
    rows,
    isLoading:
      productsQ.isLoading ||
      stockQ.isLoading ||
      salesQ.isLoading ||
      incomingQ.isLoading,
    error:
      productsQ.error ??
      stockQ.error ??
      salesQ.error ??
      incomingQ.error ??
      null,
  };
}

/**
 * 재계산 뮤테이션 — RPC `recalculate_reorder_points` 호출.
 * 성공 시 products / sales-per-day 쿼리 invalidate 하여 화면 자동 갱신.
 *
 * 🟡 이제는 수동 UI 없이 `useAutoRecalcReorderPoints` 가 하루 1회 조용히 호출.
 */
export interface RecalcReorderArgs {
  sea: number;
  fedex: number;
}

export function useRecalcReorderPoints(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<string, Error, RecalcReorderArgs>({
    mutationFn: async ({ sea, fedex }) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { data, error } = await supabaseUntypedRpc.rpc(
        'recalculate_reorder_points',
        {
          p_company_id: companyId,
          p_sea_leadtime: sea,
          p_fedex_leadtime: fedex,
        },
      );
      if (error) throw new Error(error.message);
      // RPC 는 TIMESTAMPTZ 반환. supabase-js 는 문자열로 넘김.
      return String(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', companyId] });
      qc.invalidateQueries({
        queryKey: ['sales-per-day-by-product', companyId],
      });
    },
  });
}

// ────────────────────────────────────────────────────────────
// 자동 재계산 (24시간 TTL)
// ────────────────────────────────────────────────────────────

const AUTO_RECALC_KEY_PREFIX = 'purchaseForecast_lastCalcAt_';
const AUTO_RECALC_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

function readLastCalcAt(companyId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(AUTO_RECALC_KEY_PREFIX + companyId);
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function writeLastCalcAt(companyId: string, iso: string): void {
  try {
    window.localStorage.setItem(AUTO_RECALC_KEY_PREFIX + companyId, iso);
  } catch {
    /* localStorage 접근 실패 — 다음 마운트 때 다시 시도 (한 세션 낭비 정도로 무해). */
  }
}

/**
 * 페이지 마운트 시 조용히 재계산 (RPC 호출) 을 자동 실행.
 *
 * 정책:
 *  - localStorage 의 마지막 계산 시각이 24시간을 넘겼거나 없으면 실행.
 *  - 같은 세션에서 companyId 가 바뀌지 않는 한 재실행 안 함 (attemptedRef).
 *  - 실패해도 조용히 삼킴 (다음날 마운트 때 재시도, 화면 방해 없음).
 *  - `staleTime` 개념은 localStorage TTL 로 대체 — react-query 자체 pollng 이나
 *    focus refetch 로 실행되지 않도록 useEffect 내부에서만 트리거.
 */
export function useAutoRecalcReorderPoints(companyId: string | null): void {
  const recalcMut = useRecalcReorderPoints(companyId);
  const { sea, fedex } = useLeadTimeSettings(companyId);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    if (attemptedRef.current === companyId) return;
    const now = Date.now();
    const last = readLastCalcAt(companyId);
    if (last > 0 && now - last < AUTO_RECALC_TTL_MS) return;

    attemptedRef.current = companyId;
    // 백그라운드: 결과 무관하게 fire-and-forget. 실패해도 UI 방해 없음.
    // 현재 사용자 설정 리드타임(sea/fedex) 을 RPC 파라미터로 넘김.
    recalcMut.mutate({ sea, fedex }, {
      onSuccess: (iso) => {
        writeLastCalcAt(companyId, iso);
      },
      // eslint-disable-next-line no-console
      onError: (e) => console.warn('[auto-recalc-reorder-points]', e.message),
    });
    // recalcMut 은 매 렌더 새로 만들어질 수 있어 deps 에 넣으면 무한 루프 위험.
    // companyId 만 트리거로 사용.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
}
