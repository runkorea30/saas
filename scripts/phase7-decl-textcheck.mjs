// 진단 전용: 수입면장(import_declaration) PDF 가 텍스트 추출 가능한지(스캔이미지 여부) 확인.
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
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
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { db: { schema: 'mochicraft_demo' }, auth: { persistSession: false } });
const { data: rows, error } = await supabase
  .from('document_files').select('file_name, file_path, extracted_doc_no')
  .eq('category', 'import_declaration').limit(4);
if (error) { console.error(error); process.exit(1); }
for (const r of rows) {
  const { data: blob, error: dErr } = await supabase.storage.from('documents').download(r.file_path);
  if (dErr || !blob) { console.log(`✗ ${r.extracted_doc_no} download 실패`); continue; }
  const text = await extractText(Buffer.from(await blob.arrayBuffer()));
  const compact = text.replace(/\s+/g, ' ').trim();
  console.log(`\n── ${r.extracted_doc_no} (${r.file_name}) textLen=${text.length}`);
  console.log('snippet:', compact.slice(0, 300));
}
