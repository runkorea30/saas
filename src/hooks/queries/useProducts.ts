/**
 * Products 페이지 쿼리/뮤테이션 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 (RLS + 프론트 이중 방어).
 * 🔴 CLAUDE.md §5: fetchAllRows 경유.
 * 🟠 soft delete: deleted_at IS NULL 필터, 삭제 시 deleted_at = now().
 *
 * Mutation 에러 처리:
 * - PostgrestError.code === '23505' (UNIQUE 위반) → "이미 사용 중인 제품코드입니다"
 * - 그 외는 error.message 전파 → 페이지 toast 로 노출.
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

export interface ProductUpdateArgs {
  id: string;
  changes: Partial<ProductCreateInput>;
}

type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

const PRODUCT_SELECT =
  'id, code, name, category, sell_price, supply_price, unit_price_usd, unit, is_active, created_at, updated_at';

// ───────────────────────────────────────────────────────────
// 에러 매핑
// ───────────────────────────────────────────────────────────

function mapPostgrestError(err: PostgrestError | null): Error | null {
  if (!err) return null;
  if (err.code === '23505') {
    return new Error('이미 사용 중인 제품코드입니다');
  }
  return new Error(err.message || '알 수 없는 오류가 발생했습니다');
}

// ───────────────────────────────────────────────────────────
// useProducts — 목록 (deleted_at IS NULL, code ASC)
// ───────────────────────────────────────────────────────────

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
// Mutations
// ───────────────────────────────────────────────────────────

export function useCreateProduct(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<Product, Error, ProductCreateInput>({
    mutationFn: async (input) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { data, error } = await supabase
        .from('products')
        .insert({ company_id: companyId, ...input })
        .select(PRODUCT_SELECT)
        .single();
      const mapped = mapPostgrestError(error);
      if (mapped) throw mapped;
      if (!data) throw new Error('제품 생성 응답이 비어 있습니다');
      return data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', companyId] });
    },
  });
}

export function useUpdateProduct(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<Product, Error, ProductUpdateArgs>({
    mutationFn: async ({ id, changes }) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { data, error } = await supabase
        .from('products')
        .update(changes)
        .eq('id', id)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .select(PRODUCT_SELECT)
        .single();
      const mapped = mapPostgrestError(error);
      if (mapped) throw mapped;
      if (!data) throw new Error('수정 대상 제품을 찾을 수 없습니다');
      return data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', companyId] });
    },
  });
}

export function useDeleteProduct(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId)
        .is('deleted_at', null);
      const mapped = mapPostgrestError(error);
      if (mapped) throw mapped;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', companyId] });
    },
  });
}
