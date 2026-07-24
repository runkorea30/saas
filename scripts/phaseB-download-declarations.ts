/**
 * Phase B — 48건 수입면장 PDF 를 로컬에 다운로드.
 * Read 도구로 판독하기 위한 사전 작업.
 *
 * 산출:
 *   scripts/_phaseB_temp/pdfs/{doc_no}.pdf
 *   scripts/_phaseB_temp/_list.json  (doc_no + doc_date + AWB + local_path 매핑)
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

const OUT_ROOT = path.join(REPO_ROOT, 'scripts', '_phaseB_temp');
const PDF_DIR = path.join(OUT_ROOT, 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('env 필요');
  const supabase = createClient(url, key, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list } = await supabase
    .from('document_files')
    .select('extracted_doc_no, extracted_doc_date, extracted_metadata, file_path, email_received_at')
    .eq('category', 'import_declaration')
    .eq('source', 'historical_import')
    .order('extracted_doc_no')
    .order('email_received_at', { ascending: false });
  const uniq = new Map<string, { doc_no: string; doc_date: string | null; awb: string; file_path: string; local_path: string }>();
  for (const r of list ?? []) {
    if (!r.extracted_doc_no || uniq.has(r.extracted_doc_no)) continue;
    const meta = r.extracted_metadata as Record<string, string> | null;
    uniq.set(r.extracted_doc_no, {
      doc_no: r.extracted_doc_no,
      doc_date: r.extracted_doc_date as string | null,
      awb: meta?.mawb_hawb ?? '',
      file_path: r.file_path as string,
      local_path: path.join(PDF_DIR, `${r.extracted_doc_no}.pdf`),
    });
  }
  console.log(`대상 ${uniq.size}건`); // eslint-disable-line no-console

  let ok = 0;
  for (const item of uniq.values()) {
    if (fs.existsSync(item.local_path)) { ok++; continue; }
    const { data: blob, error } = await supabase.storage.from('documents').download(item.file_path);
    if (error || !blob) {
      console.error(`  ✗ ${item.doc_no}: ${error?.message ?? 'no blob'}`); // eslint-disable-line no-console
      continue;
    }
    fs.writeFileSync(item.local_path, Buffer.from(await blob.arrayBuffer()));
    ok++;
    if (ok % 10 === 0) console.log(`  [진행] ${ok}/${uniq.size}`); // eslint-disable-line no-console
  }
  fs.writeFileSync(
    path.join(OUT_ROOT, '_list.json'),
    JSON.stringify(Array.from(uniq.values()), null, 2),
    'utf8',
  );
  console.log(`완료: ${ok}/${uniq.size}, list: ${path.join(OUT_ROOT, '_list.json')}`); // eslint-disable-line no-console
}
main().catch((e) => { console.error(e); process.exit(1); }); // eslint-disable-line no-console
