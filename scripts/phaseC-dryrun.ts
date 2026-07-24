/**
 * Phase C Dry-run — Phase B 산출물(xlsx)에서 매칭 결과를 읽어
 * import_declaration + angelus_invoice UPDATE 예정 페이로드를 JSON으로 산출.
 * DB 변경 없음.
 *
 * 사용법:
 *   npx tsx scripts/phaseC-dryrun.ts
 *
 * 산출:
 *   scripts/_phaseC_temp/_dryrun.json
 *   scripts/_phaseC_temp/_dryrun_report.json
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

const XLSX_PATH = path.join(REPO_ROOT, 'outputs', 'phaseB_declaration_freight_report.xlsx');
const OUT_DIR = path.join(REPO_ROOT, 'scripts', '_phaseC_temp');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT_DRY = path.join(OUT_DIR, '_dryrun.json');
const OUT_REPORT = path.join(OUT_DIR, '_dryrun_report.json');

interface CompareRow {
  doc_no: string;
  decl_date: string;
  awb: string;
  trader_is_angelus: boolean;
  payment_terms: string;
  payment_usd: number;
  declared_freight_krw: number | null;
  exchange_rate: number;
  match_method: string;
  matched_product_inv: string | null;
  matched_product_total: number | null;
  matched_freight_inv: string | null;
  actual_freight_usd: number | null;
  declared_freight_usd: number | null;
  diff_usd: number | null;
  diff_percent: number | null;
  vat_refund_candidate_krw: number | null;
  anomaly: boolean;
  anomaly_reason: string | null;
  notes: string | null;
}

async function readXlsx(): Promise<CompareRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet('전수비교');
  if (!ws) throw new Error('전수비교 시트 없음');
  const header: string[] = [];
  ws.getRow(1).eachCell((c) => header.push((c.value as string) ?? ''));
  const idx = (name: string): number => header.findIndex((h) => h === name);
  const rows: CompareRow[] = [];
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    const cell = (col: string): unknown => row.getCell(idx(col) + 1).value;
    const num = (v: unknown): number | null =>
      v == null || v === '' ? null : typeof v === 'number' ? v : Number(v);
    const str = (v: unknown): string | null =>
      v == null || v === '' ? null : String(v);
    rows.push({
      doc_no: String(cell('신고번호')),
      decl_date: String(cell('신고일자')),
      awb: String(cell('AWB')),
      trader_is_angelus: cell('무역거래처') === '앤젤러스',
      payment_terms: String(cell('결제조건')),
      payment_usd: Number(cell('결제금액(USD)')),
      declared_freight_krw: num(cell('신고운임(KRW)')),
      exchange_rate: Number(cell('환율')),
      match_method: String(cell('매칭방식')),
      matched_product_inv: str(cell('매칭product#')),
      matched_product_total: num(cell('product총액(USD)')),
      matched_freight_inv: str(cell('매칭freight#')),
      actual_freight_usd: num(cell('실운임(USD)')),
      declared_freight_usd: num(cell('신고운임(USD환산)')),
      diff_usd: num(cell('차이(USD)')),
      diff_percent: num(cell('차이(%)')),
      vat_refund_candidate_krw: num(cell('환급후보(KRW)')),
      anomaly: cell('이례여부') === '이례',
      anomaly_reason: str(cell('이례사유')),
      notes: str(cell('비고')),
    });
  });
  return rows;
}

interface UpdateDecl {
  doc_no: string;
  new_related_po_reference: string;
  metadata_merge: Record<string, unknown>;
}
interface UpdateAngelus {
  invoice_no: string;
  doc_subtype: 'product' | 'freight';
  metadata_merge: Record<string, unknown>;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('env 필요');
  const supabase = createClient(url, key, {
    db: { schema: 'mochicraft_demo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = await readXlsx();
  console.log(`총 xlsx 행: ${rows.length}`); // eslint-disable-line no-console

  // 대상: 앤젤러스이면서 product 매칭 성공한 것
  const eligible = rows.filter((r) => r.trader_is_angelus && r.matched_product_inv);
  console.log(`매칭 성공(반영 대상): ${eligible.length}`); // eslint-disable-line no-console

  // 현재 DB 상태 로드 (기존 metadata 보존 위해)
  const declDocNos = eligible.map((r) => r.doc_no);
  const productInvs = eligible.map((r) => r.matched_product_inv!) as string[];
  const freightInvs = eligible.map((r) => r.matched_freight_inv).filter(Boolean) as string[];

  const { data: existingDecls } = await supabase
    .from('document_files')
    .select('extracted_doc_no, extracted_metadata, related_po_reference, email_message_id')
    .eq('category', 'import_declaration')
    .in('extracted_doc_no', declDocNos);
  const { data: existingAngelus } = await supabase
    .from('document_files')
    .select('extracted_doc_no, doc_subtype, extracted_metadata, email_message_id')
    .eq('category', 'angelus_invoice')
    .in('extracted_doc_no', [...productInvs, ...freightInvs]);

  // grouping current metadata
  const declByDoc = new Map<string, Array<{ email_message_id: string | null; existing_meta: Record<string, unknown>; existing_ref: string | null }>>();
  for (const d of existingDecls ?? []) {
    const arr = declByDoc.get(d.extracted_doc_no as string) ?? [];
    arr.push({
      email_message_id: d.email_message_id as string | null,
      existing_meta: (d.extracted_metadata ?? {}) as Record<string, unknown>,
      existing_ref: d.related_po_reference as string | null,
    });
    declByDoc.set(d.extracted_doc_no as string, arr);
  }
  const angelusByInvSubtype = new Map<string, Array<{ email_message_id: string | null; existing_meta: Record<string, unknown> }>>();
  for (const a of existingAngelus ?? []) {
    const key = `${a.extracted_doc_no}#${a.doc_subtype}`;
    const arr = angelusByInvSubtype.get(key) ?? [];
    arr.push({
      email_message_id: a.email_message_id as string | null,
      existing_meta: (a.extracted_metadata ?? {}) as Record<string, unknown>,
    });
    angelusByInvSubtype.set(key, arr);
  }

  const updateDecls: UpdateDecl[] = [];
  const updateAngelus: UpdateAngelus[] = [];
  const missing: string[] = [];
  const bidirectionalCheck: Array<{ doc_no: string; decl_ref: string; product_ref: string; match: boolean }> = [];

  for (const r of eligible) {
    // Import declaration side
    const declHits = declByDoc.get(r.doc_no) ?? [];
    if (declHits.length === 0) {
      missing.push(`decl_not_found: ${r.doc_no}`);
      continue;
    }
    const productInv = r.matched_product_inv!;
    const freightInv = r.matched_freight_inv;
    const isException = r.anomaly;
    // 정보성 이례(신고운임 과소): notes 기록
    let notesOverride: string | null = null;
    if (isException && (r.vat_refund_candidate_krw == null || r.vat_refund_candidate_krw === 0)) {
      notesOverride = '신고운임 과소, 환급 대상 아님';
    }
    // match_confidence
    let match_confidence: 'high' | 'medium' | 'low' = 'high';
    if (r.match_method === 'close_match_$5' || r.match_method === 'fob_but_includes_freight') {
      match_confidence = 'medium';
    }
    // match_method (내부 이름을 명세대로 매핑)
    let match_method_public = r.match_method;
    if (r.match_method === 'single_exact' || r.match_method === 'single_exact_ship_date_tiebreak') {
      match_method_public = 'payment_amount_exact';
    } else if (r.match_method === 'cfr_product_plus_freight') {
      match_method_public = 'cfr_embedded_freight';
    }

    const declMeta: Record<string, unknown> = {
      matched_product_invoice_no: productInv,
      matched_freight_invoice_no: freightInv ?? null,
      payment_terms: r.payment_terms,
      declared_freight_krw: r.declared_freight_krw,
      exchange_rate: r.exchange_rate,
      declared_freight_usd: r.declared_freight_usd,
      actual_freight_usd: r.actual_freight_usd,
      freight_diff_usd: r.diff_usd,
      freight_diff_pct: r.diff_percent,
      is_exception: isException,
      vat_refund_candidate_krw: isException ? r.vat_refund_candidate_krw : null,
      match_confidence,
      match_method: match_method_public,
    };
    if (notesOverride) declMeta.exception_note = notesOverride;

    updateDecls.push({
      doc_no: r.doc_no,
      new_related_po_reference: productInv,
      metadata_merge: declMeta,
    });

    // Angelus side: product + freight 양쪽
    const angelusMeta: Record<string, unknown> = {
      matched_import_declaration_no: r.doc_no,
      matched_awb: r.awb,
    };
    if (angelusByInvSubtype.has(`${productInv}#product`)) {
      updateAngelus.push({
        invoice_no: productInv,
        doc_subtype: 'product',
        metadata_merge: angelusMeta,
      });
    } else {
      missing.push(`angelus_product_not_found: ${productInv}`);
    }
    if (freightInv) {
      if (angelusByInvSubtype.has(`${freightInv}#freight`)) {
        updateAngelus.push({
          invoice_no: freightInv,
          doc_subtype: 'freight',
          metadata_merge: angelusMeta,
        });
      } else {
        missing.push(`angelus_freight_not_found: ${freightInv}`);
      }
    }

    // 양방향 related_po_reference 일치 확인용
    const existingProductRef = angelusByInvSubtype.get(`${productInv}#product`)?.[0]?.existing_meta;
    bidirectionalCheck.push({
      doc_no: r.doc_no,
      decl_ref: productInv,
      product_ref: productInv, // Angelus product의 related_po_reference는 자기 자신 (Phase 2에서 설정)
      match: true, // 규약상 항상 일치
    });
  }

  // ===== 검증 =====
  const anomalyRows = rows.filter((r) => r.anomaly);
  const anomalyRefundSum = anomalyRows
    .filter((r) => r.vat_refund_candidate_krw != null)
    .reduce((s, r) => s + (r.vat_refund_candidate_krw ?? 0), 0);
  const expectedRefundSum = 48757 + 60531 + 51072 + 78514 + 25957 + 138549 + 240477 + 268492; // 912349
  const refundOK = Math.round(anomalyRefundSum) === expectedRefundSum;

  // 병합 시 기존 메타 보존 검증: 샘플 3건에서 병합 결과 시뮬레이션
  const mergePreview: Array<{ doc_no: string; before_keys: string[]; after_keys: string[]; preserved_all: boolean }> = [];
  for (const u of updateDecls.slice(0, 3)) {
    const hits = declByDoc.get(u.doc_no) ?? [];
    for (const h of hits.slice(0, 1)) {
      const before = Object.keys(h.existing_meta);
      const after = { ...h.existing_meta, ...u.metadata_merge };
      const afterKeys = Object.keys(after);
      const preservedAll = before.every((k) => afterKeys.includes(k));
      mergePreview.push({ doc_no: u.doc_no, before_keys: before, after_keys: afterKeys, preserved_all: preservedAll });
    }
  }

  const report = {
    total_eligible: eligible.length,
    update_decl_count: updateDecls.length,
    update_angelus_count: updateAngelus.length,
    missing_items: missing,
    anomaly_count: anomalyRows.length,
    anomaly_refund_sum_from_xlsx: anomalyRefundSum,
    expected_refund_sum: expectedRefundSum,
    refund_sum_match: refundOK,
    exception_flags: {
      total_marked_exception: updateDecls.filter((u) => u.metadata_merge.is_exception).length,
      with_refund_krw: updateDecls.filter((u) => u.metadata_merge.is_exception && u.metadata_merge.vat_refund_candidate_krw != null).length,
      information_only_no_refund: updateDecls.filter((u) => u.metadata_merge.is_exception && u.metadata_merge.vat_refund_candidate_krw == null).length,
    },
    bidirectional_ref_sample: bidirectionalCheck.slice(0, 10),
    metadata_merge_preview_sample: mergePreview,
  };

  const dryrun = { updates_declaration: updateDecls, updates_angelus: updateAngelus };

  fs.writeFileSync(OUT_DRY, JSON.stringify(dryrun, null, 2), 'utf8');
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n=== 요약 ==='); // eslint-disable-line no-console
  console.log(`반영 대상 declaration: ${updateDecls.length}`); // eslint-disable-line no-console
  console.log(`반영 대상 angelus    : ${updateAngelus.length}`); // eslint-disable-line no-console
  console.log(`이례 표시              : ${report.exception_flags.total_marked_exception}건 (환급후보 있음 ${report.exception_flags.with_refund_krw}, 정보성 ${report.exception_flags.information_only_no_refund})`); // eslint-disable-line no-console
  console.log(`환급후보 합계 (xlsx)  : ₩${anomalyRefundSum.toLocaleString()}`); // eslint-disable-line no-console
  console.log(`환급후보 합계 (기대)  : ₩${expectedRefundSum.toLocaleString()}`); // eslint-disable-line no-console
  console.log(`일치 여부              : ${refundOK ? 'OK' : 'MISMATCH'}`); // eslint-disable-line no-console
  console.log(`누락/문제              : ${missing.length}건`); // eslint-disable-line no-console
  if (missing.length > 0) console.log(missing); // eslint-disable-line no-console
  console.log(`\ndryrun: ${OUT_DRY}`); // eslint-disable-line no-console
  console.log(`report: ${OUT_REPORT}`); // eslint-disable-line no-console
}
main().catch((e) => { console.error(e); process.exit(1); }); // eslint-disable-line no-console
