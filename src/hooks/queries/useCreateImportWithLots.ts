/**
 * 수입/매입 입고확정 뮤테이션 — import_invoices + inventory_lots bulk INSERT.
 *
 * 🔴 CLAUDE.md §1: company_id 필수 (RLS + 프론트 이중 방어).
 * 🟠 Supabase JS에 멀티테이블 트랜잭션이 없어 앱 레벨 보상 처리:
 *    1) import_invoices INSERT → 성공 시 invoice.id 획득
 *    2) inventory_lots bulk INSERT (올-오어-나씽; Supabase 배열 insert 는 단일 쿼리)
 *    3) 2) 실패 시 1) 레코드 HARD DELETE
 * 🟠 RLS: `dev_anon_insert_import_invoices` / `inventory_lots_dev_anon_insert` 로 dev anon INSERT 허용.
 *    Phase 2 Auth 도입 시 원복 (SESSION_HANDOFF §5).
 * 🟡 에러 매핑:
 *    - 23505 on `idx_import_invoices_unique_number` → "이미 등록된 Invoice #"
 *    - 그 외 error.message
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ImportInvoiceHeader, ImportRow } from '@/types/import';

export interface CreateImportInput {
  header: ImportInvoiceHeader;
  /** 이미 enrich + 검증된 row 들 (productId, 계산값 포함). */
  rows: ImportRow[];
}

export function useCreateImportWithLots(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, CreateImportInput>({
    mutationFn: async ({ header, rows }) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      if (rows.length === 0) throw new Error('입고할 행이 없습니다.');

      // ───── 1) import_invoices INSERT ─────
      const { data: invoice, error: invErr } = await supabase
        .from('import_invoices')
        .insert({
          company_id: companyId,
          invoice_number: header.invoiceNumber,
          supplier_name: header.supplierName || null,
          invoice_date: header.invoiceDate,
          exchange_rate: header.exchangeRate,
          shipping_cost_usd: header.shippingCostUsd,
          total_usd: header.pdfTotalUsd > 0 ? header.pdfTotalUsd : null,
          notes: header.notes || null,
        })
        .select('id')
        .single();

      const mapped = mapInvoiceError(invErr, header.invoiceNumber);
      if (mapped) throw mapped;
      if (!invoice) throw new Error('인보이스 생성 응답이 비어 있습니다.');

      const invoiceId = invoice.id as string;

      // ───── 2) inventory_lots bulk INSERT ─────
      const lotDateIso = localDateToIso(header.invoiceDate);
      const lotPayload = rows.map((r) => {
        if (!r.productId) {
          throw new Error(`매칭되지 않은 코드가 있습니다: ${r.sourceCode}`);
        }
        const shippingPerUnit =
          r.adjustedQuantity > 0
            ? r.shippingAllocatedUsd / r.adjustedQuantity
            : 0;
        return {
          company_id: companyId,
          product_id: r.productId,
          lot_type: 'import',
          quantity: r.adjustedQuantity,
          remaining_quantity: r.adjustedQuantity,
          cost_krw: r.costKrw,
          cost_usd: r.unitPriceUsd + shippingPerUnit,
          lot_date: lotDateIso,
          invoice_id: invoiceId,
          source_code: r.sourceCode,
          shipping_allocated_usd: r.shippingAllocatedUsd,
        };
      });

      const { error: lotErr } = await supabase
        .from('inventory_lots')
        .insert(lotPayload);

      if (lotErr) {
        // 보상: 고아 invoice 제거.
        await supabase.from('import_invoices').delete().eq('id', invoiceId);
        throw new Error(`입고 레코드 저장 실패: ${lotErr.message}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-stock', companyId] });
      qc.invalidateQueries({ queryKey: ['inventory-detail', companyId] });
      qc.invalidateQueries({ queryKey: ['import-invoices', companyId] });
    },
  });
}

// ───────────────────────────────────────────────────────────

function mapInvoiceError(
  err: PostgrestError | null,
  invoiceNumber: string,
): Error | null {
  if (!err) return null;
  if (err.code === '23505') {
    return new Error(`이미 등록된 Invoice # 입니다: ${invoiceNumber}`);
  }
  return new Error(err.message || '알 수 없는 오류가 발생했습니다');
}

/** 'YYYY-MM-DD' (로컬 자정 = KST 자정) → ISO UTC. OpeningStockForm 과 동일 규칙. */
function localDateToIso(localDate: string): string {
  const [y, m, d] = localDate.split('-').map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return local.toISOString();
}
