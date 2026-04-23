/**
 * 🔴 모든 비즈니스 계산식은 이 파일에만 존재한다 (CLAUDE.md §2).
 * 🔴 첫 인자는 반드시 `companyId` (calcSupplyAmount는 순수 산술 예외).
 * 🟠 페이지 파일에서 계산 로직을 직접 작성하지 말 것.
 * 🔴 Supabase 목록 조회는 fetchAllRows 경유 (§5).
 *
 * Phase 3 확장: 홈 대시보드용 집계 4종 추가 (calcMonthlySales / calcDailySales
 * / calcTotalReceivables / calcInventoryValue) + 재고용 2종 (calcCurrentStock
 * / calcOrderSuggestion) 실구현.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { Period } from '@/types/common';

// ───────────────────────────────────────────────────────────
// 내부 유틸
// ───────────────────────────────────────────────────────────

/** `[year, month)` 월 구간의 ISO 시작/끝 ISO 문자열. month: 1~12. */
function monthRange(year: number, month: number): { start: string; end: string } {
  // month-1 (JS 0-index), 다음 달 1일을 end로 (미포함).
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** YYYY-MM-DD (KST 기준) 추출. */
function toKstDateKey(iso: string): string {
  const d = new Date(iso);
  // KST 오프셋 적용 후 날짜 추출.
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface OrderRow {
  id: string;
  customer_id: string;
  order_date: string;
  total_amount: number;
}

interface OrderItemRow {
  order_id: string;
  quantity: number;
  amount: number;
  is_return: boolean;
}

interface OrderWithItems extends OrderRow {
  items: OrderItemRow[];
}

type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

/**
 * 기간 내 주문(+items) 조회. 반품 플래그 포함.
 * `is_return=true` 로우의 amount는 음수로 저장된다고 가정 (Orders 페이지 기존 로직과 일관).
 */
async function fetchOrdersWithItems(
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<OrderWithItems[]> {
  const rows = await fetchAllRows<OrderWithItems>(() =>
    supabase
      .from('orders')
      .select(
        `id, customer_id, order_date, total_amount,
         items:order_items ( order_id, quantity, amount, is_return )`,
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('order_date', startIso)
      .lt('order_date', endIso)
      .order('order_date', { ascending: true }) as unknown as RangeableQuery<OrderWithItems>,
  );
  return rows;
}

// ───────────────────────────────────────────────────────────
// 매출 계산
// ───────────────────────────────────────────────────────────

/**
 * 특정 연월의 순매출 (부가세 포함).
 * 공식: SUM(order_items.amount) WHERE 해당 기간.
 * `is_return=true` 로우는 자체 amount가 음수로 들어있어 자연스럽게 상쇄된다.
 */
export async function calcMonthlySales(
  companyId: string,
  year: number,
  month: number,
): Promise<number> {
  const { start, end } = monthRange(year, month);
  const orders = await fetchOrdersWithItems(companyId, start, end);
  let sum = 0;
  for (const o of orders) {
    for (const it of o.items) {
      sum += it.amount;
    }
  }
  return sum;
}

/**
 * 기간 내 일자별 순매출 시계열. 주문이 없는 날은 amount=0 으로 채움.
 * 날짜는 KST 기준 YYYY-MM-DD.
 */
export async function calcDailySales(
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<Array<{ date: string; amount: number }>> {
  const orders = await fetchOrdersWithItems(companyId, startIso, endIso);
  const bucket = new Map<string, number>();

  for (const o of orders) {
    const key = toKstDateKey(o.order_date);
    const sum = o.items.reduce((s, it) => s + it.amount, 0);
    bucket.set(key, (bucket.get(key) ?? 0) + sum);
  }

  // 빈 날 포함 연속 시계열.
  const out: Array<{ date: string; amount: number }> = [];
  const s = new Date(startIso);
  const e = new Date(endIso);
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const endDay = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
  while (cur <= endDay) {
    const key = toKstDateKey(cur.toISOString());
    out.push({ date: key, amount: bucket.get(key) ?? 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ───────────────────────────────────────────────────────────
// 미수금 계산
// ───────────────────────────────────────────────────────────

interface BankDepositRow {
  customer_id: string | null;
  amount: number;
  transaction_date: string;
}

/** 거래처별 총입금 합계 맵. 매칭된 deposit만 집계. */
async function fetchDepositsByCustomer(companyId: string): Promise<Map<string, number>> {
  const rows = await fetchAllRows<BankDepositRow>(() =>
    supabase
      .from('bank_transactions')
      .select('customer_id, amount, transaction_date')
      .eq('company_id', companyId)
      .eq('type', 'deposit')
      .eq('match_status', 'matched')
      .is('deleted_at', null) as unknown as RangeableQuery<BankDepositRow>,
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.customer_id) continue;
    map.set(r.customer_id, (map.get(r.customer_id) ?? 0) + r.amount);
  }
  return map;
}

interface OrderForReceivableRow {
  customer_id: string;
  order_date: string;
  total_amount: number;
}

/**
 * 거래처별 미수금 (단일).
 * 공식: 해당 거래처 총매출(기간 무관, 반품 상쇄 후) - 해당 거래처 총입금(매칭분).
 */
export async function calcReceivables(
  companyId: string,
  customerId: string,
): Promise<number> {
  const orders = await fetchAllRows<OrderForReceivableRow>(() =>
    supabase
      .from('orders')
      .select('customer_id, order_date, total_amount')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .is('deleted_at', null) as unknown as RangeableQuery<OrderForReceivableRow>,
  );
  const sales = orders.reduce((s, o) => s + o.total_amount, 0);

  const deposits = await fetchAllRows<BankDepositRow>(() =>
    supabase
      .from('bank_transactions')
      .select('customer_id, amount, transaction_date')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('type', 'deposit')
      .eq('match_status', 'matched')
      .is('deleted_at', null) as unknown as RangeableQuery<BankDepositRow>,
  );
  const paid = deposits.reduce((s, d) => s + d.amount, 0);

  return sales - paid;
}

export interface ReceivableCustomer {
  customer_id: string;
  balance: number;
  last_order_date: string | null;
  days_since_last: number | null;
}

export interface TotalReceivablesResult {
  total: number;
  customers: ReceivableCustomer[];
  /** 마지막 거래일 기준 30일 이상 경과한 잔액>0 거래처 수. */
  overdueCount: number;
}

export interface CustomerAggregate {
  customer_id: string;
  total_sales: number;
  paid: number;
  balance: number; // total_sales - paid
  order_count: number;
  last_order_date: string | null;
  days_since_last: number | null;
}

/**
 * 거래처별 집계 (주문이 1건 이상 있는 거래처만 포함).
 * 주문 0인 거래처는 호출부에서 customers 마스터 리스트와 left-merge 하여 0으로 채울 것.
 * 🟠 orders + bank_transactions 2회 fetch 로 모든 집계를 구성.
 */
export async function calcCustomerAggregates(
  companyId: string,
): Promise<CustomerAggregate[]> {
  const orders = await fetchAllRows<OrderForReceivableRow>(() =>
    supabase
      .from('orders')
      .select('customer_id, order_date, total_amount')
      .eq('company_id', companyId)
      .is('deleted_at', null) as unknown as RangeableQuery<OrderForReceivableRow>,
  );

  const byCust = new Map<
    string,
    { sales: number; count: number; lastDate: string }
  >();
  for (const o of orders) {
    const cur = byCust.get(o.customer_id) ?? {
      sales: 0,
      count: 0,
      lastDate: o.order_date,
    };
    cur.sales += o.total_amount;
    cur.count += 1;
    if (o.order_date > cur.lastDate) cur.lastDate = o.order_date;
    byCust.set(o.customer_id, cur);
  }

  const paidByCust = await fetchDepositsByCustomer(companyId);
  const now = Date.now();

  return Array.from(byCust, ([customer_id, { sales, count, lastDate }]): CustomerAggregate => {
    const paid = paidByCust.get(customer_id) ?? 0;
    const balance = sales - paid;
    const days = Math.floor((now - new Date(lastDate).getTime()) / 86_400_000);
    return {
      customer_id,
      total_sales: sales,
      paid,
      balance,
      order_count: count,
      last_order_date: lastDate,
      days_since_last: days,
    };
  });
}

/**
 * 모든 거래처 미수금 합계 + 경과 일수 메타.
 * calcCustomerAggregates 결과를 재집계한다 (단일 진실 원본 §8).
 */
export async function calcTotalReceivables(
  companyId: string,
): Promise<TotalReceivablesResult> {
  const aggregates = await calcCustomerAggregates(companyId);
  const total = aggregates.reduce((s, a) => s + a.balance, 0);
  const overdueCount = aggregates.filter(
    (a) => a.balance > 0 && (a.days_since_last ?? 0) > 30,
  ).length;
  const customers: ReceivableCustomer[] = aggregates.map((a) => ({
    customer_id: a.customer_id,
    balance: a.balance,
    last_order_date: a.last_order_date,
    days_since_last: a.days_since_last,
  }));
  return { total, customers, overdueCount };
}

// ───────────────────────────────────────────────────────────
// 재고 계산
// ───────────────────────────────────────────────────────────

interface InventoryLotRow {
  product_id: string;
  lot_type: string;
  quantity: number;
  remaining_quantity: number;
  cost_krw: number | null;
}

interface InventoryTxRow {
  product_id: string;
  type: string; // 'out' | 'return' | 'damage'
  quantity: number;
  transaction_date: string;
}

/**
 * 현재 재고 자산가치 (부가세 포함).
 * 공식: Σ(remaining_quantity × 로트별 단가) × 1.1.
 * 로트별 단가 = cost_krw / quantity (quantity=0 또는 cost_krw=null 은 0 취급).
 */
export async function calcInventoryValue(companyId: string): Promise<number> {
  const lots = await fetchAllRows<InventoryLotRow>(() =>
    supabase
      .from('inventory_lots')
      .select('product_id, lot_type, quantity, remaining_quantity, cost_krw')
      .eq('company_id', companyId)
      .is('deleted_at', null) as unknown as RangeableQuery<InventoryLotRow>,
  );
  let sum = 0;
  for (const lot of lots) {
    if (!lot.cost_krw || lot.quantity <= 0) continue;
    const unit = lot.cost_krw / lot.quantity;
    sum += lot.remaining_quantity * unit;
  }
  return Math.round(sum * 1.1);
}

/**
 * 제품별 현재 재고 수량.
 * 공식: 기초 + 수입/매입 + 반품트랜잭션 − 파손트랜잭션 − 판매수량(올해 1/1 ~ 현재).
 * 판매수량 = order_items.quantity SUM (is_return=false) WHERE 올해.
 */
export async function calcCurrentStock(
  companyId: string,
  productId: string,
): Promise<number> {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString();

  // 1) inventory_lots 입고 (opening/purchase/import).
  const lots = await fetchAllRows<InventoryLotRow>(() =>
    supabase
      .from('inventory_lots')
      .select('product_id, lot_type, quantity, remaining_quantity, cost_krw')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .is('deleted_at', null) as unknown as RangeableQuery<InventoryLotRow>,
  );
  let qty = 0;
  for (const l of lots) qty += l.quantity;

  // 2) inventory_transactions: 반품(+) / 파손(-). 'out'은 판매 출고로 아래 order_items와 중복 집계를 피한다.
  const txs = await fetchAllRows<InventoryTxRow>(() =>
    supabase
      .from('inventory_transactions')
      .select('product_id, type, quantity, transaction_date')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .is('deleted_at', null) as unknown as RangeableQuery<InventoryTxRow>,
  );
  for (const t of txs) {
    if (t.type === 'return') qty += t.quantity;
    else if (t.type === 'damage') qty -= t.quantity;
  }

  // 3) order_items 판매수량 (올해, 반품 제외).
  interface SoldRow {
    quantity: number;
    is_return: boolean;
  }
  const sold = await fetchAllRows<SoldRow>(() =>
    supabase
      .from('order_items')
      .select('quantity, is_return, order:orders!inner(order_date, company_id, deleted_at)')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .eq('is_return', false)
      .is('deleted_at', null)
      .gte('order.order_date', yearStart)
      .lt('order.order_date', yearEnd) as unknown as RangeableQuery<SoldRow>,
  );
  for (const s of sold) qty -= s.quantity;

  return qty;
}

/**
 * 발주 추천 수량 (DZ 단위).
 * 공식: (과거 6개월 판매합 / 6) × 3개월 / 12.
 */
export async function calcOrderSuggestion(
  companyId: string,
  productId: string,
): Promise<number> {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

  interface SoldRow {
    quantity: number;
  }
  const sold = await fetchAllRows<SoldRow>(() =>
    supabase
      .from('order_items')
      .select('quantity, order:orders!inner(order_date, company_id, deleted_at)')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .eq('is_return', false)
      .is('deleted_at', null)
      .gte('order.order_date', sixMonthsAgo.toISOString())
      .lt('order.order_date', now.toISOString()) as unknown as RangeableQuery<SoldRow>,
  );
  const total = sold.reduce((s, r) => s + r.quantity, 0);
  // (total/6 * 3) / 12 == total / 24. DZ(12ea 묶음) 단위.
  return Math.ceil(total / 24);
}

// ───────────────────────────────────────────────────────────
// 이익률 근사치 (Phase 3 MVP — products.supply_price 기반)
// ───────────────────────────────────────────────────────────

export interface ApproxProfitResult {
  sales: number;
  cogs: number;
  margin: number;
  marginPct: number; // 0~100
}

/**
 * 특정 연월의 이익률 근사치.
 * 정식 `calcCostOfSales`(FIFO) 완성 전, `products.supply_price × quantity` 로 원가 근사.
 * UI에는 "FIFO 정산 전 근사치"로 표기할 것.
 */
export async function calcApproxProfitMargin(
  companyId: string,
  year: number,
  month: number,
): Promise<ApproxProfitResult> {
  const { start, end } = monthRange(year, month);

  interface ItemWithProduct {
    quantity: number;
    amount: number;
    is_return: boolean;
    product: { supply_price: number } | null;
    order: { order_date: string; deleted_at: string | null } | null;
  }

  const items = await fetchAllRows<ItemWithProduct>(() =>
    supabase
      .from('order_items')
      .select(
        `quantity, amount, is_return,
         product:products ( supply_price ),
         order:orders!inner ( order_date, deleted_at )`,
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('order.order_date', start)
      .lt('order.order_date', end) as unknown as RangeableQuery<ItemWithProduct>,
  );

  let sales = 0;
  let cogs = 0;
  for (const it of items) {
    sales += it.amount;
    if (it.is_return) continue; // 반품 수량은 원가 상계에서 제외 (MVP 단순화).
    const sp = it.product?.supply_price ?? 0;
    cogs += it.quantity * sp;
  }
  const margin = sales - cogs;
  const marginPct = sales > 0 ? (margin / sales) * 100 : 0;
  return { sales, cogs, margin, marginPct };
}

// ───────────────────────────────────────────────────────────
// 부가세 역산 (순수 산술)
// ───────────────────────────────────────────────────────────

/**
 * 매출금액 → 공급가액 + 부가세 역산.
 * 🔴 매출금액은 이미 부가세 포함. × 1.1 금지, ÷ 1.1만 사용.
 * @param totalAmount 부가세 포함 매출금액 (정수 원화)
 */
export function calcSupplyAmount(totalAmount: number): {
  supply: number;
  vat: number;
} {
  const supply = Math.round(totalAmount / 1.1);
  const vat = totalAmount - supply;
  return { supply, vat };
}

// ───────────────────────────────────────────────────────────
// Phase 4 이후 과제 (스텁 유지)
// ───────────────────────────────────────────────────────────

/**
 * 매출원가 (부가세 포함).
 * 공식: (기초 + 반품 - 파손 + 수입/매입 - 기말) × 1.1.
 * 🔴 반품(+), 파손(-) 방향 주의.
 * FIFO 로트 소비 로직 완성 후 Phase 4에서 구현.
 */
export async function calcCostOfSales(
  _companyId: string,
  _period: Period,
): Promise<number> {
  throw new Error('calcCostOfSales: Phase 4에서 구현 예정 (FIFO 로트 소비 로직 필요)');
}

/**
 * MRR (월간 반복 수익).
 * Super Admin 페이지 전용. Phase 5 과금 UI와 함께 구현.
 */
export async function calcMRR(_companyId: string): Promise<number> {
  throw new Error('calcMRR: Phase 5에서 구현 예정 (Super Admin 페이지와 함께)');
}
