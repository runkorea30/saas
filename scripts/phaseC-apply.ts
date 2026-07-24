/**
 * Phase C 실제 반영 — scripts/_phaseC_temp/_dryrun.json 을 읽어서
 * document_files 에 UPDATE.
 *
 * ⚠️ 사용자 승인 후에만 실행.
 *
 * 규약:
 *  - import_declaration: 동일 extracted_doc_no 를 가진 모든 row(93건 중 대응) 를 UPDATE
 *    → related_po_reference 세팅 + extracted_metadata 병합 (기존 값 보존)
 *  - angelus_invoice: (extracted_doc_no, doc_subtype) 유일 → 그 row 만 UPDATE
 *    → extracted_metadata 병합
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

const DRYRUN = path.join(REPO_ROOT, 'scripts', '_phaseC_temp', '_dryrun.json');

interface UpdateDecl {
  doc_no: string;
  new_related_po_reference: string;
  metadata_merge: Record<string, unknown>;
}
interface UpdateAngelus {
  invoice_no: string;
  doc_subtype: 'product' | 'freight';
  metadata_merge: Record<string, unknown>;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('env 필요');
  const supabase = createClient(url, key, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dry: { updates_declaration: UpdateDecl[]; updates_angelus: UpdateAngelus[] } = JSON.parse(
    fs.readFileSync(DRYRUN, 'utf8'),
  );
  console.log(`decl UPDATE 예정: ${dry.updates_declaration.length} doc_no`); // eslint-disable-line no-console
  console.log(`angelus UPDATE 예정: ${dry.updates_angelus.length} rows`); // eslint-disable-line no-console

  let declOk = 0, declErr = 0, declRowsAffected = 0;
  const declErrors: Array<{ doc_no: string; note: string }> = [];

  // ===== A. Import Declarations =====
  for (const u of dry.updates_declaration) {
    // 해당 doc_no 의 모든 row 조회 (2개 이메일 variant)
    const { data: hits, error: qErr } = await supabase
      .from('document_files')
      .select('id, extracted_metadata')
      .eq('category', 'import_declaration')
      .eq('source', 'historical_import')
      .eq('extracted_doc_no', u.doc_no);
    if (qErr) {
      declErr++;
      declErrors.push({ doc_no: u.doc_no, note: `query: ${qErr.message}` });
      continue;
    }
    if (!hits || hits.length === 0) {
      declErr++;
      declErrors.push({ doc_no: u.doc_no, note: 'no rows found' });
      continue;
    }
    for (const row of hits) {
      const existingMeta = (row.extracted_metadata ?? {}) as Record<string, unknown>;
      const mergedMeta = { ...existingMeta, ...u.metadata_merge };
      const { error: uErr } = await supabase
        .from('document_files')
        .update({
          related_po_reference: u.new_related_po_reference,
          extracted_metadata: mergedMeta,
        })
        .eq('id', row.id);
      if (uErr) {
        declErr++;
        declErrors.push({ doc_no: u.doc_no, note: `update ${row.id}: ${uErr.message}` });
      } else {
        declRowsAffected++;
      }
    }
    declOk++;
  }

  // ===== B. Angelus Invoices =====
  let angOk = 0, angErr = 0;
  const angErrors: Array<{ key: string; note: string }> = [];
  for (const u of dry.updates_angelus) {
    const { data: hits, error: qErr } = await supabase
      .from('document_files')
      .select('id, extracted_metadata')
      .eq('category', 'angelus_invoice')
      .eq('source', 'historical_import')
      .eq('extracted_doc_no', u.invoice_no)
      .eq('doc_subtype', u.doc_subtype);
    if (qErr) {
      angErr++;
      angErrors.push({ key: `${u.invoice_no}#${u.doc_subtype}`, note: `query: ${qErr.message}` });
      continue;
    }
    if (!hits || hits.length === 0) {
      angErr++;
      angErrors.push({ key: `${u.invoice_no}#${u.doc_subtype}`, note: 'no row' });
      continue;
    }
    for (const row of hits) {
      const existingMeta = (row.extracted_metadata ?? {}) as Record<string, unknown>;
      const mergedMeta = { ...existingMeta, ...u.metadata_merge };
      const { error: uErr } = await supabase
        .from('document_files')
        .update({ extracted_metadata: mergedMeta })
        .eq('id', row.id);
      if (uErr) {
        angErr++;
        angErrors.push({ key: `${u.invoice_no}#${u.doc_subtype}`, note: `update: ${uErr.message}` });
      } else {
        angOk++;
      }
    }
  }

  console.log('\n=== 완료 ==='); // eslint-disable-line no-console
  console.log(`declaration doc_no OK: ${declOk} / ERR: ${declErr}`); // eslint-disable-line no-console
  console.log(`declaration 개별 row 반영: ${declRowsAffected}건`); // eslint-disable-line no-console
  console.log(`angelus rows OK: ${angOk} / ERR: ${angErr}`); // eslint-disable-line no-console
  if (declErrors.length) console.log('decl errors:', declErrors); // eslint-disable-line no-console
  if (angErrors.length) console.log('angelus errors:', angErrors); // eslint-disable-line no-console
}
main().catch((e) => { console.error(e); process.exit(1); }); // eslint-disable-line no-console
