/**
 * 은행거래/매핑/제외 키워드/정산용 주문 조회 + mutation 훅.
 *
 * 🔴 CLAUDE.md §1: 모든 쿼리 company_id 필터.
 * 🔴 CLAUDE.md §5: fetchAllRows 경유, factory 함수 패턴.
 * ⚠️ DB 컬럼 settlement_cycle ↔ TS 타입 payment_cycle 매핑 처리.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type {
  BankTransaction,
  BankMapping,
  BankExcludeKeyword,
} from '@/types/database';

// ── useBankTransactions ──────────────────────────────────────────────
// year 필수, month null이면 해당 연도 전체.
export function useBankTransactions(year: number, month: number | null) {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ['bank-transactions', companyId, year, month],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const startDate = month
        ? `${year}-${String(month).padStart(2, '0')}-01`
        : `${year}-01-01`;
      const endDate = month
        ? new Date(year, month, 0).toISOString().slice(0, 10) // 해당월 말일
        : `${year}-12-31`;

      const rows = await fetchAllRows<Record<string, unknown>>(() =>
        supabase
          .from('bank_transactions')
          .select(
            `
              *,
              customer:customers(id, name, settlement_cycle, match_type)
            `,
          )
          .eq('company_id', companyId!)
          .eq('type', 'deposit')
          .is('deleted_at', null)
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)
          .order('transaction_date', { ascending: false }),
      );

      // settlement_cycle → payment_cycle rename (DB ↔ TS 타입 갭 흡수)
      return rows.map((row) => {
        const cust = row.customer as
          | { id: string; name: string; settlement_cycle: string; match_type: string }
          | null;
        return {
          ...row,
          customer: cust
            ? {
                id: cust.id,
                name: cust.name,
                payment_cycle: cust.settlement_cycle,
                match_type: cust.match_type,
              }
            : undefined,
        };
      }) as unknown as BankTransaction[];
    },
  });
}

// ── useBankMappings ──────────────────────────────────────────────────
export function useBankMappings() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ['bank-mappings', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<BankMapping>(() =>
        supabase
          .from('bank_mappings')
          .select('*')
          .eq('company_id', companyId!)
          .order('created_at', { ascending: true })
          .returns<BankMapping[]>(),
      );
      return rows;
    },
  });
}

// ── useBankExcludeKeywords ───────────────────────────────────────────
export function useBankExcludeKeywords() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ['bank-exclude-keywords', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<BankExcludeKeyword>(() =>
        supabase
          .from('bank_exclude_keywords')
          .select('*')
          .eq('company_id', companyId!)
          .order('created_at', { ascending: true })
          .returns<BankExcludeKeyword[]>(),
      );
      return rows;
    },
  });
}

// ── useOrdersForReconciliation ───────────────────────────────────────
// 정산 계산용: 거래처 settlement_cycle 포함.
export function useOrdersForReconciliation() {
  const { companyId } = useCompany();

  return useQuery({
    queryKey: ['orders-for-reconciliation', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<Record<string, unknown>>(() =>
        supabase
          .from('orders')
          .select(
            `
              id,
              customer_id,
              order_date,
              total_amount,
              customer:customers(name, settlement_cycle, match_type)
            `,
          )
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .order('order_date', { ascending: true }),
      );

      return rows.map((o) => {
        const cust = o.customer as
          | { name: string; settlement_cycle: string | null; match_type: string | null }
          | null;
        return {
          customer_id: o.customer_id as string,
          customer_name: cust?.name ?? '',
          settlement_cycle: cust?.settlement_cycle ?? '익월',
          order_date: String(o.order_date).slice(0, 10),
          total_amount: o.total_amount as number,
          match_type: cust?.match_type ?? 'monthly',
        };
      });
    },
  });
}

// ── useAddBankTransactions ───────────────────────────────────────────
// 배치 INSERT (중복은 ON CONFLICT DO NOTHING).
export function useAddBankTransactions() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (
      rows: {
        transaction_date: string;
        depositor_name: string;
        amount: number;
        description: string;
        match_status: 'matched' | 'unmatched' | 'excluded';
        match_type: '자동' | '수동' | '매핑' | null;
        is_excluded: boolean;
        exclude_reason: string | null;
        customer_id: string | null;
      }[],
    ) => {
      if (!companyId) throw new Error('회사 컨텍스트 미초기화');

      const payload = rows.map((r) => ({
        ...r,
        company_id: companyId,
        type: 'deposit' as const,
        moved_to_monthly: false,
      }));

      const { data, error } = await supabase
        .from('bank_transactions')
        .upsert(payload, {
          onConflict: 'company_id,transaction_date,depositor_name,amount',
          ignoreDuplicates: true,
        })
        .select('id');

      if (error) throw error;
      return data ?? [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] });
    },
  });
}

// ── useUpdateBankTransaction ─────────────────────────────────────────
export function useUpdateBankTransaction() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      match_status?: 'matched' | 'unmatched' | 'excluded';
      customer_id?: string | null;
      match_type?: '자동' | '수동' | '매핑' | null;
      is_excluded?: boolean;
      exclude_reason?: string | null;
      moved_to_monthly?: boolean;
    }) => {
      if (!companyId) throw new Error('회사 컨텍스트 미초기화');

      const { error } = await supabase
        .from('bank_transactions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] });
    },
  });
}

// ── useAddBankMapping ────────────────────────────────────────────────
export function useAddBankMapping() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      bank_name: string;
      customer_id: string | null;
      customer_name: string;
    }) => {
      if (!companyId) throw new Error('회사 컨텍스트 미초기화');

      const { error } = await supabase
        .from('bank_mappings')
        .insert({ ...payload, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-mappings', companyId] });
    },
  });
}

// ── useDeleteBankMapping ─────────────────────────────────────────────
export function useDeleteBankMapping() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('회사 컨텍스트 미초기화');

      const { error } = await supabase
        .from('bank_mappings')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-mappings', companyId] });
    },
  });
}

// ── useAddBankExcludeKeyword ─────────────────────────────────────────
export function useAddBankExcludeKeyword() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (keyword: string) => {
      if (!companyId) throw new Error('회사 컨텍스트 미초기화');

      const { error } = await supabase
        .from('bank_exclude_keywords')
        .insert({ keyword, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-exclude-keywords', companyId] });
    },
  });
}

// ── useDeleteBankExcludeKeyword ──────────────────────────────────────
export function useDeleteBankExcludeKeyword() {
  const { companyId } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('회사 컨텍스트 미초기화');

      const { error } = await supabase
        .from('bank_exclude_keywords')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-exclude-keywords', companyId] });
    },
  });
}
