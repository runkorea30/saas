/**
 * CustomsDocTab — 통관서류 탭
 * - 엑셀(다중 시트) 업로드 → SheetJS 파싱 + 시트 통합
 * - DB customs_code_mappings prefix 매핑
 * - 분류별 합계 + 품목 테이블 (인라인 편집)
 * - sessionStorage 유지
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Loader2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from '@/components/ui/Toast';

// ── 타입 ──────────────────────────────────────

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

type EditableField = 'category' | 'hsCode' | 'importReqNo' | 'originSerial';

interface CooFileRow {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string | null;
}

// ── 상수 ──────────────────────────────────────

const SESSION_KEY = 'customs_doc_rows';
const SESSION_INV_KEY = 'customs_doc_invoice_no';

const COO_CATEGORY = 'certificate_of_origin';
const COO_MAX_SIZE = 20 * 1024 * 1024; // 20MB
const COO_SELECT_LIST = 'id, file_name, file_size, mime_type, uploaded_at';

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

// ── 유틸 ──────────────────────────────────────

function getPrefix(itemCode: string): string {
  if (itemCode.toUpperCase().startsWith('992E')) return '99E';
  return itemCode.slice(0, 3);
}

function getMeta(itemCode: string, mappings: CodeMapping[]): CodeMapping | null {
  const prefix = getPrefix(itemCode);
  return mappings.find((m) => m.code_prefix === prefix) ?? null;
}

// ── 엑셀 파싱 ─────────────────────────────────

const SKIP_FIRST = new Set(['QTY SHPD', 'Sales Tax (0.0%)', 'Total', '']);

function parseSheet(ws: XLSX.WorkSheet): Array<{
  itemCode: string; description: string; qty: number; um: string; price: number; amount: number;
}> {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const result: ReturnType<typeof parseSheet> = [];
  for (let i = 6; i < aoa.length; i++) {
    const row = aoa[i] as (string | number | null)[];
    const first = String(row[0] ?? '').trim();
    if (SKIP_FIRST.has(first)) continue;
    const qty = Number(row[0]);
    const price = Number(row[13]);
    const amount = Number(row[15]);
    if (isNaN(qty) || qty === 0 || isNaN(amount)) continue;
    const itemCode = String(row[5] ?? '').trim();
    const description = String(row[7] ?? '').replace(/\n/g, ' ').trim();
    const um = String(row[2] ?? '').trim();
    if (!itemCode) continue;
    result.push({ itemCode, description, qty, um, price, amount });
  }
  return result;
}

// ── 엑셀 다운로드 ─────────────────────────────

function downloadExcel(rows: CustomsRow[], invoiceNo: string) {
  const headers = [
    'No', 'Item Code', 'Description', 'QTY', 'U/M',
    'Price (USD)', 'Amount (USD)', '제품분류', 'HS Code', '수입요건번호', 'C/O Serial No',
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

// ── 편집 셀 (파일 최상단 분리) ─────────────────
// 🟠 렌더 함수 내부에 컴포넌트를 선언하면 매 렌더마다 재마운트되어
//    onChange 한 번마다 input 이 unmount→mount 되며 포커스가 빠진다.
//    반드시 외부 함수 컴포넌트로 분리해 안정적인 reference 유지.

interface EditCellProps {
  no: number;
  field: EditableField;
  value: string;
  align?: 'left' | 'center';
  mono?: boolean;
  editingCell: { no: number; field: EditableField } | null;
  editingValue: string;
  setEditingValue: (v: string) => void;
  startEdit: (no: number, field: EditableField, value: string) => void;
  saveEdit: () => void;
  cancelEdit: () => void;
}

function EditCell({
  no, field, value, align = 'left', mono = false,
  editingCell, editingValue, setEditingValue,
  startEdit, saveEdit, cancelEdit,
}: EditCellProps) {
  const isEditing = editingCell?.no === no && editingCell?.field === field;
  return (
    <td
      style={{
        padding: '5px 8px',
        textAlign: align,
        fontSize: 11,
        cursor: 'text',
        background: isEditing ? 'var(--accent-wash, #EFF6FF)' : undefined,
      }}
      onClick={() => !isEditing && startEdit(no, field, value)}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          style={{
            width: '100%',
            border: '1px solid var(--accent, #2563eb)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 11,
            fontFamily: mono ? 'monospace' : undefined,
            outline: 'none',
          }}
        />
      ) : (
        <span style={{
          fontFamily: mono ? 'monospace' : undefined,
          color: value ? 'var(--ink)' : 'var(--ink-3)',
          display: 'block',
          minHeight: 16,
        }}>
          {value || <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>클릭하여 입력</span>}
        </span>
      )}
    </td>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────

export function CustomsDocTab() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 원산지증명서 (C/O) ──
  const cooQueryKey = ['doc-files-coo', companyId];
  const [cooUploading, setCooUploading] = useState(false);

  const { data: cooFiles = [] } = useQuery<CooFileRow[]>({
    queryKey: cooQueryKey,
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_files')
        .select(COO_SELECT_LIST)
        .eq('company_id', companyId!)
        .eq('category', COO_CATEGORY)
        .order('uploaded_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CooFileRow[];
    },
    staleTime: 30_000,
  });

  async function handleCooUpload(file: File) {
    if (!companyId) return;
    if (file.size > COO_MAX_SIZE) {
      showToast({ kind: 'error', text: '20MB 이하 파일만 업로드 가능합니다.' });
      return;
    }
    setCooUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
      });
      const { error } = await supabase.from('document_files').insert({
        company_id: companyId,
        category: COO_CATEGORY,
        file_name: file.name,
        file_path: base64,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_at: new Date().toISOString(),
      });
      if (error) throw error;
      showToast({ kind: 'success', text: '원산지증명서 업로드 완료' });
      queryClient.invalidateQueries({ queryKey: cooQueryKey });
    } catch (err) {
      showToast({ kind: 'error', text: err instanceof Error ? err.message : '업로드 실패' });
    } finally {
      setCooUploading(false);
    }
  }

  async function handleCooDownload(row: CooFileRow) {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('document_files')
        .select('file_path, file_name')
        .eq('id', row.id)
        .eq('company_id', companyId)
        .single();
      if (error) throw error;
      if (!data?.file_path) throw new Error('파일 데이터 없음');
      const a = document.createElement('a');
      a.href = data.file_path;
      a.download = data.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      showToast({ kind: 'error', text: err instanceof Error ? err.message : '다운로드 실패' });
    }
  }

  async function handleCooDelete(id: string) {
    if (!companyId) return;
    try {
      const { error } = await supabase
        .from('document_files')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      showToast({ kind: 'success', text: '삭제 완료' });
      queryClient.invalidateQueries({ queryKey: cooQueryKey });
    } catch (err) {
      showToast({ kind: 'error', text: err instanceof Error ? err.message : '삭제 실패' });
    }
  }

  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [rows, setRows] = useState<CustomsRow[]>([]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [fileName, setFileName] = useState('');
  const [mappings, setMappings] = useState<CodeMapping[]>([]);

  // 인라인 편집 상태
  const [editingCell, setEditingCell] = useState<{ no: number; field: EditableField } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // sessionStorage 복원
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      const savedInv = sessionStorage.getItem(SESSION_INV_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CustomsRow[];
        if (parsed.length > 0) { setRows(parsed); setStatus('done'); }
      }
      if (savedInv) setInvoiceNo(savedInv);
    } catch { /* ignore */ }
  }, []);

  // DB 코드 매핑 로드
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('customs_code_mappings')
      .select('code_prefix, product_category, hs_code, import_req_no, origin_serial')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setMappings(data as CodeMapping[]); });
  }, [companyId]);

  // 분류별 합계
  const catTotals = new Map<string, number>();
  for (const r of rows) catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount);
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const sortedCats = [
    ...CAT_ORDER.filter((c) => catTotals.has(c)),
    ...[...catTotals.keys()].filter((c) => !CAT_ORDER.includes(c)).sort(),
  ];

  // 셀 편집 함수
  function startEdit(no: number, field: EditableField, value: string) {
    setEditingCell({ no, field });
    setEditingValue(value);
  }

  function saveEdit() {
    if (!editingCell) return;
    const { no, field } = editingCell;
    const updated = rows.map((r) =>
      r.no === no ? { ...r, [field]: editingValue.trim() } : r
    );
    setRows(updated);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    setEditingCell(null);
  }

  function cancelEdit() { setEditingCell(null); }

  // 파일 처리
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
      const allItems: ReturnType<typeof parseSheet> = [];
      for (const sheetName of wb.SheetNames) {
        allItems.push(...parseSheet(wb.Sheets[sheetName]));
      }
      if (allItems.length === 0) throw new Error('파싱된 품목이 없습니다. 파일 형식을 확인하세요.');
      const mapped: CustomsRow[] = allItems.map((item, idx) => {
        const meta = getMeta(item.itemCode, mappings);
        return {
          no: idx + 1, ...item,
          category: meta?.product_category ?? '',
          hsCode: meta?.hs_code ?? '',
          importReqNo: meta?.import_req_no ?? '',
          originSerial: meta?.origin_serial ?? '',
        };
      });
      setRows(mapped);
      setStatus('done');
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(mapped)); } catch { /* ignore */ }
      const match = file.name.match(/(\d{4,})/);
      const inv = match?.[1] ?? '';
      setInvoiceNo(inv);
      try { sessionStorage.setItem(SESSION_INV_KEY, inv); } catch { /* ignore */ }
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
    setRows([]); setStatus('idle'); setInvoiceNo(''); setFileName('');
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_INV_KEY);
    } catch { /* ignore */ }
  }

  // ── 렌더링 ────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── 상단 2열: 업로드(좌 1/3) + 합계 정보(우 2/3) ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>

        {/* 업로드 박스 — 좌측 1/3 */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: '0 0 30%',
            border: '2px dashed var(--line)',
            borderRadius: 8,
            padding: '14px 12px',
            textAlign: 'center',
            cursor: 'pointer',
            background: status === 'parsing' ? 'var(--surface-2, var(--surface))' : 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 110,
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
            <div style={{ color: 'var(--ink-2)', fontSize: 12 }}>⏳ 파싱 중…</div>
          ) : (
            <>
              <div style={{ fontSize: 22, marginBottom: 6 }}>📊</div>
              <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--ink)' }}>
                엑셀 업로드
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                .xlsx / .xls · 다중 시트 OK
              </div>
              {fileName && (
                <div style={{
                  marginTop: 6, fontSize: 10.5, color: 'var(--ink-3)',
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {fileName}
                </div>
              )}
            </>
          )}
        </div>

        {/* 우측 2/3 — 합계 정보 or idle 안내 */}
        <div style={{
          flex: 1,
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '12px 16px',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {status === 'done' && rows.length > 0 ? (
            <>
              {/* 총계 + 버튼 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    총 {rows.length}개 품목
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: 'var(--ink)', marginLeft: 12,
                  }}>
                    합계 ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-base"
                    onClick={handleClear}
                    style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    className="btn-base primary"
                    onClick={() => downloadExcel(rows, invoiceNo)}
                    style={{ height: 28, fontSize: 11.5, padding: '0 12px' }}
                  >
                    ⬇ 엑셀 다운로드
                  </button>
                </div>
              </div>

              {/* 분류별 합계 — 한 줄 wrap */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sortedCats.map((cat) => {
                  const amt = catTotals.get(cat) ?? 0;
                  return (
                    <div key={cat} style={{
                      background: 'var(--surface-2, #f5f5f5)',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      padding: '5px 12px',
                      minWidth: 130,
                    }}>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{cat}</div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        ${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                        {grandTotal > 0 ? ((amt / grandTotal) * 100).toFixed(1) : '0.0'}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--ink-3)', fontSize: 12.5,
            }}>
              엑셀 파일을 업로드하면 분류별 합계가 표시됩니다
            </div>
          )}
        </div>
      </div>

      {/* 에러 */}
      {status === 'error' && (
        <div style={{
          padding: '8px 12px', background: 'var(--danger-wash)',
          color: 'var(--danger)', borderRadius: 6, fontSize: 12.5,
        }}>
          ❌ {errorMsg}
        </div>
      )}

      {/* ── 원산지증명서 (C/O) 섹션 ── */}
      <div style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        background: 'var(--surface)',
        overflow: 'hidden',
      }}>
        {/* 헤더 바 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          borderBottom: cooFiles.length > 0 ? '1px solid var(--line)' : 'none',
          background: 'var(--surface-2, #f5f5f5)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 12.5, flex: 'none' }}>
            📋 원산지증명서 (C/O)
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {cooFiles.length > 0 ? `${cooFiles.length}개 파일` : '업로드된 파일 없음'}
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <label
              className="btn-base"
              style={{
                cursor: cooUploading ? 'not-allowed' : 'pointer',
                opacity: cooUploading ? 0.6 : 1,
                height: 28,
                fontSize: 11.5,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {cooUploading ? (
                <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
              ) : (
                <FileUp style={{ width: 13, height: 13 }} />
              )}
              <span>{cooUploading ? '업로드 중…' : '업로드'}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={cooUploading || !companyId}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCooUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {/* 파일 목록 */}
        {cooFiles.length > 0 && (
          <div>
            {cooFiles.map((f, idx) => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 14px',
                  borderBottom: idx < cooFiles.length - 1 ? '1px solid var(--line)' : 'none',
                  fontSize: 12,
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {f.mime_type === 'application/pdf' ? '📄' : '🖼️'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.file_name}
                </span>
                {f.file_size && (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', flex: 'none' }}>
                    {(f.file_size / 1024).toFixed(0)}KB
                  </span>
                )}
                {f.uploaded_at && (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', flex: 'none' }}>
                    {new Date(f.uploaded_at).toLocaleDateString('ko-KR')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleCooDownload(f)}
                  title="다운로드"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '2px 4px', color: 'var(--ink-2)', flex: 'none',
                  }}
                >
                  <Download style={{ width: 14, height: 14 }} />
                </button>
                <button
                  type="button"
                  onClick={() => handleCooDelete(f.id)}
                  title="삭제"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '2px 4px', color: 'var(--danger)', flex: 'none',
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 품목 테이블 ── */}
      {status === 'done' && rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2, #f5f5f5)' }}>
                {[
                  { label: 'No',          align: 'center' as const, w: 36  },
                  { label: 'Item Code',   align: 'center' as const, w: 110 },
                  { label: 'Description', align: 'left'   as const        },
                  { label: 'QTY',         align: 'center' as const, w: 50  },
                  { label: 'U/M',         align: 'center' as const, w: 44  },
                  { label: 'Price',       align: 'right'  as const, w: 68  },
                  { label: 'Amount',      align: 'right'  as const, w: 76  },
                  { label: '제품분류',    align: 'left'   as const, w: 140 },
                  { label: 'HS Code',     align: 'center' as const, w: 110 },
                  { label: '수입요건번호', align: 'center' as const, w: 150 },
                  { label: 'C/O Serial',  align: 'center' as const, w: 80  },
                ].map(({ label, align, w }) => (
                  <th
                    key={label}
                    style={{
                      padding: '7px 8px',
                      textAlign: align,
                      fontWeight: 600,
                      fontSize: 11.5,
                      borderBottom: '1px solid var(--line)',
                      whiteSpace: 'nowrap',
                      width: w ? `${w}px` : undefined,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const bg = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2, #f9f9f9)';
                return (
                  <tr
                    key={r.no}
                    style={{ background: bg, borderBottom: '1px solid var(--line)' }}
                  >
                    <td style={{ padding: '5px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 11 }}>{r.no}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.itemCode}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, maxWidth: 260, wordBreak: 'break-word' }}>{r.description}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: 11 }}>{r.qty}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'center', fontSize: 11 }}>{r.um}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontSize: 11 }}>{r.price.toFixed(2)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, fontSize: 11 }}>{r.amount.toFixed(2)}</td>
                    <EditCell
                      no={r.no} field="category" value={r.category} align="left"
                      editingCell={editingCell} editingValue={editingValue} setEditingValue={setEditingValue}
                      startEdit={startEdit} saveEdit={saveEdit} cancelEdit={cancelEdit}
                    />
                    <EditCell
                      no={r.no} field="hsCode" value={r.hsCode} align="center" mono
                      editingCell={editingCell} editingValue={editingValue} setEditingValue={setEditingValue}
                      startEdit={startEdit} saveEdit={saveEdit} cancelEdit={cancelEdit}
                    />
                    <EditCell
                      no={r.no} field="importReqNo" value={r.importReqNo} align="center" mono
                      editingCell={editingCell} editingValue={editingValue} setEditingValue={setEditingValue}
                      startEdit={startEdit} saveEdit={saveEdit} cancelEdit={cancelEdit}
                    />
                    <EditCell
                      no={r.no} field="originSerial" value={r.originSerial} align="center"
                      editingCell={editingCell} editingValue={editingValue} setEditingValue={setEditingValue}
                      startEdit={startEdit} saveEdit={saveEdit} cancelEdit={cancelEdit}
                    />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)', background: 'var(--surface-2, #f5f5f5)' }}>
                <td colSpan={6} style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12 }}>합계</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 12 }}>
                  {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
