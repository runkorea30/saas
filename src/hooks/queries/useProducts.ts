/**
 * Products 페이지 쿼리/뮤테이션 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 (RLS + 프론트 이중 방어).
 * 🔴 CLAUDE.md §5: fetchAllRows 경유.
 * 🟠 soft delete: deleted_at IS NULL 필터, 삭제 시 deleted_at = now().
 *
 * Round 1(조회): useProducts 만 구현.
 * Round 2(CRUD): useCreateProduct / useUpdateProduct / useDeleteProduct 는
 *                시그니처만 선언, 호출 시 throw (이번 라운드 호출 경로 없음).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  sell_price: number;
  supply_price: number;
  unit_price_usd: number | null;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCreateInput {
  code: string;
  name: string;
  category: string;
  sell_price: number;
  supply_price: number;
  unit_price_usd: number | null;
  unit: string;
  is_active: boolean;
}

export type ProductUpdateInput = Partial<ProductCreateInput> & { id: string };

type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

// ───────────────────────────────────────────────────────────
// useProducts — 목록 (deleted_at IS NULL, code ASC)
// ───────────────────────────────────────────────────────────

const PRODUCT_SELECT =
  'id, code, name, category, sell_price, supply_price, unit_price_usd, unit, is_active, created_at, updated_at';

export function useProducts(companyId: string | null) {
  return useQuery<Product[]>({
    queryKey: ['products', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<Product>(() =>
        supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .order('code', { ascending: true }) as unknown as RangeableQuery<Product>,
      );
      return rows;
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// Mutation 스텁 — Round 2에서 구현
// ───────────────────────────────────────────────────────────

/** 🟡 Round 2에서 구현. 현재는 시그니처만 노출. */
export function useCreateProduct(_companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<Product, Error, ProductCreateInput>({
    mutationFn: async () => {
      throw new Error('useCreateProduct: Round 2에서 구현 예정');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/** 🟡 Round 2에서 구현. 현재는 시그니처만 노출. */
export function useUpdateProduct(_companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<Product, Error, ProductUpdateInput>({
    mutationFn: async () => {
      throw new Error('useUpdateProduct: Round 2에서 구현 예정');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/** 🟡 Round 2에서 구현 (soft delete). 현재는 시그니처만 노출. */
export function useDeleteProduct(_companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async () => {
      throw new Error('useDeleteProduct: Round 2에서 구현 예정 (soft delete)');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
