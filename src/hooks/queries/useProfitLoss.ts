/**
 * 손익계산서 — 매출/매출원가/수입비용/판관비/부가세 집계.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §5: 모든 목록 조회 fetchAllRows 경유.
 *
 * 데이터 소스:
 *   - orders (매출, deleted_at 제외, status != 'canceled')
 *   - order_items (판매수량/반품)
 *   - inventory_lots (EA당 수입원가 — lot_type in ['import','opening'], cost_krw < 100000)
 *   - import_invoices (운임 = shipping_cost_usd × exchange_rate)
 *   - tax_invoices (부가세, invoice_year/month 기준)
 *   - pl_expenses + pl_expense_categories (월별 판관비 수동분)
 *   - bank_expense_rows (판관비 거래내역 자동분류)
 *
 * 매출원가:
 *   - product 별 가중평균 cost_krw (lot 단위) × 판매EA. 반품은 동일 단가 차감.
 *   - cost_krw 에는 환율/관세/통관비/수입부가세가 모두 배분되어 있음.
 *     → 별도 환율/관세율 파라미터 불필요.
 *   - cost_krw 는 수입부가세 포함 값이므로 includeVat=false 시 ÷1.1 처리.
 *
 * 부가세 포함/제외 (includeVat):
 *   - true  → 매출/매출원가/수입비용/판관비 모두 raw (부가세 포함).
 *   - false → 매출/매출원가/수입비용/판관비 모두 ÷1.1 (공급가액 기준)
 *             + 부가세 라인(tax_invoices.vat_amount)을 별도 차감해 순이익 산출.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

export type PlMode = 'monthly' | 'yearly' | 'custom';

export interface UseProfitLossParams {
  companyId: string | null;
  mode: PlMode;
  year: number;
  /** monthly 모드에서만 사용. */
  month?: number;
  /** custom 모드에서만 사용. 1~12. */
  months?: number[];
  includeVat: boolean;
}

export interface PlExpenseLine {
  categoryId: string;
  categoryName: string;
  amount: number;
  /** 수동 입력분 (pl_expenses). */
  manual: number;
  /** 은행 거래내역 자동분류 (bank_expense_rows). */
  fromBank: number;
}

/** 매출원가 세부 — 항등식: beginningInventory + importPurchase - endingInventory ≈ total. */
export interface CogsDetail {
  /** 기초재고: opening lot + 이전 수입입고 누계 - 이전 COGS 누계. */
  beginningInventory: number;
  /** 수입입고: 선택 기간 내 import lot 의 quantity × cost_krw 합. */
  importPurchase: number;
  /** 기말재고: beginningInventory + importPurchase - total. */
  endingInventory: number;
  /** 매출원가 합계 (= ProfitLossData.cogs). */
  total: number;
}

export interface ProfitLossData {
  revenue: number;
  revenueExVat: number;
  displayRevenue: number;
  cogs: number;
  cogsDetail: CogsDetail;
  grossProfit: number;
  grossMargin: number;
  importCosts: number;
  sellingExpenses: PlExpenseLine[];
  /** 카테고리 합 = 수동 + 자동분류. */
  totalSellingExpenses: number;
  /** 수동 입력분 합. */
  totalSellingExpensesManual: number;
  /** 은행 거래내역 자동분류 합. */
  totalSellingExpensesFromBank: number;
  vatAmount: number;
  operatingProfit: number;
  operatingMargin: number;
  netProfit: number;
  netMargin: number;
  periodLabel: string;
  hasNoMonths: boolean;
  isLoading: boolean;
}

interface OrderRow {
  order_date: string;
  total_amount: number;
}
interface OrderItemRow {
  product_id: string;
  quantity: number;
  is_return: boolean;
  order: { order_date: string } | null;
}
interface LotRow {
  product_id: string;
  quantity: number;
  cost_krw: number | null;
  lot_type: string;
  lot_date: string;
}
interface ImportInvoiceRow {
  invoice_date: string;
  exchange_rate: number;
  shipping_cost_usd: number;
}
interface TaxInvoiceRow {
  invoice_month: number;
  vat_amount: number;
}
interface PlExpenseRow {
  category_id: string;
  amount_krw: number;
  month: number;
  category: {
    name: string;
    sort_order: number;
    is_active: boolean;
  } | null;
}
interface BankExpenseAggRow {
  withdrawal: number;
  pl_category_id: string | null;
  month: number;
  category: {
    name: string;
    sort_order: number;
    is_active: boolean;
  } | null;
}

function isMonthSelected(
  m: number,
  mode: PlMode,
  month?: number,
  months?: number[],
): boolean {
  if (mode === 'monthly') return month != null && m === month;
  if (mode === 'yearly') return true;
  return Array.isArray(months) && months.includes(m);
}

function dateToMonth(iso: string): number {
  return new Date(iso).getUTCMonth() + 1;
}

function periodLabel(
  mode: PlMode,
  year: number,
  month?: number,
  months?: number[],
): string {
  if (mode === 'monthly') return `${year}년 ${month ?? 1}월`;
  if (mode === 'yearly') return `${year}년`;
  if (!months || months.length === 0) return `${year}년 (월 미선택)`;
  if (months.length === 1) return `${year}년 ${months[0]}월`;
  return `${year}년 ${[...months].sort((a, b) => a - b).join(',')}월`;
}

export function useProfitLoss(params: UseProfitLossParams): ProfitLossData {
  const { companyId, mode, year, month, months, includeVat } = params;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const enabled = Boolean(companyId);

  const ordersQ = useQuery({
    queryKey: ['pl-orders', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<OrderRow>(() =>
        supabase
          .from('orders')
          .select('order_date, total_amount')
          .eq('company_id', companyId!)
          .neq('status', 'canceled')
          .is('deleted_at', null)
          .gte('order_date', yearStart)
          .lt('order_date', yearEnd),
      ),
  });

  const itemsQ = useQuery({
    queryKey: ['pl-items-cogs', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<OrderItemRow>(() =>
        supabase
          .from('order_items')
          .select(
            'product_id, quantity, is_return, order:orders!inner(order_date, status, deleted_at)',
          )
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .is('order.deleted_at', null)
          .neq('order.status', 'canceled')
          .gte('order.order_date', yearStart)
          .lt('order.order_date', yearEnd),
      ),
  });

  // 기초재고 역산용 — 대상 연도 이전의 모든 판매 order_items.
  // 가중평균 단가 × 판매EA 누계로 prior-year COGS 를 계산해 기초재고에서 차감.
  // (현재 데이터셋은 2026 시작 → 0건 반환되어 비용 무시 가능)
  const priorItemsQ = useQuery({
    queryKey: ['pl-prior-items-cogs', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<OrderItemRow>(() =>
        supabase
          .from('order_items')
          .select(
            'product_id, quantity, is_return, order:orders!inner(order_date, status, deleted_at)',
          )
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .is('order.deleted_at', null)
          .neq('order.status', 'canceled')
          .lt('order.order_date', yearStart),
      ),
  });

  // 매출원가 산정용 lot — 회사 전체 lot 단위. 연/월에 무관하게 캐시.
  //   - cost_krw 가중평균 단가 산출
  //   - lot_type/lot_date 로 기초재고·수입입고 분해
  //   - cost_krw >= 100,000 인 lot 은 택배비 등 비정상 opening 항목이라 제외
  const lotsQ = useQuery({
    queryKey: ['pl-lots-cogs', companyId],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<LotRow>(() =>
        supabase
          .from('inventory_lots')
          .select('product_id, quantity, cost_krw, lot_type, lot_date')
          .eq('company_id', companyId!)
          .in('lot_type', ['import', 'opening'])
          .is('deleted_at', null)
          .not('cost_krw', 'is', null)
          .lt('cost_krw', 100000),
      ),
  });

  const importsQ = useQuery({
    queryKey: ['pl-imports', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<ImportInvoiceRow>(() =>
        supabase
          .from('import_invoices')
          .select('invoice_date, exchange_rate, shipping_cost_usd')
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .gte('invoice_date', yearStart)
          .lt('invoice_date', yearEnd),
      ),
  });

  const taxQ = useQuery({
    queryKey: ['pl-tax', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<TaxInvoiceRow>(() =>
        supabase
          .from('tax_invoices')
          .select('invoice_month, vat_amount')
          .eq('company_id', companyId!)
          .eq('invoice_year', year)
          .is('deleted_at', null),
      ),
  });

  const expensesQ = useQuery({
    queryKey: ['pl-expenses', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<PlExpenseRow>(() =>
        supabase
          .from('pl_expenses')
          .select(
            'category_id, amount_krw, month, category:pl_expense_categories(name, sort_order, is_active)',
          )
          .eq('company_id', companyId!)
          .eq('year', year),
      ),
  });

  // 은행 거래내역 자동분류 — 미제외 & 카테고리 매칭된 출금. is_confirmed 무관
  // (확인은 UI 표식용. 분류만 되면 손익에 즉시 반영).
  const bankExpensesQ = useQuery({
    queryKey: ['bank-expense-rows-pl', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 2,
    queryFn: () =>
      fetchAllRows<BankExpenseAggRow>(() =>
        supabase
          .from('bank_expense_rows')
          .select(
            'withdrawal, pl_category_id, month, category:pl_expense_categories(name, sort_order, is_active)',
          )
          .eq('company_id', companyId!)
          .eq('year', year)
          .eq('is_excluded', false)
          .not('pl_category_id', 'is', null),
      ),
  });

  const isLoading =
    ordersQ.isLoading ||
    itemsQ.isLoading ||
    priorItemsQ.isLoading ||
    lotsQ.isLoading ||
    importsQ.isLoading ||
    taxQ.isLoading ||
    expensesQ.isLoading ||
    bankExpensesQ.isLoading;

  return useMemo<ProfitLossData>(() => {
    const hasNoMonths =
      mode === 'custom' && (!months || months.length === 0);

    const empty: Omit<ProfitLossData, 'periodLabel' | 'hasNoMonths' | 'isLoading'> = {
      revenue: 0,
      revenueExVat: 0,
      displayRevenue: 0,
      cogs: 0,
      cogsDetail: {
        beginningInventory: 0,
        importPurchase: 0,
        endingInventory: 0,
        total: 0,
      },
      grossProfit: 0,
      grossMargin: 0,
      importCosts: 0,
      sellingExpenses: [],
      totalSellingExpenses: 0,
      totalSellingExpensesManual: 0,
      totalSellingExpensesFromBank: 0,
      vatAmount: 0,
      operatingProfit: 0,
      operatingMargin: 0,
      netProfit: 0,
      netMargin: 0,
    };

    if (hasNoMonths || isLoading) {
      return {
        ...empty,
        periodLabel: periodLabel(mode, year, month, months),
        hasNoMonths,
        isLoading,
      };
    }

    const orders = ordersQ.data ?? [];
    const items = itemsQ.data ?? [];
    const priorItems = priorItemsQ.data ?? [];
    const lots = lotsQ.data ?? [];
    const imports = importsQ.data ?? [];
    const tax = taxQ.data ?? [];
    const expenses = expensesQ.data ?? [];
    const bankExpenses = bankExpensesQ.data ?? [];

    const vatDivisor = includeVat ? 1 : 1.1;

    // ── 매출 (VAT 포함 raw) ────────────────────────────────
    let revenueRaw = 0;
    for (const o of orders) {
      if (!isMonthSelected(dateToMonth(o.order_date), mode, month, months)) continue;
      revenueRaw += Number(o.total_amount) || 0;
    }

    // ── 제품별 가중평균 단가 (lot 단위, KRW/EA, 수입부가세 포함) ─
    const totalCostMap = new Map<string, number>();
    const totalQtyMap = new Map<string, number>();
    for (const lot of lots) {
      if (lot.cost_krw == null || lot.cost_krw >= 100000) continue;
      const q = Number(lot.quantity) || 0;
      const c = Number(lot.cost_krw) || 0;
      if (q <= 0 || c <= 0) continue;
      totalCostMap.set(
        lot.product_id,
        (totalCostMap.get(lot.product_id) ?? 0) + c * q,
      );
      totalQtyMap.set(
        lot.product_id,
        (totalQtyMap.get(lot.product_id) ?? 0) + q,
      );
    }
    const avgCostMap = new Map<string, number>();
    for (const [pid, totalCost] of totalCostMap) {
      const qty = totalQtyMap.get(pid) ?? 0;
      if (qty > 0) avgCostMap.set(pid, totalCost / qty);
    }

    // ── 매출원가 분해 — 기초재고 / 수입입고 / 기말재고 / 합계 (VAT 포함 raw) ─
    //
    // 항등식:
    //   기말재고 = 기초재고 + 수입입고 - 매출원가
    //   기초재고 = openingValue + (이전 수입 누계) - (이전 COGS 누계)
    //
    // 가중평균 단가는 회사 전체 lot 기준 고정값(avgCostMap)이므로
    // 월별 COGS 합 = 항상 일관되게 누적.

    // (a) opening lot 총가치 — lot_type='opening' 의 quantity × cost_krw 합.
    let openingValueRaw = 0;
    for (const lot of lots) {
      if (lot.lot_type !== 'opening') continue;
      if (lot.cost_krw == null || lot.cost_krw >= 100000) continue;
      openingValueRaw +=
        (Number(lot.quantity) || 0) * (Number(lot.cost_krw) || 0);
    }

    // (b) 월별 수입입고 합 (대상 연도) + 이전 연도 수입 누계.
    const monthlyImportRaw: number[] = new Array(13).fill(0); // index 1..12
    let priorYearImportRaw = 0;
    for (const lot of lots) {
      if (lot.lot_type !== 'import') continue;
      if (lot.cost_krw == null || lot.cost_krw >= 100000) continue;
      const value =
        (Number(lot.quantity) || 0) * (Number(lot.cost_krw) || 0);
      const d = new Date(lot.lot_date);
      const lotYear = d.getUTCFullYear();
      const lotMonth = d.getUTCMonth() + 1;
      if (lotYear < year) {
        priorYearImportRaw += value;
      } else if (lotYear === year && lotMonth >= 1 && lotMonth <= 12) {
        monthlyImportRaw[lotMonth] += value;
      }
      // lotYear > year 는 미래 데이터 — 무시.
    }

    // (c) 월별 COGS 합 (대상 연도) + 이전 연도 COGS 누계.
    //     가중평균 EA당 원가 × 판매EA, 반품 차감. lot 없는 product 는 0 처리.
    const monthlyCogsRaw: number[] = new Array(13).fill(0);
    for (const it of items) {
      if (!it.order) continue;
      const m = dateToMonth(it.order.order_date);
      const avgCost = avgCostMap.get(it.product_id) ?? 0;
      if (avgCost <= 0) continue;
      const sign = it.is_return ? -1 : 1;
      monthlyCogsRaw[m] +=
        sign * (Number(it.quantity) || 0) * avgCost;
    }
    let priorYearCogsRaw = 0;
    for (const it of priorItems) {
      if (!it.order) continue;
      const avgCost = avgCostMap.get(it.product_id) ?? 0;
      if (avgCost <= 0) continue;
      const sign = it.is_return ? -1 : 1;
      priorYearCogsRaw +=
        sign * (Number(it.quantity) || 0) * avgCost;
    }

    // (d) 선택된 월 집합 결정.
    const selectedMonthsList: number[] =
      mode === 'monthly'
        ? month != null
          ? [month]
          : []
        : mode === 'yearly'
          ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          : [...(months ?? [])];

    // (e) 첫 선택 월 이전 누계 (대상 연도 내).
    const firstSelected =
      selectedMonthsList.length > 0
        ? Math.min(...selectedMonthsList)
        : 1;
    let importBeforeRaw = 0;
    let cogsBeforeRaw = 0;
    for (let m = 1; m < firstSelected; m++) {
      importBeforeRaw += monthlyImportRaw[m];
      cogsBeforeRaw += monthlyCogsRaw[m];
    }

    // (f) 선택 기간 합산.
    let importPurchaseRaw = 0;
    let cogsRaw = 0;
    for (const m of selectedMonthsList) {
      importPurchaseRaw += monthlyImportRaw[m] ?? 0;
      cogsRaw += monthlyCogsRaw[m] ?? 0;
    }

    // (g) 기초재고 / 기말재고.
    const beginningInventoryRaw =
      openingValueRaw +
      priorYearImportRaw -
      priorYearCogsRaw +
      importBeforeRaw -
      cogsBeforeRaw;
    const endingInventoryRaw =
      beginningInventoryRaw + importPurchaseRaw - cogsRaw;

    // ── 수입비용 (운임, VAT 포함 raw) ──────────────────────
    let importCostsRaw = 0;
    for (const inv of imports) {
      if (!isMonthSelected(dateToMonth(inv.invoice_date), mode, month, months))
        continue;
      importCostsRaw +=
        (Number(inv.shipping_cost_usd) || 0) *
        (Number(inv.exchange_rate) || 0);
    }

    // ── 부가세 (tax_invoices.vat_amount, 그 자체가 부가세이므로 ÷1.1 적용 안 함) ─
    let vatAmount = 0;
    for (const t of tax) {
      if (!isMonthSelected(t.invoice_month, mode, month, months)) continue;
      vatAmount += Number(t.vat_amount) || 0;
    }

    // ── 판관비 카테고리 집계 (VAT 포함 raw) ────────────────
    const byCat = new Map<
      string,
      { name: string; manual: number; fromBank: number; sort: number }
    >();
    for (const e of expenses) {
      if (!e.category || !e.category.is_active) continue;
      if (!isMonthSelected(e.month, mode, month, months)) continue;
      const cur = byCat.get(e.category_id) ?? {
        name: e.category.name,
        manual: 0,
        fromBank: 0,
        sort: e.category.sort_order,
      };
      cur.manual += Number(e.amount_krw) || 0;
      byCat.set(e.category_id, cur);
    }
    for (const b of bankExpenses) {
      if (!b.category || !b.category.is_active) continue;
      if (!b.pl_category_id) continue;
      if (!isMonthSelected(b.month, mode, month, months)) continue;
      const cur = byCat.get(b.pl_category_id) ?? {
        name: b.category.name,
        manual: 0,
        fromBank: 0,
        sort: b.category.sort_order,
      };
      cur.fromBank += Number(b.withdrawal) || 0;
      byCat.set(b.pl_category_id, cur);
    }

    // ── VAT 처리 (각 항목 ÷ vatDivisor) ────────────────────
    const sellingExpenses: PlExpenseLine[] = Array.from(byCat.entries())
      .map(([categoryId, v]) => ({
        categoryId,
        categoryName: v.name,
        amount: (v.manual + v.fromBank) / vatDivisor,
        manual: v.manual / vatDivisor,
        fromBank: v.fromBank / vatDivisor,
        _sort: v.sort,
      }))
      .sort(
        (a, b) =>
          a._sort - b._sort || a.categoryName.localeCompare(b.categoryName),
      )
      .map(({ categoryId, categoryName, amount, manual, fromBank }) => ({
        categoryId,
        categoryName,
        amount,
        manual,
        fromBank,
      }));
    const totalSellingExpensesManual = sellingExpenses.reduce(
      (s, e) => s + e.manual,
      0,
    );
    const totalSellingExpensesFromBank = sellingExpenses.reduce(
      (s, e) => s + e.fromBank,
      0,
    );
    const totalSellingExpenses =
      totalSellingExpensesManual + totalSellingExpensesFromBank;

    const revenue = revenueRaw;
    const revenueExVat = revenueRaw / 1.1;
    const displayRevenue = revenueRaw / vatDivisor;
    const cogs = cogsRaw / vatDivisor;
    const importCosts = importCostsRaw / vatDivisor;
    const cogsDetail: CogsDetail = {
      beginningInventory: beginningInventoryRaw / vatDivisor,
      importPurchase: importPurchaseRaw / vatDivisor,
      endingInventory: endingInventoryRaw / vatDivisor,
      total: cogs,
    };

    const grossProfit = displayRevenue - cogs;
    const grossMargin =
      displayRevenue > 0 ? (grossProfit / displayRevenue) * 100 : 0;
    const operatingProfit =
      grossProfit - importCosts - totalSellingExpenses;
    const operatingMargin =
      displayRevenue > 0 ? (operatingProfit / displayRevenue) * 100 : 0;
    // 부가세 포함 모드: 부가세는 매출에 이미 녹아있어 별도 차감 없음.
    // 부가세 제외 모드: 공급가액 기준 매출 + 부가세 라인을 별도 차감해 순이익 산출.
    const netProfit = includeVat ? operatingProfit : operatingProfit - vatAmount;
    const netMargin =
      displayRevenue > 0 ? (netProfit / displayRevenue) * 100 : 0;

    return {
      revenue,
      revenueExVat,
      displayRevenue,
      cogs,
      cogsDetail,
      grossProfit,
      grossMargin,
      importCosts,
      sellingExpenses,
      totalSellingExpenses,
      totalSellingExpensesManual,
      totalSellingExpensesFromBank,
      vatAmount,
      operatingProfit,
      operatingMargin,
      netProfit,
      netMargin,
      periodLabel: periodLabel(mode, year, month, months),
      hasNoMonths: false,
      isLoading: false,
    };
  }, [
    ordersQ.data,
    itemsQ.data,
    priorItemsQ.data,
    lotsQ.data,
    importsQ.data,
    taxQ.data,
    expensesQ.data,
    bankExpensesQ.data,
    mode,
    year,
    month,
    months,
    includeVat,
    isLoading,
  ]);
}
