/**
 * Phase B — 48건 신고서 추출 결과와 Angelus 인보이스 매칭 + 신고운임 vs 실운임 비교.
 * DB 변경 없음.
 *
 * 산출: outputs/phaseB_report.xlsx + scripts/_phaseB_temp/_compare.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

const EXTRACTIONS = path.join(REPO_ROOT, 'scripts', '_phaseB_temp', '_all_extractions.json');
const OUT_JSON = path.join(REPO_ROOT, 'scripts', '_phaseB_temp', '_compare.json');
const OUT_XLSX_DIR = path.join(REPO_ROOT, 'outputs');
const OUT_XLSX = path.join(OUT_XLSX_DIR, 'phaseB_declaration_freight_report.xlsx');
fs.mkdirSync(OUT_XLSX_DIR, { recursive: true });

interface Decl {
  doc_no: string;
  declaration_date: string;
  arrival_date: string | null;
  awb_hawb: string;
  trader: string;
  payment_terms_code: string;
  payment_amount_usd: number;
  total_dutiable_value_usd: number;
  total_dutiable_value_krw: number;
  freight_krw: number | null;
  exchange_rate: number;
  gross_weight_kg: number;
  vat_amount_krw: number;
  special_notes: string | null;
}
interface AngelusProduct {
  invoice_no: string;
  total_usd: number | null;
  ship_date: string | null;
  paired_invoice_no: string | null;
  paired_freight_total_usd: number | null;
  paired_freight_ship_date: string | null;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('env 필요');
  const supabase = createClient(url, key, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load extractions
  const decls: Decl[] = JSON.parse(fs.readFileSync(EXTRACTIONS, 'utf8'));
  console.log(`총 신고서: ${decls.length}`); // eslint-disable-line no-console

  // Load Angelus product invoices with paired freight
  const { data: products } = await supabase
    .from('document_files')
    .select('extracted_doc_no, extracted_metadata, related_po_reference')
    .eq('category', 'angelus_invoice')
    .eq('source', 'historical_import')
    .eq('doc_subtype', 'product');
  const { data: freights } = await supabase
    .from('document_files')
    .select('extracted_doc_no, extracted_metadata, related_po_reference')
    .eq('category', 'angelus_invoice')
    .eq('source', 'historical_import')
    .eq('doc_subtype', 'freight');
  const freightByRef = new Map<string, { invoice_no: string; total_usd: number | null; ship_date: string | null }>();
  for (const f of freights ?? []) {
    if (!f.related_po_reference) continue;
    const meta = f.extracted_metadata as Record<string, unknown>;
    freightByRef.set(f.related_po_reference as string, {
      invoice_no: f.extracted_doc_no as string,
      total_usd: (meta?.total_usd as number) ?? null,
      ship_date: (meta?.ship_date as string) ?? null,
    });
  }
  const productList: AngelusProduct[] = (products ?? []).map((p) => {
    const meta = p.extracted_metadata as Record<string, unknown>;
    const pairInvKey = p.related_po_reference as string | null;
    const pairedFreight = pairInvKey ? freightByRef.get(pairInvKey) : undefined;
    return {
      invoice_no: p.extracted_doc_no as string,
      total_usd: (meta?.total_usd as number) ?? null,
      ship_date: (meta?.ship_date as string) ?? null,
      paired_invoice_no: pairedFreight?.invoice_no ?? null,
      paired_freight_total_usd: pairedFreight?.total_usd ?? null,
      paired_freight_ship_date: pairedFreight?.ship_date ?? null,
    };
  });
  console.log(`Angelus product invoices: ${productList.length}`); // eslint-disable-line no-console

  interface Row {
    doc_no: string;
    decl_date: string;
    awb: string;
    trader_is_angelus: boolean;
    payment_terms: string;
    payment_usd: number;
    total_dutiable_usd: number;
    total_dutiable_krw: number;
    declared_freight_krw: number | null;
    exchange_rate: number;
    weight_kg: number;
    // 매칭 결과
    matched_product_inv: string | null;
    matched_product_total: number | null;
    match_method: string;
    matched_freight_inv: string | null;
    actual_freight_usd: number | null;
    // 계산
    declared_freight_usd: number | null;
    diff_usd: number | null;
    diff_percent: number | null;
    vat_refund_candidate_usd: number | null;
    vat_refund_candidate_krw: number | null;
    // 판정
    anomaly: boolean;
    anomaly_reason: string | null;
    notes: string | null;
  }

  const rows: Row[] = [];
  for (const d of decls) {
    const isAngelus = /ANGELUS/i.test(d.trader);
    const row: Row = {
      doc_no: d.doc_no,
      decl_date: d.declaration_date,
      awb: d.awb_hawb,
      trader_is_angelus: isAngelus,
      payment_terms: d.payment_terms_code,
      payment_usd: d.payment_amount_usd,
      total_dutiable_usd: d.total_dutiable_value_usd,
      total_dutiable_krw: d.total_dutiable_value_krw,
      declared_freight_krw: d.freight_krw,
      exchange_rate: d.exchange_rate,
      weight_kg: d.gross_weight_kg,
      matched_product_inv: null,
      matched_product_total: null,
      match_method: 'unmatched',
      matched_freight_inv: null,
      actual_freight_usd: null,
      declared_freight_usd: null,
      diff_usd: null,
      diff_percent: null,
      vat_refund_candidate_usd: null,
      vat_refund_candidate_krw: null,
      anomaly: false,
      anomaly_reason: null,
      notes: d.special_notes,
    };

    if (!isAngelus) {
      row.match_method = 'skip_non_angelus';
      rows.push(row);
      continue;
    }

    // 매칭 시도
    const target = d.payment_amount_usd;
    // 단일 매칭 (정확도 $1)
    const singleMatches = productList.filter(
      (p) => p.total_usd != null && Math.abs(p.total_usd - target) < 1.5,
    );
    // 근접 (오차 $5)
    const closeMatches = productList.filter(
      (p) => p.total_usd != null && Math.abs(p.total_usd - target) < 5,
    );

    let matched: AngelusProduct | null = null;
    if (singleMatches.length === 1) {
      matched = singleMatches[0];
      row.match_method = 'single_exact';
    } else if (singleMatches.length > 1) {
      // 여러 개 매칭 시 ship_date 근접으로 선택
      singleMatches.sort((a, b) => {
        const da = a.ship_date ? Math.abs(new Date(a.ship_date).getTime() - new Date(d.declaration_date).getTime()) : Infinity;
        const db = b.ship_date ? Math.abs(new Date(b.ship_date).getTime() - new Date(d.declaration_date).getTime()) : Infinity;
        return da - db;
      });
      matched = singleMatches[0];
      row.match_method = 'single_exact_ship_date_tiebreak';
    } else if (closeMatches.length >= 1) {
      closeMatches.sort((a, b) => {
        const da = a.ship_date ? Math.abs(new Date(a.ship_date).getTime() - new Date(d.declaration_date).getTime()) : Infinity;
        const db = b.ship_date ? Math.abs(new Date(b.ship_date).getTime() - new Date(d.declaration_date).getTime()) : Infinity;
        return da - db;
      });
      matched = closeMatches[0];
      row.match_method = 'close_match_$5';
    }

    // CFR/CIF/DAP: payment_amount = product + freight. FOB인데도 오신고로 포함된 경우 있음 (26-168527M 등)
    if (!matched) {
      for (const p of productList) {
        if (p.total_usd == null || p.paired_freight_total_usd == null) continue;
        const combined = p.total_usd + p.paired_freight_total_usd;
        if (Math.abs(combined - target) < 5) {
          matched = p;
          row.match_method =
            d.payment_terms_code === 'FOB'
              ? 'fob_but_includes_freight'
              : 'cfr_product_plus_freight';
          break;
        }
      }
    }

    if (matched) {
      row.matched_product_inv = matched.invoice_no;
      row.matched_product_total = matched.total_usd;
      row.matched_freight_inv = matched.paired_invoice_no;
      row.actual_freight_usd = matched.paired_freight_total_usd;

      if (d.freight_krw != null && d.exchange_rate > 0) {
        row.declared_freight_usd = d.freight_krw / d.exchange_rate;
        if (row.actual_freight_usd != null) {
          row.diff_usd = row.declared_freight_usd - row.actual_freight_usd;
          row.diff_percent = (row.diff_usd / row.actual_freight_usd) * 100;

          // 이례 판정: |diff| >= $5 AND |diff%| >= 10% (관대한 기준)
          if (Math.abs(row.diff_usd) >= 5 && Math.abs(row.diff_percent) >= 10) {
            row.anomaly = true;
            row.anomaly_reason = row.diff_usd > 0
              ? `신고운임 과다: +$${row.diff_usd.toFixed(2)} (${row.diff_percent.toFixed(1)}%)`
              : `신고운임 과소: $${row.diff_usd.toFixed(2)} (${row.diff_percent.toFixed(1)}%)`;
            if (row.diff_usd > 0) {
              row.vat_refund_candidate_usd = row.diff_usd * 0.10;
              row.vat_refund_candidate_krw = row.vat_refund_candidate_usd * d.exchange_rate;
            }
          }
        } else {
          row.notes = (row.notes ? row.notes + '; ' : '') + '페어 freight invoice 없음';
        }
      } else {
        // 운임 필드 비어있는 경우 (CFR/CIF/DAP/FCA 또는 FOB인데 비어있는 특이 케이스)
        // 실 운임과 (payment - product_total) 비교
        if (row.matched_product_total != null && row.actual_freight_usd != null) {
          const implied_freight = d.payment_amount_usd - row.matched_product_total;
          row.declared_freight_usd = implied_freight;
          row.diff_usd = implied_freight - row.actual_freight_usd;
          row.diff_percent =
            row.actual_freight_usd !== 0 ? (row.diff_usd / row.actual_freight_usd) * 100 : 0;
          if (Math.abs(row.diff_usd) >= 5 && Math.abs(row.diff_percent) >= 10) {
            row.anomaly = true;
            row.anomaly_reason = row.diff_usd > 0
              ? `${d.payment_terms_code} 내재운임 과다: +$${row.diff_usd.toFixed(2)} (${row.diff_percent.toFixed(1)}%)`
              : `${d.payment_terms_code} 내재운임 과소: $${row.diff_usd.toFixed(2)} (${row.diff_percent.toFixed(1)}%)`;
            if (row.diff_usd > 0) {
              row.vat_refund_candidate_usd = row.diff_usd * 0.10;
              row.vat_refund_candidate_krw = row.vat_refund_candidate_usd * d.exchange_rate;
            }
          }
        }
      }
    } else {
      row.match_method = 'no_match';
    }

    rows.push(row);
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2), 'utf8');

  // Excel 생성
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('전수비교');
  ws.columns = [
    { header: '신고번호', key: 'doc_no', width: 22 },
    { header: '신고일자', key: 'decl_date', width: 12 },
    { header: 'AWB', key: 'awb', width: 14 },
    { header: '무역거래처', key: 'trader_note', width: 14 },
    { header: '결제조건', key: 'payment_terms', width: 8 },
    { header: '결제금액(USD)', key: 'payment_usd', width: 12 },
    { header: '총과세(USD)', key: 'total_dutiable_usd', width: 12 },
    { header: '총과세(KRW)', key: 'total_dutiable_krw', width: 14 },
    { header: '신고운임(KRW)', key: 'declared_freight_krw', width: 14 },
    { header: '환율', key: 'exchange_rate', width: 9 },
    { header: '중량(kg)', key: 'weight_kg', width: 9 },
    { header: '매칭방식', key: 'match_method', width: 22 },
    { header: '매칭product#', key: 'matched_product_inv', width: 11 },
    { header: 'product총액(USD)', key: 'matched_product_total', width: 13 },
    { header: '매칭freight#', key: 'matched_freight_inv', width: 11 },
    { header: '실운임(USD)', key: 'actual_freight_usd', width: 11 },
    { header: '신고운임(USD환산)', key: 'declared_freight_usd', width: 13 },
    { header: '차이(USD)', key: 'diff_usd', width: 10 },
    { header: '차이(%)', key: 'diff_percent', width: 9 },
    { header: '환급후보(USD)', key: 'vat_refund_candidate_usd', width: 12 },
    { header: '환급후보(KRW)', key: 'vat_refund_candidate_krw', width: 13 },
    { header: '이례여부', key: 'anomaly_str', width: 9 },
    { header: '이례사유', key: 'anomaly_reason', width: 30 },
    { header: '비고', key: 'notes', width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  for (const r of rows) {
    const row = ws.addRow({
      ...r,
      trader_note: r.trader_is_angelus ? '앤젤러스' : '비앤젤러스',
      anomaly_str: r.anomaly ? '이례' : '',
      declared_freight_usd: r.declared_freight_usd != null ? Number(r.declared_freight_usd.toFixed(2)) : null,
      diff_usd: r.diff_usd != null ? Number(r.diff_usd.toFixed(2)) : null,
      diff_percent: r.diff_percent != null ? Number(r.diff_percent.toFixed(1)) : null,
      vat_refund_candidate_usd: r.vat_refund_candidate_usd != null ? Number(r.vat_refund_candidate_usd.toFixed(2)) : null,
      vat_refund_candidate_krw: r.vat_refund_candidate_krw != null ? Math.round(r.vat_refund_candidate_krw) : null,
    });
    if (r.anomaly) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD9D9' } };
      });
    } else if (!r.trader_is_angelus) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      });
    }
  }

  // 이례만 시트
  const wsAn = wb.addWorksheet('이례케이스');
  wsAn.columns = ws.columns;
  wsAn.getRow(1).font = { bold: true };
  wsAn.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD9D9' } };
  for (const r of rows.filter((x) => x.anomaly)) {
    wsAn.addRow({
      ...r,
      trader_note: '앤젤러스',
      anomaly_str: '이례',
      declared_freight_usd: r.declared_freight_usd != null ? Number(r.declared_freight_usd.toFixed(2)) : null,
      diff_usd: r.diff_usd != null ? Number(r.diff_usd.toFixed(2)) : null,
      diff_percent: r.diff_percent != null ? Number(r.diff_percent.toFixed(1)) : null,
      vat_refund_candidate_usd: r.vat_refund_candidate_usd != null ? Number(r.vat_refund_candidate_usd.toFixed(2)) : null,
      vat_refund_candidate_krw: r.vat_refund_candidate_krw != null ? Math.round(r.vat_refund_candidate_krw) : null,
    });
  }

  // 요약
  const wsSum = wb.addWorksheet('요약');
  const totalDecl = rows.length;
  const angelusRows = rows.filter((r) => r.trader_is_angelus);
  const matched = angelusRows.filter((r) => r.matched_product_inv);
  const anomalies = rows.filter((r) => r.anomaly);
  const totalRefundUsd = anomalies.reduce((a, r) => a + (r.vat_refund_candidate_usd ?? 0), 0);
  const totalRefundKrw = anomalies.reduce((a, r) => a + (r.vat_refund_candidate_krw ?? 0), 0);
  const comparable = angelusRows.filter((r) => r.diff_usd != null);
  const normal = comparable.filter((r) => !r.anomaly);
  const normalAvgAbsDiff = normal.length
    ? normal.reduce((a, r) => a + Math.abs(r.diff_usd!), 0) / normal.length
    : 0;
  const summary = [
    ['총 신고서', totalDecl],
    ['앤젤러스 신고서', angelusRows.length],
    ['비앤젤러스(비교 제외)', totalDecl - angelusRows.length],
    ['앤젤러스 중 매칭 성공', matched.length],
    ['앤젤러스 중 매칭 실패', angelusRows.length - matched.length],
    ['비교 가능(신고운임 vs 실운임)', comparable.length],
    ['이례 케이스', anomalies.length],
    ['정상 케이스', normal.length],
    ['정상 케이스 평균 절대 오차(USD)', Number(normalAvgAbsDiff.toFixed(2))],
    ['이례 환급 후보 합계(USD)', Number(totalRefundUsd.toFixed(2))],
    ['이례 환급 후보 합계(KRW)', Math.round(totalRefundKrw)],
  ];
  wsSum.addTable({
    name: 'Summary',
    ref: 'A1',
    headerRow: true,
    columns: [{ name: '항목' }, { name: '값' }],
    rows: summary,
  });

  await wb.xlsx.writeFile(OUT_XLSX);
  console.log(`\n=== 완료 ===`); // eslint-disable-line no-console
  console.log(`xlsx: ${OUT_XLSX}`); // eslint-disable-line no-console
  console.log(`json: ${OUT_JSON}`); // eslint-disable-line no-console
  console.log(`요약: ${JSON.stringify(Object.fromEntries(summary as [string, unknown][]), null, 2)}`); // eslint-disable-line no-console
}
main().catch((e) => { console.error(e); process.exit(1); }); // eslint-disable-line no-console
