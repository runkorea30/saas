/**
 * 발주서 페이지 — 재고매입 > 발주서.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만 (하드코딩 금지).
 * 🔴 CLAUDE.md §2: 모든 계산식은 calculations.ts (`calcSalesQty3m` / `calcSalesQty1m` / `calcOrderQty`).
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 fetchAllRows 경유 (usePurchaseOrder 내부).
 *
 * 핵심 동작:
 *  - "발주서 생성" → 전 제품에 대해 calcOrderQty(baseQty, stock, unit) 자동 입력
 *  - "현재 카테고리 저장" → 선택된(혹은 전체) 카테고리별로 purchase_orders + items upsert
 *      · po_number = `PO-{YYYY}-{MM}-{카테고리}` (같은 번호 있으면 DELETE 후 INSERT)
 *      · template_id = 카테고리명 (저장 여부 추적용)
 *  - "초기화" → 이번 달 모든 draft 발주서 삭제 + orderQty 리셋
 *  - "엑셀" → savedCategories 의 품목만 ORDER SHEET 양식으로 다운로드
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownAZ,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
} from 'lucide-react';
import { downloadOrderSheetXlsx } from '@/utils/orderSheetXlsx';
import { useCompany } from '@/hooks/useCompany';
import {
  fetchSavedSnapshot,
  usePurchaseOrder,
} from '@/hooks/queries/usePurchaseOrder';
import {
  useAutoRecalcReorderPoints,
  usePurchaseForecast,
  type ForecastRow,
} from '@/hooks/queries/usePurchaseForecast';
import { useIncomingQuantities } from '@/hooks/queries/useIncomingQuantities';
import { useOrderNeedEstimate } from '@/hooks/queries/useOrderNeedEstimate';
import { useLeadTimeSettings } from '@/hooks/useLeadTimeSettings';
import { resetInvoiceVerificationForNewOrder } from '@/lib/invoiceVerification';
import type { OrderSheetRow } from '@/utils/orderSheetParser';
import { usePurchaseOrderExcluded } from '@/hooks/usePurchaseOrderExcluded';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import {
  calcOrderQty,
  calcSalesQty1m,
  calcSalesQty3m,
} from '@/utils/calculations';
import { getCategoryLabel } from '@/constants/categories';
import { sortByCategory } from '@/utils/sortProducts';
import { FinalReviewPanel } from '@/components/feature/purchase-order/FinalReviewPanel';
import {
  ResizableTh,
  useColumnWidth,
} from '@/components/feature/purchase-order/ResizableTh';

const SAVED_QUERY_KEY = 'purchase-order-saved-categories';

/** 계산검증 팝오버가 열릴 수 있는 셀 컬럼 식별자. */
type VerifyColumn =
  | 'sales1m'
  | 'sales3m'
  | 'leadQty'
  | 'incoming'
  | 'depletion'
  | 'status'
  | 'qty';

/**
 * "저장된 분류 전체선택" 의 가상 단일-선택 sentinel.
 *
 * 🟠 카테고리 필터는 단일 선택(`selectedCategory: string | null`) 모델이지만,
 *    "저장된 분류 전체선택" 버튼은 사용자 요구상 그대로 유지해야 한다.
 *    실제 카테고리 이름과 충돌하지 않는 sentinel 한 값으로 표현해
 *    상태 자체는 단일 string 으로 유지한다.
 */
const SAVED_ALL_FILTER = '__SAVED_ALL__';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function PurchaseOrderPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const {
    products,
    salesMap,
    stockMap,
    savedCategories,
    savedItemCount,
    savedTotalUsd,
    savedQtyMap,
    categories,
    isLoading,
    error,
  } = usePurchaseOrder(companyId);
  // 발주 예상 제외 카테고리 — TopNav 헤더 위젯과 동일 localStorage 공유.
  const { excluded: excludedCategories, toggle: toggleExcluded } =
    usePurchaseOrderExcluded();

  // 재주문점 기반 예측(입고예정/재고소진일/상태) — 25번 통합. 표시 전용.
  const { rows: forecastRows } = usePurchaseForecast(companyId);
  // 하루 1회 자동 재계산 (localStorage TTL). 사용자 조작 불필요.
  useAutoRecalcReorderPoints(companyId);
  const forecastById = useMemo(() => {
    const map = new Map<string, ForecastRow>();
    for (const r of forecastRows) map.set(r.id, r);
    return map;
  }, [forecastRows]);
  // 입고예정 수량 — "1단계 발주서 생성" 시 stock 에 더해 넘겨 미리 반영.
  const incomingQ = useIncomingQuantities(companyId);
  const incomingByProduct =
    incomingQ.data?.totalByProduct ?? new Map<string, number>();
  const incomingSourcesByProduct =
    incomingQ.data?.sourcesByProduct ??
    new Map<string, { invoice_no: string; qty: number }[]>();
  // 리드타임(해상/FedEx) 사용자 조정값 — 상태/리드타임수량/발주수량/RPC 전부 이 값 사용.
  const leadTime = useLeadTimeSettings(companyId);
  const urgentCount = useMemo(
    () => forecastRows.filter((r) => r.status === 'now').length,
    [forecastRows],
  );

  /** 정렬 모드: 'category'(기본) 또는 'urgency'(발주필요일 오름차순). */
  const [sortMode, setSortMode] = useState<'category' | 'urgency'>('category');
  /**
   * 계산검증 모드. ON 인 동안 계산 셀에 마우스 우클릭 시 계산식 팝오버 노출.
   * OFF 상태에서는 우클릭 이벤트에 개입하지 않아 브라우저 기본 컨텍스트 메뉴가 뜬다.
   *
   * 🔴 팝오버는 React Portal 로 document.body 에 렌더해 테이블/셀의 overflow:hidden
   *    영향을 안 받음. 위치는 우클릭한 셀의 getBoundingClientRect() 로 계산.
   * 🟡 스크롤 발생 시 위치가 어긋나지 않도록 자동 닫힘.
   */
  const [verifyMode, setVerifyMode] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState<{
    rowId: string;
    column: VerifyColumn;
    anchor: DOMRect;
    content: React.ReactNode;
  } | null>(null);

  const openVerifyAt = (
    e: React.MouseEvent,
    rowId: string,
    column: VerifyColumn,
    content: React.ReactNode,
  ) => {
    if (!verifyMode) return; // OFF 면 브라우저 기본 컨텍스트 메뉴 그대로.
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setVerifyOpen((prev) =>
      prev && prev.rowId === rowId && prev.column === column
        ? null
        : { rowId, column, anchor: rect, content },
    );
  };
  const closeVerify = () => setVerifyOpen(null);

  // 스크롤/리사이즈 시 팝오버 자동 닫기 — 좌표 stale 방지.
  useEffect(() => {
    if (!verifyOpen) return;
    const onScrollOrResize = () => closeVerify();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [verifyOpen]);

  // 팝오버 밖 클릭 시 닫기.
  useEffect(() => {
    if (!verifyOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-verify-popover]')) return;
      closeVerify();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [verifyOpen]);
  /**
   * 상단 고정 정렬 모드 — 이 3개는 서로 배타적.
   *  · 'none'      : 없음 (기본)
   *  · 'incoming'  : 입고예정 > 0 인 행을 상단
   *  · 'orderQty'  : 사용자가 입력한 orderQty >= 1 인 행을 상단
   *  · 'status'    : statusPinBucket 이 지정한 D-day 구간(누적) 인 행을 상단
   * 상단 그룹 · 하단 그룹 모두 기존 sortMode 순서 그대로 유지.
   */
  const [pinMode, setPinMode] = useState<
    'none' | 'incoming' | 'orderQty' | 'status'
  >('none');
  /**
   * '상태' 상단고정용 D-day 누적 구간.
   *  · '1m'      : days_until_reorder <= 30 (지금 발주 필요 포함)
   *  · '2m'      : <= 60 (1m 포함)
   *  · '3m'      : <= 90 (2m 포함)
   *  · '3m_plus' : > 90
   *  · null      : 미선택 (pinMode='status' 를 유지하고 있어도 아무도 pin 안 함)
   * 판매이력 없음(no_history) 은 어느 구간에도 걸리지 않음.
   */
  const [statusPinBucket, setStatusPinBucket] = useState<
    '1m' | '2m' | '3m' | '3m_plus' | null
  >(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  /** product_id → 발주수량 (EA). 0/없음 = 빈칸. */
  const [orderQty, setOrderQty] = useState<Map<string, number>>(new Map());
  // 🔴 페이지 진입 시 이번 달 저장된 발주수량(savedQtyMap)으로 1회만 초기화.
  //    OPS/모바일이 같은 DB를 읽으므로, 어느 쪽에서 저장했든 다시 열면 여기 반영됨.
  //    이후 사용자가 입력을 시작하면 다시 덮어쓰지 않음(untouched 1회 로드 패턴).
  const [qtyLoadedFromSaved, setQtyLoadedFromSaved] = useState(false);
  useEffect(() => {
    if (qtyLoadedFromSaved) return;
    if (savedQtyMap.size === 0) return;
    setOrderQty(new Map(savedQtyMap));
    setQtyLoadedFromSaved(true);
  }, [savedQtyMap, qtyLoadedFromSaved]);
  /**
   * 선택된 카테고리 (단일 선택).
   * - `null` : 전체
   * - `SAVED_ALL_FILTER` : 저장된 분류 전체선택 모드 (가상)
   * - 그 외 : 해당 카테고리 단일
   */
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 발주 기준: '1m' = 1개월 판매량, '3m' = 3개월 판매량 (기본값 '3m') */
  const [salesBasis, setSalesBasis] = useState<'1m' | '3m'>('3m');
  // "발주예상 USD" — 전체 활성 품목 기준(카테고리 필터/저장 상태 무관).
  //  useOrderNeedEstimate 는 handleGenerate 와 동일 로직(baseQty·재고+입고예정·단가) 사용.
  //  저장된 값 기반의 "발주확정 USD" 와 짝을 이루는 KPI.
  const { estimatedUsd: needEstimateUsd } = useOrderNeedEstimate(
    companyId,
    salesBasis,
    excludedCategories,
  );
  /** 3단계 최종결정 화면 표시 여부. false 면 기존 1·2단계 편집 화면. */
  const [showFinalReview, setShowFinalReview] = useState(false);

  // 메인 테이블 컬럼 폭 (localStorage 영속).
  // 순서: 코드/제품명/발주수량/재고/리드타임수량/1M/3M/단위/입고예정/재고소진일/상태/합계.
  const [wCode, setWCode] = useColumnWidth('code', 100);
  const [wName, setWName] = useColumnWidth('name', 220);
  const [wQty, setWQty] = useColumnWidth('qty', 140);
  const [wStock, setWStock] = useColumnWidth('stock', 90);
  const [wLeadQty, setWLeadQty] = useColumnWidth('leadQty', 100);
  const [wSales1m, setWSales1m] = useColumnWidth('sales1m', 100);
  const [wSales3m, setWSales3m] = useColumnWidth('sales3m', 100);
  const [wUnit, setWUnit] = useColumnWidth('unit', 70);
  const [wIncoming, setWIncoming] = useColumnWidth('incoming', 90);
  const [wDepletion, setWDepletion] = useColumnWidth('depletion', 110);
  const [wStatus, setWStatus] = useColumnWidth('status', 110);
  const [wTotal, setWTotal] = useColumnWidth('total', 100);

  const filteredProducts = useMemo(() => {
    const base =
      selectedCategory === null
        ? products
        : selectedCategory === SAVED_ALL_FILTER
          ? products.filter((p) => savedCategories.has(p.category))
          : products.filter((p) => p.category === selectedCategory);

    // 1단계: sortMode 기준으로 sorted 목록 생성.
    let sorted: typeof base;
    if (sortMode === 'urgency') {
      sorted = [...base].sort((a, b) => {
        const fa = forecastById.get(a.id);
        const fb = forecastById.get(b.id);
        const rank = (r?: ForecastRow) => {
          if (!r) return 3;
          if (r.status === 'no_history') return 2;
          return 0; // now/later 모두 앞
        };
        const ra = rank(fa);
        const rb = rank(fb);
        if (ra !== rb) return ra - rb;
        const da = fa?.days_until_reorder ?? Number.POSITIVE_INFINITY;
        const db = fb?.days_until_reorder ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return a.code.localeCompare(b.code);
      });
    } else {
      const withHistory: typeof base = [];
      const noHistory: typeof base = [];
      for (const p of base) {
        const f = forecastById.get(p.id);
        if (f && f.status === 'no_history') noHistory.push(p);
        else withHistory.push(p);
      }
      sorted = [...sortByCategory(withHistory), ...sortByCategory(noHistory)];
    }

    // 2단계: pinMode 가 있으면 조건에 맞는 행을 상단으로, 순서는 sorted 그대로 유지.
    if (pinMode === 'none') return sorted;
    const matches = (p: (typeof base)[number]): boolean => {
      // 🔴 제외 카테고리(눈 아이콘 off) 는 pin 대상에서 무조건 제외.
      //    발주서 생성/합계에서 빠지는 원칙과 일관 — 조건이 맞아도 상단으로 끌어올리지
      //    않고 원래 자리에 그대로 남음. 화면에서 숨기는 게 아니라 pin 매칭만 스킵.
      if (excludedCategories.has(p.category)) return false;

      if (pinMode === 'incoming') {
        const f = forecastById.get(p.id);
        return (f?.incoming_qty ?? 0) > 0;
      }
      if (pinMode === 'orderQty') {
        return (orderQty.get(p.id) ?? 0) >= 1;
      }
      // pinMode === 'status'
      if (!statusPinBucket) return false;
      const f = forecastById.get(p.id);
      if (!f || f.status === 'no_history') return false; // 판매이력 없음은 배제
      const d = f.days_until_reorder;
      if (d == null) return false;
      if (statusPinBucket === '1m') return d <= 30;
      if (statusPinBucket === '2m') return d <= 60;
      if (statusPinBucket === '3m') return d <= 90;
      return d > 90; // '3m_plus'
    };
    const pinned: typeof base = [];
    const rest: typeof base = [];
    for (const p of sorted) {
      if (matches(p)) pinned.push(p);
      else rest.push(p);
    }
    return [...pinned, ...rest];
  }, [
    products,
    selectedCategory,
    savedCategories,
    sortMode,
    forecastById,
    pinMode,
    statusPinBucket,
    orderQty,
    excludedCategories,
  ]);

  const totalUsd = useMemo(() => {
    let sum = 0;
    for (const p of products) {
      // 제외 카테고리는 발주 예상 합계에서 빼고 — TopNav 헤더 위젯과 일치.
      if (excludedCategories.has(p.category)) continue;
      const qty = orderQty.get(p.id) ?? 0;
      if (qty > 0 && p.unit_price_usd) sum += qty * Number(p.unit_price_usd);
    }
    return sum;
  }, [products, orderQty, excludedCategories]);

  const filledCount = useMemo(() => {
    let n = 0;
    for (const v of orderQty.values()) if (v > 0) n++;
    return n;
  }, [orderQty]);

  // ───── 액션 ─────

  const updateQty = (productId: string, raw: string) => {
    const next = new Map(orderQty);
    const n = Math.max(0, Math.floor(Number(raw)));
    if (!raw.trim() || !Number.isFinite(n) || n === 0) next.delete(productId);
    else next.set(productId, n);
    setOrderQty(next);
  };

  /** 발주서 생성 — 모든 제품의 추천 발주수량을 자동 입력 (제외 카테고리 스킵). */
  const handleGenerate = () => {
    const next = new Map<string, number>();
    for (const p of products) {
      // 제외 카테고리는 추천 발주수량 생성에서 스킵 — 테이블 값과 푸터 합계 일치.
      if (excludedCategories.has(p.category)) continue;
      const qty6mExcl = salesMap.get(p.id) ?? 0;
      const qty3m = calcSalesQty3m(qty6mExcl);
      // salesBasis 에 따라 기준 수량 결정 (1m = 3m / 3)
      const baseQty = salesBasis === '1m' ? calcSalesQty1m(qty3m) : qty3m;
      const stock = stockMap.get(p.id) ?? 0;
      const incoming = incomingByProduct.get(p.id) ?? 0;
      // 🔴 (2026-07-05) 리드타임 감안 재고 조정 + 입고예정 반영.
      //   depletionAdjustedStock = MAX(0, stock − dailyAvg × leadDays)
      //   = 발주해서 도착할 때까지 자연 소진될 몫을 뺀 "입고 시점에 실제로 남을 재고".
      //   dailyAvg / lead_time_days 는 usePurchaseForecast(ForecastRow) 값 재사용.
      const f = forecastById.get(p.id);
      const leadTimeQty = (f?.daily_avg ?? 0) * (f?.lead_time_days ?? 0);
      const depletionAdjustedStock = Math.max(0, stock - leadTimeQty);
      // 🟠 unit_order 우선 — 없으면 unit 로 폴백. DZ 면 calcOrderQty 가 재고 차감 후 /12.
      const orderQ = calcOrderQty(
        baseQty,
        depletionAdjustedStock + incoming,
        p.unit_order || p.unit,
      );
      if (orderQ > 0) next.set(p.id, orderQ);
    }
    setOrderQty(next);
    const basisLabel = salesBasis === '1m' ? '1개월' : '3개월';
    showToast({
      kind: 'success',
      text: `발주서 생성 완료 (${next.size}품목 · ${basisLabel} 기준, 리드타임·입고예정 반영)`,
    });
  };

  /** 초기화 — 이번 달 draft 발주서 전체 삭제 + orderQty 리셋. */
  const handleReset = async () => {
    if (!window.confirm('발주수량을 모두 초기화하시겠습니까?')) return;
    if (!companyId) return;
    setBusy(true);
    try {
      const monthStartIso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const nextMonthIso = new Date(Date.UTC(year, month, 1)).toISOString();

      // 헤더 조회 → CASCADE 로 items 도 함께 삭제됨 (FK ON DELETE CASCADE)
      const { data: rows, error: selErr } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'draft')
        .gte('po_date', monthStartIso)
        .lt('po_date', nextMonthIso)
        .is('deleted_at', null);
      if (selErr) throw selErr;

      if (rows && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        // 명시적 순서 — items 먼저, 헤더 다음 (FK 안전).
        const { error: itemsDelErr } = await supabase
          .from('purchase_order_items')
          .delete()
          .in('purchase_order_id', ids);
        if (itemsDelErr) throw itemsDelErr;
        const { error: hdrDelErr } = await supabase
          .from('purchase_orders')
          .delete()
          .in('id', ids);
        if (hdrDelErr) throw hdrDelErr;
      }

      setOrderQty(new Map());
      await queryClient.invalidateQueries({
        queryKey: [SAVED_QUERY_KEY, companyId],
      });
      showToast({ kind: 'success', text: '초기화 완료' });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '초기화 실패',
      });
    } finally {
      setBusy(false);
    }
  };

  /** 카테고리 단일 선택 — 클릭한 카테고리만 활성화. */
  const handleCategoryClick = (cat: string) => {
    setSelectedCategory(cat);
  };

  /** 저장된 분류 전체선택 — 가상 sentinel 로 표시 (단일 선택 모델 유지). */
  const handleSelectSavedCategories = () => {
    if (savedCategories.size === 0) return;
    setSelectedCategory(SAVED_ALL_FILTER);
  };

  /** 현재 카테고리 저장 — 선택 상태에 따라 대상 카테고리 결정. */
  const handleSaveCategory = async () => {
    if (!companyId) return;
    const targetCats =
      selectedCategory === null
        ? categories
        : selectedCategory === SAVED_ALL_FILTER
          ? Array.from(savedCategories)
          : [selectedCategory];
    if (targetCats.length === 0) {
      showToast({ kind: 'error', text: '저장할 카테고리가 없습니다.' });
      return;
    }
    setBusy(true);
    try {
      const monthYY = `${year}-${pad2(month)}`;
      let savedCount = 0;
      const skipped: string[] = [];

      for (const cat of targetCats) {
        const items = products
          .filter(
            (p) => p.category === cat && (orderQty.get(p.id) ?? 0) > 0,
          )
          .map((p) => ({
            product_id: p.id,
            quantity: orderQty.get(p.id)!,
            // 🔴 2단계 저장 시점 = 3단계 "복구" 기준값. 저장할 때마다 갱신.
            original_quantity: orderQty.get(p.id)!,
            unit_price_usd:
              p.unit_price_usd != null ? Number(p.unit_price_usd) : null,
          }));
        if (items.length === 0) {
          skipped.push(cat);
          continue;
        }

        const poNumber = `PO-${monthYY}-${cat}`;

        // 같은 po_number 의 기존 draft 삭제 (있을 수 있음)
        const { data: existing, error: selErr } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('company_id', companyId)
          .eq('po_number', poNumber)
          .is('deleted_at', null);
        if (selErr) throw selErr;
        if (existing && existing.length > 0) {
          const ids = existing.map((r) => r.id);
          const { error: delItemsErr } = await supabase
            .from('purchase_order_items')
            .delete()
            .in('purchase_order_id', ids);
          if (delItemsErr) throw delItemsErr;
          const { error: delHdrErr } = await supabase
            .from('purchase_orders')
            .delete()
            .in('id', ids);
          if (delHdrErr) throw delHdrErr;
        }

        const total = items.reduce(
          (s, it) => s + it.quantity * (it.unit_price_usd ?? 0),
          0,
        );

        const { data: header, error: insErr } = await supabase
          .from('purchase_orders')
          .insert({
            company_id: companyId,
            po_number: poNumber,
            po_date: new Date().toISOString(),
            template_id: cat,
            currency: 'USD',
            total_amount: total,
            status: 'draft',
          })
          .select('id')
          .single();
        if (insErr || !header) throw insErr ?? new Error('발주서 헤더 생성 실패');

        const { error: itemsErr } = await supabase
          .from('purchase_order_items')
          .insert(
            items.map((it) => ({
              purchase_order_id: header.id,
              company_id: companyId,
              product_id: it.product_id,
              quantity: it.quantity,
              original_quantity: it.original_quantity,
              unit_price_usd: it.unit_price_usd,
            })),
          );
        if (itemsErr) throw itemsErr;

        savedCount++;
      }

      await queryClient.invalidateQueries({
        queryKey: [SAVED_QUERY_KEY, companyId],
      });

      if (savedCount === 0) {
        showToast({ kind: 'error', text: '저장할 품목이 없습니다.' });
      } else {
        const skipMsg = skipped.length > 0 ? ` (품목 0인 ${skipped.length}개 분류 건너뜀)` : '';
        showToast({
          kind: 'success',
          text: `${savedCount}개 카테고리 저장 완료${skipMsg}`,
        });
      }
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '저장 실패',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * 엑셀 다운로드 — savedCategories 의 품목만 ORDER SHEET 양식으로.
   *
   * 🔴 수량은 반드시 DB (`purchase_order_items.quantity`) 에서 재조회한다.
   *    이유: 3단계 최종결정에서 조정한 수량은 DB 에는 즉시 반영되지만
   *    1-2단계 orderQty 로컬 state 에는 반영되지 않기 때문.
   *    로컬 state 를 그대로 쓰면 조정 전 옛 값이 다운로드된다.
   */
  const handleDownloadExcel = async () => {
    if (!companyId) return;
    if (savedCategories.size === 0) {
      showToast({ kind: 'error', text: '저장된 카테고리가 없습니다.' });
      return;
    }

    let latestQtyMap: Map<string, number>;
    try {
      const snapshot = await fetchSavedSnapshot(companyId);
      latestQtyMap = snapshot.qtyMap;
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '수량 조회 실패',
      });
      return;
    }

    const dateStr = formatDateStr(now);

    // 카테고리 정렬 순서 유지 (categories 는 이미 정렬됨).
    const orderedCats = categories.filter((c) => savedCategories.has(c));
    const lines: Array<{
      code: string;
      name: string;
      unit: string;
      price: number | '';
      qty: number;
      amount: number;
    }> = [];
    for (const cat of orderedCats) {
      for (const p of products) {
        if (p.category !== cat) continue;
        const qty = latestQtyMap.get(p.id) ?? 0;
        if (qty <= 0) continue;
        const price = p.unit_price_usd != null ? Number(p.unit_price_usd) : 0;
        // 미국 공급사 발주서 — 영문명/발주단위 우선, 없으면 한글명/판매단위로 폴백.
        // 수량은 이미 calcOrderQty 로 unit_order 환산을 거친 값이므로 그대로 출력.
        lines.push({
          code: p.code,
          name: p.name_en || p.name,
          unit: p.unit_order || p.unit,
          price: p.unit_price_usd != null ? price : '',
          qty,
          amount: Number((qty * price).toFixed(2)),
        });
      }
    }
    if (lines.length === 0) {
      showToast({ kind: 'error', text: '다운로드할 품목이 없습니다.' });
      return;
    }

    const fileName = `ORDER_SHEET_${dateStr}.xlsx`;
    await downloadOrderSheetXlsx({ lines, dateStr, fileName });

    // 🟠 다운로드된 발주서를 수입/매입 > 인보이스 검증의 "주문서" 슬롯에 자동 반영.
    //    company 당 1행 UPSERT (onConflict: 'company_id'). 인보이스 관련 필드는 초기화.
    const orderRows: OrderSheetRow[] = lines.map((l) => ({
      code: l.code,
      description: l.name,
      unit: l.unit === 'EA' ? 'EA' : 'DZ',
      price: typeof l.price === 'number' ? l.price : 0,
      qty: l.qty,
      amount: l.amount,
    }));
    try {
      await resetInvoiceVerificationForNewOrder({
        companyId,
        orderRows,
        orderFileName: fileName,
      });
      // 새 드래프트 세션이 INSERT 되었음 → InvoiceUploadCard 의 미확정 목록/현재 세션 갱신.
      queryClient.invalidateQueries({
        queryKey: ['invoice-verifications-pending', companyId],
      });
      showToast({
        kind: 'success',
        text: '엑셀 다운로드 완료 · 인보이스 검증에 반영됨',
      });
    } catch (e) {
      showToast({
        kind: 'error',
        text: `엑셀 다운로드는 완료됐지만 인보이스 검증 반영 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  // ───── 렌더 ─────

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '20px 32px 80px',
          maxWidth: 1720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <header style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            재고매입 › 발주서
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="disp"
              style={{
                fontSize: 26,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              발주서
            </h1>
            <div
              style={{
                display: 'flex',
                gap: 18,
                flex: 1,
                flexWrap: 'wrap',
                paddingBottom: 4,
              }}
            >
              <SummaryItem
                label="기준"
                value={`${year}년 ${month}월`}
                sub="(최근 6개월 판매 기준)"
              />
              {/* 🔴 발주확정 USD / 발주 품목 / 저장된 분류 = DB 저장된 purchase_orders + items 기준 (미저장 입력 제외).
                   발주예상 USD = 전체 활성 품목 기준 예상치 (카테고리 필터/저장 상태 무관). */}
              <SummaryItem label="발주 품목" value={`${savedItemCount}개`} />
              <SummaryItem
                label="발주예상 USD"
                value={`$${formatUsd(needEstimateUsd)}`}
                sub={salesBasis === '1m' ? '(1M 기준)' : '(3M 기준)'}
              />
              <SummaryItem
                label="발주확정 USD"
                value={`$${formatUsd(savedTotalUsd)}`}
                tone="brand"
              />
              <SummaryItem
                label="저장된 분류"
                value={`${savedCategories.size}개`}
                tone={savedCategories.size > 0 ? 'success' : undefined}
              />
              {urgentCount > 0 && (
                <SummaryItem
                  label="지금 발주 필요"
                  value={`${urgentCount}건`}
                  tone="danger"
                />
              )}
            </div>
          </div>

          {/*
            📐 툴바 재구성 (2026-07-05):
            상단(핵심 워크플로우 1→2→3→4)과 하단(보조 도구) 두 줄로 분리.
            핵심 4단계는 화살표로 흐름 강조, 초기화는 우측 구분선 뒤로 격리.
            보조 도구는 살짝 톤다운 (height 28) 해서 위계 확보.
          */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || products.length === 0 || busy}
              className="btn-base primary"
              style={{ height: 32, fontSize: 12.5 }}
              title="당월 제외 6개월 판매량 기준 (재고 + 입고예정 차감) 추천 발주수량 자동 입력"
            >
              <FileSpreadsheet size={13} />
              <StepBadge tone="onPrimary">1단계</StepBadge>
              발주서 생성
            </button>
            <StepArrow />
            <button
              type="button"
              onClick={handleSaveCategory}
              disabled={filledCount === 0 || busy}
              className="btn-base"
              style={{ height: 32, fontSize: 12.5 }}
              title="선택된 카테고리(없으면 전체)별로 발주서 저장"
            >
              <Save size={13} />
              <StepBadge>2단계</StepBadge>
              {busy ? '저장 중…' : '현재 카테고리 저장'}
            </button>
            <StepArrow />
            <button
              type="button"
              onClick={() => setShowFinalReview(true)}
              disabled={savedItemCount === 0}
              className="btn-base"
              style={{ height: 32, fontSize: 12.5 }}
              title="저장된 전체 발주서에서 발주수량 입력 품목만 모아 최종 조정"
            >
              <StepBadge>3단계</StepBadge>
              최종결정
            </button>
            <StepArrow />
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={savedCategories.size === 0 || busy}
              className="btn-base"
              style={{ height: 32, fontSize: 12.5 }}
              title="저장된 카테고리 품목만 ORDER SHEET 양식으로 다운로드"
            >
              <Download size={13} />
              <StepBadge>4단계</StepBadge>
              엑셀 다운로드
            </button>
            {/* 초기화: 파괴적 액션 — 시각적으로 격리. */}
            <div style={{ flex: 1 }} />
            <span
              style={{
                width: 1,
                height: 18,
                background: 'var(--line)',
                margin: '0 4px',
              }}
              aria-hidden
            />
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="btn-base"
              style={{ height: 32, fontSize: 12.5 }}
              title="이번 달 발주서 저장본 및 입력값 초기화"
            >
              <RefreshCw size={13} /> 초기화
            </button>
          </div>

          {/* 보조 도구 — 살짝 톤다운(height 28, secondary 스타일 hint). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              보조 도구
            </span>
            {/* 1개월 / 3개월 기준 토글 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: 2,
                background: 'var(--surface)',
              }}
            >
              {(['1m', '3m'] as const).map((basis) => (
                <button
                  key={basis}
                  type="button"
                  onClick={() => setSalesBasis(basis)}
                  style={{
                    height: 22,
                    padding: '0 10px',
                    fontSize: 11.5,
                    fontWeight: salesBasis === basis ? 600 : 400,
                    borderRadius: 4,
                    border: 'none',
                    // 🎨 다크모드 안전 조합 (2026-07-05):
                    //   var(--ink) 는 다크에서 밝은 색이라 흰 글자와 겹쳐 안 보이던
                    //   버그가 반복적으로 발생 → var(--brand) + var(--surface) 로 통일.
                    background: salesBasis === basis ? 'var(--brand)' : 'transparent',
                    color: salesBasis === basis ? 'var(--surface)' : 'var(--ink-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  title={basis === '1m' ? '1개월 판매량 기준' : '3개월 판매량 기준'}
                >
                  {basis === '1m' ? '1개월' : '3개월'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setSortMode((m) =>
                  m === 'category' ? 'urgency' : 'category',
                )
              }
              className="btn-base"
              style={{ height: 28, fontSize: 12, color: 'var(--ink-2)' }}
              title={
                sortMode === 'category'
                  ? '현재: 카테고리→제품명. 클릭 시 발주필요일 오름차순'
                  : '현재: 발주필요일 오름차순. 클릭 시 카테고리→제품명'
              }
            >
              {sortMode === 'category' ? (
                <ArrowDownAZ size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              {sortMode === 'category' ? '카테고리순' : '발주필요일순'}
            </button>

            {/* ── 상단 고정 정렬 3종 (상호 배타) ────────────────────────
                기존 sortMode(카테고리순/발주필요일순) 정렬 결과 위에 조건 매칭
                행을 상단으로 올림. 나머지는 순서 유지. */}
            <span
              style={{
                width: 1,
                height: 16,
                background: 'var(--line)',
                margin: '0 4px',
              }}
              aria-hidden
            />
            <PinToggle
              label="입고예정"
              active={pinMode === 'incoming'}
              onClick={() =>
                setPinMode((m) => (m === 'incoming' ? 'none' : 'incoming'))
              }
              title="입고예정 수량이 있는 행을 상단으로"
            />
            <PinToggle
              label="발주수량"
              active={pinMode === 'orderQty'}
              onClick={() =>
                setPinMode((m) => (m === 'orderQty' ? 'none' : 'orderQty'))
              }
              title="발주수량 입력이 있는 행을 상단으로 (실시간)"
            />
            <StatusPinSelect
              active={pinMode === 'status'}
              bucket={statusPinBucket}
              onChange={(next) => {
                if (next === null) {
                  setStatusPinBucket(null);
                  if (pinMode === 'status') setPinMode('none');
                } else {
                  setStatusPinBucket(next);
                  setPinMode('status');
                }
              }}
            />
            {/* ── 리드타임 조정 (해상/FedEx) ─────────────────────
                localStorage 로 저장, 상태/리드타임수량/발주수량/RPC 전부 이 값 참조. */}
            <span
              style={{
                width: 1,
                height: 16,
                background: 'var(--line)',
                margin: '0 4px',
              }}
              aria-hidden
            />
            <LeadTimeInput
              label="해상"
              value={leadTime.sea}
              onChange={leadTime.setSea}
              title="해상 카테고리(레더다이/스웨이드다이/디글레이저) 리드타임(일)"
            />
            <LeadTimeInput
              label="FedEx"
              value={leadTime.fedex}
              onChange={leadTime.setFedex}
              title="그 외(FedEx) 카테고리 리드타임(일)"
            />
            {!leadTime.isDefault && (
              <button
                type="button"
                onClick={leadTime.reset}
                className="btn-base"
                style={{
                  height: 28,
                  fontSize: 11.5,
                  padding: '0 8px',
                  color: 'var(--ink-3)',
                }}
                title="리드타임을 기본값(해상 90 / FedEx 15)으로 되돌리기"
              >
                초기화
              </button>
            )}
            <span
              style={{
                width: 1,
                height: 16,
                background: 'var(--line)',
                margin: '0 4px',
              }}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => {
                setVerifyMode((v) => !v);
                setVerifyOpen(null);
              }}
              className="btn-base"
              title="계산이 들어간 셀을 클릭하면 그 계산식과 값을 인라인으로 확인"
              style={{
                height: 28,
                fontSize: 12,
                background: verifyMode ? 'var(--brand)' : 'var(--surface)',
                color: verifyMode ? 'var(--surface)' : 'var(--ink-2)',
                borderColor: verifyMode ? 'var(--brand)' : 'var(--line)',
                fontWeight: verifyMode ? 600 : 400,
              }}
            >
              🔎 계산검증{verifyMode ? ' ON' : ''}
            </button>
          </div>
        </header>

        {showFinalReview && (
          <FinalReviewPanel
            companyId={companyId}
            products={products.map((p) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              unit: p.unit,
            }))}
            stockMap={stockMap}
            salesMap={salesMap}
            onBack={() => setShowFinalReview(false)}
            variant="desktop"
          />
        )}

        {!showFinalReview && (
        <>
        {/* 카테고리 필터 바 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
            padding: '10px 12px',
            background: 'var(--surface-2, #fafafa)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <CategoryButton
            label="전체"
            isSelected={selectedCategory === null}
            isSaved={false}
            onClick={() => setSelectedCategory(null)}
          />
          {categories.map((cat) => (
            <CategoryButton
              key={cat}
              label={getCategoryLabel(cat)}
              isSelected={selectedCategory === cat}
              isSaved={savedCategories.has(cat)}
              isExcluded={excludedCategories.has(cat)}
              onClick={() => handleCategoryClick(cat)}
              onToggleExclude={() => toggleExcluded(cat)}
            />
          ))}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleSelectSavedCategories}
            disabled={savedCategories.size === 0}
            className="btn-base"
            style={{ height: 28, fontSize: 12 }}
            title="저장된 카테고리 모두 선택"
          >
            저장된 분류 전체선택
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--danger-wash)',
              color: 'var(--danger)',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 12,
            }}
          >
            데이터 로딩 실패: {error.message}
          </div>
        )}

        {/* 메인 테이블 */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--surface-2, #fafafa)',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <ResizableTh width={wCode} onResize={setWCode}>
                    코드
                  </ResizableTh>
                  <ResizableTh width={wName} align="left" onResize={setWName}>
                    제품명
                  </ResizableTh>
                  <ResizableTh width={wQty} align="right" onResize={setWQty}>
                    발주수량(DZ)
                  </ResizableTh>
                  <ResizableTh width={wStock} align="right" onResize={setWStock}>
                    재고수량
                  </ResizableTh>
                  <ResizableTh
                    width={wLeadQty}
                    align="right"
                    onResize={setWLeadQty}
                  >
                    리드타임수량
                  </ResizableTh>
                  <ResizableTh
                    width={wSales1m}
                    align="right"
                    onResize={setWSales1m}
                  >
                    판매량(1개월)
                  </ResizableTh>
                  <ResizableTh
                    width={wSales3m}
                    align="right"
                    onResize={setWSales3m}
                  >
                    판매량(3개월)
                  </ResizableTh>
                  <ResizableTh width={wUnit} onResize={setWUnit}>
                    단위
                  </ResizableTh>
                  <ResizableTh
                    width={wIncoming}
                    align="right"
                    onResize={setWIncoming}
                  >
                    입고예정
                  </ResizableTh>
                  <ResizableTh
                    width={wDepletion}
                    align="center"
                    onResize={setWDepletion}
                  >
                    재고소진예상일
                  </ResizableTh>
                  <ResizableTh
                    width={wStatus}
                    align="center"
                    onResize={setWStatus}
                  >
                    상태
                  </ResizableTh>
                  <ResizableTh width={wTotal} align="right" onResize={setWTotal}>
                    합계($)
                  </ResizableTh>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td
                      colSpan={12}
                      style={{
                        padding: 40,
                        textAlign: 'center',
                        color: 'var(--ink-3)',
                      }}
                    >
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {!isLoading && filteredProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={12}
                      style={{
                        padding: 40,
                        textAlign: 'center',
                        color: 'var(--ink-3)',
                      }}
                    >
                      표시할 제품이 없습니다.
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filteredProducts.map((p) => {
                    const qty6mExcl = salesMap.get(p.id) ?? 0;
                    const qty3m = calcSalesQty3m(qty6mExcl);
                    const qty1m = calcSalesQty1m(qty3m);
                    const stock = stockMap.get(p.id) ?? 0;
                    const qty = orderQty.get(p.id) ?? 0;
                    const usd =
                      p.unit_price_usd != null ? Number(p.unit_price_usd) : 0;
                    const lineTotal = qty * usd;
                    const f = forecastById.get(p.id);
                    const incoming = f?.incoming_qty ?? 0;
                    // ─── 계산검증용 파생값 (verifyMode 팝오버 노출용) ───
                    const dailyAvg = f?.daily_avg ?? 0;
                    const leadDays = f?.lead_time_days ?? 0;
                    const netQty180 = f?.net_qty_180d ?? 0;
                    const lookback = f?.sales_lookback_days ?? 180;
                    const leadTimeQty = dailyAvg * leadDays;
                    const leadShortage = Math.max(
                      0,
                      Math.round(leadTimeQty - stock),
                    );
                    const effectiveStock = stock + incoming;
                    const daysToDepletion =
                      dailyAvg > 0 ? Math.floor(effectiveStock / dailyAvg) : null;
                    const incomingSources =
                      incomingSourcesByProduct.get(p.id) ?? [];
                    const baseQty = salesBasis === '1m' ? qty1m : qty3m;
                    const depletionAdjustedStock = Math.max(
                      0,
                      Math.round(stock - leadTimeQty),
                    );
                    const genNeed = Math.max(
                      0,
                      baseQty - depletionAdjustedStock - incoming,
                    );
                    const genUnit = (p.unit_order || p.unit || 'EA').toUpperCase();
                    const genOrderQty =
                      genUnit === 'DZ' ? Math.round(genNeed / 12) : genNeed;
                    // ─── 셀별 계산식 노드 (우클릭 시 팝오버 content 로 전달) ───
                    const salesFormula1m = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          판매량(1개월)
                        </div>
                        <Kv k="공식" v="판매량(3개월) ÷ 3, 반올림" />
                        <Kv k="계산" v={`ROUND(${qty3m} ÷ 3) = ${qty1m}`} />
                        <div
                          style={{
                            marginTop: 4,
                            color: 'var(--ink-3)',
                            fontSize: 10.5,
                          }}
                        >
                          * 3개월 = (당월 제외 6개월합 {qty6mExcl} ÷ 6) × 3
                        </div>
                      </>
                    );
                    const salesFormula3m = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          판매량(3개월)
                        </div>
                        <Kv k="공식" v="(당월 제외 6개월합 ÷ 6) × 3, 반올림" />
                        <Kv
                          k="계산"
                          v={`ROUND((${qty6mExcl} ÷ 6) × 3) = ${qty3m}`}
                        />
                      </>
                    );
                    const leadQtyFormula = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          리드타임수량 (부족량 표시)
                        </div>
                        <Kv
                          k="dailyAvg"
                          v={
                            dailyAvg > 0
                              ? `${netQty180} ÷ ${lookback}일 = ${dailyAvg.toFixed(2)}`
                              : '판매이력 없음'
                          }
                        />
                        <Kv
                          k="leadTimeQty"
                          v={`${dailyAvg.toFixed(2)} × ${leadDays}일 = ${leadTimeQty.toFixed(1)}`}
                        />
                        <Kv
                          k="부족량"
                          v={`MAX(0, ${leadTimeQty.toFixed(1)} − 재고 ${stock}) = ${leadShortage}`}
                        />
                      </>
                    );
                    const incomingFormula = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          입고예정 수량
                        </div>
                        <Kv
                          k="합계"
                          v={`${incoming.toLocaleString('ko-KR')} EA (${incomingSources.length}건 세션)`}
                        />
                        {incomingSources.length === 0 ? (
                          <div style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>
                            현재 매칭된 미확정 세션 없음
                          </div>
                        ) : (
                          <div
                            style={{
                              marginTop: 2,
                              color: 'var(--ink-3)',
                              fontSize: 10.5,
                            }}
                          >
                            {incomingSources.map((s, i) => (
                              <div key={i}>
                                · invoice_no {s.invoice_no || '(미입력)'}:{' '}
                                {s.qty.toLocaleString('ko-KR')} EA
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                    const depletionFormula = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          재고소진예상일
                        </div>
                        {dailyAvg <= 0 ? (
                          <div style={{ color: 'var(--ink-3)' }}>
                            판매이력 없음 (dailyAvg=0) → 계산 불가
                          </div>
                        ) : (
                          <>
                            <Kv
                              k="유효재고"
                              v={`재고 ${stock} + 입고예정 ${incoming} = ${effectiveStock}`}
                            />
                            <Kv
                              k="일수"
                              v={`FLOOR(${effectiveStock} ÷ ${dailyAvg.toFixed(2)}) = ${daysToDepletion}일`}
                            />
                            <Kv
                              k="결과"
                              v={`오늘 + ${daysToDepletion}일 = ${f?.depletion_date}`}
                            />
                          </>
                        )}
                      </>
                    );
                    const statusFormula = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          상태 (D-day)
                        </div>
                        {!f || f.status === 'no_history' ? (
                          <div style={{ color: 'var(--ink-3)' }}>
                            판매이력 없음 → 상태 배지 없음
                          </div>
                        ) : (
                          <>
                            <Kv k="소진예상일" v={f.depletion_date ?? '—'} />
                            <Kv
                              k="발주필요일"
                              v={`소진 − 리드타임 ${f.lead_time_days}일 = ${f.reorder_date ?? '—'}`}
                            />
                            <Kv
                              k="D-day"
                              v={
                                f.days_until_reorder != null
                                  ? f.days_until_reorder <= 0
                                    ? '지금 발주 필요'
                                    : `D-${f.days_until_reorder}`
                                  : '—'
                              }
                            />
                          </>
                        )}
                      </>
                    );
                    const qtyFormula = (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          발주수량 (1단계 발주서 생성 로직)
                        </div>
                        <Kv
                          k={`baseQty(${salesBasis === '1m' ? '1M' : '3M'})`}
                          v={baseQty.toLocaleString('ko-KR')}
                        />
                        <Kv
                          k="leadTimeQty"
                          v={`${dailyAvg.toFixed(2)} × ${leadDays}일 = ${leadTimeQty.toFixed(1)}`}
                        />
                        <Kv
                          k="depletionAdjustedStock"
                          v={`MAX(0, ${stock} − ${leadTimeQty.toFixed(1)}) = ${depletionAdjustedStock}`}
                        />
                        <Kv
                          k="부족량(EA)"
                          v={`MAX(0, ${baseQty} − ${depletionAdjustedStock} − ${incoming}) = ${genNeed}`}
                        />
                        <Kv
                          k={`환산(${genUnit})`}
                          v={
                            genUnit === 'DZ'
                              ? `ROUND(${genNeed} ÷ 12) = ${genOrderQty} DZ`
                              : `${genNeed} EA`
                          }
                        />
                        <div
                          style={{
                            marginTop: 4,
                            color: 'var(--ink-3)',
                            fontSize: 10.5,
                          }}
                        >
                          현재 입력값: {qty.toLocaleString('ko-KR')} · 1단계 예상값:{' '}
                          {genOrderQty.toLocaleString('ko-KR')}
                        </div>
                      </>
                    );
                    return (
                      <tr
                        key={p.id}
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        <Td width={wCode}>
                          <span className="num">{p.code}</span>
                        </Td>
                        <Td align="left" width={wName}>
                          {p.name}
                        </Td>
                        <Td align="right" width={wQty}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={qty === 0 ? '' : qty}
                            onChange={(e) => updateQty(p.id, e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            onContextMenu={(e) =>
                              openVerifyAt(e, p.id, 'qty', qtyFormula)
                            }
                            placeholder="0"
                            style={{
                              width: 80,
                              height: 28,
                              padding: '0 8px',
                              border: '1px solid var(--line)',
                              borderRadius: 4,
                              fontSize: 13,
                              textAlign: 'right',
                              fontFamily: 'var(--font-num)',
                              fontVariantNumeric: 'tabular-nums',
                              background: 'var(--surface)',
                              color: 'var(--ink)',
                            }}
                            title={
                              verifyMode
                                ? '우클릭하여 계산식 보기'
                                : undefined
                            }
                          />
                        </Td>
                        <Td align="right" muted width={wStock}>
                          {stock.toLocaleString('ko-KR')}
                        </Td>
                        <Td align="right" width={wLeadQty}>
                          <VerifyCell
                            active={verifyMode}
                            onOpen={(e) =>
                              openVerifyAt(e, p.id, 'leadQty', leadQtyFormula)
                            }
                          >
                            <LeadTimeQtyCell f={f} stock={stock} />
                          </VerifyCell>
                        </Td>
                        <Td align="right" muted width={wSales1m}>
                          <VerifyCell
                            active={verifyMode}
                            onOpen={(e) =>
                              openVerifyAt(e, p.id, 'sales1m', salesFormula1m)
                            }
                          >
                            {qty1m.toLocaleString('ko-KR')}
                          </VerifyCell>
                        </Td>
                        <Td align="right" muted width={wSales3m}>
                          <VerifyCell
                            active={verifyMode}
                            onOpen={(e) =>
                              openVerifyAt(e, p.id, 'sales3m', salesFormula3m)
                            }
                          >
                            {qty3m.toLocaleString('ko-KR')}
                          </VerifyCell>
                        </Td>
                        <Td align="center" muted width={wUnit}>
                          {p.unit}
                        </Td>
                        <Td align="right" width={wIncoming}>
                          <VerifyCell
                            active={verifyMode}
                            onOpen={(e) =>
                              openVerifyAt(e, p.id, 'incoming', incomingFormula)
                            }
                          >
                            {incoming > 0 ? (
                              <span
                                style={{
                                  fontFamily: 'var(--font-num)',
                                  color: 'var(--info, #2563eb)',
                                  fontWeight: 600,
                                }}
                                title="미확정 이관본에서 집계된 입고 예정 수량 (EA)"
                              >
                                +{incoming.toLocaleString('ko-KR')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--ink-4, #ccc)' }}>—</span>
                            )}
                          </VerifyCell>
                        </Td>
                        <Td align="center" width={wDepletion}>
                          <VerifyCell
                            active={verifyMode}
                            onOpen={(e) =>
                              openVerifyAt(e, p.id, 'depletion', depletionFormula)
                            }
                          >
                            {f?.depletion_date ? (
                              <span
                                style={{
                                  fontFamily: 'var(--font-num)',
                                  color: 'var(--ink-2)',
                                  fontSize: 12,
                                }}
                              >
                                {f.depletion_date}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--ink-4, #ccc)' }}>—</span>
                            )}
                          </VerifyCell>
                        </Td>
                        <Td align="center" width={wStatus}>
                          <VerifyCell
                            active={verifyMode}
                            onOpen={(e) =>
                              openVerifyAt(e, p.id, 'status', statusFormula)
                            }
                          >
                            <ForecastStatusBadge row={f} />
                          </VerifyCell>
                        </Td>
                        <Td align="right" width={wTotal}>
                          {qty > 0 ? (
                            <span
                              className="num"
                              style={{
                                fontWeight: 600,
                                color: 'var(--ink)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatUsd(lineTotal)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ink-4, #ccc)' }}>
                              —
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: 'var(--ink-3)',
            textAlign: 'right',
          }}
        >
          총 {filteredProducts.length}품목 표시 · 발주 {filledCount}품목 ·
          총합계 ${formatUsd(totalUsd)}
          {excludedCategories.size > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-3)' }}>
              제외: {Array.from(excludedCategories).join(', ')}
            </div>
          )}
        </div>
        </>
        )}
      </main>

      {/* 계산검증 팝오버 — Portal 로 body 에 fixed 렌더. 테이블 overflow 영향 없음. */}
      {verifyOpen && (
        <VerifyPopover anchor={verifyOpen.anchor} onClose={closeVerify}>
          {verifyOpen.content}
        </VerifyPopover>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function StepBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'onPrimary';
}) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: 'var(--font-num)',
        letterSpacing: '0.04em',
        color: tone === 'onPrimary' ? 'rgba(255,255,255,0.78)' : 'var(--ink-3)',
        marginLeft: 4,
        marginRight: 2,
      }}
    >
      {children}
    </span>
  );
}

/**
 * 계산검증 팝오버 — 우클릭된 셀 좌표에 fixed 위치로 Portal 렌더.
 *
 * · React Portal 로 document.body 에 그려 테이블/셀의 overflow:hidden 영향 없음
 * · anchor(우클릭 대상 셀의 DOMRect) 기준으로 화면 경계 벗어나지 않도록 좌/우, 상/하 방향 보정
 * · 스타일 전부 CSS 변수 (다크모드 안전)
 */
function VerifyPopover({
  anchor,
  children,
  onClose,
}: {
  anchor: DOMRect;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  // 앵커가 화면 오른쪽 절반이면 오른쪽 정렬(팝오버가 왼쪽으로 펼쳐짐).
  const anchorRight = anchor.left + 200 > vw;
  // 앵커가 화면 아래 절반이면 위쪽에 띄움 (팝오버가 위로 펼쳐짐).
  const anchorAbove = anchor.bottom + 200 > vh;

  const posStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    ...(anchorRight
      ? { right: Math.max(4, vw - anchor.right) }
      : { left: Math.max(4, anchor.left) }),
    ...(anchorAbove
      ? { bottom: Math.max(4, vh - anchor.top + 4) }
      : { top: Math.max(4, anchor.bottom + 4) }),
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-verify-popover
      onContextMenu={(e) => e.preventDefault()}
      style={{
        ...posStyle,
        minWidth: 220,
        maxWidth: 320,
        padding: '8px 10px',
        background: 'var(--surface)',
        border: '1px solid var(--line-strong, var(--line))',
        borderRadius: 6,
        boxShadow: 'var(--shadow-lg, 0 6px 20px rgba(0,0,0,0.15))',
        color: 'var(--ink)',
        fontSize: 11.5,
        lineHeight: 1.5,
        fontFamily: 'var(--font-kr)',
        whiteSpace: 'normal',
      }}
    >
      {children}
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 18,
          height: 18,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink-3)',
          fontSize: 12,
          cursor: 'pointer',
          lineHeight: 1,
          padding: 0,
        }}
        aria-label="닫기"
        title="닫기"
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}

/**
 * 계산검증 셀 래퍼.
 *   · active=false : children 그대로 렌더. 우클릭 이벤트 안 건다 → 브라우저 기본 컨텍스트 메뉴 정상 노출.
 *   · active=true  : 우클릭 시 onOpen(e) 호출 → 부모가 좌표 계산 후 verifyOpen 설정.
 *                     팝오버는 부모가 최상단에서 Portal 로 렌더.
 *   · dashed underline hint 로 verifyMode 인지 시각화.
 */
function VerifyCell({
  active,
  onOpen,
  children,
}: {
  active: boolean;
  onOpen: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  return (
    <span
      onContextMenu={onOpen}
      style={{
        cursor: 'context-menu',
        borderBottom: '1px dashed var(--ink-3)',
        display: 'inline-block',
        padding: '0 2px',
      }}
      title="우클릭하여 계산식 보기"
    >
      {children}
    </span>
  );
}

/** 팝오버 안에서 공통 사용할 스타일 (라벨/값 쌍). */
function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'baseline',
        color: 'var(--ink-2)',
      }}
    >
      <span style={{ color: 'var(--ink-3)' }}>{k}</span>
      <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-num)' }}>
        {v}
      </span>
    </div>
  );
}

/**
 * 리드타임 조정 입력 (해상/FedEx 공용).
 * 값은 즉시 반영(onChange). 빈 값/음수/NaN 은 훅 내부 clamp(1..365) 로 방어.
 */
function LeadTimeInput({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  title: string;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11.5,
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-kr)',
      }}
      title={title}
    >
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={365}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: 46,
          height: 26,
          padding: '0 4px',
          border: '1px solid var(--line)',
          borderRadius: 4,
          fontSize: 12,
          textAlign: 'right',
          fontFamily: 'var(--font-num)',
          background: 'var(--surface)',
          color: 'var(--ink)',
          outline: 'none',
        }}
      />
      <span>일</span>
    </label>
  );
}

/** 보조도구 줄의 상단 고정 정렬 토글 (입고예정/발주수량 공용). */
function PinToggle({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-base"
      title={title}
      style={{
        height: 28,
        fontSize: 12,
        // 🎨 다크모드 안전: 활성=brand+surface, 비활성=surface+ink-2.
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? 'var(--surface)' : 'var(--ink-2)',
        borderColor: active ? 'var(--brand)' : 'var(--line)',
        fontWeight: active ? 600 : 400,
      }}
    >
      ↑ {label}
    </button>
  );
}

const STATUS_BUCKETS: ReadonlyArray<{
  key: '1m' | '2m' | '3m' | '3m_plus';
  label: string;
}> = [
  { key: '1m', label: '1개월 (D-30 이내)' },
  { key: '2m', label: '2개월 (D-60 이내)' },
  { key: '3m', label: '3개월 (D-90 이내)' },
  { key: '3m_plus', label: '3개월 이상 (D-90 초과)' },
];

/** '상태' 상단 고정 정렬 — D-day 누적 구간 드롭다운. */
function StatusPinSelect({
  active,
  bucket,
  onChange,
}: {
  active: boolean;
  bucket: '1m' | '2m' | '3m' | '3m_plus' | null;
  onChange: (next: '1m' | '2m' | '3m' | '3m_plus' | null) => void;
}) {
  const value = active && bucket ? bucket : '';
  return (
    <select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') onChange(null);
        else onChange(v as '1m' | '2m' | '3m' | '3m_plus');
      }}
      title="선택한 D-day 누적 구간의 행을 상단으로 (판매이력 없음은 항상 아래)"
      style={{
        height: 28,
        padding: '0 8px',
        borderRadius: 6,
        border: `1px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? 'var(--surface)' : 'var(--ink-2)',
        fontSize: 12,
        fontFamily: 'var(--font-kr)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      <option value="">↑ 상태 (선택 안 함)</option>
      {STATUS_BUCKETS.map((b) => (
        <option key={b.key} value={b.key}>
          ↑ 상태: {b.label}
        </option>
      ))}
    </select>
  );
}

/** 워크플로우 단계 사이의 흐름 화살표 (1→2→3→4). */
function StepArrow() {
  return (
    <ChevronRight
      size={14}
      strokeWidth={1.6}
      style={{ color: 'var(--ink-4, #ccc)', flexShrink: 0 }}
      aria-hidden
    />
  );
}

function CategoryButton({
  label,
  isSelected,
  isSaved,
  isExcluded,
  onClick,
  onToggleExclude,
}: {
  label: string;
  isSelected: boolean;
  isSaved: boolean;
  isExcluded?: boolean;
  onClick: () => void;
  /** 정의되면 좌상단 체크박스 노출 — "전체" 버튼처럼 토글 불필요 시 omit. */
  onToggleExclude?: () => void;
}) {
  // 우선순위: selected > saved > 기본
  let background = 'transparent';
  let color = 'var(--ink)';
  let borderColor = 'var(--line)';
  if (isSelected) {
    background = '#6B1F2A';
    color = '#ffffff';
    borderColor = '#6B1F2A';
  } else if (isSaved) {
    background = '#DCFCE7'; // tailwind green-100
    color = '#166534'; // green-800
    borderColor = '#22C55E'; // green-500
  }
  // 제외 카테고리는 흐리게 + 취소선 — 발주 예상에 안 잡힘을 시각화.
  const opacity = isExcluded ? 0.4 : 1;
  const textDecoration = isExcluded ? 'line-through' : 'none';
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="btn-base"
        style={{
          height: 28,
          fontSize: 12,
          background,
          color,
          borderColor,
          opacity,
          textDecoration,
        }}
      >
        {label}
      </button>
      {onToggleExclude && (
        <input
          type="checkbox"
          checked={!isExcluded}
          onChange={(e) => {
            e.stopPropagation();
            onToggleExclude();
          }}
          onClick={(e) => e.stopPropagation()}
          title={
            isExcluded
              ? '발주 예상에서 제외됨 (클릭하여 포함)'
              : '발주 예상에 포함됨 (클릭하여 제외)'
          }
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            width: 12,
            height: 12,
            accentColor: '#6B1F2A',
            cursor: 'pointer',
          }}
        />
      )}
    </span>
  );
}

/**
 * 리드타임수량(디스플레이) = MAX(0, leadTimeQty − 현재재고).
 *
 * 🔴 (2026-07-05) 표시 전용 clamp. 값이 0 이면 여유, 양수면 부족량(EA).
 *    이 clamp 는 **표시 목적일 뿐**이고, 발주수량 계산의
 *    `depletionAdjustedStock = MAX(0, stock − leadTimeQty)` 는 **별개 계산**.
 *    (한쪽은 "재고 대비 부족량", 다른 쪽은 "리드타임 소진 후 남는 재고" — 개념이 다름.)
 *
 * `dailyAvg` 없음(판매이력 없음) 또는 forecast 미로드 → '—'.
 */
function LeadTimeQtyCell({
  f,
  stock,
}: {
  f: ForecastRow | undefined;
  stock: number;
}) {
  if (!f || !(f.daily_avg > 0)) {
    return <span style={{ color: 'var(--ink-4, #ccc)' }}>—</span>;
  }
  const leadTimeQty = f.daily_avg * f.lead_time_days;
  const display = Math.max(0, Math.round(leadTimeQty - stock));
  const isShortage = display > 0;
  return (
    <span
      style={{
        fontFamily: 'var(--font-num)',
        fontWeight: isShortage ? 600 : 400,
        color: isShortage ? 'var(--danger)' : 'var(--ink-3)',
      }}
      title={`리드타임 ${f.lead_time_days}일 × 일평균 ${f.daily_avg.toFixed(2)} = ${leadTimeQty.toFixed(1)} EA (재고 ${stock} 대비, 부족량 표시)`}
    >
      {display.toLocaleString('ko-KR')}
    </span>
  );
}

/** 재고소진 상태 배지 — D-n / 지금 발주 필요 / 판매이력 없음. */
function ForecastStatusBadge({ row }: { row: ForecastRow | undefined }) {
  if (!row) return <span style={{ color: 'var(--ink-4, #ccc)' }}>—</span>;
  if (row.status === 'no_history') {
    return (
      <span
        style={{
          padding: '2px 8px',
          background: 'var(--surface-2, #f3f4f6)',
          color: 'var(--ink-3)',
          borderRadius: 4,
          fontSize: 10.5,
          fontWeight: 600,
        }}
      >
        판매이력 없음
      </span>
    );
  }
  if (row.status === 'now') {
    return (
      <span
        style={{
          padding: '2px 8px',
          background: 'var(--danger)',
          color: '#FDFAF4',
          borderRadius: 4,
          fontSize: 10.5,
          fontWeight: 600,
        }}
      >
        지금 발주 필요
      </span>
    );
  }
  return (
    <span
      style={{
        padding: '2px 8px',
        background: 'var(--warning-soft, #fef3c7)',
        color: 'var(--warning-ink, #92400e)',
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 600,
        fontFamily: 'var(--font-num)',
      }}
    >
      D-{row.days_until_reorder}
    </span>
  );
}

function SummaryItem({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'brand' | 'success' | 'danger';
}) {
  const color =
    tone === 'brand'
      ? 'var(--brand)'
      : tone === 'success'
        ? 'var(--success)'
        : tone === 'danger'
          ? 'var(--danger)'
          : 'var(--ink)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {sub && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--ink-3)',
              marginLeft: 6,
            }}
          >
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}


function Td({
  children,
  align = 'center',
  muted,
  width,
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  muted?: boolean;
  width?: number;
}) {
  return (
    <td
      style={{
        padding: '8px 12px',
        textAlign: align,
        color: muted ? 'var(--ink-3)' : 'var(--ink)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderRight: '1px solid var(--line)',
        background: muted ? 'var(--surface-2, #fafafa)' : 'var(--surface)',
        ...(width != null ? { width, maxWidth: width } : {}),
      }}
    >
      {children}
    </td>
  );
}
