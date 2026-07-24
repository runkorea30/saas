/**
 * 진단용 — zip 안의 "수입면장 안내" 이메일 하나를 골라서 첨부 PDF 첫 페이지 텍스트를 추출.
 * Claude 판별이 왜 all-false 였는지 확인용.
 */
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import StreamZip from 'node-stream-zip';
import { simpleParser } from 'mailparser';
import { pdfAttachments } from '../api/_shared/emailIngest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(REPO_ROOT, 'samples', '20260704_FEDEX.zip');

async function main() {
  const zip = new StreamZip.async({ file: ZIP_PATH, storeEntries: true });
  const entriesMap = await zip.entries();
  const target = Object.values(entriesMap).find(
    (e) => !e.isDirectory && e.name.includes('수입면장 안내 - 873449616586'),
  );
  if (!target) throw new Error('target eml not found');
  console.log('target:', target.name);
  const buf = await zip.entryData(target.name);
  const parsed = await simpleParser(buf);
  console.log('subject:', parsed.subject);
  console.log('from:', parsed.from?.text);
  console.log('date:', parsed.date?.toISOString());
  const pdfs = pdfAttachments(parsed.attachments);
  console.log('pdf attachments:', pdfs.length);
  for (const p of pdfs) {
    console.log(
      `  - ${p.filename} (${p.contentType}, ${p.size} bytes)`,
    );
  }
  if (pdfs[0]) {
    const outPath = path.join(REPO_ROOT, 'samples', 'sample-fedex.pdf');
    writeFileSync(outPath, pdfs[0].content);
    console.log(`saved to: ${outPath}`);
  }
  await zip.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
