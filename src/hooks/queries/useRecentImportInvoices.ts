/**
 * 최근 수입 인보이스 목록 — import_invoices + inventory_lots count.
 *
 * 🔴 CLAUDE.md §1: company_id 필수 (RLS + 프론트 이중 방어).
 * 🟠 queryKey ['import-invoices', companyId] — useCreateImportWithLots / PurchaseOrderPage(발주완료)
 *    에서 이미 invalidate 하는 키와 동일. 신규 등록 시 자동 갱신.
 * 🟡 lot 카운트는 두 번째 쿼리로 집계 (PostgREST embedded count 의 TS 타입 노이즈 회피).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface RecentImportInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  total_usd: number | null;
  notes: string | null;
  created_at: string;
  lot_count: number;
  is_auto: boolean;
}

const RECENT_LIMIT = 20;

export function useRecentImportInvoices(companyId: string | null) {
  return useQuery<RecentImportInvoice[]>({
    queryKey: ['import-invoices', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return [];

      const { data: invoices, error } = await supabase
        .from('import_invoices')
        .select(
          'id, invoice_number, invoice_date, supplier_name, total_usd, notes, created_at',
        )
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT);
      if (error) throw error;
      if (!invoices || invoices.length === 0) return [];

      const invoiceIds = invoices.map((iv) => iv.id);
      const { data: lots, error: lotErr } = await supabase
        .from('inventory_lots')
        .select('invoice_id')
        .in('invoice_id', invoiceIds)
        .eq('company_id', companyId);
      if (lotErr) throw lotErr;

      const countMap = new Map<string, number>();
      for (const lot of lots ?? []) {
        if (!lot.invoice_id) continue;
        countMap.set(lot.invoice_id, (countMap.get(lot.invoice_id) ?? 0) + 1);
      }

      return invoices.map((iv) => {
        const note = iv.notes ?? '';
        // PO-AUTO 마커: invoice_number 접두사 또는 notes 본문에 포함.
        const isAuto =
          iv.invoice_number.startsWith('PO-AUTO') || note.includes('PO-AUTO');
        return {
          id: iv.id,
          invoice_number: iv.invoice_number,
          invoice_date: iv.invoice_date,
          supplier_name: iv.supplier_name,
          total_usd: iv.total_usd,
          notes: iv.notes,
          created_at: iv.created_at,
          lot_count: countMap.get(iv.id) ?? 0,
          is_auto: isAuto,
        };
      });
    },
  });
}
