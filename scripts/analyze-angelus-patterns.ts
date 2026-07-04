/**
 * Phase 1 후속 분석 — metadata.jsonl 을 읽어 패턴/그룹핑/리비전 통계를 출력.
 * DB 변경 없음. 로컬 산출만.
 *
 * 사용법:
 *   npx tsx scripts/analyze-angelus-patterns.ts > scripts/_angelus_analysis_temp/_patterns.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const META = path.join(REPO_ROOT, 'scripts', '_angelus_analysis_temp', 'metadata.jsonl');

interface AttMeta {
  index: number;
  original_filename: string;
  safe_filename: string;
  content_type: string;
  size: number | null;
  rel_path: string;
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
}

function normSubject(s: string | null): string {
  if (!s) return '';
  return s
    .replace(/﻿/g, '')
    .replace(/^(re|fw|fwd)\s*:\s*/i, '')
    .replace(/^(re|fw|fwd)\s*:\s*/i, '')
    .replace(/^(re|fw|fwd)\s*:\s*/i, '')
    .replace(/^(re|fw|fwd)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifySubject(s: string): string {
  const l = s.toLowerCase();
  if (/sales order \d+/.test(l)) return 'SalesOrder';
  if (/invoice \d+/.test(l)) return 'Invoice';
  if (/credit memo \d+/.test(l)) return 'CreditMemo';
  if (l.includes('statement')) return 'Statement';
  if (l.includes('purchase order')) return 'PurchaseOrder';
  if (/(fedex|shipment|shipping|awb|tracking|air ?way ?bill)/.test(l)) return 'Shipping';
  if (l.includes('revised')) return 'Revised';
  return 'Other';
}

function extractDocNumbers(s: string): { salesOrder: string[]; invoice: string[]; creditMemo: string[] } {
  const salesOrder = Array.from(s.matchAll(/sales order (\d+)/gi)).map((m) => m[1]);
  const invoice = Array.from(s.matchAll(/invoice (\d+)/gi)).map((m) => m[1]);
  const creditMemo = Array.from(s.matchAll(/credit memo (\d+)/gi)).map((m) => m[1]);
  return { salesOrder, invoice, creditMemo };
}

const rows: EmlMeta[] = fs
  .readFileSync(META, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l));

// ---- 1. Subject classification distribution ----
const catCount: Record<string, number> = {};
for (const r of rows) {
  const cat = classifySubject(r.subject ?? '');
  catCount[cat] = (catCount[cat] ?? 0) + 1;
}

// ---- 2. Revised detection ----
const revisedRows = rows.filter((r) => (r.subject ?? '').toLowerCase().includes('revised'));
const revisedSubjects = revisedRows.map((r) => r.subject).slice(0, 20);

// ---- 3. Thread building: Message-ID -> node ----
const nodeById = new Map<string, EmlMeta>();
for (const r of rows) if (r.message_id) nodeById.set(r.message_id, r);

// UnionFind for threads (via references / in-reply-to)
const parent = new Map<number, number>();
function find(x: number): number {
  let p = parent.get(x) ?? x;
  while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
  parent.set(x, p);
  return p;
}
function union(a: number, b: number): void {
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}
for (const r of rows) parent.set(r.seq, r.seq);

// Union via In-Reply-To / References
for (const r of rows) {
  const linkIds = new Set<string>();
  if (r.in_reply_to) linkIds.add(r.in_reply_to);
  if (r.references) r.references.forEach((id) => linkIds.add(id));
  for (const id of linkIds) {
    const other = nodeById.get(id);
    if (other) union(r.seq, other.seq);
  }
}

// Also union via normalized subject if both contain same Sales Order or Invoice number
const numToSeqs = new Map<string, number[]>();
for (const r of rows) {
  const nums = extractDocNumbers(r.subject ?? '');
  const keys = [
    ...nums.salesOrder.map((n) => `SO:${n}`),
    ...nums.invoice.map((n) => `INV:${n}`),
    ...nums.creditMemo.map((n) => `CM:${n}`),
  ];
  for (const k of keys) {
    if (!numToSeqs.has(k)) numToSeqs.set(k, []);
    numToSeqs.get(k)!.push(r.seq);
  }
}
for (const [_k, seqs] of numToSeqs) {
  for (let i = 1; i < seqs.length; i++) union(seqs[0], seqs[i]);
}

// Group by root
const threads = new Map<number, EmlMeta[]>();
for (const r of rows) {
  const root = find(r.seq);
  if (!threads.has(root)) threads.set(root, []);
  threads.get(root)!.push(r);
}

// Focus on threads that carry Sales Order or Invoice number
interface ThreadInfo {
  root: number;
  size: number;
  years: number[];
  salesOrderNos: string[];
  invoiceNos: string[];
  creditMemoNos: string[];
  subjectsSample: string[];
  pdfAttachmentCount: number;
  attachmentNamesSample: string[];
  fromDomains: string[];
  hasRevisedSubject: boolean;
  earliestDate: string | null;
  latestDate: string | null;
}
const threadInfos: ThreadInfo[] = [];
for (const [root, arr] of threads) {
  const soSet = new Set<string>();
  const invSet = new Set<string>();
  const cmSet = new Set<string>();
  const subjectsSample: string[] = [];
  const attNames: string[] = [];
  const fromDomains = new Set<string>();
  let pdfCount = 0;
  let hasRev = false;
  const years = new Set<number>();
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const r of arr) {
    const nums = extractDocNumbers(r.subject ?? '');
    nums.salesOrder.forEach((n) => soSet.add(n));
    nums.invoice.forEach((n) => invSet.add(n));
    nums.creditMemo.forEach((n) => cmSet.add(n));
    if (r.subject && subjectsSample.length < 6) subjectsSample.push(r.subject);
    if (r.subject && r.subject.toLowerCase().includes('revised')) hasRev = true;
    if (r.year) years.add(r.year);
    if (r.from_addr) fromDomains.add(r.from_addr.split('@')[1] ?? '');
    for (const a of r.attachments) {
      if (a.content_type === 'application/pdf' || a.safe_filename.toLowerCase().endsWith('.pdf')) {
        pdfCount++;
        if (attNames.length < 10) attNames.push(a.original_filename);
      }
    }
    if (r.received_at) {
      const d = new Date(r.received_at);
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    }
  }
  threadInfos.push({
    root,
    size: arr.length,
    years: Array.from(years).sort(),
    salesOrderNos: Array.from(soSet),
    invoiceNos: Array.from(invSet),
    creditMemoNos: Array.from(cmSet),
    subjectsSample,
    pdfAttachmentCount: pdfCount,
    attachmentNamesSample: attNames,
    fromDomains: Array.from(fromDomains),
    hasRevisedSubject: hasRev,
    earliestDate: earliest ? earliest.toISOString() : null,
    latestDate: latest ? latest.toISOString() : null,
  });
}

// Filter: threads that contain SalesOrder or Invoice numbers (business threads)
const bizThreads = threadInfos.filter(
  (t) => t.salesOrderNos.length > 0 || t.invoiceNos.length > 0 || t.creditMemoNos.length > 0,
);

// Revised threads
const revisedThreads = threadInfos.filter((t) => t.hasRevisedSubject);

// Multi-invoice threads: threads with multiple invoice numbers
const multiInvThreads = threadInfos.filter((t) => t.invoiceNos.length > 1);

// Threads with multiple message counts (potential revision cycles)
const multiMsgBizThreads = bizThreads.filter((t) => t.size >= 3).sort((a, b) => b.size - a.size);

// ---- 4. Attachment stats: PDF vs others ----
let totalAtt = 0, pdfAtt = 0;
const attTypes: Record<string, number> = {};
const attNameSamples: string[] = [];
const fedexKeywordCount: { fedex: number; awb: number; airwaybill: number; shipping: number; freight: number } = {
  fedex: 0, awb: 0, airwaybill: 0, shipping: 0, freight: 0,
};
const invoiceInFilename: number[] = [];
for (const r of rows) {
  for (const a of r.attachments) {
    totalAtt++;
    attTypes[a.content_type] = (attTypes[a.content_type] ?? 0) + 1;
    const nm = a.original_filename.toLowerCase();
    if (a.content_type === 'application/pdf' || nm.endsWith('.pdf')) pdfAtt++;
    if (nm.includes('fedex')) fedexKeywordCount.fedex++;
    if (nm.includes('awb')) fedexKeywordCount.awb++;
    if (nm.includes('airwaybill') || nm.includes('air waybill')) fedexKeywordCount.airwaybill++;
    if (nm.includes('shipping')) fedexKeywordCount.shipping++;
    if (nm.includes('freight')) fedexKeywordCount.freight++;
    const m = nm.match(/invoice[ _-]*(\d+)/);
    if (m) invoiceInFilename.push(Number(m[1]));
    if (attNameSamples.length < 60) attNameSamples.push(a.original_filename);
  }
}

// ---- 5. Pick 10-15 representative samples across years for PDF inspection ----
const samples: Array<{
  seq: number;
  year: number | null;
  subject: string | null;
  from: string | null;
  received_at: string | null;
  attachments: Array<{ name: string; rel_path: string; content_type: string; size: number | null }>;
}> = [];
const yearsWanted = [2022, 2023, 2024, 2025, 2026];
for (const y of yearsWanted) {
  const yr = rows.filter((r) => r.year === y && r.pdf_count > 0);
  // prefer subjects that look like invoice or sales order
  const preferred = yr.filter(
    (r) =>
      /invoice \d+|sales order \d+/i.test(r.subject ?? '') ||
      (r.attachments.some((a) => /invoice/i.test(a.original_filename))),
  );
  const pool = preferred.length >= 3 ? preferred : yr;
  const pick = pool.slice(0, 3);
  for (const p of pick) {
    samples.push({
      seq: p.seq,
      year: p.year,
      subject: p.subject,
      from: p.from,
      received_at: p.received_at,
      attachments: p.attachments.map((a) => ({
        name: a.original_filename,
        rel_path: a.rel_path,
        content_type: a.content_type,
        size: a.size,
      })),
    });
  }
}

const report = {
  total_eml: rows.length,
  subject_category_count: catCount,
  revised_subject_count: revisedRows.length,
  revised_subjects_sample: revisedSubjects,
  thread_count_total: threads.size,
  thread_count_business: bizThreads.length, // SO/INV/CM number 있는 스레드만
  thread_size_stats: {
    max: Math.max(...threadInfos.map((t) => t.size)),
    avg: threadInfos.length
      ? threadInfos.reduce((a, b) => a + b.size, 0) / threadInfos.length
      : 0,
  },
  multi_invoice_thread_count: multiInvThreads.length,
  multi_message_business_thread_count: multiMsgBizThreads.length,
  multi_message_business_thread_top10: multiMsgBizThreads.slice(0, 10),
  revised_thread_count: revisedThreads.length,
  revised_thread_sample: revisedThreads.slice(0, 8),
  attachments: {
    total: totalAtt,
    pdf: pdfAtt,
    content_type_dist: attTypes,
    fedex_keyword_count_in_filename: fedexKeywordCount,
    invoice_number_in_filename_count: invoiceInFilename.length,
    invoice_number_in_filename_sample: invoiceInFilename.slice(0, 20),
    attachment_name_samples: attNameSamples,
  },
  representative_samples: samples,
};

process.stdout.write(JSON.stringify(report, null, 2));
