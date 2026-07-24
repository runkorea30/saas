/**
 * seq 9-153 중 이메일 제목에 "수입면장" 이 포함되지 않은 후보를 자동 스킵으로 표기.
 *
 * 사용법:
 *   npx tsx scripts/filter-subject.ts
 *
 * 결과:
 *   - samples/extracted-pdfs/results.jsonl 에 append (subject_filtered=true, is_import_declaration=false)
 *     → commit 스크립트가 email_ingest_log 에 status='skipped', error_message='subject-filtered' 로 기록
 *   - samples/extracted-pdfs/subject-filtered.jsonl 에도 별도 목록 저장 (나중에 재검토용)
 *
 * 재실행 안전:
 *   - results.jsonl 에 이미 있는 seq 는 건드리지 않음
 *   - subject-filtered.jsonl 은 매 실행마다 새로 씀 (전체 스냅샷)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const OUT_ROOT = path.join(REPO_ROOT, 'samples', 'extracted-pdfs');
const MANIFEST_PATH = path.join(OUT_ROOT, 'manifest.json');
const RESULTS_PATH = path.join(OUT_ROOT, 'results.jsonl');
const FILTERED_LIST_PATH = path.join(OUT_ROOT, 'subject-filtered.jsonl');

const SEQ_START = 9;
const KEYWORD = '수입면장';

interface ManifestCandidate {
  seq: number;
  message_id: string;
  subject: string;
  from: string;
  received_at: string;
  pdf_count: number;
}

interface Manifest {
  candidates: ManifestCandidate[];
}

function loadExistingSeqs(): Set<number> {
  const existing = new Set<number>();
  if (!fs.existsSync(RESULTS_PATH)) return existing;
  const raw = fs.readFileSync(RESULTS_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t) as { seq?: number };
      if (typeof r.seq === 'number') existing.add(r.seq);
    } catch {
      // ignore malformed
    }
  }
  return existing;
}

function main(): void {
  const manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, 'utf8'),
  ) as Manifest;
  const existingSeqs = loadExistingSeqs();

  const filteredList: Array<{
    seq: number;
    subject: string;
    received_at: string;
    message_id: string;
  }> = [];
  const appendLines: string[] = [];
  let scanned = 0;
  let subjectMatches = 0;
  let alreadyDone = 0;
  let newlyFiltered = 0;

  for (const c of manifest.candidates) {
    if (c.seq < SEQ_START) continue;
    scanned++;

    if (existingSeqs.has(c.seq)) {
      alreadyDone++;
      continue;
    }
    if (c.subject.includes(KEYWORD)) {
      subjectMatches++;
      continue;
    }

    newlyFiltered++;
    const row = {
      seq: c.seq,
      pdf_index: 0,
      message_id: c.message_id,
      is_import_declaration: false,
      subject_filtered: true,
      reason: `subject 에 "${KEYWORD}" 없음`,
      subject: c.subject,
      received_at: c.received_at,
    };
    appendLines.push(JSON.stringify(row));
    filteredList.push({
      seq: c.seq,
      subject: c.subject,
      received_at: c.received_at,
      message_id: c.message_id,
    });
  }

  if (appendLines.length > 0) {
    fs.appendFileSync(
      RESULTS_PATH,
      appendLines.join('\n') + '\n',
      'utf8',
    );
  }
  fs.writeFileSync(
    FILTERED_LIST_PATH,
    filteredList.map((f) => JSON.stringify(f)).join('\n') + '\n',
    'utf8',
  );

  // eslint-disable-next-line no-console
  console.log(`\n=== subject 필터 완료 ===`);
  // eslint-disable-next-line no-console
  console.log(`스캔 (seq ${SEQ_START}~)   : ${scanned}`);
  // eslint-disable-next-line no-console
  console.log(`이미 처리됨          : ${alreadyDone}`);
  // eslint-disable-next-line no-console
  console.log(`제목 매치 (판별 대상): ${subjectMatches}`);
  // eslint-disable-next-line no-console
  console.log(`새로 필터 스킵       : ${newlyFiltered}`);
  // eslint-disable-next-line no-console
  console.log(`results.jsonl 추가   : ${appendLines.length} 줄`);
  // eslint-disable-next-line no-console
  console.log(
    `재검토 목록          : ${path.relative(REPO_ROOT, FILTERED_LIST_PATH)}`,
  );
}

main();
