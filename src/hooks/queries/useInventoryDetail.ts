/**
 * 선택 제품의 재고 상세 — lots + transactions 병합 조회.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 + product_id 제약.
 * 🟠 Detail Pane 의 "최근 움직임" 리스트는 두 테이블을 시간 역순 병합하여 단일 리스트로 표시.
 *    `subtype` 으로 렌더링 분기 (opening/purchase/import vs out/return/damage).
 */
import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';

export type LotType = 'opening' | 'purchase' | 'import';
export type TxType = 'out' | 'return' | 'damage';
export type MovementSubtype = LotType | TxType;

export interface InventoryLotRow {
  id: string;
  lot_type: LotType;
  quantity: number;
  remaining_quantity: number;
  cost_krw: number | null;
  cost_usd: number | null;
  lot_date: string;
}

export interface InventoryTransactionRow {
  id: string;
  type: TxType;
  quantity: number;
  memo: string | null;
  transaction_date: string;
}

export interface InventoryDetailResult {
  lots: InventoryLotRow[];
  transactions: InventoryTransactionRow[];
  /** 시간 역순(최근 순) 병합 리스트 — UI 렌더용. */
  movements: Array<{
    kind: 'lot' | 'tx';
    subtype: MovementSubtype;
    id: string;
    quantity: number;
    at: string;
    memo?: string | null;
    cost_krw?: number | null;
  }>;
}

type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

export function useInventoryDetail(
  companyId: string | null,
  productId: string | null,
) {
  return useQuery<InventoryDetailResult>({
    queryKey: ['inventory-detail', companyId, productId],
    enabled: Boolean(companyId && productId),
    queryFn: async () => {
      const [lots, transactions] = await Promise.all([
        fetchAllRows<InventoryLotRow>(() =>
          supabase
            .from('inventory_lots')
            .select(
              'id, lot_type, quantity, remaining_quantity, cost_krw, cost_usd, lot_date',
            )
            .eq('company_id', companyId!)
            .eq('product_id', productId!)
            .is('deleted_at', null)
            .order('lot_date', { ascending: false }) as unknown as RangeableQuery<InventoryLotRow>,
        ),
        fetchAllRows<InventoryTransactionRow>(() =>
          supabase
            .from('inventory_transactions')
            .select('id, type, quantity, memo, transaction_date')
            .eq('company_id', companyId!)
            .eq('product_id', productId!)
            .is('deleted_at', null)
            .order('transaction_date', {
              ascending: false,
            }) as unknown as RangeableQuery<InventoryTransactionRow>,
        ),
      ]);

      const movements: InventoryDetailResult['movements'] = [
        ...lots.map((l) => ({
          kind: 'lot' as const,
          subtype: l.lot_type,
          id: l.id,
          quantity: l.quantity,
          at: l.lot_date,
          cost_krw: l.cost_krw,
        })),
        ...transactions.map((t) => ({
          kind: 'tx' as const,
          subtype: t.type,
          id: t.id,
          quantity: t.quantity,
          at: t.transaction_date,
          memo: t.memo,
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      return { lots, transactions, movements };
    },
    staleTime: 30_000,
  });
}
