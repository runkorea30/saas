/**
 * Phase 2 Dry-run — Phase 1.5 분류 결과를 document_files 스키마로 매핑하고
 * INSERT 예정 레코드를 JSON 파일로 산출. DB 인서트 없음.
 *
 * 사용법:
 *   npx tsx scripts/angelus-phase2-dryrun.ts
 *
 * 산출:
 *   scripts/_angelus_freight_temp/_dryrun.json   — INSERT 예정 118건 (배열)
 *   scripts/_angelus_freight_temp/_dryrun_report.json — 검증 리포트
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(REPO_ROOT, 'scripts', '_angelus_freight_temp');
const CLASSIFIED = path.join(TEMP_DIR, '_classified.json');
const INVOICES_JSONL = path.join(TEMP_DIR, 'invoices.jsonl');
const OUT_RECORDS = path.join(TEMP_DIR, '_dryrun.json');
const OUT_REPORT = path.join(TEMP_DIR, '_dryrun_report.json');

const COMPANY_ID = '9e13f035-ed4f-4a41-9043-6a585beab221';

interface ClassifiedRow {
  sha256: string;
  invoice_no: string;
  invoice_date: string | null;
  sales_order: string | null;
  customer_po: string | null;
  terms: string | null;
  ship_date: string | null;
  ship_via: string | null;
  total_amount: number | null;
  item_codes: string[];
  line_item_count: number;
  freight_line_count: number;
  freight_for_invoice: string | null;
  is_freight_invoice: boolean;
  category: 'freight' | 'product' | 'mixed' | 'unknown';
  first_seen_date: string | null;
  first_seen_year: number | null;
  filename_invoice_no: string;
  source_email_count: number;
}
interface Pair {
  product: ClassifiedRow;
  freight: ClassifiedRow;
  pairing_method: 'invoice_ref' | 'ship_date_proximity' | 'invoice_number_proximity';
  ship_date_match: boolean | null;
}
interface Classified {
  total_invoices: number;
  all_classified: ClassifiedRow[];
  pairing: {
    total_pairs: number;
    by_method: Record<string, number>;
    ship_date_match: number;
    ship_date_mismatch: number;
    unpaired_freight: number;
    unpaired_product: number;
    unpaired_freight_details: Array<{ invoice_no: string }>;
    unpaired_product_details: Array<{ invoice_no: string }>;
    ship_date_mismatch_pairs: Array<{
      product_invoice: string;
      product_ship_date: string | null;
      freight_invoice: string | null;
      freight_ship_date: string | null;
      method: string;
    }>;
  };
}
interface InvoiceExtract {
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

const classified: Classified = JSON.parse(fs.readFileSync(CLASSIFIED, 'utf8'));
const extractsBySha = new Map<string, InvoiceExtract>();
for (const line of fs.readFileSync(INVOICES_JSONL, 'utf8').split(/\r?\n/).filter(Boolean)) {
  const r = JSON.parse(line) as InvoiceExtract;
  extractsBySha.set(r.sha256, r);
}

// 페어링 다시 계산 (classify 스크립트와 동일한 로직)
function dayDiff(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}
const rows = classified.all_classified;
const productByInv = new Map<string, ClassifiedRow>();
for (const c of rows) if (c.category === 'product') productByInv.set(c.invoice_no, c);
const freightRows = rows.filter((c) => c.category === 'freight');
const productRows = rows.filter((c) => c.category === 'product');
const pairs: Pair[] = [];
const usedProduct = new Set<string>();
const usedFreight = new Set<string>();
// 1차: invoice_ref
for (const f of freightRows) {
  if (!f.freight_for_invoice) continue;
  const p = productByInv.get(f.freight_for_invoice);
  if (!p || usedProduct.has(p.invoice_no)) continue;
  usedProduct.add(p.invoice_no);
  usedFreight.add(f.invoice_no);
  const shipMatch = p.ship_date && f.ship_date ? p.ship_date === f.ship_date : null;
  pairs.push({ product: p, freight: f, pairing_method: 'invoice_ref', ship_date_match: shipMatch });
}
// 2차: ship_date + invoice # proximity
for (const f of freightRows) {
  if (usedFreight.has(f.invoice_no)) continue;
  const fInvNum = parseInt(f.invoice_no, 10);
  const cands = productRows
    .filter((p) => !usedProduct.has(p.invoice_no))
    .map((p) => ({
      p,
      invDiff: Math.abs(parseInt(p.invoice_no, 10) - fInvNum),
      dateDiff: p.ship_date && f.ship_date ? dayDiff(p.ship_date, f.ship_date) : 999,
    }))
    .filter((x) => x.invDiff <= 15 && x.dateDiff <= 7)
    .sort((a, b) => a.invDiff + a.dateDiff * 2 - (b.invDiff + b.dateDiff * 2));
  const best = cands[0];
  if (best) {
    usedProduct.add(best.p.invoice_no);
    usedFreight.add(f.invoice_no);
    const shipMatch = best.p.ship_date === f.ship_date;
    pairs.push({
      product: best.p,
      freight: f,
      pairing_method: shipMatch ? 'ship_date_proximity' : 'invoice_number_proximity',
      ship_date_match: shipMatch,
    });
  }
}

// 페어링 방법 → confidence & method 매핑
function pairingMeta(method: Pair['pairing_method']): {
  paired_invoice_no_key: 'reference' | 'ship_date_exact' | 'ship_date_proximity';
  pairing_confidence: 'high' | 'medium';
} {
  if (method === 'invoice_ref') return { paired_invoice_no_key: 'reference', pairing_confidence: 'high' };
  if (method === 'ship_date_proximity')
    return { paired_invoice_no_key: 'ship_date_exact', pairing_confidence: 'high' };
  return { paired_invoice_no_key: 'ship_date_proximity', pairing_confidence: 'medium' };
}

// invoice_no → 페어 정보 조회 맵
const pairInfoByInvoice = new Map<string, {
  paired_invoice_no: string;
  pairing_method: string;
  pairing_confidence: string;
}>();
for (const p of pairs) {
  const meta = pairingMeta(p.pairing_method);
  const groupId = p.product.invoice_no; // 페어 그룹 ID = product invoice #
  pairInfoByInvoice.set(p.product.invoice_no, {
    paired_invoice_no: p.freight.invoice_no,
    pairing_method: meta.paired_invoice_no_key,
    pairing_confidence: meta.pairing_confidence,
  });
  pairInfoByInvoice.set(p.freight.invoice_no, {
    paired_invoice_no: p.product.invoice_no,
    pairing_method: meta.paired_invoice_no_key,
    pairing_confidence: meta.pairing_confidence,
  });
  // group id 저장은 아래 매핑에서 처리 (related_po_reference = product.invoice_no)
}

// 중복 invoice # (SHA distinct) 처리: invoice_no 별로 최신 first_seen_date 선택
const bestByInvoice = new Map<string, ClassifiedRow>();
for (const c of rows) {
  const cur = bestByInvoice.get(c.invoice_no);
  if (!cur) {
    bestByInvoice.set(c.invoice_no, c);
    continue;
  }
  const curT = cur.first_seen_date ? new Date(cur.first_seen_date).getTime() : 0;
  const newT = c.first_seen_date ? new Date(c.first_seen_date).getTime() : 0;
  if (newT > curT) bestByInvoice.set(c.invoice_no, c);
}

function normalizeTransportType(shipVia: string | null, customerPo: string | null): string | null {
  const v = ((shipVia ?? '') + ' ' + (customerPo ?? '')).toLowerCase();
  if (/interport|ocean|sea/.test(v)) return 'ocean';
  if (/federal|fedex|air|scan\s*shipping|ups|dhl/.test(v)) return 'air';
  return null;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120);
}

interface DryRunRecord {
  invoice_no: string;
  sha256: string;
  local_pdf_path: string; // 실제 파일 위치 (Storage 업로드 소스)
  // ---- document_files 컬럼 ----
  company_id: string;
  category: 'angelus_invoice';
  source: 'historical_import';
  file_name: string;
  file_path: string; // Storage 경로
  mime_type: 'application/pdf';
  doc_subtype: 'product' | 'freight';
  subtype_confirmed: boolean;
  email_message_id: string | null;
  email_from: string | null;
  email_received_at: string | null;
  extracted_doc_no: string;
  extracted_doc_date: string | null;
  related_po_reference: string | null; // 페어 그룹 ID = product invoice #
  extracted_metadata: Record<string, unknown>;
  // ---- 검증용 부가 필드 (INSERT 시 사용 안 함) ----
  _validation: {
    ship_date_present: boolean;
    invoice_date_present: boolean;
    total_present: boolean;
    paired: boolean;
    pairing_method: string | null;
  };
}

const records: DryRunRecord[] = [];
for (const c of bestByInvoice.values()) {
  const ext = extractsBySha.get(c.sha256);
  if (!ext) {
    throw new Error(`extract not found for sha ${c.sha256}`);
  }
  const shaShort = c.sha256.slice(0, 16);
  const safe = safeFileName(ext.original_filename || `Inv_${c.invoice_no}.pdf`);
  const storagePath = `historical-import/${COMPANY_ID}/${shaShort}/${safe}`;
  const localPath = `scripts/_angelus_freight_temp/pdfs/${shaShort}.pdf`;
  // 페어 그룹 ID: product 인보이스면 자기 invoice_no, freight 인보이스면 페어 product invoice_no
  let relatedRef: string | null = null;
  const pairInfo = pairInfoByInvoice.get(c.invoice_no);
  if (pairInfo) {
    relatedRef = c.category === 'product' ? c.invoice_no : pairInfo.paired_invoice_no;
  }
  const transportType = normalizeTransportType(c.ship_via, c.customer_po);
  const metadata: Record<string, unknown> = {
    invoice_no: c.invoice_no,
    sales_order_no: c.sales_order,
    ship_date: c.ship_date,
    ship_via: c.ship_via,
    transport_type: transportType,
    total_usd: c.total_amount,
    doc_subtype: c.category,
    paired_invoice_no: pairInfo ? pairInfo.paired_invoice_no : null,
    pairing_method: pairInfo ? pairInfo.pairing_method : null,
    pairing_confidence: pairInfo ? pairInfo.pairing_confidence : null,
  };
  // document_files.email_message_id UNIQUE 제약 우회:
  // 하나의 이메일에 product + freight PDF 가 함께 첨부되는 케이스가 40건 있음.
  // FedEx 이력적재 방식과 동일하게 messageId#{invoice_no} 로 disambiguation.
  const uniqueEmailKey = ext.first_seen_message_id
    ? `${ext.first_seen_message_id}#${c.invoice_no}`
    : null;
  const rec: DryRunRecord = {
    invoice_no: c.invoice_no,
    sha256: c.sha256,
    local_pdf_path: localPath,
    company_id: COMPANY_ID,
    category: 'angelus_invoice',
    source: 'historical_import',
    file_name: ext.original_filename,
    file_path: storagePath,
    mime_type: 'application/pdf',
    doc_subtype: c.category === 'freight' ? 'freight' : 'product',
    subtype_confirmed: false,
    email_message_id: uniqueEmailKey,
    email_from: ext.first_seen_from,
    email_received_at: ext.first_seen_date,
    extracted_doc_no: c.invoice_no,
    extracted_doc_date: c.invoice_date, // YYYY-MM-DD
    related_po_reference: relatedRef,
    extracted_metadata: metadata,
    _validation: {
      ship_date_present: c.ship_date != null,
      invoice_date_present: c.invoice_date != null,
      total_present: c.total_amount != null,
      paired: pairInfo != null,
      pairing_method: pairInfo ? pairInfo.pairing_method : null,
    },
  };
  records.push(rec);
}

// ---- 검증 리포트 ----
const productCount = records.filter((r) => r.doc_subtype === 'product').length;
const freightCount = records.filter((r) => r.doc_subtype === 'freight').length;
const pairedCount = records.filter((r) => r.related_po_reference != null).length;
const unpaired = records.filter((r) => r.related_po_reference == null);

// 페어 그룹 검증: same related_po_reference → 정확히 2건이면 pair, 1건이면 나머지 없음
const groups = new Map<string, DryRunRecord[]>();
for (const r of records) {
  if (r.related_po_reference == null) continue;
  const key = r.related_po_reference;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(r);
}
const groupSizes: Record<number, number> = {};
for (const arr of groups.values()) {
  const s = arr.length;
  groupSizes[s] = (groupSizes[s] ?? 0) + 1;
}

// 샘플 10건: pair 그룹의 양쪽 레코드가 같은 related_po_reference 를 갖는지 확인
const groupSamples: Array<{
  ref: string;
  members: Array<{ invoice_no: string; doc_subtype: string; ship_date: string | null }>;
}> = [];
for (const [ref, arr] of groups) {
  if (groupSamples.length >= 10) break;
  groupSamples.push({
    ref,
    members: arr.map((r) => ({
      invoice_no: r.invoice_no,
      doc_subtype: r.doc_subtype,
      ship_date: r.extracted_metadata.ship_date as string | null,
    })),
  });
}

// 날짜/금액 파싱 실패 케이스
const shipDateMissing = records.filter((r) => !r._validation.ship_date_present);
const invoiceDateMissing = records.filter((r) => !r._validation.invoice_date_present);
const totalMissing = records.filter((r) => !r._validation.total_present);

const report = {
  target_count: records.length,
  by_subtype: { product: productCount, freight: freightCount },
  paired_count: pairedCount,
  unpaired_count: unpaired.length,
  unpaired_list: unpaired.map((r) => ({
    invoice_no: r.invoice_no,
    doc_subtype: r.doc_subtype,
    ship_date: r.extracted_metadata.ship_date,
    total_usd: r.extracted_metadata.total_usd,
    file_name: r.file_name,
  })),
  group_size_distribution: groupSizes,
  group_samples: groupSamples,
  date_parsing: {
    ship_date_missing: shipDateMissing.length,
    ship_date_missing_invoice_nos: shipDateMissing.map((r) => r.invoice_no),
    invoice_date_missing: invoiceDateMissing.length,
    invoice_date_missing_invoice_nos: invoiceDateMissing.map((r) => r.invoice_no),
  },
  amount_parsing: {
    total_missing: totalMissing.length,
    total_missing_invoice_nos: totalMissing.map((r) => r.invoice_no),
  },
  ship_date_mismatch_pairs: classified.pairing.ship_date_mismatch_pairs,
};

fs.writeFileSync(OUT_RECORDS, JSON.stringify(records, null, 2), 'utf8');
fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');

console.log('=== Dry-run 결과 ===');
console.log(`INSERT 예정 레코드: ${records.length}`);
console.log(`  product: ${productCount} / freight: ${freightCount}`);
console.log(`  paired: ${pairedCount} / unpaired: ${unpaired.length}`);
console.log(`페어 그룹 크기 분포: ${JSON.stringify(groupSizes)}`);
console.log(`날짜 파싱 실패: ship_date=${shipDateMissing.length}, invoice_date=${invoiceDateMissing.length}`);
console.log(`금액 파싱 실패: total=${totalMissing.length}`);
console.log(`records: ${path.relative(REPO_ROOT, OUT_RECORDS)}`);
console.log(`report : ${path.relative(REPO_ROOT, OUT_REPORT)}`);
