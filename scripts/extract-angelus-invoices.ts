/**
 * Phase 1.5 — 20260704_ANGELUS.zip 에서 Inv_*.pdf 첨부만 추출하고 pdftotext 로 텍스트화.
 * 동일 SHA-256 해시 파일은 한 번만 처리(FW/RE 중복 제거).
 *
 * ⚠️ DB 인서트 없음, 스키마 변경 없음.
 *
 * 산출:
 *  - scripts/_angelus_freight_temp/invoices.jsonl  (한 줄 = 하나의 인보이스 파일)
 *    { sha256, filename_invoice_no, first_seen_seq, first_seen_date, source_emails: [{seq, date, subject}], pdf_text }
 *  - scripts/_angelus_freight_temp/pdfs/{sha256_first16}.pdf  (원본 PDF, 텍스트 추출용 캐시)
 *
 * 사용법:
 *   npx tsx scripts/extract-angelus-invoices.ts
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import StreamZip from 'node-stream-zip';
import { simpleParser } from 'mailparser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(REPO_ROOT, 'samples', '20260704_ANGELUS.zip');
const OUT_ROOT = path.join(REPO_ROOT, 'scripts', '_angelus_freight_temp');
const PDF_DIR = path.join(OUT_ROOT, 'pdfs');
const JSONL = path.join(OUT_ROOT, 'invoices.jsonl');

const INV_RE = /^Inv_(\d+)_from_Angelus/i;

interface InvoiceRow {
  sha256: string;
  filename_invoice_no: string;
  original_filename: string;
  first_seen_seq: number;
  first_seen_date: string | null;
  first_seen_subject: string | null;
  first_seen_message_id: string | null;
  first_seen_from: string | null;
  first_seen_year: number | null;
  source_emails: Array<{
    seq: number;
    date: string | null;
    subject: string | null;
    message_id: string | null;
    from: string | null;
  }>;
  pdf_text: string;
}

function log(...args: unknown[]): void {
  console.log(...args); // eslint-disable-line no-console
}

function pdfToText(pdfPath: string): string {
  try {
    // -layout 은 컬럼 정렬 보존 (테이블 파싱에 유리)
    // -enc UTF-8 명시
    // "-" 는 stdout 출력
    const buf = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
      encoding: 'buffer',
      maxBuffer: 20 * 1024 * 1024,
    });
    return buf.toString('utf8');
  } catch (err) {
    return `PDFTOTEXT_ERROR: ${(err as Error).message}`;
  }
}

async function main(): Promise<void> {
  log('=== Angelus Freight 재검증 — Inv PDF 전수 추출 ===');
  if (!fs.existsSync(ZIP_PATH)) throw new Error(`zip 없음: ${ZIP_PATH}`);
  fs.mkdirSync(PDF_DIR, { recursive: true });
  if (fs.existsSync(JSONL)) fs.rmSync(JSONL);

  const zip = new StreamZip.async({ file: ZIP_PATH, storeEntries: true });
  const entries = Object.values(await zip.entries());
  log(`엔트리 총 ${entries.length}`);

  const bySha = new Map<string, InvoiceRow>();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'angfr-'));
  let seq = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.toLowerCase().endsWith('.eml')) continue;
    seq++;

    let parsed: Awaited<ReturnType<typeof simpleParser>>;
    try {
      parsed = await simpleParser(await zip.entryData(entry.name));
    } catch {
      continue;
    }
    const receivedAt = parsed.date ? parsed.date.toISOString() : null;
    const year = parsed.date ? parsed.date.getUTCFullYear() : null;
    if (year != null && year < 2022) continue; // 2022~2026 만 관심
    const subject = parsed.subject ?? null;
    const messageId = parsed.messageId ?? null;
    const fromText = parsed.from?.text ?? null;
    const atts = parsed.attachments ?? [];
    for (const att of atts) {
      const nm = att.filename ?? '';
      const m = nm.match(INV_RE);
      if (!m) continue;
      if (!att.content) continue;
      const invoiceNo = m[1];
      const sha = crypto.createHash('sha256').update(att.content).digest('hex');
      const existing = bySha.get(sha);
      if (existing) {
        existing.source_emails.push({ seq, date: receivedAt, subject, message_id: messageId, from: fromText });
        continue;
      }
      // 신규: 파일 저장 후 pdftotext
      const shaShort = sha.slice(0, 16);
      const dstPath = path.join(PDF_DIR, `${shaShort}.pdf`);
      fs.writeFileSync(dstPath, att.content);
      const tmpPdf = path.join(tmpDir, `${shaShort}.pdf`);
      fs.writeFileSync(tmpPdf, att.content);
      const text = pdfToText(tmpPdf);
      try { fs.rmSync(tmpPdf); } catch { /* ignore */ }
      const row: InvoiceRow = {
        sha256: sha,
        filename_invoice_no: invoiceNo,
        original_filename: nm,
        first_seen_seq: seq,
        first_seen_date: receivedAt,
        first_seen_subject: subject,
        first_seen_message_id: messageId,
        first_seen_from: fromText,
        first_seen_year: year,
        source_emails: [{ seq, date: receivedAt, subject, message_id: messageId, from: fromText }],
        pdf_text: text,
      };
      bySha.set(sha, row);
    }
  }

  await zip.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

  // Write JSONL
  const out = fs.createWriteStream(JSONL, { encoding: 'utf8' });
  for (const row of bySha.values()) out.write(JSON.stringify(row) + '\n');
  await new Promise<void>((r) => out.end(r));

  log(`\n=== 결과 ===`);
  log(`고유 Inv PDF 파일 수(SHA256): ${bySha.size}`);
  log(`고유 filename Invoice # 수    : ${new Set(Array.from(bySha.values()).map((r) => r.filename_invoice_no)).size}`);
  log(`JSONL 산출: ${path.relative(REPO_ROOT, JSONL)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }); // eslint-disable-line no-console
