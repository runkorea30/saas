/**
 * CustomsDocTab — 통관서류 탭
 *
 * 1. PDF 업로드 → Claude API (anthropic-dangerous-direct-browser-access) 로 파싱
 * 2. 품목 데이터 + 통관 메타(제품분류/HS Code/수입요건번호/원산지증명서) 자동 매핑
 * 3. 통합 표 + 분류별 합계 표시
 * 4. SheetJS 엑셀 다운로드
 */

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

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

// ─────────────────────────────────────────────
// 아이템 코드 prefix 기반 통관 메타 매핑 테이블
// 세 번째 엑셀(통합본) 기준으로 하드코딩
// ─────────────────────────────────────────────

interface CustomsMeta {
  category: string;
  hsCode: string;
  importReqNo: string;
  originSerial: string;
}

// 정확한 코드 매칭 우선, prefix 매칭 fallback
const EXACT_MAP: Record<string, CustomsMeta> = {
  '840-08-000': { category: '세정제',           hsCode: '3402509000',  importReqNo: '2423002561239886', originSerial: '14' },
  '901-01-000': { category: '광택코팅제',        hsCode: '3405100000',  importReqNo: '2423002561110037', originSerial: '6'  },
  '902-01-000': { category: '광택코팅제',        hsCode: '3405100000',  importReqNo: '2423002561110037', originSerial: '6'  },
};

// prefix 매핑 (startsWith 순서대로 우선 적용)
const PREFIX_MAP: Array<{ prefix: string; meta: CustomsMeta }> = [
  { prefix: '600-', meta: { category: '광택코팅제',          hsCode: '3405100000', importReqNo: '2423002561193086', originSerial: '5'  } },
  { prefix: '605-', meta: { category: '광택코팅제',          hsCode: '3405100000', importReqNo: '2423002561193086', originSerial: '5'  } },
  { prefix: '610-', meta: { category: '광택코팅제',          hsCode: '3405100000', importReqNo: '2423002561193086', originSerial: '5'  } },
  { prefix: '615-', meta: { category: '광택코팅제',          hsCode: '3405100000', importReqNo: '2423002561193086', originSerial: '5'  } },
  { prefix: '620-', meta: { category: '광택코팅제',          hsCode: '3405100000', importReqNo: '2423002561193086', originSerial: '5'  } },
  { prefix: '720-', meta: { category: '물체염색제(가죽페인트)', hsCode: '3405100000', importReqNo: '2423002561189441', originSerial: '3'  } },
  { prefix: '732-', meta: { category: '물체염색제(가죽페인트)', hsCode: '3405100000', importReqNo: '2423002561189441', originSerial: '3'  } },
  { prefix: '733-', meta: { category: '물체염색제(가죽페인트)', hsCode: '3405100000', importReqNo: '2423002561189441', originSerial: '3'  } },
  { prefix: '799-', meta: { category: '물체염색제(가죽페인트)', hsCode: '3405100000', importReqNo: '2423002561189441', originSerial: '3'  } },
  { prefix: '992E-', meta: { category: '기타(슈트리)',       hsCode: '3926.9',     importReqNo: '',                originSerial: '22' } },
  { prefix: '992-', meta: { category: '기타(미술용칼)',      hsCode: '8211920000', importReqNo: '',                originSerial: '25' } },
];

function getCustomsMeta(itemCode: string): CustomsMeta {
  if (EXACT_MAP[itemCode]) return EXACT_MAP[itemCode];
  for (const { prefix, meta } of PREFIX_MAP) {
    if (itemCode.startsWith(prefix)) return meta;
  }
  return { category: '', hsCode: '', importReqNo: '', originSerial: '' };
}

// ─────────────────────────────────────────────
// 분류 표시 순서
// ─────────────────────────────────────────────

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
// Claude API로 PDF 파싱
// ─────────────────────────────────────────────

async function parsePdfWithClaude(base64Data: string): Promise<CustomsRow[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY 환경변수가 없습니다.');

  const prompt = `아래 PDF는 Angelus Shoe Polish Co.의 인보이스입니다.
인보이스에서 품목 데이터를 모두 추출하여 JSON 배열로만 응답하세요.
다른 텍스트나 마크다운 없이 순수 JSON 배열만 출력하세요.

각 품목은 아래 필드를 포함해야 합니다:
- itemCode: string (ITEM CODE 컬럼)
- description: string (DESCRIPTION 컬럼)
- qty: number (QTY SHPD 컬럼)
- um: string (U/M 컬럼, 예: "DZ", "EA")
- price: number (PRICE 컬럼)
- amount: number (AMOUNT 컬럼)

헤더 반복 행, "Sales Tax", "Total", 빈 행은 제외하세요.
여러 페이지에 걸쳐 있어도 모든 품목을 포함하세요.

응답 형식 예시:
[{"itemCode":"600-01-000","description":"Acrylic Finisher 1 oz.","qty":12,"um":"DZ","price":17.61,"amount":211.32}]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API 오류: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const text = (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  // JSON 파싱 (마크다운 펜스 제거)
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean) as Array<{
    itemCode: string;
    description: string;
    qty: number;
    um: string;
    price: number;
    amount: number;
  }>;

  return parsed.map((item, idx) => {
    const meta = getCustomsMeta(item.itemCode);
    return {
      no: idx + 1,
      itemCode: item.itemCode,
      description: item.description,
      qty: item.qty,
      um: item.um,
      price: item.price,
      amount: item.amount,
      ...meta,
    };
  });
}

// ─────────────────────────────────────────────
// 엑셀 다운로드 (SheetJS)
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
      r.price, r.amount, r.category, r.hsCode,
      r.importReqNo, r.originSerial,
    ]),
  ];

  // 분류별 합계 시트
  const catTotals = new Map<string, number>();
  for (const r of rows) {
    catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount);
  }
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);

  const summaryHeaders = ['제품분류', '금액 (USD)', '비율 (%)'];
  const sortedCats = [
    ...CAT_ORDER.filter((c) => catTotals.has(c)),
    ...[...catTotals.keys()].filter((c) => !CAT_ORDER.includes(c)).sort(),
  ];
  const summaryData = [
    summaryHeaders,
    ...sortedCats.map((cat) => {
      const amt = catTotals.get(cat) ?? 0;
      return [cat, +amt.toFixed(2), +((amt / grandTotal) * 100).toFixed(1)];
    }),
    ['합   계', +grandTotal.toFixed(2), 100],
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(data);
  const ws2 = XLSX.utils.aoa_to_sheet(summaryData);

  // 컬럼 너비
  ws1['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 44 }, { wch: 6 }, { wch: 5 },
    { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 14 },
    { wch: 20 }, { wch: 12 },
  ];
  ws2['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, ws1, '통관용_통합인보이스');
  XLSX.utils.book_append_sheet(wb, ws2, '제품분류별_합계');
  XLSX.writeFile(wb, `통관인보이스_${invoiceNo || 'export'}.xlsx`);
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

export function CustomsDocTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [rows, setRows] = useState<CustomsRow[]>([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [fileName, setFileName] = useState('');

  // 분류별 합계
  const catTotals = (() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.category, (map.get(r.category) ?? 0) + r.amount);
    }
    return map;
  })();
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const sortedCats = [
    ...CAT_ORDER.filter((c) => catTotals.has(c)),
    ...[...catTotals.keys()].filter((c) => !CAT_ORDER.includes(c)).sort(),
  ];

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('PDF 파일만 업로드 가능합니다.');
      setStatus('error');
      return;
    }

    setFileName(file.name);
    setStatus('parsing');
    setErrorMsg('');
    setRows([]);

    try {
      // base64 변환
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          res(result.split(',')[1]);
        };
        reader.onerror = () => rej(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
      });

      const parsed = await parsePdfWithClaude(base64);
      setRows(parsed);
      setStatus('done');

      // 파일명에서 인보이스 번호 추출 시도 (예: Inv_81252_...)
      const match = file.name.match(/(\d{4,})/);
      if (match) setInvoiceNo(match[1]);
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

  // ─── 렌더링 ────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 업로드 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--line)',
          borderRadius: 10,
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: status === 'parsing' ? 'var(--surface-2)' : 'var(--surface)',
          transition: 'background 0.15s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        {status === 'parsing' ? (
          <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            PDF 파싱 중… Claude가 인보이스를 읽고 있습니다.
          </div>
        ) : (
          <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <strong style={{ color: 'var(--ink)' }}>PDF 인보이스를 드래그하거나 클릭하여 업로드</strong>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              업로드하면 Claude AI가 자동으로 파싱합니다
            </div>
            {fileName && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
                최근 파일: {fileName}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 에러 */}
      {status === 'error' && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--danger-wash)',
          color: 'var(--danger)',
          borderRadius: 8,
          fontSize: 12.5,
        }}>
          ❌ {errorMsg}
        </div>
      )}

      {/* 결과 영역 */}
      {status === 'done' && rows.length > 0 && (
        <>
          {/* 헤더 + 다운로드 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                총 {rows.length}개 품목
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', marginLeft: 10 }}>
                합계: ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <button
              type="button"
              className="btn-base primary"
              onClick={() => downloadExcel(rows, invoiceNo)}
              style={{ height: 32, fontSize: 12.5, padding: '0 16px' }}
            >
              ⬇ 엑셀 다운로드
            </button>
          </div>

          {/* 분류별 합계 카드 */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            {sortedCats.map((cat) => {
              const amt = catTotals.get(cat) ?? 0;
              return (
                <div
                  key={cat}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    padding: '8px 14px',
                    minWidth: 160,
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 4 }}>{cat}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    ${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    {((amt / grandTotal) * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* 통합 품목 테이블 */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['No', 'Item Code', 'Description', 'QTY', 'U/M', 'Price', 'Amount',
                    '제품분류', 'HS Code', '수입요건번호', 'C/O Serial'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 10px',
                        textAlign: h === 'Description' || h === '제품분류' ? 'left' : 'center',
                        fontWeight: 600,
                        fontSize: 11.5,
                        borderBottom: '1px solid var(--line)',
                        whiteSpace: 'nowrap',
                        color: 'var(--ink)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.no}
                    style={{
                      background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--ink-3)' }}>{r.no}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.itemCode}</td>
                    <td style={{ padding: '6px 10px', maxWidth: 280, wordBreak: 'break-word' }}>{r.description}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.qty}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.um}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.price.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{r.amount.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', fontSize: 11 }}>{r.category}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.hsCode}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11 }}>{r.importReqNo}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11 }}>{r.originSerial}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                  <td colSpan={6} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12.5 }}>합계</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12.5 }}>
                    {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
