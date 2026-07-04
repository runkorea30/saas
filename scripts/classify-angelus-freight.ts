/**
 * Phase 1.5 분류기 — invoices.jsonl 에서 인보이스 헤더와 라인아이템을 파싱해
 * '프레이트 인보이스' vs '제품 인보이스' 로 분류한 뒤, SO+SHIP DATE 기준 페어링 검증.
 *
 * ⚠️ DB 변경 없음.
 *
 * 사용법:
 *   npx tsx scripts/classify-angelus-freight.ts > scripts/_angelus_freight_temp/_classified.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const JSONL = path.join(REPO_ROOT, 'scripts', '_angelus_freight_temp', 'invoices.jsonl');

interface RawRow {
  sha256: string;
  filename_invoice_no: string;
  first_seen_seq: number;
  first_seen_date: string | null;
  first_seen_subject: string | null;
  first_seen_year: number | null;
  source_emails: Array<{ seq: number; date: string | null; subject: string | null }>;
  pdf_text: string;
}

const rows: RawRow[] = fs
  .readFileSync(JSONL, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l));

function parseInvoiceNo(text: string): string | null {
  const m = text.match(/INVOICE\s*#\s*(\d+)/);
  return m ? m[1] : null;
}

function parseInvoiceDate(text: string): string | null {
  // 인보이스 상단의 "DATE M/D/YYYY"
  const m = text.match(/\bDATE\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
  return m ? m[1] : null;
}

function normalizeDate(mdy: string | null): string | null {
  if (!mdy) return null;
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = String(m[1]).padStart(2, '0');
  const dd = String(m[2]).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

/**
 * "SALES ORDER    CUSTOMER PO    TERMS    SHIP DATE    SHIP VIA    FOB" 헤더 라인의
 * 다음 (또는 같은) 줄에 값이 있다. 값 라인에서 필드를 뽑는다.
 *
 * pdftotext -layout 출력 예:
 * SALES ORDER    CUSTOMER PO         TERMS   SHIP DATE                SHIP VIA  FOB
 *       67793                 WIRE TRANSFER   6/22/2026
 */
function parseHeaderTable(text: string): {
  sales_order: string | null;
  customer_po: string | null;
  terms: string | null;
  ship_date: string | null;
  ship_via: string | null;
  fob: string | null;
} {
  const empty = {
    sales_order: null,
    customer_po: null,
    terms: null,
    ship_date: null,
    ship_via: null,
    fob: null,
  };
  const idx = text.search(/SALES ORDER\s+CUSTOMER PO/);
  if (idx < 0) return empty;
  const after = text.slice(idx);
  const lines = after.split(/\r?\n/);
  // 첫 줄은 헤더, 두 번째 이후에서 값 라인을 찾음. 값 라인은 보통 sales order 숫자로 시작
  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    // 헤더 다음 첫 non-empty 라인이 값 라인
    // pdftotext -layout 이므로 컬럼 위치가 대체로 보존됨
    // 값 라인에서 date 는 M/D/YYYY, 나머지는 텍스트
    // 순서: sales_order  customer_po  terms  ship_date  ship_via  fob
    // 단순화: 공백 2개 이상으로 split
    const parts = l
      .split(/\s{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    // ship_date 추출 (M/D/YYYY)
    const shipDateM = l.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const shipDate = shipDateM ? shipDateM[1] : null;
    // sales order 는 첫 숫자 필드
    const soM = l.match(/^\s*(\d{4,7})\b/);
    const salesOrder = soM ? soM[1] : (parts[0] && /^\d+$/.test(parts[0]) ? parts[0] : null);
    // ship_via 는 SHIP DATE 다음 텍스트 (Federal Express / INTERPORT / scan shipping 등)
    let shipVia: string | null = null;
    if (shipDate) {
      const afterDateIdx = l.indexOf(shipDate) + shipDate.length;
      const rest = l.slice(afterDateIdx).trim();
      if (rest) shipVia = rest;
    }
    // terms
    const termsM = l.match(/(WIRE TRANSFER|WIRE|Net \d+|COD|Prepaid|WT)/i);
    const terms = termsM ? termsM[1] : null;
    // customer_po: sales_order 다음 필드 (AIR, ocean, air 등)
    let customerPo: string | null = null;
    if (parts.length >= 2 && parts[0] && parts[1] && parts[1].toLowerCase() !== (terms ?? '').toLowerCase()) {
      customerPo = parts[1];
    }
    return {
      sales_order: salesOrder,
      customer_po: customerPo,
      terms,
      ship_date: shipDate,
      ship_via: shipVia,
      fob: null,
    };
  }
  return empty;
}

function parseTotal(text: string): number | null {
  // 인보이스 총액은 "Total" 라벨 근처의 마지막 금액. 두 가지 포맷:
  //   (신) "$7,442.32"    - 달러 기호 있음
  //   (구) "  6,026.58"   - 달러 기호 없이 숫자만
  // 전략: 텍스트 전체에서 마지막 등장하는 $금액 우선. 없으면 마지막 등장 X,XXX.XX (콤마+2자리) 형태.
  const dollarMatches = Array.from(text.matchAll(/\$([\d,]+\.\d{2})/g));
  if (dollarMatches.length > 0) {
    return parseFloat(dollarMatches[dollarMatches.length - 1][1].replace(/,/g, ''));
  }
  // Fallback: Total 라벨 직전 마지막 amount. 라벨 위치 기준으로 앞 방향 스캔.
  const totalIdx = text.lastIndexOf('Total');
  const searchArea = totalIdx > 0 ? text.slice(0, totalIdx) : text;
  const amountMatches = Array.from(searchArea.matchAll(/\b([\d]{1,3}(?:,[\d]{3})*\.\d{2})\b/g));
  if (amountMatches.length === 0) return null;
  // 마지막에 등장하는 금액을 grand total 로 간주
  const last = amountMatches[amountMatches.length - 1][1].replace(/,/g, '');
  return parseFloat(last);
}

/**
 * 라인아이템의 ITEM CODE 컬럼을 추출. 연도별로 컬럼 순서가 다름:
 *   - 2018~2024 (구): QTY_SHPD  QTY_BO  U/M  ITEM_CODE  DESC  PRICE  AMOUNT
 *     예) "10  0             DZ 605-04-000   High Gloss Acrylic Finisher..."
 *   - 2025+ (신)    : QTY_SHPD  U/M  QTY_BO  ITEM_CODE  DESC  PRICE  AMOUNT
 *     예) "48         DZ      0         720-01-001 Leather Paint Black..."
 *   - Freight 인보이스 (양쪽 layout 공통): "1  Freight  Air Freight federal express..."
 *
 * 규칙:
 *  - 라인이 숫자(QTY_SHPD)로 시작해야 라인아이템 후보.
 *  - Freight 라인은 "Freight" 뒤에 "Air|Ocean|International|Ground|Sea|Truck ... Freight" 서술 존재.
 *  - 제품 라인은 [0-9]{3,4}[A-Z]?-[0-9A-Z]+-[0-9A-Z]+ 형태의 ITEM CODE.
 */
const PRODUCT_CODE_RE = /\b([0-9]{3,4}[A-Z]?-[0-9A-Z]+-[0-9A-Z]+)\b/;
// Freight 인보이스는 라인아이템 서술이 다양함:
//  - "1  Freight  Air Freight federal express  418.57"
//  - "1  Freight for invoice 81252 with Fed Ex  267.25"
//  - "1  Freight for invoice 80682  441.17"
// 공통: QTY 로 시작 + Freight 단어 포함 + 제품코드 없음 + $ 가격 있음.
const FREIGHT_WORD_RE = /\bFreight\b/i;
const PRICE_RE = /\d+\.\d{2}/;

function parseLineItems(text: string): {
  item_codes: string[];
  freight_line_count: number;
  freight_for_invoice: string | null;
} {
  const item_codes: string[] = [];
  let freight_line_count = 0;
  const lines = text.split(/\r?\n/);
  for (const l of lines) {
    if (!/^\s*\d+\s/.test(l)) continue; // QTY_SHPD 로 시작해야 라인아이템
    const pm = l.match(PRODUCT_CODE_RE);
    if (pm) {
      item_codes.push(pm[1]);
      continue;
    }
    // 제품코드 없고 Freight 단어 있고 가격 있으면 Freight 라인
    if (FREIGHT_WORD_RE.test(l) && PRICE_RE.test(l)) {
      item_codes.push('Freight');
      freight_line_count++;
    }
  }
  // Freight 인보이스에서 "for invoice NNNN" 참조 추출 (라인아이템 서술 or 이어지는 줄)
  const forInvM = text.match(/Freight\b[^\n]{0,80}\bfor\s+invoice\s+(\d+)/i);
  const freight_for_invoice = forInvM ? forInvM[1] : null;
  return { item_codes, freight_line_count, freight_for_invoice };
}

interface ClassifiedRow {
  sha256: string;
  invoice_no: string;
  invoice_date: string | null; // YYYY-MM-DD
  sales_order: string | null;
  customer_po: string | null;
  terms: string | null;
  ship_date: string | null; // YYYY-MM-DD
  ship_via: string | null;
  total_amount: number | null;
  item_codes: string[];
  line_item_count: number;
  freight_line_count: number;
  freight_for_invoice: string | null; // Freight 인보이스가 참조하는 제품 인보이스 #
  is_freight_invoice: boolean;
  category: 'freight' | 'product' | 'mixed' | 'unknown';
  first_seen_date: string | null;
  first_seen_year: number | null;
  filename_invoice_no: string;
  source_email_count: number;
}

const classified: ClassifiedRow[] = rows.map((r) => {
  const text = r.pdf_text;
  const invoice_no = parseInvoiceNo(text) ?? r.filename_invoice_no;
  const invoice_date = normalizeDate(parseInvoiceDate(text));
  const header = parseHeaderTable(text);
  const ship_date = normalizeDate(header.ship_date);
  const total_amount = parseTotal(text);
  const li = parseLineItems(text);
  const isFreight = li.freight_line_count > 0 && li.freight_line_count === li.item_codes.length;
  const category: ClassifiedRow['category'] =
    li.item_codes.length === 0
      ? 'unknown'
      : isFreight
        ? 'freight'
        : li.freight_line_count > 0
          ? 'mixed'
          : 'product';
  return {
    sha256: r.sha256,
    invoice_no,
    invoice_date,
    sales_order: header.sales_order,
    customer_po: header.customer_po,
    terms: header.terms,
    ship_date,
    ship_via: header.ship_via,
    total_amount,
    item_codes: li.item_codes.slice(0, 5),
    line_item_count: li.item_codes.length,
    freight_line_count: li.freight_line_count,
    freight_for_invoice: li.freight_for_invoice,
    is_freight_invoice: isFreight,
    category,
    first_seen_date: r.first_seen_date,
    first_seen_year: r.first_seen_year,
    filename_invoice_no: r.filename_invoice_no,
    source_email_count: r.source_emails.length,
  };
});

// ---- 페어링 검증: Freight 인보이스의 "for invoice N" 참조를 1차 키로 사용 ----
// 관찰: Freight 인보이스는 별도 SO 번호를 갖고, DESCRIPTION 에 "Freight for invoice N" 형태로
//       제품 인보이스 번호를 참조하는 케이스가 다수. SO 번호는 페어링 키가 아님.
// 페어링 우선순위:
//   1. 참조 매칭: freight.freight_for_invoice === product.invoice_no
//   2. Fallback: SHIP DATE 동일 + 인보이스 번호 인접(±5)
//   3. 그 외: 단독으로 분류
const productByInv = new Map<string, ClassifiedRow>();
for (const c of classified) {
  if (c.category === 'product') productByInv.set(c.invoice_no, c);
}
const freightRows = classified.filter((c) => c.category === 'freight');
const productRows = classified.filter((c) => c.category === 'product');

interface Pair {
  product: ClassifiedRow;
  freight: ClassifiedRow;
  pairing_method: 'invoice_ref' | 'ship_date_proximity' | 'invoice_number_proximity';
  ship_date_match: boolean | null;
}

const pairs: Pair[] = [];
const usedProductInv = new Set<string>();
const usedFreightInv = new Set<string>();

// 1차: freight_for_invoice 로 매칭
for (const f of freightRows) {
  if (!f.freight_for_invoice) continue;
  const p = productByInv.get(f.freight_for_invoice);
  if (!p || usedProductInv.has(p.invoice_no)) continue;
  usedProductInv.add(p.invoice_no);
  usedFreightInv.add(f.invoice_no);
  const shipMatch = p.ship_date && f.ship_date ? p.ship_date === f.ship_date : null;
  pairs.push({ product: p, freight: f, pairing_method: 'invoice_ref', ship_date_match: shipMatch });
}

// 2차: 남은 freight 는 SHIP DATE 근접 + 인보이스 번호 근접도로 매칭 (invoice_ref 없을 때)
function dayDiff(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs((da - db) / (1000 * 60 * 60 * 24));
}

const remainingFreight = freightRows.filter((f) => !usedFreightInv.has(f.invoice_no));

for (const f of remainingFreight) {
  const fInvNum = parseInt(f.invoice_no, 10);
  // 후보: 미사용 product 중 invoice # ±15 이내
  const candidates = productRows
    .filter((p) => !usedProductInv.has(p.invoice_no))
    .map((p) => {
      const invDiff = Math.abs(parseInt(p.invoice_no, 10) - fInvNum);
      const dateDiff = p.ship_date && f.ship_date ? dayDiff(p.ship_date, f.ship_date) : 999;
      return { p, invDiff, dateDiff };
    })
    .filter((x) => x.invDiff <= 15 && x.dateDiff <= 7)
    // 점수: 인보이스 번호 근접 + 날짜 근접 종합
    .sort((a, b) => a.invDiff + a.dateDiff * 2 - (b.invDiff + b.dateDiff * 2));
  const best = candidates[0];
  if (best) {
    usedProductInv.add(best.p.invoice_no);
    usedFreightInv.add(f.invoice_no);
    const shipMatch = best.p.ship_date === f.ship_date;
    pairs.push({
      product: best.p,
      freight: f,
      pairing_method: shipMatch ? 'ship_date_proximity' : 'invoice_number_proximity',
      ship_date_match: shipMatch,
    });
  }
}

const unpairedFreight = freightRows.filter((f) => !usedFreightInv.has(f.invoice_no));
const unpairedProduct = productRows.filter((p) => !usedProductInv.has(p.invoice_no));

const pairsShipMatch = pairs.filter((p) => p.ship_date_match === true).length;
const pairsShipMismatch = pairs.filter((p) => p.ship_date_match === false).length;
const pairsShipNull = pairs.filter((p) => p.ship_date_match === null).length;

// SO 없이 분류된 인보이스 (SO 파싱 실패)
const noSo = classified.filter((c) => !c.sales_order);

// 연도별 재분류
const yearly = new Map<number, { freight: number; product: number; mixed: number; unknown: number }>();
for (const c of classified) {
  const y = c.first_seen_year ?? 0;
  if (!yearly.has(y)) yearly.set(y, { freight: 0, product: 0, mixed: 0, unknown: 0 });
  yearly.get(y)![c.category]++;
}
const yearlyArr = Array.from(yearly.entries())
  .sort((a, b) => a[0] - b[0])
  .map(([y, s]) => ({ year: y, ...s }));

// 페어링 방법 분포
const methodCount: Record<string, number> = {};
for (const p of pairs) methodCount[p.pairing_method] = (methodCount[p.pairing_method] ?? 0) + 1;

const report = {
  total_invoices: classified.length,
  by_category: {
    freight: classified.filter((c) => c.category === 'freight').length,
    product: classified.filter((c) => c.category === 'product').length,
    mixed: classified.filter((c) => c.category === 'mixed').length,
    unknown: classified.filter((c) => c.category === 'unknown').length,
  },
  yearly_array: yearlyArr,
  no_sales_order: noSo.length,
  no_sales_order_samples: noSo.slice(0, 5).map((c) => ({
    invoice_no: c.invoice_no,
    category: c.category,
  })),
  pairing: {
    total_pairs: pairs.length,
    by_method: methodCount,
    ship_date_match: pairsShipMatch,
    ship_date_mismatch: pairsShipMismatch,
    ship_date_unknown: pairsShipNull,
    unpaired_freight: unpairedFreight.length,
    unpaired_product: unpairedProduct.length,
    unpaired_freight_details: unpairedFreight.map((f) => ({
      invoice_no: f.invoice_no,
      year: f.first_seen_year,
      sales_order: f.sales_order,
      ship_date: f.ship_date,
      ship_via: f.ship_via,
      total: f.total_amount,
      freight_for_invoice: f.freight_for_invoice,
    })),
    unpaired_product_details: unpairedProduct.map((p) => ({
      invoice_no: p.invoice_no,
      year: p.first_seen_year,
      sales_order: p.sales_order,
      ship_date: p.ship_date,
      ship_via: p.ship_via,
      total: p.total_amount,
    })),
    ship_date_mismatch_pairs: pairs
      .filter((p) => p.ship_date_match === false)
      .map((p) => ({
        product_invoice: p.product.invoice_no,
        product_ship_date: p.product.ship_date,
        freight_invoice: p.freight.invoice_no,
        freight_ship_date: p.freight.ship_date,
        method: p.pairing_method,
      })),
  },
  all_classified: classified,
};

process.stdout.write(JSON.stringify(report, null, 2));
