/**
 * 손익계산서 — 월별 판관비 입력/조회.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 upsert onConflict: (company_id, category_id, year, month) — 한 셀당 1행.
 *    UNIQUE 제약이 마이그레이션에서 추가되어 있다는 전제.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

/** 한 달 분 카테고리 ID → 금액 맵 — 편집 폼 초기값. */
export function usePlExpensesForMonth(
  companyId: string | null,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: ['pl-expenses-for-month', companyId, year, month],
    enabled: Boolean(companyId && year && month),
    queryFn: async () => {
      const rows = await fetchAllRows<{
        category_id: string;
        amount_krw: number;
      }>(() =>
        supabase
          .from('pl_expenses')
          .select('category_id, amount_krw')
          .eq('company_id', companyId!)
          .eq('year', year)
          .eq('month', month),
      );
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.category_id, Number(r.amount_krw));
      return map;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export interface PlExpenseSaveArgs {
  companyId: string;
  categoryId: string;
  year: number;
  month: number;
  amountKrw: number;
}

export function useSavePlExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: PlExpenseSaveArgs) => {
      const { error } = await supabase.from('pl_expenses').upsert(
        {
          company_id: args.companyId,
          category_id: args.categoryId,
          year: args.year,
          month: args.month,
          amount_krw: args.amountKrw,
        },
        { onConflict: 'company_id,category_id,year,month' },
      );
      if (error) throw error;
    },
    onSuccess: (_, args) => {
      qc.invalidateQueries({ queryKey: ['pl-expenses', args.companyId] });
      qc.invalidateQueries({
        queryKey: ['pl-expenses-for-month', args.companyId],
      });
    },
  });
}
