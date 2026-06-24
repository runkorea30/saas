/**
 * 세금계산서 도메인 훅.
 *
 * 🔴 CLAUDE.md §1: 모든 쿼리 company_id 필터 + useCompany() 훅에서만 가져옴.
 * 🔴 CLAUDE.md §5: 목록 조회는 fetchAllRows() 경유.
 *
 * 발행 단위 정책:
 *  - 독립 거래처 (group_id IS NULL + 본인 사업자번호 보유) → customer_id 사용
 *  - 그룹 소속 거래처들 → customer_group_id 사용 (그룹 멤버 매출 합산)
 *
 * 금액 계산:
 *  - supply_amount = Math.floor(total_amount / 1.1)
 *  - vat_amount = total_amount - supply_amount
 *  (이 페이지에서는 utils/calculations.ts 의 calcSupplyAmount(Math.round) 사용 금지)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { TaxInvoice, TaxInvoiceRow, TaxInvoiceSubject } from '@/types/taxInvoice';

// ───────────────────────────────────────────────────────────
// 내부 유틸
// ───────────────────────────────────────────────────────────

/**
 * KST 기준 [year, month) 의 UTC ISO 시작/끝.
 * KST midnight = UTC midnight - 9h.
 */
function monthRangeKst(year: number, month: number): { start: string; end: string } {
  const startMs = Date.UTC(year, month - 1, 1) - 9 * 3600_000;
  const endMs = Date.UTC(year, month, 1) - 9 * 3600_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

/** 사업자번호 유효성: NULL / 빈문자열 / '-' 만 모두 제외. */
function hasValidBrn(brn: string | null | undefined): brn is string {
  if (!brn) return false;
  const trimmed = brn.trim();
  return trimmed !== '' && trimmed !== '-';
}

/** 금액 분해: total → supply (floor) + vat. */
function splitAmounts(totalAmount: number) {
  const supply_amount = Math.floor(totalAmount / 1.1);
  const vat_amount = totalAmount - supply_amount;
  return { supply_amount, vat_amount };
}

// ───────────────────────────────────────────────────────────
// 1. useTaxInvoices — 해당 월 발행 목록만 단순 조회
// ───────────────────────────────────────────────────────────

const TAX_INVOICE_SELECT = `
  id, company_id, customer_id, customer_group_id,
  invoice_year, invoice_month,
  total_amount, supply_amount, vat_amount,
  invoice_type, payment_type, status, issued_at, memo,
  deleted_at, created_at, updated_at
`;

export function useTaxInvoices(
  companyId: string | null,
  year: number,
  month: number,
) {
  return useQuery<TaxInvoice[]>({
    queryKey: ['tax-invoices', companyId, year, month],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<TaxInvoice>(() =>
        supabase
          .from('tax_invoices')
          .select(TAX_INVOICE_SELECT)
          .eq('company_id', companyId!)
          .eq('invoice_year', year)
          .eq('invoice_month', month)
          .is('deleted_at', null),
      );
      return rows;
    },
    staleTime: 30_000,
  });
}

// ───────────────────────────────────────────────────────────
// 2. useTaxInvoiceRows — 발행 가능 행 (매출 집계 + 발행 현황 병합)
// ───────────────────────────────────────────────────────────

interface IndependentCustomerRow {
  id: string;
  name: string;
  business_registration_number: string | null;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  business_registration_number: string | null;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
}

interface GroupMemberRow {
  id: string;
  group_id: string | null;
}

interface OrderAggRow {
  customer_id: string;
  total_amount: number;
}

export function useTaxInvoiceRows(
  companyId: string | null,
  year: number,
  month: number,
) {
  return useQuery<TaxInvoiceRow[]>({
    queryKey: ['tax-invoice-rows', companyId, year, month],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { start, end } = monthRangeKst(year, month);

      // 5개 쿼리 병렬 실행 (모두 같은 회사 범위)
      const [
        independentCustomers,
        groups,
        groupMembers,
        orders,
        existingInvoices,
      ] = await Promise.all([
        // 1) 독립 거래처 (group_id IS NULL + 자체 사업자번호 보유)
        fetchAllRows<IndependentCustomerRow>(() =>
          supabase
            .from('customers')
            .select(
              `id, name, business_registration_number, ceo_name,
               business_address, business_type, business_category, tax_email`,
            )
            .eq('company_id', companyId!)
            .is('deleted_at', null)
            .is('group_id', null)
            .not('business_registration_number', 'is', null),
        ),
        // 2) 그룹 (사업자번호 보유)
        fetchAllRows<GroupRow>(() =>
          supabase
            .from('customer_groups')
            .select(
              `id, name, business_registration_number, ceo_name,
               business_address, business_type, business_category, tax_email`,
            )
            .eq('company_id', companyId!)
            .not('business_registration_number', 'is', null),
        ),
        // 3) 그룹 멤버 매핑 (customer_id → group_id)
        fetchAllRows<GroupMemberRow>(() =>
          supabase
            .from('customers')
            .select('id, group_id')
            .eq('company_id', companyId!)
            .is('deleted_at', null)
            .not('group_id', 'is', null),
        ),
        // 4) 해당 월 주문
        fetchAllRows<OrderAggRow>(() =>
          supabase
            .from('orders')
            .select('customer_id, total_amount')
            .eq('company_id', companyId!)
            .is('deleted_at', null)
            .gte('order_date', start)
            .lt('order_date', end),
        ),
        // 5) 기존 발행 세금계산서
        fetchAllRows<TaxInvoice>(() =>
          supabase
            .from('tax_invoices')
            .select(TAX_INVOICE_SELECT)
            .eq('company_id', companyId!)
            .eq('invoice_year', year)
            .eq('invoice_month', month)
            .is('deleted_at', null),
        ),
      ]);

      // 빈/'-' brn 제거
      const validIndependents = independentCustomers.filter((c) =>
        hasValidBrn(c.business_registration_number),
      );
      const validGroups = groups.filter((g) =>
        hasValidBrn(g.business_registration_number),
      );

      // 매핑 테이블
      const customerToGroup = new Map<string, string>();
      for (const m of groupMembers) {
        if (m.group_id) customerToGroup.set(m.id, m.group_id);
      }

      // 주문 → 집계
      const customerTotals = new Map<string, { total: number; count: number }>();
      const groupTotals = new Map<string, { total: number; count: number }>();
      for (const o of orders) {
        const gid = customerToGroup.get(o.customer_id);
        if (gid) {
          const cur = groupTotals.get(gid) ?? { total: 0, count: 0 };
          cur.total += o.total_amount;
          cur.count += 1;
          groupTotals.set(gid, cur);
        } else {
          const cur = customerTotals.get(o.customer_id) ?? { total: 0, count: 0 };
          cur.total += o.total_amount;
          cur.count += 1;
          customerTotals.set(o.customer_id, cur);
        }
      }

      // 발행 현황 맵
      const customerInvoiceMap = new Map<string, TaxInvoice>();
      const groupInvoiceMap = new Map<string, TaxInvoice>();
      for (const inv of existingInvoices) {
        if (inv.customer_id) customerInvoiceMap.set(inv.customer_id, inv);
        if (inv.customer_group_id) groupInvoiceMap.set(inv.customer_group_id, inv);
      }

      // 행 구성
      const rows: TaxInvoiceRow[] = [];

      for (const c of validIndependents) {
        const agg = customerTotals.get(c.id);
        if (!agg || agg.total <= 0) continue;
        const subject: TaxInvoiceSubject = {
          id: c.id,
          name: c.name,
          business_registration_number: c.business_registration_number!,
          ceo_name: c.ceo_name,
          business_address: c.business_address,
          business_type: c.business_type,
          business_category: c.business_category,
          tax_email: c.tax_email,
        };
        const { supply_amount, vat_amount } = splitAmounts(agg.total);
        rows.push({
          subjectType: 'customer',
          subjectId: c.id,
          subject,
          total_amount: agg.total,
          supply_amount,
          vat_amount,
          order_count: agg.count,
          invoice: customerInvoiceMap.get(c.id) ?? null,
        });
      }

      for (const g of validGroups) {
        const agg = groupTotals.get(g.id);
        if (!agg || agg.total <= 0) continue;
        const subject: TaxInvoiceSubject = {
          id: g.id,
          name: g.name,
          business_registration_number: g.business_registration_number!,
          ceo_name: g.ceo_name,
          business_address: g.business_address,
          business_type: g.business_type,
          business_category: g.business_category,
          tax_email: g.tax_email,
        };
        const { supply_amount, vat_amount } = splitAmounts(agg.total);
        rows.push({
          subjectType: 'group',
          subjectId: g.id,
          subject,
          total_amount: agg.total,
          supply_amount,
          vat_amount,
          order_count: agg.count,
          invoice: groupInvoiceMap.get(g.id) ?? null,
        });
      }

      // 상호명 한글 정렬
      rows.sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'ko'));
      return rows;
    },
    staleTime: 30_000,
  });
}

// ───────────────────────────────────────────────────────────
// 3. useCreateTaxInvoice — 단건 생성
// ───────────────────────────────────────────────────────────

export interface CreateTaxInvoiceInput {
  subjectType: 'customer' | 'group';
  subjectId: string;
  year: number;
  month: number;
  total_amount: number;
}

export function useCreateTaxInvoice(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaxInvoiceInput) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { supply_amount, vat_amount } = splitAmounts(input.total_amount);
      const row = {
        company_id: companyId,
        customer_id: input.subjectType === 'customer' ? input.subjectId : null,
        customer_group_id: input.subjectType === 'group' ? input.subjectId : null,
        invoice_year: input.year,
        invoice_month: input.month,
        total_amount: input.total_amount,
        supply_amount,
        vat_amount,
        invoice_type: '01',
        payment_type: '02',
        status: 'issued',
        issued_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('tax_invoices').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['tax-invoice-rows'] });
    },
  });
}

// ───────────────────────────────────────────────────────────
// 4. useCreateTaxInvoicesBulk — 일괄 생성 (미발행 건만)
// ───────────────────────────────────────────────────────────

export interface BulkInsertResult {
  inserted: number;
  skipped: number;       // 23505 중복 — 다른 세션이 먼저 발행했거나 stale 데이터
  failed: number;
  errors: string[];      // 표시용 — "거래처명: 에러메시지"
}

export function useCreateTaxInvoicesBulk(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<BulkInsertResult, Error, { year: number; month: number; rows: TaxInvoiceRow[] }>({
    mutationFn: async (input) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const unissued = input.rows.filter((r) => r.invoice === null);
      const result: BulkInsertResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
      if (unissued.length === 0) return result;

      const issuedAt = new Date().toISOString();

      // 🟠 순차 INSERT: 한 행 실패가 전체를 막지 않도록.
      //    23505(unique violation) 은 stale 데이터로 간주하고 skip.
      for (const r of unissued) {
        const payload = {
          company_id: companyId,
          customer_id: r.subjectType === 'customer' ? r.subjectId : null,
          customer_group_id: r.subjectType === 'group' ? r.subjectId : null,
          invoice_year: input.year,
          invoice_month: input.month,
          total_amount: r.total_amount,
          supply_amount: r.supply_amount,
          vat_amount: r.vat_amount,
          invoice_type: '01',
          payment_type: '02',
          status: 'issued',
          issued_at: issuedAt,
        };
        const { error } = await supabase.from('tax_invoices').insert(payload);
        if (!error) {
          result.inserted += 1;
          continue;
        }
        if (error.code === '23505') {
          result.skipped += 1;
          continue;
        }
        result.failed += 1;
        result.errors.push(`${r.subject.name}: ${error.message}`);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['tax-invoice-rows'] });
    },
  });
}

// ───────────────────────────────────────────────────────────
// 5. useDeleteTaxInvoice — 하드 삭제
// ───────────────────────────────────────────────────────────

export function useDeleteTaxInvoice(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { error } = await supabase
        .from('tax_invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['tax-invoice-rows'] });
    },
  });
}
