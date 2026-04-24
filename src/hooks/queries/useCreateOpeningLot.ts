/**
 * 기초재고 투입 뮤테이션 — inventory_lots insert (lot_type='opening').
 *
 * 🔴 CLAUDE.md §1: company_id 필수 (RLS + 프론트 이중 방어).
 * 🟠 RLS: `inventory_lots_dev_anon_insert` 정책으로 dev 환경에서 anon INSERT 허용.
 *    Phase 2 Auth 도입 시 원복 필요 (SESSION_HANDOFF §5).
 * 🟡 `remaining_quantity` 는 FIFO 소비 전이므로 quantity 와 동일하게 세팅.
 * 🟡 성공 시 products · inventory-stock · inventory-detail 쿼리 invalidate.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CreateOpeningLotInput {
  product_id: string;
  quantity: number;
  cost_krw: number;
  /** ISO 문자열. 기본값은 호출부에서 오늘 KST 자정으로 세팅. */
  lot_date: string;
}

export function useCreateOpeningLot(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, CreateOpeningLotInput>({
    mutationFn: async (input) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        throw new Error('수량은 양의 정수여야 합니다.');
      }
      if (!Number.isFinite(input.cost_krw) || input.cost_krw < 0) {
        throw new Error('단가는 0 이상이어야 합니다.');
      }
      const { error } = await supabase.from('inventory_lots').insert({
        company_id: companyId,
        product_id: input.product_id,
        lot_type: 'opening',
        quantity: input.quantity,
        remaining_quantity: input.quantity,
        cost_krw: input.cost_krw,
        lot_date: input.lot_date,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-stock', companyId] });
      qc.invalidateQueries({ queryKey: ['inventory-detail', companyId] });
    },
  });
}
