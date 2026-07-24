/**
 * Phase A 조사 — 수입면장 샘플 7건 Storage 다운로드 + pdftotext.
 * DB 변경 없음.
 *
 * 사용법:
 *   npx tsx scripts/phaseA-declaration-sample.ts
 *
 * 산출:
 *   scripts/_phaseA_temp/pdfs/{doc_no}.pdf
 *   scripts/_phaseA_temp/texts/{doc_no}.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

const OUT_ROOT = path.join(REPO_ROOT, 'scripts', '_phaseA_temp');
const PDF_DIR = path.join(OUT_ROOT, 'pdfs');
const TEXT_DIR = path.join(OUT_ROOT, 'texts');
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TEXT_DIR, { recursive: true });

const samples = [
  { doc_no: '23176-22-961644M', doc_date: '2022-12-31', mawb: '770893228014', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/e34654c2193dda5c/0-AWB#770893228014.pdf' },
  { doc_no: '23176-23-886257M', doc_date: '2023-12-13', mawb: '787415872820', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/209cbdf763d5579d/0-AWB#787415872820.pdf' },
  { doc_no: '23176-24-114879M', doc_date: '2024-02-15', mawb: '775154158270', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/820da4d245d04d8c/0-AWB#775154158270.pdf' },
  { doc_no: '23176-24-863215M', doc_date: '2024-11-21', mawb: '770041818087', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/0563c52430a9ec36/0-AWB#770041818087.pdf' },
  { doc_no: '23176-25-862078M', doc_date: '2025-11-08', mawb: '885775969977', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/9185c2b676995365/0-AWB#885775969977.pdf' },
  { doc_no: '23176-26-168527M', doc_date: '2026-02-22', mawb: '888880785100', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/51a82bb2464d2e5c/0-AWB#888880785100.pdf' },
  { doc_no: '23176-26-573807M', doc_date: '2026-06-30', mawb: '873449616586', path: 'historical-import/9e13f035-ed4f-4a41-9043-6a585beab221/7abb3332ce593fe2/0-AWB#873449616586.pdf' },
];

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('env 필요');
  const supabase = createClient(url, key, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const s of samples) {
    console.log(`\n=== ${s.doc_no} (doc_date=${s.doc_date}, mawb=${s.mawb}) ===`);
    const { data, error } = await supabase.storage.from('documents').download(s.path);
    if (error) { console.error('download err:', error.message); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const pdfPath = path.join(PDF_DIR, `${s.doc_no}.pdf`);
    fs.writeFileSync(pdfPath, buf);
    // pdftotext -layout
    const text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
      encoding: 'buffer', maxBuffer: 20 * 1024 * 1024,
    }).toString('utf8');
    fs.writeFileSync(path.join(TEXT_DIR, `${s.doc_no}.txt`), text, 'utf8');
    console.log(`  ${buf.length} bytes → ${text.length} chars`);
  }
  console.log(`\n샘플 ${samples.length}건 다운로드/추출 완료. ${OUT_ROOT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
