/**
 * 매출분석 페이지 전용 통합 쿼리 + 피벗 헬퍼.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 fetchAllRows 경유.
 *
 * 패턴:
 * - 연도 1회만 서버 fetch (order_items + orders + customers + products JOIN).
 * - 탭/필터 별 피벗은 클라이언트에서 useMemo + 본 파일의 pivot* 헬퍼.
 *
 * 🔴 금액 집계 SoT 는 `orders.total_amount` (공급가 + VAT 기준).
 *    `order_items.amount` 는 일부 레거시 데이터에서 판매가로 저장된 케이스가 있어
 *    합계 산출에는 사용하지 않는다. 제품별 수량 집계에는 `order_items.quantity` 사용.
 * 🟠 동일 order_id 가 N 개 item 으로 펼쳐져 들어오므로 월별/일별 합계는 order_id 중복제거.
 * 🟠 KST 기준 월/일 산정 — Vercel(UTC) 환경에서도 한국 회계상 월/일이 일관되게 잡힘.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { compareCategoryThenName } from '@/utils/sortProducts';

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────

export interface SalesRawRow {
  order_id: string;
  order_date: string;
  customer_id: string;
  customer_name: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  product_category: string;
  quantity: number;
  /** order_items.amount — 제품별/수량 분석 용. 금액 합계에는 사용 금지. */
  amount: number;
  is_return: boolean;
  /** orders.total_amount — 금액 합계의 SoT. 같은 order_id 의 모든 행에서 동일값. */
  order_total_amount: number;
}

export interface MonthlySalesRow {
  customer_id: string;
  customer_name: string;
  /** 1~12 → 금액 합계. 데이터 없는 월은 키 없음. */
  monthly: Record<number, number>;
  total: number;
}

export interface DailySalesRow {
  /** YYYY-MM-DD (KST) */
  date: string;
  /** customer_id → 금액 */
  byCustomer: Record<string, number>;
  total: number;
}

export interface ProductSalesRow {
  product_id: string;
  product_name: string;
  product_code: string;
  category: string;
  /** 1~12 → 수량 합계. */
  monthly: Record<number, number>;
  total: number;
}

export interface CustomerColumn {
  id: string;
  name: string;
}

// ───────────────────────────────────────────────────────────
// KST 유틸
// ───────────────────────────────────────────────────────────

function kstParts(iso: string): { y: number; m: number; d: number } {
  const utc = new Date(iso);
  const kst = new Date(utc.getTime() + 9 * 3600 * 1000);
  return {
    y: kst.getUTCFullYear(),
    m: kst.getUTCMonth() + 1,
    d: kst.getUTCDate(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function kstDateKey(iso: string): string {
  const { y, m, d } = kstParts(iso);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// ───────────────────────────────────────────────────────────
// 서버 쿼리
// ───────────────────────────────────────────────────────────

interface RawJoinRow {
  order_id: string;
  quantity: number;
  amount: number;
  is_return: boolean;
  order: {
    order_date: string;
    company_id: string;
    total_amount: number;
    customer: { id: string; name: string } | null;
  } | null;
  product: {
    id: string;
    code: string;
    name: string;
    category: string;
  } | null;
}

async function fetchSalesYear(
  companyId: string,
  year: number,
): Promise<SalesRawRow[]> {
  // KST 기준 [year-01-01, (year+1)-01-01) — Vercel(UTC) 환경에서도 KST 회계 연도 정확.
  const fromIso = new Date(`${year}-01-01T00:00:00+09:00`).toISOString();
  const toIso = new Date(`${year + 1}-01-01T00:00:00+09:00`).toISOString();

  // 🟠 SQL 단계의 is_return 필터 제거 — 환불만 있는 주문도 orders.total_amount 합계에는
  //    반영되어야 함. 수량(제품별 탭)에서는 JS 단계에서 is_return=false 필터 적용.
  const rows = await fetchAllRows<RawJoinRow>(
    () =>
      supabase
        .from('order_items')
        .select(
          `order_id, quantity, amount, is_return,
           order:orders!inner(order_date, company_id, total_amount,
             customer:customers(id, name)),
           product:products(id, code, name, category)`,
        )
        .eq('company_id', companyId)
        .gte('order.order_date', fromIso)
        .lt('order.order_date', toIso) as never,
  );

  const out = rows
    .filter((r) => r.order && r.order.customer)
    .map((r) => ({
      order_id: r.order_id,
      order_date: r.order!.order_date,
      customer_id: r.order!.customer!.id,
      customer_name: r.order!.customer!.name,
      product_id: r.product?.id ?? null,
      product_code: r.product?.code ?? '',
      product_name: r.product?.name ?? '(삭제됨)',
      product_category: r.product?.category ?? '',
      quantity: r.quantity,
      amount: r.amount,
      is_return: r.is_return,
      order_total_amount: r.order!.total_amount,
    }));

  // 🟡 진단용 — 새 코드(v3) 로드 + total_amount SoT 적용 검증.
  //    콘솔에 호미화방 2월 = 586750 / 디엔에스 3월 = 4985640 이 찍히면 정상.
  if (typeof window !== 'undefined') {
    const orderTotals = new Map<string, { date: string; cust: string; amt: number }>();
    for (const r of out) {
      if (!orderTotals.has(r.order_id)) {
        orderTotals.set(r.order_id, {
          date: r.order_date,
          cust: r.customer_name,
          amt: r.order_total_amount,
        });
      }
    }
    const byMonthCust = new Map<string, number>();
    for (const o of orderTotals.values()) {
      const utc = new Date(o.date);
      const kst = new Date(utc.getTime() + 9 * 3600 * 1000);
      const m = kst.getUTCMonth() + 1;
      const k = `${o.cust}|${m}월`;
      byMonthCust.set(k, (byMonthCust.get(k) ?? 0) + o.amt);
    }
    // eslint-disable-next-line no-console
    console.log('[sales-analysis v3] total_amount 기준 검증', {
      '호미화방 2월': byMonthCust.get('㈜호미화방|2월') ?? 0,
      '디엔에스 3월': byMonthCust.get('디엔에스|3월') ?? 0,
    });
  }
  return out;
}

export function useSalesAnalysis(companyId: string | null, year: number) {
  return useQuery<SalesRawRow[]>({
    // 🔴 queryKey 'v2' — orders.total_amount 기준으로 산식이 변경되어 기존 'sales-analysis'
    //    캐시(레거시 items.amount 합산값)와 강제 분리.
    queryKey: ['sales-analysis-v3', companyId, year],
    enabled: Boolean(companyId),
    queryFn: () => fetchSalesYear(companyId!, year),
    staleTime: 0,
  });
}

// ───────────────────────────────────────────────────────────
// 피벗 헬퍼
// ───────────────────────────────────────────────────────────

/**
 * 월별매출 (거래처 × 월) 피벗 — orders.total_amount 기준.
 * 🔴 같은 order_id 의 item 행이 N 개 펼쳐져 있으므로 order_id 별로 1회만 합산.
 * - customerFilter null → 전체. 합계 내림차순.
 */
export function pivotMonthly(
  rows: SalesRawRow[],
  customerFilter: string | null,
): MonthlySalesRow[] {
  const seenOrders = new Set<string>();
  const map = new Map<string, MonthlySalesRow>();
  for (const r of rows) {
    if (customerFilter && r.customer_id !== customerFilter) continue;
    if (seenOrders.has(r.order_id)) continue;
    seenOrders.add(r.order_id);
    const { m } = kstParts(r.order_date);
    let row = map.get(r.customer_id);
    if (!row) {
      row = {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        monthly: {},
        total: 0,
      };
      map.set(r.customer_id, row);
    }
    row.monthly[m] = (row.monthly[m] ?? 0) + r.order_total_amount;
    row.total += r.order_total_amount;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/**
 * 일별매출 (날짜 × 거래처) 피벗 — orders.total_amount 기준.
 * 🔴 같은 order_id 의 item 행이 N 개 펼쳐져 있으므로 order_id 별로 1회만 합산.
 * - monthFilter 비어있으면 전체 월. customerFilter null → 전체 거래처.
 * - 날짜 내림차순. 거래처 컬럼은 실제 데이터 있는 거래처만 한글 정렬.
 */
export function pivotDaily(
  rows: SalesRawRow[],
  monthFilter: number[],
  customerFilter: string | null,
): { rows: DailySalesRow[]; customers: CustomerColumn[] } {
  const monthSet = new Set(monthFilter);
  const dateMap = new Map<string, DailySalesRow>();
  const custMap = new Map<string, CustomerColumn>();
  const seenOrders = new Set<string>();

  for (const r of rows) {
    if (customerFilter && r.customer_id !== customerFilter) continue;
    if (monthFilter.length > 0) {
      const { m } = kstParts(r.order_date);
      if (!monthSet.has(m)) continue;
    }
    if (seenOrders.has(r.order_id)) continue;
    seenOrders.add(r.order_id);
    const dateKey = kstDateKey(r.order_date);
    let row = dateMap.get(dateKey);
    if (!row) {
      row = { date: dateKey, byCustomer: {}, total: 0 };
      dateMap.set(dateKey, row);
    }
    row.byCustomer[r.customer_id] =
      (row.byCustomer[r.customer_id] ?? 0) + r.order_total_amount;
    row.total += r.order_total_amount;
    if (!custMap.has(r.customer_id)) {
      custMap.set(r.customer_id, {
        id: r.customer_id,
        name: r.customer_name,
      });
    }
  }

  const sortedRows = Array.from(dateMap.values()).sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );
  const customers = Array.from(custMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  );
  return { rows: sortedRows, customers };
}

/**
 * 제품별판매 (제품 × 월) 피벗 — 수량 기준.
 * - 카테고리/검색/거래처/월 필터 모두 적용.
 * - 정렬: 분류명 → 제품명 한글 오름차순 (재고현황/발주서/제품리스트와 통일).
 */
export function pivotByProduct(
  rows: SalesRawRow[],
  monthFilter: number[],
  customerFilter: string | null,
  categoryFilter: string | null,
  searchQuery: string,
  customerNameQuery: string = '',
): ProductSalesRow[] {
  const monthSet = new Set(monthFilter);
  const q = searchQuery.trim().toLowerCase();
  const cnq = customerNameQuery.trim().toLowerCase();
  const map = new Map<string, ProductSalesRow>();

  for (const r of rows) {
    if (!r.product_id) continue;
    // 🟠 수량 분석은 정상 출고만. (SQL 단계의 is_return 필터 제거 후 JS 단계 가드)
    if (r.is_return) continue;
    if (customerFilter && r.customer_id !== customerFilter) continue;
    // 🟠 제품별판매 탭 전용 자유 텍스트 업체명 검색 — 부분 문자열, 대소문자 무시.
    if (cnq && !r.customer_name.toLowerCase().includes(cnq)) continue;
    if (categoryFilter && r.product_category !== categoryFilter) continue;
    if (
      q &&
      !r.product_code.toLowerCase().includes(q) &&
      !r.product_name.toLowerCase().includes(q)
    )
      continue;
    const { m } = kstParts(r.order_date);
    if (monthFilter.length > 0 && !monthSet.has(m)) continue;

    let row = map.get(r.product_id);
    if (!row) {
      row = {
        product_id: r.product_id,
        product_name: r.product_name,
        product_code: r.product_code,
        category: r.product_category,
        monthly: {},
        total: 0,
      };
      map.set(r.product_id, row);
    }
    row.monthly[m] = (row.monthly[m] ?? 0) + r.quantity;
    row.total += r.quantity;
  }
  return Array.from(map.values()).sort((a, b) =>
    compareCategoryThenName(a.category, a.product_name, b.category, b.product_name),
  );
}

// ───────────────────────────────────────────────────────────
// 필터 옵션 추출
// ───────────────────────────────────────────────────────────

export function getCustomerList(rows: SalesRawRow[]): CustomerColumn[] {
  const map = new Map<string, CustomerColumn>();
  for (const r of rows) {
    if (!map.has(r.customer_id)) {
      map.set(r.customer_id, { id: r.customer_id, name: r.customer_name });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  );
}

export function getCategoryList(rows: SalesRawRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.product_category) set.add(r.product_category);
  return Array.from(set).sort();
}
