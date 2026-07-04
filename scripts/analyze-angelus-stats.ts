/**
 * Phase 1 최종 통계 — 연도별 인보이스/SO 카운트, 리비전 통계.
 * DB 변경 없음.
 *
 * 사용법:
 *   npx tsx scripts/analyze-angelus-stats.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const META = path.join(REPO_ROOT, 'scripts', '_angelus_analysis_temp', 'metadata.jsonl');

interface AttMeta {
  original_filename: string;
  content_type: string;
  size: number | null;
}
interface EmlMeta {
  seq: number;
  subject: string | null;
  from: string | null;
  received_at: string | null;
  year: number | null;
  attachments: AttMeta[];
  pdf_count: number;
}

const rows: EmlMeta[] = fs
  .readFileSync(META, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l));

// 파일명에서 Invoice / SalesOrd 번호 추출
function extractFileNos(fname: string): { inv: string | null; so: string | null } {
  const invM = fname.match(/Inv_(\d+)_from_Angelus/);
  const soM = fname.match(/SalesOrd_(\d+)_from_Angelus/);
  return { inv: invM ? invM[1] : null, so: soM ? soM[1] : null };
}

// 연도별 통계
interface YearStat {
  year: number;
  eml_count: number;
  eml_with_invoice_pdf: number;
  eml_with_salesord_pdf: number;
  unique_invoice_nos: Set<string>;
  unique_so_nos: Set<string>;
  invoice_pdf_file_count: number;
  salesord_pdf_file_count: number;
}
const yearStats = new Map<number, YearStat>();
function ys(y: number): YearStat {
  if (!yearStats.has(y)) {
    yearStats.set(y, {
      year: y,
      eml_count: 0,
      eml_with_invoice_pdf: 0,
      eml_with_salesord_pdf: 0,
      unique_invoice_nos: new Set(),
      unique_so_nos: new Set(),
      invoice_pdf_file_count: 0,
      salesord_pdf_file_count: 0,
    });
  }
  return yearStats.get(y)!;
}

// 인보이스별 리비전 카운트 (같은 invoice 번호 파일이 여러 사이즈로 등장하는 경우)
const invSizes = new Map<string, Set<number>>();
// SO별 리비전 카운트 (같은 SO 파일이 여러 사이즈로 등장)
const soSizes = new Map<string, Set<number>>();

for (const r of rows) {
  const y = r.year;
  if (y != null) ys(y).eml_count++;

  let hasInv = false, hasSo = false;
  for (const a of r.attachments) {
    if (!(a.content_type === 'application/pdf' || a.original_filename.toLowerCase().endsWith('.pdf'))) continue;
    const { inv, so } = extractFileNos(a.original_filename);
    if (inv) {
      hasInv = true;
      if (y != null) {
        ys(y).unique_invoice_nos.add(inv);
        ys(y).invoice_pdf_file_count++;
      }
      if (!invSizes.has(inv)) invSizes.set(inv, new Set());
      if (a.size) invSizes.get(inv)!.add(a.size);
    }
    if (so) {
      hasSo = true;
      if (y != null) {
        ys(y).unique_so_nos.add(so);
        ys(y).salesord_pdf_file_count++;
      }
      if (!soSizes.has(so)) soSizes.set(so, new Set());
      if (a.size) soSizes.get(so)!.add(a.size);
    }
  }
  if (y != null && hasInv) ys(y).eml_with_invoice_pdf++;
  if (y != null && hasSo) ys(y).eml_with_salesord_pdf++;
}

// 리비전 있는 인보이스/SO
const invWithRev = Array.from(invSizes.entries()).filter(([_, s]) => s.size > 1);
const soWithRev = Array.from(soSizes.entries()).filter(([_, s]) => s.size > 1);

// 최대 리비전 수
const maxInvRevs = Math.max(0, ...Array.from(invSizes.values()).map((s) => s.size));
const maxSoRevs = Math.max(0, ...Array.from(soSizes.values()).map((s) => s.size));

// 연도별 요약 (2022~2026)
const yearReport = Array.from(yearStats.values())
  .filter((s) => s.year >= 2022 && s.year <= 2026)
  .sort((a, b) => a.year - b.year)
  .map((s) => ({
    year: s.year,
    eml_count: s.eml_count,
    eml_with_invoice_pdf: s.eml_with_invoice_pdf,
    eml_with_salesord_pdf: s.eml_with_salesord_pdf,
    unique_invoices: s.unique_invoice_nos.size,
    unique_sales_orders: s.unique_so_nos.size,
    invoice_pdf_files: s.invoice_pdf_file_count,
    salesord_pdf_files: s.salesord_pdf_file_count,
  }));

// 전체 (2022~2026)
const total = yearReport.reduce(
  (acc, y) => {
    acc.eml_count += y.eml_count;
    acc.eml_with_invoice_pdf += y.eml_with_invoice_pdf;
    acc.eml_with_salesord_pdf += y.eml_with_salesord_pdf;
    acc.unique_invoices += y.unique_invoices;
    acc.unique_sales_orders += y.unique_sales_orders;
    acc.invoice_pdf_files += y.invoice_pdf_files;
    acc.salesord_pdf_files += y.salesord_pdf_files;
    return acc;
  },
  {
    eml_count: 0,
    eml_with_invoice_pdf: 0,
    eml_with_salesord_pdf: 0,
    unique_invoices: 0,
    unique_sales_orders: 0,
    invoice_pdf_files: 0,
    salesord_pdf_files: 0,
  },
);

// SO 6건 뽑아서 리비전 개수 top10
const soRevTop = Array.from(soSizes.entries())
  .filter(([_, s]) => s.size > 1)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 10)
  .map(([so, s]) => ({ sales_order: so, revision_count: s.size, file_sizes: Array.from(s) }));

console.log(JSON.stringify({
  target_period: '2022-2026',
  yearly: yearReport,
  total_2022_2026: total,
  revision: {
    invoice_with_multiple_sizes: invWithRev.length,
    max_invoice_revisions: maxInvRevs,
    sales_order_with_multiple_sizes: soWithRev.length,
    max_sales_order_revisions: maxSoRevs,
    sales_order_revision_top10: soRevTop,
  },
}, null, 2));
