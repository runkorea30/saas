/**
 * 손익계산서 — 매출/매출원가/수입비용/판관비/부가세 집계.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §5: 모든 목록 조회 fetchAllRows 경유.
 *
 * 데이터 소스:
 *   - orders (매출, deleted_at 제외, status != 'canceled')
 *   - order_items + products.supply_price (매출원가 근사치)
 *   - import_invoices (운임 = shipping_cost_usd × exchange_rate)
 *   - tax_invoices (부가세, invoice_year/month 기준)
 *   - pl_expenses + pl_expense_categories (월별 판관비)
 *
 * 모든 쿼리는 연도 단위로 한 번에 fetch → mode/month(s) 에 따라 JS 에서 필터.
 * 같은 연도 안에서 모드만 토글하면 캐시 재사용.
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
}

export interface ProfitLossData {
  revenue: number;
  revenueExVat: number;
  displayRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  importCosts: number;
  sellingExpenses: PlExpenseLine[];
  totalSellingExpenses: number;
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
  quantity: number;
  is_return: boolean;
  order: { order_date: string } | null;
  product: { supply_price: number | null } | null;
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
    queryKey: ['pl-items', companyId, year],
    enabled,
    staleTime: 1000 * 60 * 5,
    queryFn: () =>
      fetchAllRows<OrderItemRow>(() =>
        supabase
          .from('order_items')
          .select(
            'quantity, is_return, order:orders!inner(order_date, status, deleted_at), product:products(supply_price)',
          )
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .is('order.deleted_at', null)
          .neq('order.status', 'canceled')
          .gte('order.order_date', yearStart)
          .lt('order.order_date', yearEnd),
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

  const isLoading =
    ordersQ.isLoading ||
    itemsQ.isLoading ||
    importsQ.isLoading ||
    taxQ.isLoading ||
    expensesQ.isLoading;

  return useMemo<ProfitLossData>(() => {
    const hasNoMonths =
      mode === 'custom' && (!months || months.length === 0);

    const empty: Omit<ProfitLossData, 'periodLabel' | 'hasNoMonths' | 'isLoading'> = {
      revenue: 0,
      revenueExVat: 0,
      displayRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      grossMargin: 0,
      importCosts: 0,
      sellingExpenses: [],
      totalSellingExpenses: 0,
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
    const imports = importsQ.data ?? [];
    const tax = taxQ.data ?? [];
    const expenses = expensesQ.data ?? [];

    let revenue = 0;
    for (const o of orders) {
      if (!isMonthSelected(dateToMonth(o.order_date), mode, month, months)) continue;
      revenue += Number(o.total_amount) || 0;
    }
    const revenueExVat = revenue / 1.1;

    let cogs = 0;
    for (const it of items) {
      if (it.is_return) continue;
      if (!it.order) continue;
      if (!isMonthSelected(dateToMonth(it.order.order_date), mode, month, months))
        continue;
      cogs += it.quantity * (it.product?.supply_price ?? 0);
    }

    let importCosts = 0;
    for (const inv of imports) {
      if (!isMonthSelected(dateToMonth(inv.invoice_date), mode, month, months))
        continue;
      importCosts +=
        (Number(inv.shipping_cost_usd) || 0) *
        (Number(inv.exchange_rate) || 0);
    }

    let vatAmount = 0;
    for (const t of tax) {
      if (!isMonthSelected(t.invoice_month, mode, month, months)) continue;
      vatAmount += Number(t.vat_amount) || 0;
    }

    const byCat = new Map<
      string,
      { name: string; amount: number; sort: number }
    >();
    for (const e of expenses) {
      if (!e.category || !e.category.is_active) continue;
      if (!isMonthSelected(e.month, mode, month, months)) continue;
      const cur = byCat.get(e.category_id) ?? {
        name: e.category.name,
        amount: 0,
        sort: e.category.sort_order,
      };
      cur.amount += Number(e.amount_krw) || 0;
      byCat.set(e.category_id, cur);
    }
    const sellingExpenses: PlExpenseLine[] = Array.from(byCat.entries())
      .map(([categoryId, v]) => ({
        categoryId,
        categoryName: v.name,
        amount: v.amount,
        _sort: v.sort,
      }))
      .sort((a, b) => a._sort - b._sort || a.categoryName.localeCompare(b.categoryName))
      .map(({ categoryId, categoryName, amount }) => ({
        categoryId,
        categoryName,
        amount,
      }));
    const totalSellingExpenses = sellingExpenses.reduce(
      (s, e) => s + e.amount,
      0,
    );

    const displayRevenue = includeVat ? revenue : revenueExVat;
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
      grossProfit,
      grossMargin,
      importCosts,
      sellingExpenses,
      totalSellingExpenses,
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
    importsQ.data,
    taxQ.data,
    expensesQ.data,
    mode,
    year,
    month,
    months,
    includeVat,
    isLoading,
  ]);
}
