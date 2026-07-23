// 항목 7 Phase 1 (dry-run): angelus 제품 인보이스 60건 전체 파싱 → line_items 산출.
// DB 에 쓰지 않음. 결과 JSON 을 scripts/_phase7_temp/_lineitems.json 에 저장(Phase 2 용).
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises';
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
    const content = await (await doc.getPage(p)).getTextContent();
    for (const it of content.items) if (typeof it.str === 'string') text += it.str + (it.hasEOL ? '\n' : '\t');
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

const { data: rows, error } = await supabase
  .from('document_files')
  .select('id, file_name, file_path, extracted_doc_no, related_po_reference, extracted_metadata')
  .eq('category', 'angelus_invoice').eq('doc_subtype', 'product');
if (error) { console.error(error); process.exit(1); }

const PARSER = await loadParser();
const results = [];
const failures = [];
for (const r of rows) {
  const stored = Number(r.extracted_metadata?.total_usd ?? 0);
  try {
    const { data: blob, error: dErr } = await supabase.storage.from('documents').download(r.file_path);
    if (dErr || !blob) throw new Error(`download: ${dErr?.message}`);
    const text = await extractText(Buffer.from(await blob.arrayBuffer()));
    const parsed = PARSER.parseAngelusInvoiceText(text);
    const line_items = parsed.rows.map((x) => ({ code: x.item_code, name: x.description, qty: x.qty_shipped, amount: x.amount }));
    const sum = line_items.reduce((a, x) => a + x.amount, 0);
    const sumClose = stored > 0 ? Math.abs(sum - stored) / stored < 0.02 : line_items.length > 0;
    const okRows = line_items.length > 0;
    results.push({ id: r.id, doc_no: r.extracted_doc_no, po: r.related_po_reference, count: line_items.length, sum: Number(sum.toFixed(2)), stored, sumClose, line_items });
    if (!okRows || !sumClose) failures.push({ doc_no: r.extracted_doc_no, count: line_items.length, sum: Number(sum.toFixed(2)), stored, reason: !okRows ? 'no-rows' : 'sum-mismatch' });
  } catch (e) {
    results.push({ id: r.id, doc_no: r.extracted_doc_no, po: r.related_po_reference, count: 0, error: String(e) });
    failures.push({ doc_no: r.extracted_doc_no, reason: 'error', error: String(e) });
  }
}

await mkdir('scripts/_phase7_temp', { recursive: true });
await writeFile('scripts/_phase7_temp/_lineitems.json', JSON.stringify(results, null, 2));

const okCount = results.filter((r) => r.count > 0 && r.sumClose).length;
console.log(`\n=== Phase 1 dry-run: 제품 인보이스 ${rows.length}건 ===`);
console.log(`라인 추출 + Σ정합 성공: ${okCount}/${rows.length}`);
console.log(`총 라인아이템 수: ${results.reduce((a, r) => a + (r.count || 0), 0)}`);
if (failures.length) {
  console.log(`\n실패/불일치 ${failures.length}건:`);
  for (const f of failures) console.log('  ', JSON.stringify(f));
} else {
  console.log('실패/불일치 0건 — 전건 성공');
}
console.log('\n산출 JSON: scripts/_phase7_temp/_lineitems.json');
