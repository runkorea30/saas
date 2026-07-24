/**
 * 1회성 스크립트 — 로컬 판별 결과(results.jsonl)를 Supabase 에 적재.
 *
 * 사용법:
 *   npx tsx scripts/commit-fedex-results.ts [--dry-run]
 *
 * 입력:
 *   samples/extracted-pdfs/manifest.json — 후보 메타(seq, message_id, msg_hash, ...)
 *   samples/extracted-pdfs/results.jsonl — 판별 결과 (한 줄 = 한 PDF)
 *
 * 흐름 (results.jsonl 한 줄씩):
 *   1. manifest 에서 후보 정보 조회 (seq 기준)
 *   2. is_import_declaration=true:
 *        - PDF 를 Storage(documents 버킷, historical-import/{companyId}/{msgHash}/{i}-{safe}) 업로드
 *        - email_ingest_log INSERT (status='processed', message_id UNIQUE dedup)
 *        - document_files INSERT (source='historical_import', extracted_doc_no/date/metadata)
 *        - email_ingest_log UPDATE document_file_id
 *      false:
 *        - email_ingest_log INSERT (status='skipped', error_message='not-declaration')
 *
 * 재실행 안전:
 *   - email_ingest_log.message_id UNIQUE → 23505 발생 시 skip 처리.
 *   - PDF 는 upsert:true 로 재업로드해도 무해.
 *   - 실패 항목은 skipped_seqs.jsonl 에 append, 다음 실행 시 재시도.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

loadDotenv({ path: path.join(REPO_ROOT, '.env.local') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

const OUT_ROOT = path.join(REPO_ROOT, 'samples', 'extracted-pdfs');
const MANIFEST_PATH = path.join(OUT_ROOT, 'manifest.json');
const RESULTS_PATH = path.join(OUT_ROOT, 'results.jsonl');
const ERROR_LOG_PATH = path.join(OUT_ROOT, 'commit-errors.jsonl');
const STORAGE_BUCKET = 'documents';
const SOURCE_TAG = 'historical_import';

interface ManifestPdf {
  index: number;
  original_filename: string;
  safe_filename: string;
  size: number | null;
  rel_path: string;
}

interface ManifestCandidate {
  seq: number;
  message_id: string;
  msg_hash: string;
  subject: string;
  from: string;
  received_at: string;
  pdf_count: number;
  pdfs: ManifestPdf[];
}

interface Manifest {
  candidates: ManifestCandidate[];
}

interface ResultRow {
  seq: number;
  pdf_index: number;
  message_id: string;
  is_import_declaration: boolean;
  reason?: string;
  doc_no?: string | null;
  doc_date?: string | null;
  transport_type?: 'air' | 'sea' | null;
  mawb_hawb?: string | null;
  master_bl?: string | null;
  note?: string | null;
  /**
   * true 이면 PDF 를 열지 않고 이메일 제목 필터로 스킵된 후보.
   * email_ingest_log.error_message='subject-filtered' 로 기록해 나중에 재검토 가능.
   */
  subject_filtered?: boolean;
}

interface Counters {
  totalRows: number;
  declaredTrue: number;
  declaredFalse: number;
  logInsertConflict: number;
  logInsertError: number;
  storageUploadError: number;
  docInsertError: number;
  newlySaved: number;
  skippedInserted: number;
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function appendError(record: Record<string, unknown>): void {
  fs.appendFileSync(ERROR_LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
}

function readResults(): ResultRow[] {
  if (!fs.existsSync(RESULTS_PATH)) return [];
  const raw = fs.readFileSync(RESULTS_PATH, 'utf8');
  const rows: ResultRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t) as ResultRow);
    } catch (err) {
      warn(`  ✗ results.jsonl 파싱 실패: ${t.slice(0, 80)} (${(err as Error).message})`);
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  log(`\n=== FedEx 판별결과 → Supabase 적재 ${dryRun ? '(dry-run)' : ''} ===`);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  let companyId = process.env.EMAIL_INGEST_COMPANY_ID ?? null;

  if (!dryRun) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL / VITE_SUPABASE_URL');
    if (!supabaseServiceKey)
      missing.push('SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length > 0) {
      throw new Error(
        `환경변수 누락: ${missing.join(', ')}\n` +
          `.env.local 에 값을 넣거나, --dry-run 으로 카운트만 확인하세요.`,
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
    log('EMAIL_INGEST_COMPANY_ID 미설정 → DB 자동 감지…');
    const pubKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!pubKey || !supabaseUrl)
      throw new Error('companies 자동 감지에 VITE_SUPABASE_PUBLISHABLE_KEY 필요.');
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
        `companies 여러 개 존재 → EMAIL_INGEST_COMPANY_ID 명시 필요.`,
      );
    companyId = cos[0].id as string;
    log(`  → 사용 company_id: ${companyId} (${cos[0].name})`);
  }

  const manifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(manifestRaw) as Manifest;
  const bySeq = new Map<number, ManifestCandidate>();
  for (const c of manifest.candidates) bySeq.set(c.seq, c);

  const results = readResults();
  log(`manifest 후보 : ${manifest.candidates.length}`);
  log(`results 라인  : ${results.length}`);

  // 같은 seq 여러 PDF 처리 위해 seq 별 그룹화
  const bySeqResult = new Map<number, ResultRow[]>();
  for (const r of results) {
    const arr = bySeqResult.get(r.seq) ?? [];
    arr.push(r);
    bySeqResult.set(r.seq, arr);
  }

  const counters: Counters = {
    totalRows: results.length,
    declaredTrue: 0,
    declaredFalse: 0,
    logInsertConflict: 0,
    logInsertError: 0,
    storageUploadError: 0,
    docInsertError: 0,
    newlySaved: 0,
    skippedInserted: 0,
  };

  for (const [seq, rows] of bySeqResult) {
    const cand = bySeq.get(seq);
    if (!cand) {
      warn(`  ✗ seq=${seq} 이 manifest 에 없음, 스킵`);
      appendError({ seq, kind: 'seq-not-in-manifest' });
      continue;
    }
    const anyTrue = rows.some((r) => r.is_import_declaration);
    if (anyTrue) counters.declaredTrue++;
    else counters.declaredFalse++;

    if (dryRun) continue;
    if (!supabase || !companyId) continue;

    const anySubjectFiltered = rows.some((r) => r.subject_filtered);
    const skipReason = anySubjectFiltered ? 'subject-filtered' : 'not-declaration';

    // 1) email_ingest_log INSERT (초기 상태는 processed / skipped 둘 중 하나)
    const { data: logRow, error: logErr } = await supabase
      .from('email_ingest_log')
      .insert({
        company_id: companyId,
        message_id: cand.message_id,
        sender: cand.from || null,
        subject: cand.subject || null,
        received_at: cand.received_at,
        matched_category: 'import_declaration',
        status: anyTrue ? 'processed' : 'skipped',
        error_message: anyTrue ? null : skipReason,
      })
      .select('id')
      .single();

    if (logErr) {
      if (logErr.code === '23505') {
        counters.logInsertConflict++;
        continue;
      }
      counters.logInsertError++;
      appendError({ seq, kind: 'log-insert', note: logErr.message });
      warn(`  ✗ seq=${seq} log INSERT 실패: ${logErr.message}`);
      continue;
    }
    const logId = logRow!.id as string;

    if (!anyTrue) {
      counters.skippedInserted++;
      continue;
    }

    // 2) is_import_declaration=true 인 PDF 각각 처리
    let firstDocFileId: string | null = null;
    for (const r of rows) {
      if (!r.is_import_declaration) continue;
      const pdf = cand.pdfs[r.pdf_index];
      if (!pdf) {
        appendError({ seq, kind: 'pdf-index-oob', pdf_index: r.pdf_index });
        continue;
      }
      const absPath = path.join(REPO_ROOT, pdf.rel_path);
      let buf: Buffer;
      try {
        buf = fs.readFileSync(absPath);
      } catch (err) {
        counters.storageUploadError++;
        appendError({
          seq,
          kind: 'pdf-read',
          note: (err as Error).message,
        });
        continue;
      }

      const storagePath = `historical-import/${companyId}/${cand.msg_hash}/${r.pdf_index}-${pdf.safe_filename}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buf, {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (upErr) {
        counters.storageUploadError++;
        appendError({
          seq,
          kind: 'storage-upload',
          note: upErr.message,
        });
        warn(`  ✗ seq=${seq} Storage 업로드 실패: ${upErr.message}`);
        continue;
      }

      const uniqueEmailKey =
        rows.filter((x) => x.is_import_declaration).length === 1
          ? cand.message_id
          : `${cand.message_id}#${r.pdf_index}`;

      const { data: docRow, error: docErr } = await supabase
        .from('document_files')
        .insert({
          company_id: companyId,
          category: 'import_declaration',
          file_name: pdf.original_filename,
          file_path: storagePath,
          file_size: pdf.size,
          mime_type: 'application/pdf',
          uploaded_at: new Date().toISOString(),
          source: SOURCE_TAG,
          email_message_id: uniqueEmailKey,
          email_from: cand.from || null,
          email_received_at: cand.received_at,
          extracted_doc_no: r.doc_no ?? null,
          extracted_doc_date: r.doc_date ?? null,
          extracted_metadata: {
            transport_type: r.transport_type ?? null,
            mawb_hawb: r.mawb_hawb ?? null,
            master_bl: r.master_bl ?? null,
            classification_reason: r.reason ?? null,
            duplicate_note: r.note ?? null,
          },
        })
        .select('id')
        .single();

      if (docErr) {
        counters.docInsertError++;
        appendError({
          seq,
          kind: 'doc-insert',
          note: docErr.message,
        });
        warn(`  ✗ seq=${seq} document_files INSERT 실패: ${docErr.message}`);
        continue;
      }
      if (!firstDocFileId) firstDocFileId = docRow!.id as string;
    }

    // 3) email_ingest_log 에 document_file_id 세팅
    if (firstDocFileId) {
      counters.newlySaved++;
      await supabase
        .from('email_ingest_log')
        .update({
          document_file_id: firstDocFileId,
          processed_at: new Date().toISOString(),
        })
        .eq('id', logId);
    } else {
      // true 였는데 결국 아무것도 못 넣은 경우 (모두 실패)
      await supabase
        .from('email_ingest_log')
        .update({
          status: 'skipped',
          error_message: 'all-pdf-inserts-failed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }

    if (counters.newlySaved > 0 && counters.newlySaved % 10 === 0) {
      log(`  [진행] 저장 ${counters.newlySaved}건`);
    }
  }

  log('\n=== 결과 요약 ===');
  log(`results 라인 총계   : ${counters.totalRows}`);
  log(`판별 true (seq)     : ${counters.declaredTrue}`);
  log(`판별 false (seq)    : ${counters.declaredFalse}`);
  if (!dryRun) {
    log(`log 중복 (dedup)    : ${counters.logInsertConflict}`);
    log(`log INSERT 실패     : ${counters.logInsertError}`);
    log(`Storage 업로드 실패 : ${counters.storageUploadError}`);
    log(`doc INSERT 실패     : ${counters.docInsertError}`);
    log(`skipped 저장        : ${counters.skippedInserted}`);
    log(`신규 저장 성공       : ${counters.newlySaved}`);
    if (fs.existsSync(ERROR_LOG_PATH))
      log(`에러 로그           : ${path.relative(REPO_ROOT, ERROR_LOG_PATH)}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n실행 실패:', err);
  process.exit(1);
});
