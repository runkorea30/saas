/**
 * 1회성 스크립트 — 한메일 백업 zip 에서 과거 FedEx 수입면장 이메일을 OPS 에 적재.
 *
 * 사용법:
 *   npx tsx scripts/import-historical-fedex-declarations.ts [--dry-run]
 *
 * 흐름:
 *  1. samples/20260704_FEDEX.zip 을 엔트리별로 읽기
 *  2. 각 .eml 파싱 → Date 헤더 확인, 2022-01-01 이전이면 skip
 *  3. PDF 첨부파일 없으면 skip
 *  4. (Claude API 판별 단계) 실제 수입신고필증인지 판별, 아니면 skip
 *  5. email_ingest_log INSERT (message_id UNIQUE → 이미 있으면 skip)
 *  6. Storage 업로드 + Claude 메타 추출 + document_files INSERT
 *  7. email_ingest_log UPDATE status='processed'
 *
 * 재실행 안전:
 *  - email_ingest_log.message_id UNIQUE 로 이미 처리된 메일 자동 skip.
 *  - 어떤 항목 실패해도 다음 항목 계속 진행, 마지막에 요약 출력.
 *
 * --dry-run 모드:
 *  - Claude API / Storage / DB 접근 없이 필터링·카운트만 수행.
 *  - 필터가 제대로 되는지 확인용 (본격 실행 전 최소 1회).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import StreamZip from 'node-stream-zip';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import {
  FEDEX_IS_DECLARATION_PROMPT,
  FEDEX_PROMPT,
  type FedexMeta,
  type IsDeclarationResult,
  callClaude,
  parseJsonLoose,
  pdfAttachments,
  safeFileName,
} from '../api/_shared/emailIngest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

loadDotenv({ path: path.join(REPO_ROOT, '.env.local') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

const ZIP_PATH = path.join(REPO_ROOT, 'samples', '20260704_FEDEX.zip');
const CUTOFF_DATE = new Date('2022-01-01T00:00:00Z');
const STORAGE_BUCKET = 'documents';
const SOURCE_TAG = 'historical_import';

interface Counters {
  totalEml: number;
  parseError: number;
  beforeCutoff: number;
  noPdf: number;
  notDeclaration: number;
  alreadyIngested: number;
  storageUploadError: number;
  dbInsertError: number;
  newlySaved: number;
}

function emptyCounters(): Counters {
  return {
    totalEml: 0,
    parseError: 0,
    beforeCutoff: 0,
    noPdf: 0,
    notDeclaration: 0,
    alreadyIngested: 0,
    storageUploadError: 0,
    dbInsertError: 0,
    newlySaved: 0,
  };
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function fmtKst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseIntArg(name: string): number | null {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return null;
  const n = Number(hit.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limit = parseIntArg('--limit');
  log(
    `\n=== 한메일 FedEx 수입면장 일괄 적재 ${dryRun ? '(dry-run)' : ''}${
      limit ? ` [limit=${limit}]` : ''
    } ===`,
  );
  log(`zip: ${ZIP_PATH}`);
  log(`cutoff: ${CUTOFF_DATE.toISOString()}`);

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  let companyId = process.env.EMAIL_INGEST_COMPANY_ID ?? null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!dryRun) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL / VITE_SUPABASE_URL');
    if (!supabaseServiceKey)
      missing.push('SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY');
    if (!anthropicKey) missing.push('ANTHROPIC_API_KEY');
    if (missing.length > 0) {
      throw new Error(
        `환경변수 누락: ${missing.join(', ')}\n` +
          `.env.local 에 값을 넣거나, --dry-run 으로 필터 카운트만 확인하세요.`,
      );
    }
  }

  const supabase =
    !dryRun && supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey, {
          db: { schema: 'mochicraft_demo' },
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  if (!dryRun && supabase && !companyId) {
    log('EMAIL_INGEST_COMPANY_ID 미설정 → DB 에서 companies 자동 감지…');
    // 신규 opaque secret 키는 mochicraft_demo.companies 에 GRANT 가 안 되어 있어 403.
    // 읽기만 필요한 단발성 조회는 publishable(=anon) 키로 처리.
    const pubKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!pubKey || !supabaseUrl)
      throw new Error(
        'companies 자동 감지에 VITE_SUPABASE_PUBLISHABLE_KEY 가 필요합니다.',
      );
    const lookup = createClient(supabaseUrl, pubKey, {
      db: { schema: 'mochicraft_demo' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: cos, error: coErr } = await lookup
      .from('companies')
      .select('id, name')
      .limit(2);
    if (coErr) throw new Error(`companies 조회 실패: ${coErr.message}`);
    if (!cos || cos.length === 0)
      throw new Error('companies 가 비어있어 자동 감지 불가');
    if (cos.length > 1)
      throw new Error(
        `companies 가 여러 개(${cos
          .map((c) => `${c.id}:${c.name}`)
          .join(', ')}) — EMAIL_INGEST_COMPANY_ID 를 명시적으로 지정하세요.`,
      );
    companyId = cos[0].id as string;
    log(`  → 사용 company_id: ${companyId} (${cos[0].name})`);
  }

  log('zip 열기 중…');
  const zip = new StreamZip.async({ file: ZIP_PATH, storeEntries: true });
  const entriesMap = await zip.entries();
  const entries = Object.values(entriesMap);
  log(`엔트리 총 ${entries.length}개\n`);

  const counters = emptyCounters();
  const passedSamples: Array<{
    filename: string;
    subject: string;
    from: string;
    receivedAt: string;
    pdfCount: number;
  }> = [];
  const errorList: Array<{ file: string; kind: string; note: string }> = [];

  let idx = 0;
  for (const entry of entries) {
    idx++;
    if (entry.isDirectory) continue;
    if (!entry.name.toLowerCase().endsWith('.eml')) continue;

    counters.totalEml++;

    let parsed: Awaited<ReturnType<typeof simpleParser>>;
    try {
      const buf = await zip.entryData(entry.name);
      parsed = await simpleParser(buf);
    } catch (err) {
      counters.parseError++;
      const msg = (err as Error).message;
      errorList.push({ file: entry.name, kind: 'parse', note: msg });
      warn(`  ✗ 파싱 실패: ${entry.name} (${msg})`);
      continue;
    }

    const receivedAt = parsed.date ?? null;
    if (!receivedAt || receivedAt < CUTOFF_DATE) {
      counters.beforeCutoff++;
      continue;
    }

    const pdfs = pdfAttachments(parsed.attachments);
    if (pdfs.length === 0) {
      counters.noPdf++;
      continue;
    }

    if (passedSamples.length < 20) {
      passedSamples.push({
        filename: entry.name,
        subject: parsed.subject ?? '',
        from: parsed.from?.text ?? '',
        receivedAt: receivedAt.toISOString(),
        pdfCount: pdfs.length,
      });
    }

    if (dryRun) {
      if (counters.totalEml % 200 === 0) {
        log(
          `  [진행] ${idx}/${entries.length} — 통과 후보 누적 ${
            counters.totalEml -
            counters.parseError -
            counters.beforeCutoff -
            counters.noPdf
          }건`,
        );
      }
      continue;
    }

    // === 여기부터 실 적재 (dryRun 이 아닐 때만) ===
    if (!supabase || !anthropicKey || !companyId) continue;

    const messageId =
      parsed.messageId ??
      `historical:${entry.name}:${receivedAt.toISOString()}`;

    // 1) email_ingest_log INSERT (message_id UNIQUE dedup)
    const { data: logRow, error: logErr } = await supabase
      .from('email_ingest_log')
      .insert({
        company_id: companyId,
        message_id: messageId,
        sender: parsed.from?.text ?? null,
        subject: parsed.subject ?? null,
        received_at: receivedAt.toISOString(),
        matched_category: 'import_declaration',
        status: 'processed',
      })
      .select('id')
      .single();

    if (logErr) {
      if (logErr.code === '23505') {
        counters.alreadyIngested++;
        continue;
      }
      counters.dbInsertError++;
      errorList.push({
        file: entry.name,
        kind: 'log-insert',
        note: logErr.message,
      });
      warn(`  ✗ log INSERT 실패: ${entry.name} (${logErr.message})`);
      continue;
    }
    const logId = logRow!.id as string;

    // 2) PDF 하나씩 → 수입면장 여부 판별 → Storage 업로드 → 메타 추출 → document_files 저장
    let firstDocFileId: string | null = null;
    let anySaved = false;
    for (let i = 0; i < pdfs.length; i++) {
      const att = pdfs[i];
      const pdfBase64 = att.content.toString('base64');

      const judgeText = await callClaude(
        anthropicKey,
        pdfBase64,
        FEDEX_IS_DECLARATION_PROMPT,
      );
      const judge = parseJsonLoose<IsDeclarationResult>(judgeText);
      if (!judge?.is_import_declaration) {
        continue;
      }

      const rawName = att.filename ?? `attachment-${i + 1}.pdf`;
      const safeBase = safeFileName(rawName) || 'file.pdf';
      // Message-ID 는 <...@...> 형태라 URL 인코딩해도 Supabase Storage key 제약 위반.
      //   → sha256 앞 16자로 안전한 경로 세그먼트 생성.
      const msgHash = crypto
        .createHash('sha256')
        .update(messageId)
        .digest('hex')
        .slice(0, 16);
      const storagePath = `historical-import/${companyId}/${msgHash}/${i}-${safeBase}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, att.content, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (upErr) {
        counters.storageUploadError++;
        errorList.push({
          file: entry.name,
          kind: 'storage-upload',
          note: upErr.message,
        });
        warn(
          `  ✗ Storage 업로드 실패: ${entry.name} (${upErr.message})`,
        );
        continue;
      }

      const metaText = await callClaude(
        anthropicKey,
        pdfBase64,
        FEDEX_PROMPT,
      );
      const meta = parseJsonLoose<FedexMeta>(metaText);

      const uniqueEmailKey =
        pdfs.length === 1 ? messageId : `${messageId}#${i}`;

      const { data: docRow, error: docErr } = await supabase
        .from('document_files')
        .insert({
          company_id: companyId,
          category: 'import_declaration',
          file_name: rawName,
          file_path: storagePath,
          file_size: att.size ?? null,
          mime_type: 'application/pdf',
          uploaded_at: new Date().toISOString(),
          source: SOURCE_TAG,
          email_message_id: uniqueEmailKey,
          email_from: parsed.from?.text ?? null,
          email_received_at: receivedAt.toISOString(),
          extracted_doc_no: meta?.doc_no ?? null,
          extracted_doc_date: meta?.doc_date ?? null,
          extracted_metadata: {
            transport_type: meta?.transport_type ?? null,
            mawb_hawb: meta?.mawb_hawb ?? null,
          },
        })
        .select('id')
        .single();

      if (docErr) {
        counters.dbInsertError++;
        errorList.push({
          file: entry.name,
          kind: 'doc-insert',
          note: docErr.message,
        });
        warn(
          `  ✗ document_files INSERT 실패: ${entry.name} (${docErr.message})`,
        );
        continue;
      }
      if (!anySaved) firstDocFileId = docRow!.id as string;
      anySaved = true;
    }

    if (!anySaved) {
      counters.notDeclaration++;
      await supabase
        .from('email_ingest_log')
        .update({
          status: 'skipped',
          error_message: 'no-pdf-is-declaration',
          processed_at: new Date().toISOString(),
        })
        .eq('id', logId);
      continue;
    }

    counters.newlySaved++;
    await supabase
      .from('email_ingest_log')
      .update({
        status: 'processed',
        document_file_id: firstDocFileId,
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);

    if (counters.newlySaved % 20 === 0) {
      log(
        `  [진행] ${idx}/${entries.length} — 저장 ${counters.newlySaved}건`,
      );
    }

    if (limit && counters.newlySaved >= limit) {
      log(`  [limit] 신규 저장 ${limit} 건 도달 — 조기 종료`);
      break;
    }
  }

  await zip.close();

  log('\n=== 결과 요약 ===');
  log(`전체 .eml           : ${counters.totalEml}`);
  log(`파싱 실패           : ${counters.parseError}`);
  log(`2022-01-01 이전     : ${counters.beforeCutoff}`);
  log(`PDF 첨부 없음        : ${counters.noPdf}`);
  const passed =
    counters.totalEml -
    counters.parseError -
    counters.beforeCutoff -
    counters.noPdf;
  log(`필터 통과 후보       : ${passed}`);
  if (!dryRun) {
    log(`이미 적재됨(dedup)  : ${counters.alreadyIngested}`);
    log(`수입면장 아님        : ${counters.notDeclaration}`);
    log(`Storage 업로드 실패 : ${counters.storageUploadError}`);
    log(`DB INSERT 실패      : ${counters.dbInsertError}`);
    log(`신규 저장 성공       : ${counters.newlySaved}`);
  }

  if (passedSamples.length > 0) {
    log('\n=== 통과 후보 샘플 (앞 20건) ===');
    for (const s of passedSamples) {
      log(
        `  ${fmtKst(s.receivedAt)}  PDF ${s.pdfCount}  ${
          s.from
        }  |  ${s.subject}`,
      );
    }
  }

  if (errorList.length > 0) {
    log(`\n=== 에러 상세 (${errorList.length}건) ===`);
    for (const e of errorList) {
      log(`  [${e.kind}] ${e.file}  |  ${e.note}`);
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n실행 실패:', err);
  process.exit(1);
});
