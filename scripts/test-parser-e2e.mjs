// 로컬 종단 검증: PDF 두 개 (Invoice / Sales Order) 를 pdfjs-dist 로 추출 →
// TypeScript 파서(esbuild 로 즉석 트랜스파일) 로 파싱 → invoice_no/date/rows/Σamount 출력.
// 진단 전용, 커밋 대상 아님.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFile, mkdtemp } from 'node:fs/promises';

const require_ = createRequire(import.meta.url);

// DOM stub
{
  const g = globalThis;
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class { constructor() {} translate(){return this;} scale(){return this;} invertSelf(){return this;} multiplySelf(){return this;} preMultiplySelf(){return this;} };
  }
  if (typeof g.ImageData === 'undefined') g.ImageData = class {};
  if (typeof g.Path2D === 'undefined') g.Path2D = class { addPath(){} };
}

async function extractTextFromPdf(pdfPath) {
  const buf = await readFile(pdfPath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = require_.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
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

// esbuild 로 TS 파서를 JS 로 즉석 변환하고 tmp 파일로 저장 → import.
async function loadTsParser(tsPath) {
  const dir = await mkdtemp(path.join(tmpdir(), 'inv-parser-'));
  const outPath = path.join(dir, 'parser.mjs');
  const r = spawnSync(process.execPath, [
    require_.resolve('esbuild/bin/esbuild'),
    tsPath,
    '--bundle=false',
    '--format=esm',
    '--platform=node',
    `--outfile=${outPath}`,
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('esbuild 실패:', r.stderr);
    process.exit(1);
  }
  return import(pathToFileURL(outPath).href);
}

const PARSER = await loadTsParser('api/_shared/invoice-local-parser.ts');

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('사용법: node scripts/test-parser-e2e.mjs <pdf...>');
  process.exit(1);
}

for (const p of targets) {
  console.log('\n════════════════════════════════════════════');
  console.log(`FILE: ${p}`);
  const text = await extractTextFromPdf(p);
  const parsed = PARSER.parseAngelusInvoiceText(text);
  console.log(`text.length = ${text.length}`);
  console.log(`invoice_no  = ${JSON.stringify(parsed.invoice_no)}`);
  console.log(`invoice_date= ${JSON.stringify(parsed.invoice_date)}`);
  console.log(`rows.count  = ${parsed.rows.length}`);
  const sum = parsed.rows.reduce((a, r) => a + r.amount, 0);
  console.log(`Σamount     = ${sum.toFixed(2)}`);
  if (parsed.rows.length > 0) {
    console.log('first 3 rows:');
    for (const r of parsed.rows.slice(0, 3)) console.log('  ', r);
    console.log('last 3 rows:');
    for (const r of parsed.rows.slice(-3)) console.log('  ', r);
  }
}
