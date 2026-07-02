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

/** YYYY-MM (KST 기준) 추출 — 월별 매출/미수금 집계 키. */
function toKstMonthKey(iso: string): string {
  return toKstDateKey(iso).slice(0, 7);
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
      .gte('order_date', startIso)
      .lt('order_date', endIso)
      .order('order_date', { ascending: true }),
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
      .is('deleted_at', null),
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
      .eq('customer_id', customerId),
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
      .is('deleted_at', null),
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
      .eq('company_id', companyId),
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
      .eq('company_id', companyId),
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
 * 제품별 현재 재고 수량 (단일 제품 조회용 얇은 래퍼).
 * 공식: 기초 + 수입/매입 + 반품트랜잭션 − 파손트랜잭션 − 판매수량(올해 1/1 ~ 현재).
 *
 * 🔴 **루프에서 호출 금지**. 내부가 전 회사 범위 배치 fetch 3회이므로, N개 제품을
 *    Promise.all 로 돌리면 동일한 전체 fetch 가 N회 반복된다. 여러 제품 수량이
 *    필요하면 `calcCurrentStockByProduct(companyId)` 로 Map 을 한 번에 받아 쓸 것.
 */
export async function calcCurrentStock(
  companyId: string,
  productId: string,
): Promise<number> {
  const map = await calcCurrentStockByProduct(companyId);
  return map.get(productId)?.current ?? 0;
}

/**
 * 제품별 재고 스냅샷 맵 — 재고현황 페이지 단일 호출용.
 *
 * 🟠 N+1 해결: `calcCurrentStock` 을 제품마다 호출하지 않고, 전 회사 범위로
 *    lots/transactions/order_items 를 **각 1회** 조회하여 Map<product_id, …> 로 집계.
 * 🟠 `out` 트랜잭션은 order_items 와 중복될 수 있어 집계에서 제외 (단일-제품 계산식과 일관).
 *    Phase 4 에서 FIFO 실원가로 교체 예정.
 */
export interface ProductStockInfo {
  /** 기초재고 + 매입/수입 lots + 반품 tx − 파손 tx − 올해 판매수량. */
  current: number;
  /** lot_type='opening' 합계 — "기초재고" KPI. */
  opening: number;
  /** 올해 1/1 ~ 현재 order_items.quantity 합 (is_return=false). */
  soldThisYear: number;
  /** 이 제품의 마지막 재고 움직임 ISO — lots.lot_date 또는 tx.transaction_date 중 최대값. */
  lastMovementAt: string | null;
}

export const LOW_STOCK_THRESHOLD = 10;

export type StockStatus = 'out' | 'low' | 'normal';

/** 재고 수량 → 상태 분류. */
export function classifyStockStatus(current: number): StockStatus {
  if (current <= 0) return 'out';
  if (current <= LOW_STOCK_THRESHOLD) return 'low';
  return 'normal';
}

interface LotSliceRow {
  product_id: string;
  lot_type: string;
  quantity: number;
  lot_date: string;
}
interface TxSliceRow {
  product_id: string;
  type: string;
  quantity: number;
  transaction_date: string;
}

export async function calcCurrentStockByProduct(
  companyId: string,
): Promise<Map<string, ProductStockInfo>> {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString();

  const [lots, txs, sold] = await Promise.all([
    fetchAllRows<LotSliceRow>(() =>
      supabase
        .from('inventory_lots')
        .select('product_id, lot_type, quantity, lot_date')
        .eq('company_id', companyId),
    ),
    fetchAllRows<TxSliceRow>(() =>
      supabase
        .from('inventory_transactions')
        .select('product_id, type, quantity, transaction_date')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ),
    (async (): Promise<Array<{ product_id: string; quantity: number }>> => {
      interface SoldRow {
        product_id: string;
        quantity: number;
      }
      return fetchAllRows<SoldRow>(() =>
        supabase
          .from('order_items')
          .select(
            'product_id, quantity, order:orders!inner(order_date, company_id)',
          )
          .eq('company_id', companyId)
          .eq('is_return', false)
          .gte('order.order_date', yearStart)
          .lt('order.order_date', yearEnd),
      );
    })(),
  ]);

  const map = new Map<string, ProductStockInfo>();
  const ensure = (id: string): ProductStockInfo => {
    let row = map.get(id);
    if (!row) {
      row = { current: 0, opening: 0, soldThisYear: 0, lastMovementAt: null };
      map.set(id, row);
    }
    return row;
  };

  for (const l of lots) {
    const row = ensure(l.product_id);
    row.current += l.quantity;
    if (l.lot_type === 'opening') row.opening += l.quantity;
    if (!row.lastMovementAt || l.lot_date > row.lastMovementAt) {
      row.lastMovementAt = l.lot_date;
    }
  }
  for (const t of txs) {
    const row = ensure(t.product_id);
    // 'out' 은 order_items 와 중복 → 제외 (단일-제품 calcCurrentStock 과 일관).
    if (t.type === 'return') row.current += t.quantity;
    else if (t.type === 'damage') row.current -= t.quantity;
    if (!row.lastMovementAt || t.transaction_date > row.lastMovementAt) {
      row.lastMovementAt = t.transaction_date;
    }
  }
  for (const s of sold) {
    const row = ensure(s.product_id);
    row.current -= s.quantity;
    row.soldThisYear += s.quantity;
  }

  return map;
}

/**
 * 제품별 발주 추천 수량(DZ) 맵 — 단일 order_items fetch 로 전 제품 집계.
 *
 * 🟠 N+1 해결: `calcOrderSuggestion` 을 제품마다 호출하지 않고, 전 회사 범위로
 *    order_items(비반품, 과거 `lookbackMonths`개월)를 **단 1회** 조회해 Map 으로 반환.
 *
 * 공식: Math.ceil(Σ quantity / 24) — 단일판과 동일 ((total/6 * 3) / 12).
 *
 * @param companyId 회사 UUID
 * @param lookbackMonths 기본 6개월. JS `setUTCMonth(-N)` 시맨틱과 일치.
 */
export async function calcOrderSuggestionByProduct(
  companyId: string,
  lookbackMonths: number = 6,
): Promise<Map<string, number>> {
  const now = new Date();
  const lookbackStart = new Date(now);
  lookbackStart.setUTCMonth(lookbackStart.getUTCMonth() - lookbackMonths);

  interface SoldRow {
    product_id: string;
    quantity: number;
  }
  const rows = await fetchAllRows<SoldRow>(() =>
    supabase
      .from('order_items')
      .select('product_id, quantity, order:orders!inner(order_date, company_id)')
      .eq('company_id', companyId)
      .eq('is_return', false)
      .gte('order.order_date', lookbackStart.toISOString())
      .lt('order.order_date', now.toISOString()),
  );

  const sumByProduct = new Map<string, number>();
  for (const r of rows) {
    sumByProduct.set(r.product_id, (sumByProduct.get(r.product_id) ?? 0) + r.quantity);
  }
  const result = new Map<string, number>();
  for (const [pid, total] of sumByProduct) {
    result.set(pid, Math.ceil(total / 24)); // DZ(12ea 묶음) 단위.
  }
  return result;
}

/**
 * 발주 추천 수량 (DZ 단위) — 단일 제품 조회용 얇은 래퍼.
 * 공식: (과거 6개월 판매합 / 6) × 3개월 / 12.
 *
 * 🔴 **루프에서 호출 금지**. 내부가 전 회사 범위 배치 fetch 이므로, N개 제품을
 *    Promise.all 로 돌리면 동일 fetch 가 N회 반복된다. 여러 제품이 필요하면
 *    `calcOrderSuggestionByProduct(companyId)` 로 Map 을 한 번에 받아 쓸 것.
 */
export async function calcOrderSuggestion(
  companyId: string,
  productId: string,
): Promise<number> {
  const map = await calcOrderSuggestionByProduct(companyId);
  return map.get(productId) ?? 0;
}

// ───────────────────────────────────────────────────────────
// 발주서 페이지용 (순수 산술, 당월 제외 6개월 윈도우 기반)
// ───────────────────────────────────────────────────────────

/**
 * 판매량(3개월) = 당월 제외 최근 6개월 판매수량 ÷ 6 × 3.
 * 반올림된 정수 수량(EA) 반환.
 */
export function calcSalesQty3m(qty6mExcludingThisMonth: number): number {
  return Math.round((qty6mExcludingThisMonth / 6) * 3);
}

/**
 * 판매량(1개월) = 판매량(3개월) ÷ 3.
 * 반올림된 정수 수량(EA) 반환.
 */
export function calcSalesQty1m(qty3m: number): number {
  return Math.round(qty3m / 3);
}

/**
 * 발주서 추천 발주수량.
 * - 주문할 수량 = 판매량(기준) − 현재재고 (음수면 0)
 * - unit 이 'DZ'(대소문자 무관) 면 round(주문할 수량 / 12) DZ (소수점 첫째 자리 반올림)
 * - 그 외(EA 등) 면 주문할 수량 그대로
 *
 * 🔴 버그수정 이력: 과거엔 stock 파라미터가 없어 재고 차감 없이 qty3m/1m을
 *    그대로 12로 나눴다. 예: 판매량(3개월) 672, 재고 87 → 올바른 값은
 *    round((672-87)/12)=49DZ 인데 이전엔 round(672/12)=56DZ 로 잘못 계산됨.
 */
export function calcOrderQty(
  baseQty: number,
  stock: number,
  unit: string,
): number {
  const needQty = Math.max(0, baseQty - stock);
  if (unit.toUpperCase() === 'DZ') {
    return Math.round(needQty / 12);
  }
  return needQty;
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
    order: { order_date: string } | null;
  }

  const items = await fetchAllRows<ItemWithProduct>(() =>
    supabase
      .from('order_items')
      .select(
        `quantity, amount, is_return,
         product:products ( supply_price ),
         order:orders!inner ( order_date )`,
      )
      .eq('company_id', companyId)
      .gte('order.order_date', start)
      .lt('order.order_date', end),
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

/**
 * 거래처 등급(A~E)에 따른 제품별 공급율로 공급가 계산.
 * 공식: unitPrice × gradeRate (반올림).
 * @param unitPrice 판매가 (VAT 포함, 정수 원화)
 * @param gradeRate 제품별 등급 공급율 (예: 0.6, 0.5). 0/null/undefined 면 0 반환.
 */
export function calcSupplyPriceByGrade(
  unitPrice: number,
  gradeRate: number | null | undefined,
): number {
  if (!gradeRate) return 0;
  return Math.round(unitPrice * gradeRate);
}

/** products 테이블의 등급별 공급율 컬럼만 추린 shape. */
export interface ProductGradeRates {
  grade_a?: number | null;
  grade_b?: number | null;
  grade_c?: number | null;
  grade_d?: number | null;
  grade_e?: number | null;
}

/**
 * 거래처 등급('A'~'E') + 제품 grade_a~e 컬럼 조합으로 공급가 계산.
 *
 * 🔴 CLAUDE.md §2: 거래처별 공급가 계산의 단일 진입점.
 *    이전에는 페이지마다 pickGradeRate 헬퍼를 반복 정의 → 이 함수로 일원화.
 *
 * @param unitPrice 판매가 (VAT 포함, 정수 원화)
 * @param customerGrade 거래처 등급 — 'A'|'B'|'C'|'D'|'E' (대소문자 무관). null/비표준 → 0
 * @param product grade_a~e 컬럼을 포함한 제품 (다른 컬럼은 무시). null → 0
 */
export function calcSupplyPriceByCustomerGrade(
  unitPrice: number,
  customerGrade: string | null | undefined,
  product: ProductGradeRates | null | undefined,
): number {
  if (!customerGrade || !product) return 0;
  let rate: number | null | undefined;
  switch (customerGrade.toUpperCase()) {
    case 'A': rate = product.grade_a; break;
    case 'B': rate = product.grade_b; break;
    case 'C': rate = product.grade_c; break;
    case 'D': rate = product.grade_d; break;
    case 'E': rate = product.grade_e; break;
    default: return 0;
  }
  return calcSupplyPriceByGrade(unitPrice, rate);
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

// ── 은행거래 / 미수금 계산 ─────────────────────────────────────────

/**
 * 정산 마감일 계산.
 *
 * 당월 → 해당 월 말일
 * 익월 → 다음 달 말일
 * 2개월 → 2개월 후 말일
 */
export function calcDueDate(
  salesMonth: string, // 'YYYY-MM'
  settlementCycle: '당월' | '익월' | '2개월',
): string {
  const [year, month] = salesMonth.split('-').map(Number);
  const offset =
    settlementCycle === '당월' ? 0
    : settlementCycle === '익월' ? 1
    : 2;
  // 로컬 기준 (month + offset)월의 마지막 날.
  // toISOString()은 UTC라 KST(+9)에서 말일이 하루 당겨짐 → 로컬 y/m/d 추출.
  const due = new Date(year, month + offset, 0);
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, '0');
  const d = String(due.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 월별 정산 계산.
 *
 * orders:        거래처별 주문 목록 (total_amount = 공급가 합계)
 * transactions:  매칭된 입금 내역 (match_status = 'matched')
 * today:         기준일 (기본값: 현재 날짜)
 *
 * 반환: 거래처×월 조합별 MonthlyReconciliation[]
 *   - 정산완료: difference <= 0
 *   - 정산대기: difference > 0 AND due_date >= today
 *   - 연체:    difference > 0 AND due_date < today
 */
export function calcMonthlyReconciliation(
  orders: {
    customer_id: string;
    customer_name: string;
    settlement_cycle: string;
    order_date: string;
    total_amount: number;
  }[],
  transactions: {
    id: string;
    customer_id: string | null;
    transaction_date: string;
    amount: number;
    match_status: string;
    target_sales_month: string | null;
  }[],
  splits: {
    bank_transaction_id: string;
    target_sales_month: string;
    amount: number;
  }[] = [],
  today: Date = new Date(),
  toleranceAmount: number = 100,
): import('@/types/database').MonthlyReconciliation[] {
  type Cycle = '당월' | '익월' | '2개월';

  // 거래처×매출월별 매출 집계.
  const salesMap = new Map<
    string,
    {
      customer_id: string;
      customer_name: string;
      settlement_cycle: Cycle;
      month: string;
      sales_total: number;
    }
  >();
  for (const o of orders) {
    // 🔴 KST 새벽 0~9시 등록 주문이 UTC 기준 전월로 매핑되어 매출이 전월
    //    합계에 잘못 합산되던 버그 수정 (toKstMonthKey 사용).
    const month = toKstMonthKey(o.order_date);
    const key = `${o.customer_id}__${month}`;
    const cycle = (o.settlement_cycle || '익월') as Cycle;
    const existing = salesMap.get(key);
    if (existing) {
      existing.sales_total += o.total_amount;
    } else {
      salesMap.set(key, {
        customer_id: o.customer_id,
        customer_name: o.customer_name,
        settlement_cycle: cycle,
        month,
        sales_total: o.total_amount,
      });
    }
  }

  // 거래처×매출월별 입금 집계 (matched만).
  //
  // 입금 허용 구간 규칙:
  //   당월 업체: 해당월 1일 ~ 해당월 말일+7일
  //   익월 업체: 다음달 1일 ~ 다음달 말일+7일
  //   2개월 업체: 2개월 후 1일 ~ 2개월 후 말일+7일
  //
  // target_sales_month 값이 있으면 자동 계산 무시하고 그 월로 즉시 귀속.
  // 어떤 구간에도 속하지 않으면 미귀속 (사용자가 target_sales_month로 수동 지정 필요).
  const depositMap = new Map<string, { amount: number; dates: string[] }>();

  // salesMap의 매출월별 입금 허용 구간 사전 계산.
  // key: 'customerId__YYYY-MM', value: { start, end }
  const windowMap = new Map<string, { start: Date; end: Date }>();
  for (const [key, s] of salesMap) {
    const [year, month] = s.month.split('-').map(Number);
    const offset = s.settlement_cycle === '당월' ? 0 : s.settlement_cycle === '익월' ? 1 : 2;
    const windowStart = new Date(year, month - 1 + offset, 1);
    const lastDay = new Date(year, month - 1 + offset + 1, 0); // (offset만큼 미룬) 해당월 말일
    const windowEnd = new Date(lastDay);
    windowEnd.setDate(windowEnd.getDate() + 7);
    windowMap.set(key, { start: windowStart, end: windowEnd });
  }

  // bank_transaction_id → splits[] 맵
  const splitsMap = new Map<string, typeof splits>();
  for (const sp of splits) {
    const arr = splitsMap.get(sp.bank_transaction_id) ?? [];
    arr.push(sp);
    splitsMap.set(sp.bank_transaction_id, arr);
  }

  const pushDeposit = (key: string, amount: number, date: string) => {
    const existing = depositMap.get(key) ?? { amount: 0, dates: [] };
    existing.amount += amount;
    if (!existing.dates.includes(date)) existing.dates.push(date);
    depositMap.set(key, existing);
  };

  for (const t of transactions) {
    if (!t.customer_id || t.match_status !== 'matched') continue;

    const txDate = new Date(t.transaction_date);

    // 분할 귀속 우선 (target_sales_month / 자동 매칭보다 강함)
    const txSplits = splitsMap.get(t.id);
    if (txSplits && txSplits.length > 0) {
      for (const sp of txSplits) {
        pushDeposit(
          `${t.customer_id}__${sp.target_sales_month}`,
          sp.amount,
          t.transaction_date,
        );
      }
      continue;
    }

    // target_sales_month 수동 지정 우선
    if (t.target_sales_month) {
      pushDeposit(
        `${t.customer_id}__${t.target_sales_month}`,
        t.amount,
        t.transaction_date,
      );
      continue;
    }

    // 허용 구간에 속하는 매출월 탐색 (해당 거래처에 한정)
    for (const [key, window] of windowMap) {
      if (!key.startsWith(`${t.customer_id}__`)) continue;
      if (txDate >= window.start && txDate <= window.end) {
        pushDeposit(key, t.amount, t.transaction_date);
        break;
      }
    }
    // 어느 구간에도 속하지 않으면 미귀속 (집계 제외) — target_sales_month 수동 지정 필요.
  }

  const result: import('@/types/database').MonthlyReconciliation[] = [];
  for (const [, s] of salesMap) {
    const slot = depositMap.get(`${s.customer_id}__${s.month}`);
    const deposit_total = slot?.amount ?? 0;
    const deposit_dates = slot ? [...slot.dates].sort() : [];
    const difference = s.sales_total - deposit_total;
    const due_date = calcDueDate(s.month, s.settlement_cycle);
    // 허용 오차 적용:
    //   |차액| ≤ tolerance 면 정산완료 (십원 절사 등 소액 흡수)
    //   양수 차액 + due_date 지났으면 연체
    //   양수 차액 + 아직 마감 전이면 정산대기
    //   음수 차액 (초과입금) 도 정산완료
    const effectiveDifference = Math.abs(difference);
    const is_overdue =
      effectiveDifference > toleranceAmount &&
      difference > 0 &&
      new Date(due_date) < today;
    const status =
      effectiveDifference <= toleranceAmount ? '정산완료'
      : is_overdue ? '연체'
      : difference > 0 ? '정산대기'
      : '정산완료';

    result.push({
      customer_id: s.customer_id,
      customer_name: s.customer_name,
      payment_cycle: s.settlement_cycle,
      month: s.month,
      due_date,
      sales_total: s.sales_total,
      deposit_total,
      deposit_dates,
      difference,
      is_overdue,
      status,
    });
  }

  return result.sort(
    (a, b) =>
      a.customer_name.localeCompare(b.customer_name) || a.month.localeCompare(b.month),
  );
}

/**
 * 거래처별 미수금 카드 집계.
 * calcMonthlyReconciliation() 결과를 거래처 단위로 롤업.
 *
 * badge 판정:
 *   위험: overdue_amount > 0 (연체 발생)
 *   경고: pending_amount > 0 (정산대기, 아직 due_date 미경과)
 *   정상: 잔액 없음
 *
 * 정렬: 위험 → 경고 → 정상, 같은 등급이면 이름순.
 */
export function calcReceivableCards(
  reconciliations: import('@/types/database').MonthlyReconciliation[],
  lastDepositDates: Map<string, string>, // customer_id → 최근 입금일
): import('@/types/database').ReceivableCard[] {
  const cardMap = new Map<string, import('@/types/database').ReceivableCard>();

  for (const r of reconciliations) {
    if (!cardMap.has(r.customer_id)) {
      cardMap.set(r.customer_id, {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        payment_cycle: r.payment_cycle,
        total_sales: 0,
        total_deposit: 0,
        pending_amount: 0,
        overdue_amount: 0,
        last_deposit_date: lastDepositDates.get(r.customer_id) ?? null,
        badge: '정상',
        monthly_detail: [],
      });
    }
    const card = cardMap.get(r.customer_id)!;
    card.total_sales += r.sales_total;
    card.total_deposit += r.deposit_total;
    if (r.status === '정산대기') card.pending_amount += r.difference;
    if (r.status === '연체') card.overdue_amount += r.difference;
    card.monthly_detail.push(r);
  }

  for (const card of cardMap.values()) {
    if (card.overdue_amount > 0) card.badge = '위험';
    else if (card.pending_amount > 0) card.badge = '경고';
    else card.badge = '정상';
  }

  const order: Record<string, number> = { 위험: 0, 경고: 1, 정상: 2 };
  return [...cardMap.values()].sort(
    (a, b) =>
      order[a.badge] - order[b.badge] || a.customer_name.localeCompare(b.customer_name),
  );
}

/**
 * 월차감 거래처 정상 입금 여부 판정.
 * 실입금 + 차감액 ≥ 미수금 → true.
 *
 * 예: 한가람문구 미수금 100,000원 · 실입금 97,800원 · 차감 2,200원 = 100,000원 → 정상.
 */
export function isNormalPaymentWithDeduction(
  amount: number,
  deductionApplied: number,
  outstanding: number,
): boolean {
  return amount + deductionApplied >= outstanding;
}
