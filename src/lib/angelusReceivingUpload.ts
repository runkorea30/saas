/**
 * 입고확정 시 제품/운임 인보이스를 "엔젤러스인보이스" 문서 탭에 자동 업로드.
 *
 * 🔴 CLAUDE.md §1: company_id 필수 (호출부 useCompany() 에서 전달).
 * 🟠 CLAUDE.md §8: 문서 업로드 로직 단일화 — 입고확정 콜백에서만 이 함수 경유.
 *
 * 동작:
 *  1) 제품 인보이스 — verification 세션(`invoice_verifications`)의 이미 업로드된
 *     `invoice_file_path` 를 Storage `copy()` 로 재활용 (재업로드 없음).
 *     세션이 없거나 파일 경로가 없으면(수동입고 등) 스킵.
 *  2) 운임 인보이스 — 항목 3에서 임시 보관한 File 객체를 fresh 업로드.
 *  3) 각각 `document_files` INSERT: category='angelus_invoice',
 *     doc_subtype='product'|'freight', related_po_reference=제품 인보이스 번호,
 *     source='import_receiving', subtype_confirmed=false.
 *
 * 🟠 부분 실패 허용 — 한쪽 실패해도 다른쪽은 진행. 재고/입고 롤백은 절대 안 함
 *    (호출부가 이미 커밋 성공한 뒤 호출). 결과 카운트 + 에러 목록을 반환한다.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

const STORAGE_BUCKET = 'documents';

export interface UploadReceivingInvoicesParams {
  companyId: string;
  /** 제품 인보이스 번호 = import_invoices.invoice_number. 페어 그룹키(related_po_reference). */
  invoiceNumber: string;
  /** 항목 3에서 업로드된 운임 인보이스 File (없으면 운임 업로드 스킵). */
  freightFile: File | null;
  /** 운임 인보이스 파싱으로 얻은 문서번호 (freight row 의 extracted_doc_no). */
  freightInvoiceNo?: string | null;
}

export interface UploadReceivingInvoicesResult {
  productUploaded: boolean;
  freightUploaded: boolean;
  errors: string[];
}

/** invoice_number 를 Storage 경로 안전 문자열로 정규화. */
function safeSegment(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned || 'unknown';
}

/** 항목 7 백필과 동일한 line_items 형식 {code,name,qty,amount}. */
interface LineItem {
  code: string;
  name: string;
  qty: number;
  amount: number;
}

/** 세션 invoice_rows(InvoiceParsedRow[]) → line_items 로 정규화. */
function toLineItems(invoiceRows: unknown): LineItem[] {
  if (!Array.isArray(invoiceRows)) return [];
  const items: LineItem[] = [];
  for (const r of invoiceRows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const code = String(o.item_code ?? '').trim();
    if (!code) continue;
    items.push({
      code,
      name: String(o.description ?? '').trim(),
      qty: Number(o.qty_shipped ?? 0) || 0,
      amount: Number(o.amount ?? 0) || 0,
    });
  }
  return items;
}

/** verification 세션에서 이 인보이스의 업로드된 제품 PDF 경로/파일명 + 라인아이템 조회 (최신 1건). */
async function findSessionInvoiceFile(
  companyId: string,
  invoiceNumber: string,
): Promise<{ path: string; name: string; lineItems: LineItem[] } | null> {
  const key = invoiceNumber.trim();
  if (!key) return null;
  const { data, error } = await supabase
    .from('invoice_verifications')
    .select('invoice_file_path, invoice_file_name, invoice_rows, updated_at')
    .eq('company_id', companyId)
    .ilike('invoice_no', key)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row?.invoice_file_path) return null;
  // base64(data:) 로 저장된 경우는 Storage copy 대상이 아님 — 스킵.
  if (row.invoice_file_path.startsWith('data:')) return null;
  return {
    path: row.invoice_file_path,
    name: row.invoice_file_name || `Inv_${safeSegment(invoiceNumber)}_product.pdf`,
    lineItems: toLineItems(row.invoice_rows),
  };
}

export async function uploadReceivingInvoices(
  params: UploadReceivingInvoicesParams,
): Promise<UploadReceivingInvoicesResult> {
  const { companyId, invoiceNumber, freightFile, freightInvoiceNo } = params;
  const result: UploadReceivingInvoicesResult = {
    productUploaded: false,
    freightUploaded: false,
    errors: [],
  };
  const safeInvoice = safeSegment(invoiceNumber);
  const basePrefix = `import-receiving/${companyId}/${safeInvoice}`;

  // ───── 1) 제품 인보이스 (세션 파일 Storage copy) ─────
  try {
    const sessionFile = await findSessionInvoiceFile(companyId, invoiceNumber);
    if (sessionFile) {
      const destPath = `${basePrefix}/product.pdf`;
      const { error: copyErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .copy(sessionFile.path, destPath);
      if (copyErr) throw copyErr;
      const { error: insErr } = await supabase.from('document_files').insert({
        company_id: companyId,
        category: 'angelus_invoice',
        file_name: sessionFile.name,
        file_path: destPath,
        mime_type: 'application/pdf',
        uploaded_at: new Date().toISOString(),
        source: 'import_receiving',
        doc_subtype: 'product',
        subtype_confirmed: false,
        related_po_reference: invoiceNumber.trim(),
        extracted_doc_no: invoiceNumber.trim(),
        // 항목 7: 제품코드/명 필터용 line_items 함께 저장(백필과 동일 형식).
        extracted_metadata:
          sessionFile.lineItems.length > 0
            ? ({ line_items: sessionFile.lineItems } as unknown as Json)
            : null,
      });
      if (insErr) throw insErr;
      result.productUploaded = true;
    }
  } catch (e) {
    result.errors.push(
      `제품 인보이스: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ───── 2) 운임 인보이스 (File fresh 업로드) ─────
  if (freightFile) {
    try {
      const destPath = `${basePrefix}/freight.pdf`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(destPath, freightFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/pdf',
        });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('document_files').insert({
        company_id: companyId,
        category: 'angelus_invoice',
        file_name: freightFile.name,
        file_path: destPath,
        file_size: freightFile.size,
        mime_type: 'application/pdf',
        uploaded_at: new Date().toISOString(),
        source: 'import_receiving',
        doc_subtype: 'freight',
        subtype_confirmed: false,
        related_po_reference: invoiceNumber.trim(),
        extracted_doc_no: (freightInvoiceNo ?? '').trim() || null,
      });
      if (insErr) throw insErr;
      result.freightUploaded = true;
    } catch (e) {
      result.errors.push(
        `운임 인보이스: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}
