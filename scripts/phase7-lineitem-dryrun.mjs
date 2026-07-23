// 진단 전용 (커밋 대상 아님): 항목 7 조사.
// historical angelus 제품 인보이스 N건을 Storage 에서 내려받아 parseAngelusInvoiceText 로
// 라인아이템(code/qty/amount) 추출 성공률 + Σamount vs 저장된 total_usd 정합을 측정.
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const require_ = createRequire(import.meta.url);
loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

{
  const g = globalThis;
  if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = class { constructor() {} translate(){return this;} scale(){return this;} invertSelf(){return this;} multiplySelf(){return this;} preMultiplySelf(){return this;} };
  if (typeof g.ImageData === 'undefined') g.ImageData = class {};
  if (typeof g.Path2D === 'undefined') g.Path2D = class { addPath(){} };
}

async function extractText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require_.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (typeof it.str !== 'string') continue;
      text += it.str + (it.hasEOL ? '\n' : '\t');
    }
  }
  await doc.destroy();
  return text;
}

async function loadParser() {
  const dir = await mkdtemp(path.join(tmpdir(), 'inv-parser-'));
  const outPath = path.join(dir, 'parser.mjs');
  const r = spawnSync(process.execPath, [require_.resolve('esbuild/bin/esbuild'), 'api/_shared/invoice-local-parser.ts', '--format=esm', '--platform=node', `--outfile=${outPath}`], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  return import(pathToFileURL(outPath).href);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { db: { schema: 'mochicraft_demo' }, auth: { persistSession: false } });

const LIMIT = Number(process.argv[2] ?? 12);
const { data: rows, error } = await supabase
  .from('document_files')
  .select('file_name, file_path, extracted_doc_no, extracted_metadata')
  .eq('category', 'angelus_invoice')
  .eq('doc_subtype', 'product')
  .limit(LIMIT);
if (error) { console.error(error); process.exit(1); }

const PARSER = await loadParser();
let ok = 0, sumMatch = 0;
for (const r of rows) {
  const { data: blob, error: dErr } = await supabase.storage.from('documents').download(r.file_path);
  if (dErr || !blob) { console.log(`✗ ${r.extracted_doc_no} download 실패: ${dErr?.message}`); continue; }
  const buf = Buffer.from(await blob.arrayBuffer());
  const text = await extractText(buf);
  const parsed = PARSER.parseAngelusInvoiceText(text);
  const sum = parsed.rows.reduce((a, x) => a + x.amount, 0);
  const stored = Number(r.extracted_metadata?.total_usd ?? 0);
  const close = stored > 0 && Math.abs(sum - stored) / stored < 0.02;
  if (parsed.rows.length > 0) ok++;
  if (close) sumMatch++;
  console.log(`${parsed.rows.length > 0 ? '✓' : '✗'} inv=${r.extracted_doc_no} rows=${parsed.rows.length} Σ=${sum.toFixed(2)} stored=${stored} ${close ? 'MATCH' : 'DIFF'} sample=${JSON.stringify(parsed.rows[0] ?? null)}`);
}
console.log(`\n=== ${rows.length}건 중 rows>0: ${ok} / Σ≈total_usd: ${sumMatch} ===`);
