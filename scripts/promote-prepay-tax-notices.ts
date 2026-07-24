/**
 * subject-filtered 로 처리된 "수입세금 안내" 44건 중 이미 저장된 "수입면장 안내" 와 AWB 매칭되는
 * 것들을 사전납부 사본(document_files 추가 row)로 승격.
 *
 * 사용법:
 *   npx tsx scripts/promote-prepay-tax-notices.ts
 *
 * 흐름:
 *   1. manifest 에서 subject 에 "수입세금 안내" 포함 & subject_filtered 처리된 후보 선별
 *   2. 각 후보의 이메일 subject 에서 AWB(9~12자리) 추출
 *   3. 이미 저장된 수입면장 안내 entry 를 AWB 로 매칭 → 신고번호/신고일/HAWB/master_bl 상속
 *   4. 기존 email_ingest_log 의 skipped/subject-filtered row 를 update 로 processed 로 승격
 *   5. Storage 업로드 + document_files INSERT (사전납부 버전 마킹)
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
const STORAGE_BUCKET = 'documents';
const SOURCE_TAG = 'historical_import';

interface ManifestCandidate {
  seq: number;
  message_id: string;
  msg_hash: string;
  subject: string;
  from: string;
  received_at: string;
  pdfs: Array<{
    index: number;
    original_filename: string;
    safe_filename: string;
    size: number | null;
    rel_path: string;
  }>;
}

interface Manifest {
  candidates: ManifestCandidate[];
}

interface ResultRow {
  seq: number;
  is_import_declaration: boolean;
  doc_no?: string | null;
  doc_date?: string | null;
  transport_type?: 'air' | 'sea' | null;
  mawb_hawb?: string | null;
  master_bl?: string | null;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY 필요');
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // company_id 자동 감지
  const pubKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const lookup = createClient(supabaseUrl, pubKey, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: cos } = await lookup.from('companies').select('id, name').limit(2);
  const companyId = cos![0].id as string;
  console.log(`company_id: ${companyId} (${cos![0].name})`);

  const manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, 'utf8'),
  ) as Manifest;
  const results: ResultRow[] = fs
    .readFileSync(RESULTS_PATH, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

  // AWB → 수입면장 안내 신고 메타 매핑
  const awbToDeclaration = new Map<
    string,
    {
      seq: number;
      doc_no: string;
      doc_date: string;
      transport_type: string | null;
      master_bl: string | null;
    }
  >();
  for (const c of manifest.candidates) {
    if (!c.subject.includes('수입면장')) continue;
    const r = results.find((x) => x.seq === c.seq);
    if (r?.is_import_declaration && r.mawb_hawb && r.doc_no && r.doc_date) {
      awbToDeclaration.set(r.mawb_hawb, {
        seq: r.seq,
        doc_no: r.doc_no,
        doc_date: r.doc_date,
        transport_type: r.transport_type ?? null,
        master_bl: r.master_bl ?? null,
      });
    }
  }

  // subject-filtered 로 스킵된 수입세금 안내 후보만 필터
  const 세금스킵Seqs = new Set<number>();
  for (const r of results) {
    if ((r as ResultRow & { subject_filtered?: boolean }).subject_filtered) {
      세금스킵Seqs.add(r.seq);
    }
  }

  const targets: Array<{
    cand: ManifestCandidate;
    awb: string;
    decl: ReturnType<Map<string, unknown>['get']>;
  }> = [];
  for (const c of manifest.candidates) {
    if (!세금스킵Seqs.has(c.seq)) continue;
    if (!c.subject.includes('수입세금 안내')) continue;
    const awb = c.subject.match(/(\d{9,12})\s*$/)?.[1];
    if (!awb) continue;
    const decl = awbToDeclaration.get(awb);
    if (!decl) continue;
    targets.push({ cand: c, awb, decl: decl as never });
  }
  console.log(`\n=== 승격 대상 ===`);
  console.log(`  수입세금 안내 (subject-filtered): ${targets.length}건`);

  let promoted = 0;
  let logUpdateErr = 0;
  let storageErr = 0;
  let docInsertErr = 0;
  let noPdf = 0;

  for (const { cand, awb, decl } of targets) {
    const d = decl as {
      seq: number;
      doc_no: string;
      doc_date: string;
      transport_type: string | null;
      master_bl: string | null;
    };
    const pdf = cand.pdfs[0];
    if (!pdf) {
      noPdf++;
      continue;
    }
    const absPath = path.join(REPO_ROOT, pdf.rel_path);
    let buf: Buffer;
    try {
      buf = fs.readFileSync(absPath);
    } catch (err) {
      storageErr++;
      console.warn(
        `  ✗ seq=${cand.seq} PDF read 실패: ${(err as Error).message}`,
      );
      continue;
    }

    // 1) email_ingest_log 승격 (subject-filtered → processed)
    const { data: logRow, error: logErr } = await supabase
      .from('email_ingest_log')
      .update({
        status: 'processed',
        error_message: null,
        processed_at: new Date().toISOString(),
      })
      .eq('message_id', cand.message_id)
      .eq('company_id', companyId)
      .select('id')
      .single();
    if (logErr || !logRow) {
      logUpdateErr++;
      console.warn(
        `  ✗ seq=${cand.seq} log update 실패: ${logErr?.message ?? 'no row'}`,
      );
      continue;
    }

    // 2) Storage 업로드
    const storagePath = `historical-import/${companyId}/${cand.msg_hash}/0-${pdf.safe_filename}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buf, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (upErr) {
      storageErr++;
      console.warn(`  ✗ seq=${cand.seq} Storage 실패: ${upErr.message}`);
      continue;
    }

    // 3) document_files INSERT
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
        email_message_id: cand.message_id,
        email_from: cand.from || null,
        email_received_at: cand.received_at,
        extracted_doc_no: d.doc_no,
        extracted_doc_date: d.doc_date,
        extracted_metadata: {
          transport_type: d.transport_type,
          mawb_hawb: awb,
          master_bl: d.master_bl,
          classification_reason: `사전납부 사본 — 짝 수입면장 안내 seq=${d.seq} 에서 메타 상속`,
          duplicate_note: `prepay_version_of_seq_${d.seq}`,
        },
      })
      .select('id')
      .single();
    if (docErr || !docRow) {
      docInsertErr++;
      console.warn(
        `  ✗ seq=${cand.seq} doc INSERT 실패: ${docErr?.message ?? 'no row'}`,
      );
      continue;
    }

    // 4) email_ingest_log 에 document_file_id 연결
    await supabase
      .from('email_ingest_log')
      .update({ document_file_id: docRow.id })
      .eq('id', logRow.id);

    promoted++;
    if (promoted % 10 === 0) console.log(`  [진행] ${promoted}건 승격`);
  }

  console.log(`\n=== 결과 ===`);
  console.log(`대상: ${targets.length}`);
  console.log(`승격 성공: ${promoted}`);
  console.log(`log update 실패: ${logUpdateErr}`);
  console.log(`Storage 업로드 실패: ${storageErr}`);
  console.log(`doc INSERT 실패: ${docInsertErr}`);
  console.log(`PDF 없음: ${noPdf}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n실행 실패:', err);
  process.exit(1);
});
