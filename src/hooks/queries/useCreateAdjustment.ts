/**
 * 재고조정 뮤테이션 — RPC `mochicraft_demo.create_stock_adjustment` 호출.
 *
 * 🔴 CLAUDE.md §1: company_id 필수 (RLS + 프론트 이중 방어).
 * 🔴 CLAUDE.md §5: DB INSERT + opening lot UPDATE 는 단일 트랜잭션이 필요 → RPC 경유.
 * 🟠 quantity 는 부호 포함 정수 (양수=증가, 음수=감소). 0 금지.
 * 🟠 RPC 내부에서 (현재 opening qty + p_quantity < 0) 면 예외 — 음수 방지 1차 방어.
 * 🟡 성공 시 inventory-stock · inventory-detail 쿼리 invalidate.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CreateAdjustmentInput {
  product_id: string;
  /** 부호 포함 정수. 양수=증가, 음수=감소. 0 금지. */
  quantity: number;
  memo: string | null;
  /** ISO 문자열. */
  transaction_date: string;
}

export function useCreateAdjustment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, CreateAdjustmentInput>({
    mutationFn: async (input) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      if (!Number.isInteger(input.quantity) || input.quantity === 0) {
        throw new Error('조정 수량은 0이 아닌 정수여야 합니다.');
      }
      const { error } = await supabase.rpc('create_stock_adjustment', {
        p_company_id: companyId,
        p_product_id: input.product_id,
        p_quantity: input.quantity,
        p_memo: input.memo,
        p_date: input.transaction_date,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-stock', companyId] });
      qc.invalidateQueries({ queryKey: ['inventory-detail', companyId] });
    },
  });
}
