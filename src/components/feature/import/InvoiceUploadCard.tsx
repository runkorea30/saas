/**
 * 인보이스 자동 입고 카드 — ImportReceivingPage 상단에 마운트.
 *
 * 흐름: 주문서(엑셀) + 인보이스(PDF) 업로드 → [비교 시작] → 4상태 분류 결과 표 →
 *       [기존 입력 폼에 채우기] 로 부모의 rowInputs/header 교체.
 *
 * 🔴 Claude API 키는 클라이언트 노출 (VITE_ANTHROPIC_API_KEY) — 내부 도구 한정.
 *    Phase 3 에서 Supabase Edge Function 으로 이전 권장.
 * 🟠 검수/USD단가/환율/저장은 모두 부모 페이지의 기존 14컬럼 테이블에 위임.
 *    이 카드는 "파싱 + 비교 + 초기 채우기" 만 담당.
 * 🟡 BO(백오더): 인보이스에 qty_shipped=0 으로 나오거나, 주문서에만 있는 항목.
 *    "기존 입력 폼에 채우기" 시 BO 행은 제외 — 실입고 0 인 행을 만들지 않음.
 */
import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, X } from 'lucide-react';
import {
  parseOrderSheet,
  type OrderSheetRow,
} from '@/utils/orderSheetParser';
import {
  parseInvoicePDF,
  type InvoiceParsed,
} from '@/utils/invoiceParser';
import type { ImportRowInput, ImportInvoiceHeader } from '@/types/import';

// ───── 비교 결과 타입 ─────

export type CompareStatus =
  | 'match'
  | 'qty_diff'
  | 'invoice_only'
  | 'backorder';

interface ComparisonRow {
  code: string;
  description: string;
  unit: 'DZ' | 'EA';
  orderQty: number; // 0 = 주문서에 없음
  invoiceQty: number; // 0 = 인보이스에 없거나 BO
  price: number; // 인보이스 단가 (있으면) > 주문서 단가
  amount: number; // 인보이스 금액 (있으면) > 주문서 금액
  status: CompareStatus;
}

// ───── Props ─────

interface Props {
  /** 비교 결과를 기존 행 입력 폼으로 옮길 때 호출. */
  onFill: (rows: ImportRowInput[], headerPatch: Partial<ImportInvoiceHeader>) => void;
  disabled?: boolean;
}

type Tab = 'all' | 'diff' | 'backorder';

const STATUS_META: Record<
  CompareStatus,
  { label: string; color: string; bg: string }
> = {
  match:        { label: '일치',        color: 'var(--success)', bg: 'var(--success-wash)' },
  qty_diff:     { label: '수량차이',    color: 'var(--warning)', bg: 'var(--warning-wash)' },
  invoice_only: { label: '인보이스에만', color: 'var(--info)',    bg: 'var(--info-wash)' },
  backorder:    { label: '백오더',      color: 'var(--danger)',  bg: 'var(--danger-wash)' },
};

// ───────────────────────────────────────────────────────────

export function InvoiceUploadCard({ onFill, disabled }: Props) {
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{
    rows: ComparisonRow[];
    invoiceNo: string;
    invoiceDate: string;
  } | null>(null);
  const [tab, setTab] = useState<Tab>('all');

  const canCompare = Boolean(orderFile && invoiceFile) && !parsing && !disabled;

  const handleCompare = async () => {
    if (!orderFile || !invoiceFile) return;
    setError(null);
    setComparison(null);
    setParsing(true);
    try {
      const [orderRows, invoice] = await Promise.all([
        parseOrderSheet(orderFile),
        parseInvoicePDF(invoiceFile),
      ]);
      const rows = compareOrderInvoice(orderRows, invoice);
      setComparison({
        rows,
        invoiceNo: invoice.invoice_no,
        invoiceDate: invoice.invoice_date,
      });
      setTab('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  };

  const counts = useMemo(() => {
    const rows = comparison?.rows ?? [];
    let diff = 0;
    let bo = 0;
    for (const r of rows) {
      if (r.status === 'qty_diff' || r.status === 'invoice_only') diff++;
      if (r.status === 'backorder') bo++;
    }
    return { all: rows.length, diff, bo };
  }, [comparison]);

  const visibleRows = useMemo(() => {
    if (!comparison) return [];
    if (tab === 'all') return comparison.rows;
    if (tab === 'backorder')
      return comparison.rows.filter((r) => r.status === 'backorder');
    // 차이있음 = qty_diff + invoice_only
    return comparison.rows.filter(
      (r) => r.status === 'qty_diff' || r.status === 'invoice_only',
    );
  }, [comparison, tab]);

  const handleFill = () => {
    if (!comparison) return;
    // BO 제외 — 실제로 입고할 수 있는 행만.
    const fillable = comparison.rows.filter(
      (r) => r.status !== 'backorder' && r.invoiceQty > 0,
    );
    const rows: ImportRowInput[] = fillable.map((r) => ({
      id: makeId(),
      sourceCode: r.code,
      quantity: r.invoiceQty,
      unit: r.unit,
      adjustedQuantity: r.unit === 'DZ' ? r.invoiceQty * 12 : r.invoiceQty,
      totalUsd: r.amount,
    }));
    onFill(rows, {
      invoiceNumber: comparison.invoiceNo,
      invoiceDate: comparison.invoiceDate,
    });
  };

  const handleReset = () => {
    setOrderFile(null);
    setInvoiceFile(null);
    setComparison(null);
    setError(null);
    setTab('all');
  };

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 16,
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2
          className="disp"
          style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}
        >
          인보이스 자동 입고
        </h2>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          주문서(엑셀) + 인보이스(PDF) 업로드 → 비교 → 기존 폼에 채우기
        </span>
      </header>

      {/* Drop zones */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        <FileSlot
          label="주문서 (XLSX)"
          icon="excel"
          accept=".xlsx,.xls"
          file={orderFile}
          onChange={setOrderFile}
          disabled={parsing || disabled}
        />
        <FileSlot
          label="인보이스 (PDF)"
          icon="pdf"
          accept=".pdf"
          file={invoiceFile}
          onChange={setInvoiceFile}
          disabled={parsing || disabled}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            className="btn-base primary"
            onClick={handleCompare}
            disabled={!canCompare}
            style={{ height: 38, fontSize: 12.5, minWidth: 120 }}
          >
            {parsing ? '분석 중…' : '비교 시작'}
          </button>
          {(orderFile || invoiceFile || comparison) && (
            <button
              type="button"
              className="btn-base"
              onClick={handleReset}
              disabled={parsing}
              style={{ height: 28, fontSize: 11.5 }}
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-wash)',
            color: 'var(--danger)',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      )}

      {comparison && (
        <>
          {/* 요약 + 탭 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--ink-2)',
                marginRight: 8,
              }}
            >
              Invoice #
              <strong style={{ color: 'var(--ink)', marginLeft: 4 }}>
                {comparison.invoiceNo || '—'}
              </strong>
              <span style={{ marginLeft: 10 }}>
                date{' '}
                <strong style={{ color: 'var(--ink)' }}>
                  {comparison.invoiceDate || '—'}
                </strong>
              </span>
            </span>
            <TabButton
              active={tab === 'all'}
              onClick={() => setTab('all')}
              label={`전체 ${counts.all}`}
            />
            <TabButton
              active={tab === 'diff'}
              onClick={() => setTab('diff')}
              label={`차이있음 ${counts.diff}`}
              tone="warning"
            />
            <TabButton
              active={tab === 'backorder'}
              onClick={() => setTab('backorder')}
              label={`백오더 ${counts.bo}`}
              tone="danger"
            />
          </div>

          {/* 결과 테이블 */}
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '120px minmax(220px, 1fr) 60px 80px 100px 70px 100px',
                  gap: 10,
                  padding: '8px 12px',
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--font-num)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  minWidth: 760,
                }}
              >
                <span>제품코드</span>
                <span>제품명</span>
                <span style={{ textAlign: 'center' }}>단위</span>
                <span style={{ textAlign: 'right' }}>주문</span>
                <span style={{ textAlign: 'right' }}>인보이스</span>
                <span style={{ textAlign: 'right' }}>차이</span>
                <span style={{ textAlign: 'center' }}>상태</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {visibleRows.length === 0 ? (
                  <div
                    style={{
                      padding: 20,
                      textAlign: 'center',
                      color: 'var(--ink-3)',
                      fontSize: 12.5,
                    }}
                  >
                    표시할 행이 없습니다.
                  </div>
                ) : (
                  visibleRows.map((r) => {
                    const meta = STATUS_META[r.status];
                    const diff = r.invoiceQty - r.orderQty;
                    const diffColor =
                      diff === 0
                        ? 'var(--ink-3)'
                        : diff > 0
                          ? 'var(--success)'
                          : 'var(--danger)';
                    return (
                      <div
                        key={`${r.code}-${r.status}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            '120px minmax(220px, 1fr) 60px 80px 100px 70px 100px',
                          gap: 10,
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--line)',
                          fontSize: 12.5,
                          alignItems: 'center',
                          minWidth: 760,
                        }}
                      >
                        <span className="num" style={{ color: 'var(--ink-2)' }}>
                          {r.code}
                        </span>
                        <span
                          style={{
                            color: 'var(--ink)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={r.description}
                        >
                          {r.description || '—'}
                        </span>
                        <span
                          style={{
                            textAlign: 'center',
                            color: 'var(--ink-3)',
                            fontSize: 11.5,
                          }}
                        >
                          {r.unit}
                        </span>
                        <span
                          className="num"
                          style={{ textAlign: 'right', color: 'var(--ink-3)' }}
                        >
                          {r.orderQty === 0 ? '—' : r.orderQty.toLocaleString('ko-KR')}
                        </span>
                        <span
                          className="num"
                          style={{
                            textAlign: 'right',
                            color: 'var(--ink)',
                            fontWeight: 500,
                          }}
                        >
                          {r.invoiceQty === 0
                            ? '—'
                            : r.invoiceQty.toLocaleString('ko-KR')}
                        </span>
                        <span
                          className="num"
                          style={{
                            textAlign: 'right',
                            color: diffColor,
                            fontWeight: 600,
                          }}
                        >
                          {diff === 0
                            ? '—'
                            : `${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}`}
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <span
                            className="chip"
                            style={{
                              color: meta.color,
                              background: meta.bg,
                              fontSize: 10.5,
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 액션 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="btn-base"
              onClick={handleReset}
              style={{ height: 32, fontSize: 12.5 }}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-base primary"
              onClick={handleFill}
              disabled={
                comparison.rows.filter(
                  (r) => r.status !== 'backorder' && r.invoiceQty > 0,
                ).length === 0
              }
              style={{ height: 32, fontSize: 12.5 }}
            >
              기존 입력 폼에 채우기 (
              {
                comparison.rows.filter(
                  (r) => r.status !== 'backorder' && r.invoiceQty > 0,
                ).length
              }
              건)
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// helpers / subcomponents
// ───────────────────────────────────────────────────────────

function FileSlot({
  label,
  icon,
  accept,
  file,
  onChange,
  disabled,
}: {
  label: string;
  icon: 'excel' | 'pdf';
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const Icon = icon === 'excel' ? FileSpreadsheet : FileText;
  return (
    <label
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        border: `1px dashed ${dragOver ? 'var(--brand)' : 'var(--line-strong)'}`,
        borderRadius: 8,
        background: dragOver ? 'var(--brand-wash)' : 'var(--surface-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        minHeight: 56,
        transition: 'background .12s, border-color .12s',
      }}
    >
      <Icon
        size={20}
        color={file ? 'var(--brand)' : 'var(--ink-3)'}
        strokeWidth={1.6}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: file ? 'var(--ink)' : 'var(--ink-3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={file?.name}
        >
          {file ? file.name : '클릭 또는 드래그로 선택'}
        </div>
      </div>
      {file && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange(null);
          }}
          aria-label="파일 제거"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--ink-3)',
            padding: 2,
          }}
        >
          <X size={14} />
        </button>
      )}
      <input
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function TabButton({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: 'warning' | 'danger';
}) {
  const accent =
    tone === 'warning'
      ? 'var(--warning)'
      : tone === 'danger'
        ? 'var(--danger)'
        : 'var(--brand)';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        padding: '0 10px',
        border: `1px solid ${active ? accent : 'var(--line)'}`,
        background: active ? `${accent}1a` : 'var(--surface)',
        color: active ? accent : 'var(--ink-2)',
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `row_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

// ───────────────────────────────────────────────────────────
// 비교 로직
// ───────────────────────────────────────────────────────────

function compareOrderInvoice(
  orders: OrderSheetRow[],
  invoice: InvoiceParsed,
): ComparisonRow[] {
  const orderByCode = new Map<string, OrderSheetRow>();
  for (const o of orders) orderByCode.set(o.code, o);

  const invoiceByCode = new Map<string, InvoiceParsed['rows'][number]>();
  for (const r of invoice.rows) invoiceByCode.set(r.item_code, r);

  const seen = new Set<string>();
  const out: ComparisonRow[] = [];

  // 인보이스 기준 1차 패스
  for (const inv of invoice.rows) {
    const ord = orderByCode.get(inv.item_code);
    seen.add(inv.item_code);

    if (inv.qty_shipped === 0) {
      // BO — 주문 있었지만 출하 0 (또는 정보용)
      out.push({
        code: inv.item_code,
        description: inv.description || ord?.description || '',
        unit: (ord?.unit ?? inv.unit) as 'DZ' | 'EA',
        orderQty: ord?.qty ?? 0,
        invoiceQty: 0,
        price: inv.price || ord?.price || 0,
        amount: inv.amount,
        status: 'backorder',
      });
      continue;
    }

    if (!ord) {
      out.push({
        code: inv.item_code,
        description: inv.description,
        unit: inv.unit,
        orderQty: 0,
        invoiceQty: inv.qty_shipped,
        price: inv.price,
        amount: inv.amount,
        status: 'invoice_only',
      });
      continue;
    }

    out.push({
      code: inv.item_code,
      description: inv.description || ord.description,
      unit: ord.unit,
      orderQty: ord.qty,
      invoiceQty: inv.qty_shipped,
      price: inv.price || ord.price,
      amount: inv.amount,
      status: ord.qty === inv.qty_shipped ? 'match' : 'qty_diff',
    });
  }

  // 주문서에만 있고 인보이스 전무 (Claude 가 BO 항목까지 포함 못 한 경우의 안전망)
  for (const ord of orders) {
    if (seen.has(ord.code)) continue;
    out.push({
      code: ord.code,
      description: ord.description,
      unit: ord.unit,
      orderQty: ord.qty,
      invoiceQty: 0,
      price: ord.price,
      amount: 0,
      status: 'backorder',
    });
  }

  // 정렬: 상태별 → 코드 오름차순
  const STATUS_ORDER: Record<CompareStatus, number> = {
    qty_diff: 0,
    backorder: 1,
    invoice_only: 2,
    match: 3,
  };
  out.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return a.code.localeCompare(b.code, 'ko');
  });
  return out;
}
