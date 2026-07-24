// 배포된 api/analyze-invoice.ts 와 동일 로직으로 PDF 텍스트 추출 → 파서 결과 덤프.
// 실행: node scripts/dump-pdf-text.mjs '<pdf-path>'
// 진단 전용, 커밋 대상 아님.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

// api/analyze-invoice.ts 의 stub 과 동일.
function installPdfjsDomStubs() {
  const g = globalThis;
  if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class DOMMatrixStub {
      constructor(_init) {}
      translate() { return this; }
      scale() { return this; }
      invertSelf() { return this; }
      multiplySelf() { return this; }
      preMultiplySelf() { return this; }
    };
  }
  if (typeof g.ImageData === 'undefined') g.ImageData = class {};
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = class { addPath() {} };
  }
}
installPdfjsDomStubs();

async function extractTextFromPdf(buf) {
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

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('사용법: node scripts/dump-pdf-text.mjs <pdf-path>');
  process.exit(1);
}

const pdfPath = argv[0];
const buf = await readFile(pdfPath);
const text = await extractTextFromPdf(buf);

const outName = `dump-${path.basename(pdfPath).replace(/[^A-Za-z0-9._-]/g, '_')}.txt`;
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '_phaseC_temp', outName);
await writeFile(outPath, text, 'utf8');
console.log(`텍스트 길이: ${text.length}`);
console.log(`덤프 저장: ${outPath}`);
console.log('---- 처음 2000자 ----');
console.log(text.slice(0, 2000));
console.log('---- 마지막 800자 ----');
console.log(text.slice(-800));

// 파서도 돌려봄 (파일 확장자가 실제로는 .ts 라 tsx 로만 로드 가능 → 스킵)
try { throw new Error('skip parser'); } catch { process.exit(0); }
// eslint-disable-next-line no-unreachable
const parserMod = await import('../api/_shared/invoice-local-parser.js');
try {
  const parsed = parserMod.parseAngelusInvoiceText(text);
  console.log('---- 파서 결과 ----');
  console.log('invoice_no:', JSON.stringify(parsed.invoice_no));
  console.log('invoice_date:', JSON.stringify(parsed.invoice_date));
  console.log('rows count:', parsed.rows.length);
  if (parsed.rows.length > 0) {
    console.log('first row:', JSON.stringify(parsed.rows[0]));
    const sum = parsed.rows.reduce((a, r) => a + r.amount, 0);
    console.log('Σamount:', sum.toFixed(2));
  }
} catch (e) {
  console.error('파서 예외:', e);
}
