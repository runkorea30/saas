/**
 * Phase 1 분석 스크립트 — 20260704_ANGELUS.zip 순수 조사용.
 *
 * ⚠️ DB 인서트 / 스키마 변경 / Storage 업로드 없음. 로컬 파일 산출만.
 *
 * 산출:
 *  - scripts/_angelus_analysis_temp/metadata.jsonl : eml 별 헤더/첨부 목록 (한 줄 = 하나의 eml)
 *  - scripts/_angelus_analysis_temp/attachments/{seq}_{msghash}/{i}_{safeName} : 첨부 파일 실체
 *  - scripts/_angelus_analysis_temp/_summary.json  : 총 개수/통계 요약
 *
 * 사용법:
 *   npx tsx scripts/analyze-angelus-invoices.ts
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StreamZip from 'node-stream-zip';
import { simpleParser } from 'mailparser';
import { safeFileName } from '../api/_shared/emailIngest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(REPO_ROOT, 'samples', '20260704_ANGELUS.zip');
const OUT_ROOT = path.join(REPO_ROOT, 'scripts', '_angelus_analysis_temp');
const ATT_ROOT = path.join(OUT_ROOT, 'attachments');
const META_PATH = path.join(OUT_ROOT, 'metadata.jsonl');
const SUM_PATH = path.join(OUT_ROOT, '_summary.json');

interface AttMeta {
  index: number;
  original_filename: string;
  safe_filename: string;
  content_type: string;
  size: number | null;
  rel_path: string; // repo 기준
}

interface EmlMeta {
  seq: number;
  eml_name: string;
  message_id: string | null;
  in_reply_to: string | null;
  references: string[] | null;
  subject: string | null;
  from: string | null;
  from_addr: string | null;
  to: string | null;
  received_at: string | null;
  year: number | null;
  attachments: AttMeta[];
  pdf_count: number;
  parse_error?: string;
}

function log(...args: unknown[]): void {
  console.log(...args); // eslint-disable-line no-console
}

function parseRefs(v: string | string[] | undefined): string[] | null {
  if (!v) return null;
  const s = Array.isArray(v) ? v.join(' ') : v;
  const ids = s.match(/<[^>]+>/g);
  return ids && ids.length > 0 ? ids : null;
}

function firstAddress(from: string | null): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase();
  const bare = from.match(/[\w.+-]+@[\w.-]+/);
  return bare ? bare[0].toLowerCase() : null;
}

async function main(): Promise<void> {
  log('=== Angelus zip 분석 (Phase 1, 순수 조사) ===');
  log(`zip: ${ZIP_PATH}`);
  log(`out: ${OUT_ROOT}`);

  if (!fs.existsSync(ZIP_PATH)) {
    log(`⚠️ zip 파일이 없음: ${ZIP_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(ATT_ROOT, { recursive: true });
  if (fs.existsSync(META_PATH)) fs.rmSync(META_PATH);

  const zip = new StreamZip.async({ file: ZIP_PATH, storeEntries: true });
  const entriesMap = await zip.entries();
  const entries = Object.values(entriesMap);
  log(`엔트리 총 ${entries.length}개`);

  const metaStream = fs.createWriteStream(META_PATH, { encoding: 'utf8' });

  let totalEml = 0;
  let parseError = 0;
  let seq = 0;
  const yearCount: Record<string, number> = {};
  const fromDomainCount: Record<string, number> = {};
  const subjectSamples: string[] = [];

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
      const emlMeta: EmlMeta = {
        seq: ++seq,
        eml_name: entry.name,
        message_id: null,
        in_reply_to: null,
        references: null,
        subject: null,
        from: null,
        from_addr: null,
        to: null,
        received_at: null,
        year: null,
        attachments: [],
        pdf_count: 0,
        parse_error: (err as Error).message,
      };
      metaStream.write(JSON.stringify(emlMeta) + '\n');
      continue;
    }

    seq++;
    const receivedAt = parsed.date ?? null;
    const year = receivedAt ? receivedAt.getUTCFullYear() : null;
    if (year != null) yearCount[String(year)] = (yearCount[String(year)] ?? 0) + 1;

    const fromText = parsed.from?.text ?? null;
    const fromAddr = firstAddress(fromText);
    if (fromAddr) {
      const domain = fromAddr.split('@')[1] ?? '';
      fromDomainCount[domain] = (fromDomainCount[domain] ?? 0) + 1;
    }

    const messageId = parsed.messageId ?? null;
    const hashSource = messageId ?? `${entry.name}:${receivedAt?.toISOString() ?? ''}`;
    const msgHash = crypto.createHash('sha256').update(hashSource).digest('hex').slice(0, 16);

    const attachments: AttMeta[] = [];
    const atts = parsed.attachments ?? [];
    if (atts.length > 0) {
      const seqStr = String(seq).padStart(4, '0');
      const dirName = `${seqStr}_${msgHash}`;
      const dirPath = path.join(ATT_ROOT, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      for (let i = 0; i < atts.length; i++) {
        const att = atts[i];
        const rawName = att.filename ?? `attachment-${i + 1}.bin`;
        const safeBase = safeFileName(rawName) || `file-${i}.bin`;
        const fileName = `${String(i).padStart(2, '0')}_${safeBase}`;
        const filePath = path.join(dirPath, fileName);
        fs.writeFileSync(filePath, att.content);
        attachments.push({
          index: i,
          original_filename: rawName,
          safe_filename: safeBase,
          content_type: (att.contentType ?? '').toLowerCase(),
          size: att.size ?? null,
          rel_path: path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
        });
      }
    }

    const pdfCount = attachments.filter(
      (a) => a.content_type === 'application/pdf' || a.safe_filename.toLowerCase().endsWith('.pdf'),
    ).length;

    const subject = parsed.subject ?? null;
    if (subject && subjectSamples.length < 40) subjectSamples.push(subject);

    const emlMeta: EmlMeta = {
      seq,
      eml_name: entry.name,
      message_id: messageId,
      in_reply_to: parsed.inReplyTo ?? null,
      references: parseRefs(parsed.references),
      subject,
      from: fromText,
      from_addr: fromAddr,
      to: parsed.to?.text ?? null,
      received_at: receivedAt ? receivedAt.toISOString() : null,
      year,
      attachments,
      pdf_count: pdfCount,
    };
    metaStream.write(JSON.stringify(emlMeta) + '\n');

    if (seq % 100 === 0) log(`  [진행] ${seq}건 처리`);
  }

  await zip.close();
  await new Promise<void>((resolve) => metaStream.end(resolve));

  const summary = {
    generated_at: new Date().toISOString(),
    zip_path: path.relative(REPO_ROOT, ZIP_PATH).replace(/\\/g, '/'),
    total_eml: totalEml,
    parse_error: parseError,
    year_distribution: yearCount,
    from_domain_top: Object.entries(fromDomainCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    subject_samples: subjectSamples,
  };
  fs.writeFileSync(SUM_PATH, JSON.stringify(summary, null, 2), 'utf8');

  log('\n=== 요약 ===');
  log(`총 .eml         : ${totalEml}`);
  log(`파싱 실패        : ${parseError}`);
  log(`연도별 분포      : ${JSON.stringify(yearCount)}`);
  log(`metadata.jsonl  : ${path.relative(REPO_ROOT, META_PATH)}`);
  log(`summary          : ${path.relative(REPO_ROOT, SUM_PATH)}`);
}

main().catch((err) => {
  console.error('\n실행 실패:', err); // eslint-disable-line no-console
  process.exit(1);
});
