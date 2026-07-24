/**
 * 1회성 스크립트 — 한메일 백업 zip 에서 조건에 맞는 후보 메일의 PDF 첨부를 로컬에 추출.
 *
 * 사용법:
 *   npx tsx scripts/extract-fedex-candidates.ts
 *
 * 흐름:
 *  1. samples/20260704_FEDEX.zip 을 엔트리별로 읽기
 *  2. 각 .eml 파싱 → Date 헤더 확인, 2022-01-01 이전이면 skip
 *  3. PDF 첨부파일 없으면 skip
 *  4. 통과한 후보에 seq(001..) 부여, PDF 를 samples/extracted-pdfs/{seq}_{msgHash}/{i}-{safe}.pdf 에 기록
 *  5. samples/extracted-pdfs/manifest.json 에 전체 목록 저장
 *
 * ⚠️ Claude API / Supabase 호출 없음. 순수 추출·저장만.
 * 재실행 시 기존 폴더/파일을 덮어씀 (idempotent).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StreamZip from 'node-stream-zip';
import { simpleParser } from 'mailparser';
import { pdfAttachments, safeFileName } from '../api/_shared/emailIngest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(REPO_ROOT, 'samples', '20260704_FEDEX.zip');
const OUT_ROOT = path.join(REPO_ROOT, 'samples', 'extracted-pdfs');
const MANIFEST_PATH = path.join(OUT_ROOT, 'manifest.json');
const CUTOFF_DATE = new Date('2022-01-01T00:00:00Z');

interface PdfEntry {
  index: number;
  original_filename: string;
  safe_filename: string;
  size: number | null;
  rel_path: string;
}

interface Candidate {
  seq: number;
  eml_name: string;
  message_id: string;
  msg_hash: string;
  subject: string;
  from: string;
  received_at: string;
  pdf_count: number;
  pdfs: PdfEntry[];
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

async function main(): Promise<void> {
  log('=== FedEx 후보 PDF 추출 ===');
  log(`zip: ${ZIP_PATH}`);
  log(`out: ${OUT_ROOT}`);
  log(`cutoff: ${CUTOFF_DATE.toISOString()}`);

  fs.mkdirSync(OUT_ROOT, { recursive: true });

  const zip = new StreamZip.async({ file: ZIP_PATH, storeEntries: true });
  const entriesMap = await zip.entries();
  const entries = Object.values(entriesMap);
  log(`엔트리 총 ${entries.length}개\n`);

  const candidates: Candidate[] = [];
  let totalEml = 0;
  let parseError = 0;
  let beforeCutoff = 0;
  let noPdf = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.name.toLowerCase().endsWith('.eml')) continue;
    totalEml++;

    let parsed: Awaited<ReturnType<typeof simpleParser>>;
    try {
      const buf = await zip.entryData(entry.name);
      parsed = await simpleParser(buf);
    } catch (err) {
      parseError++;
      warn(`  ✗ 파싱 실패: ${entry.name} (${(err as Error).message})`);
      continue;
    }

    const receivedAt = parsed.date ?? null;
    if (!receivedAt || receivedAt < CUTOFF_DATE) {
      beforeCutoff++;
      continue;
    }

    const pdfs = pdfAttachments(parsed.attachments);
    if (pdfs.length === 0) {
      noPdf++;
      continue;
    }

    const seq = candidates.length + 1;
    const messageId =
      parsed.messageId ??
      `historical:${entry.name}:${receivedAt.toISOString()}`;
    const msgHash = crypto
      .createHash('sha256')
      .update(messageId)
      .digest('hex')
      .slice(0, 16);

    const seqStr = String(seq).padStart(3, '0');
    const dirName = `${seqStr}_${msgHash}`;
    const dirPath = path.join(OUT_ROOT, dirName);
    fs.mkdirSync(dirPath, { recursive: true });

    const pdfEntries: PdfEntry[] = [];
    for (let i = 0; i < pdfs.length; i++) {
      const att = pdfs[i];
      const rawName = att.filename ?? `attachment-${i + 1}.pdf`;
      const safeBase = safeFileName(rawName) || `file-${i}.pdf`;
      const fileName = `${i}-${safeBase}`;
      const filePath = path.join(dirPath, fileName);
      fs.writeFileSync(filePath, att.content);
      pdfEntries.push({
        index: i,
        original_filename: rawName,
        safe_filename: safeBase,
        size: att.size ?? null,
        rel_path: path
          .relative(REPO_ROOT, filePath)
          .replace(/\\/g, '/'),
      });
    }

    candidates.push({
      seq,
      eml_name: entry.name,
      message_id: messageId,
      msg_hash: msgHash,
      subject: parsed.subject ?? '',
      from: parsed.from?.text ?? '',
      received_at: receivedAt.toISOString(),
      pdf_count: pdfs.length,
      pdfs: pdfEntries,
    });

    if (candidates.length % 20 === 0) {
      log(`  [진행] eml ${totalEml}건 스캔 — 후보 누적 ${candidates.length}건`);
    }
  }

  await zip.close();

  const manifest = {
    generated_at: new Date().toISOString(),
    zip_path: path.relative(REPO_ROOT, ZIP_PATH).replace(/\\/g, '/'),
    cutoff_utc: CUTOFF_DATE.toISOString(),
    total_eml: totalEml,
    parse_error: parseError,
    before_cutoff: beforeCutoff,
    no_pdf: noPdf,
    candidate_count: candidates.length,
    candidates,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  log('\n=== 결과 요약 ===');
  log(`전체 .eml           : ${totalEml}`);
  log(`파싱 실패           : ${parseError}`);
  log(`2022-01-01 이전     : ${beforeCutoff}`);
  log(`PDF 첨부 없음        : ${noPdf}`);
  log(`후보 (추출 완료)     : ${candidates.length}`);
  log(`manifest            : ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n실행 실패:', err);
  process.exit(1);
});
