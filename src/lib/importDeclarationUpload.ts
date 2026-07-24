/**
 * 입고확정 시 수입면장(수입신고필증) PDF 를 문서관리 "수입면장" 탭에 업로드.
 *
 * 🔴 CLAUDE.md §1: company_id 필수 (호출부 useCompany() 에서 전달).
 * 🟠 CLAUDE.md §8: 수입면장 업로드 로직 단일화 — 입고확정 콜백에서만 이 함수 경유.
 *
 * 동작:
 *  1) 입고처리탭에서 보관하던 File 을 Storage `documents` 버킷에 fresh 업로드.
 *  2) `document_files` INSERT: category='import_declaration' (수입면장 탭에서 조회됨),
 *     source='import_receiving', related 은 제품 인보이스 번호로 연결.
 *
 * 🟠 부분 실패 허용 — 재고/입고는 이미 커밋된 뒤 호출되므로 롤백 없음. 실패 시 throw.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

const STORAGE_BUCKET = 'documents';

/** invoice_number 를 Storage 경로 안전 문자열로 정규화. */
function safeSegment(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned || 'unknown';
}

export interface UploadImportDeclarationParams {
  companyId: string;
  /** 제품 인보이스 번호 = import_invoices.invoice_number. 제품 인보이스와의 연결키. */
  invoiceNumber: string;
  /** 입고처리탭에서 보관 중이던 수입면장 File. */
  file: File;
}

export async function uploadImportDeclaration(
  params: UploadImportDeclarationParams,
): Promise<void> {
  const { companyId, invoiceNumber, file } = params;
  const safeInvoice = safeSegment(invoiceNumber);
  const destPath = `import-receiving/${companyId}/${safeInvoice}/declaration-${Date.now()}.pdf`;

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(destPath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/pdf',
    });
  if (upErr) throw upErr;

  const trimmedNo = invoiceNumber.trim();
  const { error: insErr } = await supabase.from('document_files').insert({
    company_id: companyId,
    category: 'import_declaration',
    file_name: file.name,
    file_path: destPath,
    file_size: file.size,
    mime_type: 'application/pdf',
    uploaded_at: new Date().toISOString(),
    source: 'import_receiving',
    extracted_doc_no: trimmedNo || null,
    // 엔젤러스인보이스 탭의 "연관 수입면장" 링크가 이 필드로 제품 인보이스와 매칭됨.
    extracted_metadata: trimmedNo
      ? ({ matched_product_invoice_no: trimmedNo } as unknown as Json)
      : null,
  });
  if (insErr) throw insErr;
}
