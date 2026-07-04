/**
 * Phase 2 실제 적재 — angelus-phase2-dryrun.ts 가 산출한 _dryrun.json 을 읽어
 * PDF 파일 118건을 Supabase Storage 에 업로드하고 document_files 에 INSERT.
 *
 * ⚠️ 사용자 승인 후에만 실행할 것. 재실행 시 email_message_id UNIQUE 제약으로
 *    dedup 되지만, Storage 는 upsert:true 로 덮어쓰기 됨.
 *
 * 사용법:
 *   npx tsx scripts/import-angelus-invoices.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

const DRYRUN = path.join(REPO_ROOT, 'scripts', '_angelus_freight_temp', '_dryrun.json');
const STORAGE_BUCKET = 'documents';

interface Rec {
  invoice_no: string;
  sha256: string;
  local_pdf_path: string;
  company_id: string;
  category: 'angelus_invoice';
  source: 'historical_import';
  file_name: string;
  file_path: string;
  mime_type: 'application/pdf';
  doc_subtype: 'product' | 'freight';
  subtype_confirmed: boolean;
  email_message_id: string | null;
  email_from: string | null;
  email_received_at: string | null;
  extracted_doc_no: string;
  extracted_doc_date: string | null;
  related_po_reference: string | null;
  extracted_metadata: Record<string, unknown>;
}

function log(...args: unknown[]): void { console.log(...args); } // eslint-disable-line no-console
function warn(...args: unknown[]): void { console.warn(...args); } // eslint-disable-line no-console

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY 필요');

  const supabase = createClient(url, key, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const records: Rec[] = JSON.parse(fs.readFileSync(DRYRUN, 'utf8'));
  log(`=== Angelus 인보이스 적재 시작: ${records.length} 건 ===`);

  let storageOk = 0, storageErr = 0, dbOk = 0, dbErr = 0, dbSkipDedup = 0;
  const errors: Array<{ inv: string; kind: string; note: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const localFullPath = path.join(REPO_ROOT, r.local_pdf_path);
    if (!fs.existsSync(localFullPath)) {
      storageErr++;
      errors.push({ inv: r.invoice_no, kind: 'file-missing', note: localFullPath });
      warn(`  ✗ [${r.invoice_no}] 로컬 PDF 없음: ${localFullPath}`);
      continue;
    }
    const buf = fs.readFileSync(localFullPath);

    // 1) Storage 업로드
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(r.file_path, buf, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (upErr) {
      storageErr++;
      errors.push({ inv: r.invoice_no, kind: 'storage', note: upErr.message });
      warn(`  ✗ [${r.invoice_no}] Storage 실패: ${upErr.message}`);
      continue;
    }
    storageOk++;

    // 2) DB INSERT
    const { error: dbErrX } = await supabase.from('document_files').insert({
      company_id: r.company_id,
      category: r.category,
      file_name: r.file_name,
      file_path: r.file_path,
      file_size: buf.length,
      mime_type: r.mime_type,
      uploaded_at: new Date().toISOString(),
      source: r.source,
      doc_subtype: r.doc_subtype,
      subtype_confirmed: r.subtype_confirmed,
      email_message_id: r.email_message_id,
      email_from: r.email_from,
      email_received_at: r.email_received_at,
      extracted_doc_no: r.extracted_doc_no,
      extracted_doc_date: r.extracted_doc_date,
      related_po_reference: r.related_po_reference,
      extracted_metadata: r.extracted_metadata,
    });
    if (dbErrX) {
      if (dbErrX.code === '23505') {
        dbSkipDedup++;
        continue;
      }
      dbErr++;
      errors.push({ inv: r.invoice_no, kind: 'db', note: dbErrX.message });
      warn(`  ✗ [${r.invoice_no}] DB 실패: ${dbErrX.message}`);
      continue;
    }
    dbOk++;

    if ((i + 1) % 20 === 0) log(`  [진행] ${i + 1}/${records.length} 완료`);
  }

  log('\n=== 완료 ===');
  log(`Storage 업로드 성공: ${storageOk} / 실패: ${storageErr}`);
  log(`DB INSERT 성공     : ${dbOk} / 실패: ${dbErr} / dedup skip: ${dbSkipDedup}`);
  if (errors.length > 0) {
    log(`\n=== 에러 (${errors.length}) ===`);
    for (const e of errors.slice(0, 20)) log(`  [${e.kind}] inv=${e.inv} ${e.note}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }); // eslint-disable-line no-console
