/**
 * 손익계산서 — 판관비 카테고리 CRUD.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 (RLS + 프론트 이중 방어).
 * 🟠 삭제는 soft delete (is_active=false) — 과거 pl_expenses 무결성 보존.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface PlExpenseCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export function usePlExpenseCategories(companyId: string | null) {
  return useQuery({
    queryKey: ['pl-expense-categories', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      return fetchAllRows<PlExpenseCategory>(() =>
        supabase
          .from('pl_expense_categories')
          .select('id, name, sort_order, is_active')
          .eq('company_id', companyId!)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
      );
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useAddPlExpenseCategory(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!companyId) throw new Error('companyId 없음');
      const { error } = await supabase.from('pl_expense_categories').insert({
        company_id: companyId,
        name,
        sort_order: 9999,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pl-expense-categories', companyId] });
    },
  });
}

export function useDeletePlExpenseCategory(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('companyId 없음');
      // soft delete — 기존 pl_expenses 데이터는 보존되지만 목록/계산에서 제외.
      const { error } = await supabase
        .from('pl_expense_categories')
        .update({ is_active: false })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pl-expense-categories', companyId] });
      qc.invalidateQueries({ queryKey: ['pl-expenses', companyId] });
      qc.invalidateQueries({ queryKey: ['pl-expenses-for-month', companyId] });
    },
  });
}
