/**
 * CustomsDocTab — 통관서류 탭
 *
 * 1. 엑셀(PDF→엑셀 변환본, 다중 시트) 업로드 → SheetJS로 파싱 + 시트 통합
 * 2. DB customs_code_mappings 에서 prefix별 통관 메타 로드 → 자동 매핑
 * 3. 분류별 합계 카드 + 전체 품목 테이블
 * 4. 엑셀 다운로드 (2개 시트: 통관용_통합인보이스 / 제품분류별_합계)
 * 5. sessionStorage로 탭 이동 후에도 데이터 유지
 */

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

interface CustomsRow {
  no: number;
  itemCode: string;
  description: string;
  qty: number;
  um: string;
  price: number;
  amount: number;
  category: string;
  hsCode: string;
  importReqNo: string;
  originSerial: string;
}

interface CodeMapping {
  code_prefix: string;
  product_category: string;
  hs_code: string;
  import_req_no: string;
  origin_serial: string;
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const SESSION_KEY = 'customs_doc_rows';
const SESSION_INV_KEY = 'customs_doc_invoice_no';

const CAT_ORDER = [
  '물체염색제(가죽페인트)',
  '물체염색제(레더다이)',
  '물체염색제(스웨이드다이)',
  '광택코팅제',
  '세정제',
  '특수목적코팅제',
  '제거제',
  '기타(미술용칼)',
  '기타(슈트리)',
];

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

/** item code prefix 추출: 앞 3자리. 단, '992E-'로 시작하면 '99E' 반환 */
function getPrefix(itemCode: string): string {
  if (itemCode.toUpperCase().startsWith('992E')) return '99E';
  return itemCode.slice(0, 3);
}

function getMeta(itemCode: string, mappings: CodeMapping[]): CodeMapping | null {
  const prefix = getPrefix(itemCode);
  return mappings.find((m) => m.code_prefix === prefix) ?? null;
}

// ─────────────────────────────────────────────
// 엑셀 파싱
// ─────────────────────────────────────────────

const SKIP_FIRST = new Set(['QTY SHPD', 'Sales Tax (0.0%)', 'Total', '']);

function parseSheet(ws: XLSX.WorkSheet): Array<{
  itemCode: string; description: string; qty: number; um: string; price: number; amount: number;
}> {
  // 원본 인보이스 엑셀 구조:
  //   row0~4: 헤더(BILL TO, SHIP TO, SALES ORDER 등)
  //   row5:   컬럼 헤더 (QTY SHPD | U/M | QTY BO | ITEM CODE | DESCRIPTION | PRICE | AMOUNT)
  //   row6~:  데이터 (컬럼 위치: 0=qty, 2=um, 4=qty_bo, 5=itemCode, 7=desc, 13=price, 15=amount)
  //   중간에 헤더 반복행 있음
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const result: ReturnType<typeof parseSheet> = [];

  for (let i = 6; i < aoa.length; i++) {
    const row = aoa[i] as (string | number | null)[];
    const first = String(row[0] ?? '').trim();
    if (SKIP_FIRST.has(first)) continue;

    const qty = Number(row[0]);
    const price = Number(row[13]);
    const amount = Number(row[15]);
    if (isNaN(qty) || qty === 0) continue;
    if (isNaN(amount)) continue;

    const itemCode = String(row[5] ?? '').trim();
    const description = String(row[7] ?? '').replace(/\n/g, ' ').trim();
    const um = String(row[2] ?? '').trim();

    if (!itemCode) continue;

    result.push({ itemCode, description, qty, um, price, amount });
  }
  return result;
}

// ─────────────────────────────────────────────
// 엑셀 다운로드
// ─────────────────────────────────────────────

function downloadExcel(rows: CustomsRow[], invoiceNo: string) {
  const headers = [
    'No', 'Item Code', 'Description', 'QTY', 'U/M',
    'Price (USD)', 'Amount (USD)', '제품분류', 'HS Code',
    '수입요건번호', 'C/O Serial No',
  ];
  const data = [
    headers,
    ...rows.map((r) => [
      r.no, r.itemCode, r.description, r.qty, r.um,
      r.price, r.amount, r.category, r.hsCode, r.importReqNo, r.originSerial,
    ]),
  ];

  const catTotals = new Map<string, number>();
  for (const r of rows) catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const sortedCats = [
    ...CAT_ORDER.filter((c) => catTotals.has(c)),
    ...[...catTotals.keys()].filter((c) => !CAT_ORDER.includes(c)).sort(),
  ];
  const summaryData = [
    ['제품분류', '금액 (USD)', '비율 (%)'],
    ...sortedCats.map((cat) => {
      const amt = catTotals.get(cat) ?? 0;
      return [cat, +amt.toFixed(2), +((amt / grandTotal) * 100).toFixed(1)];
    }),
    ['합   계', +grandTotal.toFixed(2), 100],
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(data);
  const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 44 }, { wch: 6 }, { wch: 5 },
    { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 12 },
  ];
  ws2['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws1, '통관용_통합인보이스');
  XLSX.utils.book_append_sheet(wb, ws2, '제품분류별_합계');
  XLSX.writeFile(wb, `통관인보이스_${invoiceNo || 'export'}.xlsx`);
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

export function CustomsDocTab() {
  const { companyId } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [rows, setRows] = useState<CustomsRow[]>([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [fileName, setFileName] = useState('');
  const [mappings, setMappings] = useState<CodeMapping[]>([]);

  // sessionStorage 복원
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      const savedInv = sessionStorage.getItem(SESSION_INV_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CustomsRow[];
        if (parsed.length > 0) {
          setRows(parsed);
          setStatus('done');
        }
      }
      if (savedInv) setInvoiceNo(savedInv);
    } catch {/* ignore */}
  }, []);

  // DB에서 코드 매핑 로드
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('customs_code_mappings')
      .select('code_prefix, product_category, hs_code, import_req_no, origin_serial')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setMappings(data as CodeMapping[]);
      });
  }, [companyId]);

  // 분류별 합계
  const catTotals = new Map<string, number>();
  for (const r of rows) catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const sortedCats = [
    ...CAT_ORDER.filter((c) => catTotals.has(c)),
    ...[...catTotals.keys()].filter((c) => !CAT_ORDER.includes(c)).sort(),
  ];

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext ?? '')) {
      setErrorMsg('엑셀 파일(.xlsx / .xls)만 업로드 가능합니다.');
      setStatus('error');
      return;
    }

    setFileName(file.name);
    setStatus('parsing');
    setErrorMsg('');
    setRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // 모든 시트 파싱 후 통합
      const allItems: ReturnType<typeof parseSheet> = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const items = parseSheet(ws);
        allItems.push(...items);
      }

      if (allItems.length === 0) {
        throw new Error('파싱된 품목이 없습니다. 파일 형식을 확인하세요.');
      }

      // 통관 메타 매핑
      const mapped: CustomsRow[] = allItems.map((item, idx) => {
        const meta = getMeta(item.itemCode, mappings);
        return {
          no: idx + 1,
          ...item,
          category: meta?.product_category ?? '',
          hsCode: meta?.hs_code ?? '',
          importReqNo: meta?.import_req_no ?? '',
          originSerial: meta?.origin_serial ?? '',
        };
      });

      setRows(mapped);
      setStatus('done');

      // sessionStorage 저장
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(mapped));
      } catch {/* ignore */}

      // 파일명에서 인보이스 번호 추출
      const match = file.name.match(/(\d{4,})/);
      const inv = match?.[1] ?? '';
      setInvoiceNo(inv);
      try { sessionStorage.setItem(SESSION_INV_KEY, inv); } catch {/* ignore */}

    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleClear() {
    setRows([]);
    setStatus('idle');
    setInvoiceNo('');
    setFileName('');
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_INV_KEY);
    } catch {/* ignore */}
  }

  // ─── 렌더링 ────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 안내 문구 */}
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
        알PDF 등으로 변환한 <strong>엑셀 파일(다중 시트)</strong>을 업로드하면 자동으로 통합하고
        통관 메타(제품분류 / HS Code / 수입요건번호)를 매핑합니다.
        <br />
        코드 매핑은 <strong>문서관리 → 시험검사번호</strong> 탭 하단에서 관리하세요.
      </div>

      {/* 업로드 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--line)',
          borderRadius: 10,
          padding: '28px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: status === 'parsing' ? 'var(--surface-2, var(--surface))' : 'var(--surface)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        {status === 'parsing' ? (
          <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            엑셀 파싱 중…
          </div>
        ) : (
          <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
            <strong style={{ color: 'var(--ink)' }}>
              엑셀 파일을 드래그하거나 클릭하여 업로드
            </strong>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              알PDF 변환 엑셀 (다중 시트 OK) · .xlsx / .xls
            </div>
            {fileName && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
                최근: {fileName}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 에러 */}
      {status === 'error' && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-wash)',
          color: 'var(--danger)', borderRadius: 8, fontSize: 12.5,
        }}>
          ❌ {errorMsg}
        </div>
      )}

      {/* 결과 */}
      {status === 'done' && rows.length > 0 && (
        <>
          {/* 헤더 바 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>총 {rows.length}개 품목</span>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', marginLeft: 10 }}>
                합계: ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-base"
                onClick={handleClear}
                style={{ height: 32, fontSize: 12.5, padding: '0 14px' }}
              >
                초기화
              </button>
              <button
                type="button"
                className="btn-base primary"
                onClick={() => downloadExcel(rows, invoiceNo)}
                style={{ height: 32, fontSize: 12.5, padding: '0 16px' }}
              >
                ⬇ 엑셀 다운로드
              </button>
            </div>
          </div>

          {/* 분류별 합계 카드 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sortedCats.map((cat) => {
              const amt = catTotals.get(cat) ?? 0;
              return (
                <div key={cat} style={{
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: 8, padding: '8px 14px', minWidth: 160,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 4 }}>{cat}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    {grandTotal > 0 ? ((amt / grandTotal) * 100).toFixed(1) : '0.0'}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* 품목 테이블 */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, var(--surface))' }}>
                  {['No', 'Item Code', 'Description', 'QTY', 'U/M', 'Price', 'Amount',
                    '제품분류', 'HS Code', '수입요건번호', 'C/O Serial'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 10px',
                      textAlign: ['Description', '제품분류'].includes(h) ? 'left' : 'center',
                      fontWeight: 600, fontSize: 11.5,
                      borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.no} style={{
                    background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2, var(--surface))',
                    borderBottom: '1px solid var(--line)',
                  }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--ink-3)' }}>{r.no}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.itemCode}</td>
                    <td style={{ padding: '6px 10px', maxWidth: 280, wordBreak: 'break-word' }}>{r.description}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.qty}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.um}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.price.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{r.amount.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', fontSize: 11 }}>{r.category || <span style={{ color: 'var(--ink-3)' }}>미매핑</span>}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.hsCode}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11 }}>{r.importReqNo}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11 }}>{r.originSerial}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}>
                  <td colSpan={6} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12.5 }}>합계</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12.5 }}>
                    {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
