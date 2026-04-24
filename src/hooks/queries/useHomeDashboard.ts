/**
 * 홈 대시보드 composite query hook.
 *
 * 🔴 CLAUDE.md §1: companyId는 useCompany() 경유만.
 * 🔴 CLAUDE.md §2: 계산식은 utils/calculations 에서만.
 * 🔴 CLAUDE.md §5: 목록 조회는 fetchAllRows 경유.
 *
 * 5개 쿼리를 개별 useQuery 로 병렬 실행 → 한 쿼리 실패가 다른 섹션을 막지 않도록
 * 각각 독립적인 { data, isLoading, error } 로 노출.
 */
import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  calcApproxProfitMargin,
  calcCurrentStockByProduct,
  calcDailySales,
  calcInventoryValue,
  calcMonthlySales,
  calcOrderSuggestionByProduct,
  calcTotalReceivables,
  type ApproxProfitResult,
  type ReceivableCustomer,
  type TotalReceivablesResult,
} from '@/utils/calculations';

// ───────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────

export interface HomeKpi {
  thisMonthSales: number;
  prevMonthSales: number;
  salesDeltaPct: number; // 전월 대비

  receivables: TotalReceivablesResult;
  inventoryValue: number;

  profit: ApproxProfitResult; // 이익률 근사치 (Phase 3)

  /** 계산 시점 기준 연월 */
  year: number;
  month: number;
}

export interface DailySalesPoint {
  date: string; // YYYY-MM-DD (KST)
  amount: number;
}

export interface UnreceivedPO {
  id: string;
  po_number: string;
  po_date: string;
  currency: string;
  total_amount: number;
  days: number;
}

export interface OverdueReceivable {
  customer_id: string;
  name: string;
  grade: string | null;
  balance: number;
  last_order_date: string | null;
  days_since_last: number;
}

export interface LowStockItem {
  product_id: string;
  code: string;
  name: string;
  unit: string;
  onhand: number;
  suggest: number;
}

export interface UnmatchedDeposit {
  id: string;
  depositor_name: string | null;
  amount: number;
  transaction_date: string;
  description: string | null;
}

export interface TodayData {
  unreceivedPOs: UnreceivedPO[];
  overdueReceivables: OverdueReceivable[];
  lowStock: LowStockItem[];
  unmatchedDeposits: UnmatchedDeposit[];
  /** 재고 데이터(로트/트랜잭션) 0건이면 lowStock 섹션을 공란으로 안내. */
  inventoryReady: boolean;
}

export type TimelineKind = 'order' | 'deposit' | 'po_confirm' | 'invoice' | 'stock_move';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  at: string; // ISO
  title: string;
  desc: string;
  ref: string;
  warn?: boolean;
}

type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

// ───────────────────────────────────────────────────────────
// KPI
// ───────────────────────────────────────────────────────────

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function useHomeKpi(companyId: string | null) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  return useQuery<HomeKpi>({
    queryKey: ['home.kpi', companyId, y, m],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<HomeKpi> => {
      const cid = companyId!;
      const { year: py, month: pm } = prevMonth(y, m);

      const [thisMonthSales, prevMonthSales, receivables, inventoryValue, profit] =
        await Promise.all([
          calcMonthlySales(cid, y, m),
          calcMonthlySales(cid, py, pm),
          calcTotalReceivables(cid),
          calcInventoryValue(cid),
          calcApproxProfitMargin(cid, y, m),
        ]);

      const salesDeltaPct =
        prevMonthSales > 0
          ? ((thisMonthSales - prevMonthSales) / prevMonthSales) * 100
          : 0;

      return {
        thisMonthSales,
        prevMonthSales,
        salesDeltaPct,
        receivables,
        inventoryValue,
        profit,
        year: y,
        month: m,
      };
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// 일별 매출 시계열 (이번기간 / 전년동기)
// ───────────────────────────────────────────────────────────

function daysAgoIso(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function addYears(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString();
}

export function useDailySales(companyId: string | null, windowDays = 30) {
  const endIso = new Date().toISOString();
  const startIso = daysAgoIso(windowDays - 1);
  const prevStartIso = addYears(startIso, -1);
  const prevEndIso = addYears(endIso, -1);

  return useQuery<{ current: DailySalesPoint[]; previous: DailySalesPoint[] }>({
    queryKey: ['home.daily-sales', companyId, windowDays, startIso.slice(0, 10)],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const cid = companyId!;
      const [current, previous] = await Promise.all([
        calcDailySales(cid, startIso, endIso),
        calcDailySales(cid, prevStartIso, prevEndIso),
      ]);
      return { current, previous };
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// Today 4블록
// ───────────────────────────────────────────────────────────

interface PoRow {
  id: string;
  po_number: string;
  po_date: string;
  currency: string;
  total_amount: number;
}

interface DepositRow {
  id: string;
  depositor_name: string | null;
  amount: number;
  transaction_date: string;
  description: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  grade: string | null;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
  unit: string;
}

async function fetchUnreceivedPOs(companyId: string): Promise<UnreceivedPO[]> {
  const rows = await fetchAllRows<PoRow>(() =>
    supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, currency, total_amount')
      .eq('company_id', companyId)
      .in('status', ['sent', 'confirmed'])
      .is('deleted_at', null)
      .order('po_date', { ascending: true }) as unknown as RangeableQuery<PoRow>,
  );
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    po_number: r.po_number,
    po_date: r.po_date,
    currency: r.currency,
    total_amount: Number(r.total_amount),
    days: Math.floor((now - new Date(r.po_date).getTime()) / 86_400_000),
  }));
}

async function fetchOverdueReceivables(
  companyId: string,
): Promise<OverdueReceivable[]> {
  const result = await calcTotalReceivables(companyId);
  const overdue = result.customers.filter(
    (c) => c.balance > 0 && (c.days_since_last ?? 0) > 30,
  );
  if (overdue.length === 0) return [];

  const ids = overdue.map((c) => c.customer_id);
  const customers = await fetchAllRows<CustomerRow>(() =>
    supabase
      .from('customers')
      .select('id, name, grade')
      .eq('company_id', companyId)
      .in('id', ids)
      .is('deleted_at', null) as unknown as RangeableQuery<CustomerRow>,
  );
  const byId = new Map(customers.map((c) => [c.id, c]));

  return overdue
    .map((c): OverdueReceivable => {
      const info = byId.get(c.customer_id);
      return {
        customer_id: c.customer_id,
        name: info?.name ?? '—',
        grade: info?.grade ?? null,
        balance: c.balance,
        last_order_date: c.last_order_date,
        days_since_last: c.days_since_last ?? 0,
      };
    })
    .sort((a, b) => b.days_since_last - a.days_since_last);
}

async function fetchLowStock(
  companyId: string,
): Promise<{ items: LowStockItem[]; ready: boolean }> {
  // 재고 데이터(로트/트랜잭션)가 전무하면 '준비 전' 로 간주. 불필요한 N쿼리 방지.
  const { count: lotCount } = (await supabase
    .from('inventory_lots')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)) as { count: number | null };
  const { count: txCount } = (await supabase
    .from('inventory_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)) as { count: number | null };

  if ((lotCount ?? 0) === 0 && (txCount ?? 0) === 0) {
    return { items: [], ready: false };
  }

  // 🟠 N+1 해결: 제품별 계산식을 루프로 돌리지 않고, 전 회사 범위 배치 집계 2회로 대체.
  //    - calcCurrentStockByProduct: inventory_lots / inventory_transactions / order_items(YTD) 각 1회
  //    - calcOrderSuggestionByProduct: order_items(과거 6개월) 1회
  //    products 리스트와 병렬 fetch 로 전체 대기시간 최소화.
  const [products, stockMap, suggestMap] = await Promise.all([
    fetchAllRows<ProductRow>(() =>
      supabase
        .from('products')
        .select('id, code, name, unit')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null) as unknown as RangeableQuery<ProductRow>,
    ),
    calcCurrentStockByProduct(companyId),
    calcOrderSuggestionByProduct(companyId),
  ]);

  const rows: LowStockItem[] = products.map((p) => ({
    product_id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    onhand: stockMap.get(p.id)?.current ?? 0,
    suggest: suggestMap.get(p.id) ?? 0,
  }));

  const low = rows
    .filter((r) => r.suggest > 0 && r.onhand < r.suggest * 0.3)
    .sort((a, b) => a.onhand - b.onhand);
  return { items: low, ready: true };
}

async function fetchUnmatchedDeposits(companyId: string): Promise<UnmatchedDeposit[]> {
  const sinceIso = daysAgoIso(7);
  const rows = await fetchAllRows<DepositRow>(() =>
    supabase
      .from('bank_transactions')
      .select('id, depositor_name, amount, transaction_date, description')
      .eq('company_id', companyId)
      .eq('type', 'deposit')
      .eq('match_status', 'unmatched')
      .gte('transaction_date', sinceIso)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false }) as unknown as RangeableQuery<DepositRow>,
  );
  return rows;
}

export function useTodayData(companyId: string | null) {
  return useQuery<TodayData>({
    queryKey: ['home.today', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<TodayData> => {
      const cid = companyId!;
      const [unreceivedPOs, overdueReceivables, low, unmatchedDeposits] = await Promise.all([
        fetchUnreceivedPOs(cid),
        fetchOverdueReceivables(cid),
        fetchLowStock(cid),
        fetchUnmatchedDeposits(cid),
      ]);
      return {
        unreceivedPOs,
        overdueReceivables,
        lowStock: low.items,
        unmatchedDeposits,
        inventoryReady: low.ready,
      };
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// Timeline — 5종 이벤트 머지
// ───────────────────────────────────────────────────────────

interface OrderTimelineRow {
  id: string;
  order_date: string;
  total_amount: number;
  customer: { name: string } | null;
  items_count?: number;
}

interface DepositTimelineRow {
  id: string;
  transaction_date: string;
  amount: number;
  depositor_name: string | null;
  match_status: string;
  customer: { name: string } | null;
  description: string | null;
}

interface PoTimelineRow {
  id: string;
  po_number: string;
  po_date: string;
  currency: string;
  total_amount: number;
  status: string;
}

interface InvoiceTimelineRow {
  id: string;
  exported_at: string | null;
  total_amount: number;
  invoice_year: number;
  invoice_month: number;
  business: { name: string } | null;
}

interface StockTxTimelineRow {
  id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  product: { name: string; code: string } | null;
}

async function fetchTimelineOrders(companyId: string): Promise<TimelineEvent[]> {
  const rows = await fetchAllRows<OrderTimelineRow>(() =>
    supabase
      .from('orders')
      .select('id, order_date, total_amount, customer:customers(name)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('order_date', { ascending: false })
      .limit(8) as unknown as RangeableQuery<OrderTimelineRow>,
  );
  return rows.map(
    (r): TimelineEvent => ({
      id: `order:${r.id}`,
      kind: 'order',
      at: r.order_date,
      title: '신규 주문',
      desc: `${r.customer?.name ?? '알 수 없음'} — ₩${r.total_amount.toLocaleString('ko-KR')}`,
      ref: `ORD-${r.id.slice(0, 8)}`,
    }),
  );
}

async function fetchTimelineDeposits(companyId: string): Promise<TimelineEvent[]> {
  const rows = await fetchAllRows<DepositTimelineRow>(() =>
    supabase
      .from('bank_transactions')
      .select(
        'id, transaction_date, amount, depositor_name, match_status, description, customer:customers(name)',
      )
      .eq('company_id', companyId)
      .eq('type', 'deposit')
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .limit(5) as unknown as RangeableQuery<DepositTimelineRow>,
  );
  return rows.map((r): TimelineEvent => {
    const matched = r.match_status === 'matched';
    const who = r.customer?.name ?? r.depositor_name ?? '—';
    return {
      id: `deposit:${r.id}`,
      kind: 'deposit',
      at: r.transaction_date,
      title: matched ? '입금 매칭' : '입금 미매칭',
      desc: `${who} ₩${r.amount.toLocaleString('ko-KR')}`,
      ref: `DEP-${r.id.slice(0, 8)}`,
      warn: !matched,
    };
  });
}

async function fetchTimelinePOs(companyId: string): Promise<TimelineEvent[]> {
  const rows = await fetchAllRows<PoTimelineRow>(() =>
    supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, currency, total_amount, status')
      .eq('company_id', companyId)
      .in('status', ['sent', 'confirmed'])
      .is('deleted_at', null)
      .order('po_date', { ascending: false })
      .limit(5) as unknown as RangeableQuery<PoTimelineRow>,
  );
  return rows.map(
    (r): TimelineEvent => ({
      id: `po:${r.id}`,
      kind: 'po_confirm',
      at: r.po_date,
      title: r.status === 'confirmed' ? '발주 확정' : '발주 전송',
      desc: `${r.currency} ${Number(r.total_amount).toLocaleString('en-US')} · ${r.po_number}`,
      ref: r.po_number,
    }),
  );
}

async function fetchTimelineInvoices(companyId: string): Promise<TimelineEvent[]> {
  const rows = await fetchAllRows<InvoiceTimelineRow>(() =>
    supabase
      .from('tax_invoices')
      .select(
        'id, exported_at, total_amount, invoice_year, invoice_month, business:businesses(name)',
      )
      .eq('company_id', companyId)
      .not('exported_at', 'is', null)
      .is('deleted_at', null)
      .order('exported_at', { ascending: false })
      .limit(5) as unknown as RangeableQuery<InvoiceTimelineRow>,
  );
  return rows
    .filter((r) => r.exported_at)
    .map(
      (r): TimelineEvent => ({
        id: `inv:${r.id}`,
        kind: 'invoice',
        at: r.exported_at!,
        title: '세금계산서 발행',
        desc: `${r.business?.name ?? '—'} — ₩${r.total_amount.toLocaleString('ko-KR')}`,
        ref: `TAX-${r.invoice_year}${String(r.invoice_month).padStart(2, '0')}`,
      }),
    );
}

async function fetchTimelineStockTx(companyId: string): Promise<TimelineEvent[]> {
  const rows = await fetchAllRows<StockTxTimelineRow>(() =>
    supabase
      .from('inventory_transactions')
      .select('id, transaction_date, type, quantity, product:products(name, code)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .limit(5) as unknown as RangeableQuery<StockTxTimelineRow>,
  );
  const typeLabel: Record<string, string> = {
    out: '재고 출고',
    return: '재고 반품 입고',
    damage: '재고 파손',
  };
  return rows.map(
    (r): TimelineEvent => ({
      id: `stock:${r.id}`,
      kind: 'stock_move',
      at: r.transaction_date,
      title: typeLabel[r.type] ?? '재고 이동',
      desc: `${r.product?.name ?? '—'} · ${r.quantity}건`,
      ref: r.product?.code ?? '—',
    }),
  );
}

export function useTimelineEvents(companyId: string | null) {
  return useQuery<TimelineEvent[]>({
    queryKey: ['home.timeline', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const cid = companyId!;
      const results = await Promise.allSettled([
        fetchTimelineOrders(cid),
        fetchTimelineDeposits(cid),
        fetchTimelinePOs(cid),
        fetchTimelineInvoices(cid),
        fetchTimelineStockTx(cid),
      ]);
      const merged: TimelineEvent[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
        else console.warn('[timeline] partial fetch failed:', r.reason);
      }
      merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      return merged.slice(0, 10);
    },
    staleTime: 60_000,
  });
}

// Re-export public types for convenience.
export type { ReceivableCustomer };
