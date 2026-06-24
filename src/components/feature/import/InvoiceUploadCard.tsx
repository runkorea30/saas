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
  type InvoiceParsedRow,
} from '@/utils/invoiceParser';
import type { ImportRowInput, ImportInvoiceHeader } from '@/types/import';

// 주문서/인보이스/OPS 제품 코드 간 매칭용 정규화.
// 공백·하이픈 제거 + 소문자 통일. (leading-zero 는 제거하지 않음 — 다른 SKU 가 충돌할 수 있음.)
function normalizeCode(code: string | number | null | undefined): string {
  if (code === null || code === undefined) return '';
  return String(code).trim().replace(/-/g, '').replace(/\s/g, '').toLowerCase();
}

// ───── 비교 결과 타입 ─────

export type CompareStatus =
  | 'match'         // 일치 — 코드·수량·단가 모두 동일
  | 'qty_diff'      // 수량불일치 — 코드는 같은데 수량 다름
  | 'amount_diff'   // 금액불일치 — 코드·수량 같지만 단가 다름
  | 'order_only'    // 주문서만 — 주문 있고 인보이스에 없음 (구 backorder)
  | 'invoice_only'  // 인보이스만 — 주문은 없고 인보이스만 존재
  | 'unknown';      // 미확인 — OPS products 에 등록되지 않은 코드

interface ComparisonRow {
  id: string; // 안정적 React key + 편집 핸들러 식별자 (코드 변경되어도 유지)
  code: string;
  originalCode: string; // 파싱 직후 원본 코드 (편집 감지용)
  description: string;
  unit: 'DZ' | 'EA';
  orderQty: number;
  invoiceQty: number;
  originalInvoiceQty: number; // 현재 매칭 기준 원본 수량 (재매칭 시 리셋)
  orderPrice?: number;   // 주문서 단가 (없으면 undefined → 금액 비교 스킵)
  invoicePrice: number;  // 인보이스 단가
  amount: number;        // 인보이스 금액 (totalUsd 채움 용도)
  isInOps: boolean;      // OPS products 에 코드가 존재하는지
  status: CompareStatus;
}

function calcStatus(
  orderQty: number,
  invoiceQty: number,
  invoicePrice: number,
  orderPrice: number | undefined,
  isInOps: boolean,
): CompareStatus {
  if (!isInOps) return 'unknown';
  if (orderQty === 0 && invoiceQty > 0) return 'invoice_only';
  if (invoiceQty === 0 && orderQty > 0) return 'order_only';
  if (orderQty !== invoiceQty) return 'qty_diff';
  if (orderPrice !== undefined && Math.abs(invoicePrice - orderPrice) > 0.01) {
    return 'amount_diff';
  }
  return 'match';
}

// ───── Props ─────

interface Props {
  /** 비교 결과를 기존 행 입력 폼으로 옮길 때 호출. */
  onFill: (rows: ImportRowInput[], headerPatch: Partial<ImportInvoiceHeader>) => void;
  disabled?: boolean;
  /** OPS products 목록. 매칭된 코드의 한글 제품명을 표시하는 데 사용. */
  products?: ReadonlyArray<{ code: string; name: string }>;
}

type Tab = 'all' | CompareStatus;

// '금액불일치' 는 테마 토큰에 별도 orange 가 없어 hex 직접 지정 (amber 와 구분).
const STATUS_META: Record<
  CompareStatus,
  { label: string; color: string; bg: string }
> = {
  match:        { label: '일치',       color: 'var(--success)', bg: 'var(--success-wash)' },
  qty_diff:     { label: '수량불일치', color: 'var(--warning)', bg: 'var(--warning-wash)' },
  amount_diff:  { label: '금액불일치', color: '#C8590E',         bg: '#FAE3D2' },
  order_only:   { label: '주문서만',   color: 'var(--danger)',  bg: 'var(--danger-wash)' },
  invoice_only: { label: '인보이스만', color: 'var(--info)',    bg: 'var(--info-wash)' },
  unknown:      { label: '미확인',     color: 'var(--ink-3)',   bg: 'var(--surface-2)' },
};

// ───────────────────────────────────────────────────────────

export function InvoiceUploadCard({ onFill, disabled, products }: Props) {
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{
    rows: ComparisonRow[];
    /** 원본 주문서 행 — 코드 편집 시 재매칭 소스. */
    orderRows: OrderSheetRow[];
    /** 원본 인보이스 행 — 코드 편집 시 재매칭 소스. */
    invoiceRows: InvoiceParsedRow[];
    invoiceNo: string;
    invoiceDate: string;
  } | null>(null);
  const [tab, setTab] = useState<Tab>('all');

  // 정규화된 OPS 제품코드 → 한글명 맵. (인보이스/주문서의 영문명을 한글로 치환)
  const productNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products ?? []) {
      const key = normalizeCode(p.code);
      if (key && p.name) map.set(key, p.name);
    }
    return map;
  }, [products]);

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
      const rows = compareOrderInvoice(orderRows, invoice, productNameByCode);
      setComparison({
        rows,
        orderRows,
        invoiceRows: invoice.rows,
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
    const c: Record<CompareStatus, number> & { all: number; edited: number } = {
      all: rows.length,
      edited: 0,
      match: 0,
      qty_diff: 0,
      amount_diff: 0,
      order_only: 0,
      invoice_only: 0,
      unknown: 0,
    };
    for (const r of rows) {
      c[r.status]++;
      if (r.invoiceQty !== r.originalInvoiceQty || r.code !== r.originalCode) {
        c.edited++;
      }
    }
    return c;
  }, [comparison]);

  const handleQtyChange = (rowId: string, newQty: number) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const safeQty = Number.isFinite(newQty) ? Math.max(0, Math.floor(newQty)) : 0;
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          invoiceQty: safeQty,
          status: calcStatus(
            row.orderQty,
            safeQty,
            row.invoicePrice,
            row.orderPrice,
            row.isInOps,
          ),
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  // 코드 셀 입력 변경 — 화면 표시만 즉시 반영 (재매칭은 blur 에서).
  const handleCodeChange = (rowId: string, rawCode: string) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((row) =>
        row.id === rowId ? { ...row, code: rawCode } : row,
      );
      return { ...prev, rows: nextRows };
    });
  };

  // 코드 셀 blur — 새 코드로 OPS / 주문서 / 인보이스 재매칭 후 상태 재계산.
  const handleCodeBlur = (rowId: string, rawNewCode: string) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        const newCode = rawNewCode.trim();
        const normNew = normalizeCode(newCode);
        const normCur = normalizeCode(row.code);

        // 정규화 형태가 동일하면 재매칭 스킵 (사용자 수량 편집 보존).
        if (normNew === normCur) {
          return newCode !== row.code ? { ...row, code: newCode } : row;
        }

        const matchedOrder = prev.orderRows.find(
          (r) => normalizeCode(r.code) === normNew,
        );
        const matchedInvoice = prev.invoiceRows.find(
          (r) => normalizeCode(r.item_code) === normNew,
        );
        const opsName = productNameByCode.get(normNew);
        const isInOps = opsName !== undefined;

        const newOrderQty = matchedOrder?.qty ?? 0;
        const newOrderPrice = matchedOrder?.price;
        const newInvoiceQty = matchedInvoice?.qty_shipped ?? 0;
        const newInvoicePrice = matchedInvoice?.price ?? 0;
        const newAmount = matchedInvoice?.amount ?? 0;
        const newUnit = (matchedOrder?.unit ??
          matchedInvoice?.unit ??
          row.unit) as 'DZ' | 'EA';
        const newDesc =
          opsName ||
          matchedInvoice?.description ||
          matchedOrder?.description ||
          '';

        return {
          ...row,
          code: newCode,
          description: newDesc,
          unit: newUnit,
          orderQty: newOrderQty,
          invoiceQty: newInvoiceQty,
          originalInvoiceQty: newInvoiceQty, // 새 매칭 기준 baseline 으로 리셋
          orderPrice: newOrderPrice,
          invoicePrice: newInvoicePrice,
          amount: newAmount,
          isInOps,
          status: calcStatus(
            newOrderQty,
            newInvoiceQty,
            newInvoicePrice,
            newOrderPrice,
            isInOps,
          ),
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  const visibleRows = useMemo(() => {
    if (!comparison) return [];
    if (tab === 'all') return comparison.rows;
    return comparison.rows.filter((r) => r.status === tab);
  }, [comparison, tab]);

  const handleFill = () => {
    if (!comparison) return;
    // '주문서만' 행 제외 — 실제로 입고할 수 있는 행만.
    const fillable = comparison.rows.filter(
      (r) => r.status !== 'order_only' && r.invoiceQty > 0,
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
              active={tab === 'qty_diff'}
              onClick={() => setTab('qty_diff')}
              label={`수량불일치 ${counts.qty_diff}`}
              tone="warning"
            />
            <TabButton
              active={tab === 'amount_diff'}
              onClick={() => setTab('amount_diff')}
              label={`금액불일치 ${counts.amount_diff}`}
              tone="warning"
            />
            <TabButton
              active={tab === 'order_only'}
              onClick={() => setTab('order_only')}
              label={`주문서만 ${counts.order_only}`}
              tone="danger"
            />
            <TabButton
              active={tab === 'invoice_only'}
              onClick={() => setTab('invoice_only')}
              label={`인보이스만 ${counts.invoice_only}`}
            />
            <TabButton
              active={tab === 'unknown'}
              onClick={() => setTab('unknown')}
              label={`미확인 ${counts.unknown}`}
            />
            {counts.edited > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11.5,
                  color: 'var(--warning)',
                  fontWeight: 500,
                }}
              >
                {counts.edited}건 수정됨
              </span>
            )}
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
                    const qtyEdited = r.invoiceQty !== r.originalInvoiceQty;
                    const codeEdited =
                      normalizeCode(r.code) !== normalizeCode(r.originalCode);
                    const rowEdited = qtyEdited || codeEdited;
                    return (
                      <div
                        key={r.id}
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
                          background: rowEdited ? 'var(--warning-wash)' : undefined,
                        }}
                      >
                        <input
                          type="text"
                          value={r.code}
                          onChange={(e) =>
                            handleCodeChange(r.id, e.target.value)
                          }
                          onBlur={(e) => handleCodeBlur(r.id, e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          title={
                            codeEdited
                              ? `원본 코드: ${r.originalCode}`
                              : undefined
                          }
                          className="num"
                          style={{
                            width: '100%',
                            height: 24,
                            padding: '0 4px',
                            border: 'none',
                            borderBottom: `1px ${codeEdited ? 'solid' : 'dashed'} ${codeEdited ? 'var(--warning)' : 'var(--line)'}`,
                            background: 'transparent',
                            color: 'var(--ink-2)',
                            fontSize: 12.5,
                            outline: 'none',
                          }}
                        />
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
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={r.invoiceQty}
                            onChange={(e) =>
                              handleQtyChange(r.id, Number(e.target.value))
                            }
                            onFocus={(e) => e.currentTarget.select()}
                            title={
                              qtyEdited
                                ? `원본: ${r.originalInvoiceQty.toLocaleString('ko-KR')}`
                                : undefined
                            }
                            className="num"
                            style={{
                              width: 72,
                              height: 26,
                              padding: '0 6px',
                              textAlign: 'right',
                              border: `1px solid ${qtyEdited ? 'var(--warning)' : 'var(--line)'}`,
                              borderRadius: 4,
                              background: 'var(--surface)',
                              color: 'var(--ink)',
                              fontWeight: 500,
                              fontSize: 12.5,
                              outline: 'none',
                            }}
                          />
                        </div>
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
                  (r) => r.status !== 'order_only' && r.invoiceQty > 0,
                ).length === 0
              }
              style={{ height: 32, fontSize: 12.5 }}
            >
              기존 입력 폼에 채우기 (
              {
                comparison.rows.filter(
                  (r) => r.status !== 'order_only' && r.invoiceQty > 0,
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
  productNameByCode: ReadonlyMap<string, string> = new Map(),
): ComparisonRow[] {
  // 정규화된 코드 → 주문 행. (대소문자/공백/하이픈 차이로 매칭 누락되던 문제 해결)
  const orderByCode = new Map<string, OrderSheetRow>();
  for (const o of orders) orderByCode.set(normalizeCode(o.code), o);

  const seen = new Set<string>();
  const out: ComparisonRow[] = [];

  // 인보이스 기준 1차 패스
  for (const inv of invoice.rows) {
    const normInv = normalizeCode(inv.item_code);
    const ord = orderByCode.get(normInv);
    seen.add(normInv);

    // OPS 한글 제품명 우선, 없으면 인보이스/주문서 영문명.
    const opsName = productNameByCode.get(normInv);
    const isInOps = opsName !== undefined;
    const desc = opsName || inv.description || ord?.description || '';

    const orderQty = ord?.qty ?? 0;
    const orderPrice = ord?.price;
    const invoiceQty = inv.qty_shipped;
    const invoicePrice = inv.price || ord?.price || 0;

    out.push({
      id: makeId(),
      code: inv.item_code,
      originalCode: inv.item_code,
      description: desc,
      unit: (ord?.unit ?? inv.unit) as 'DZ' | 'EA',
      orderQty,
      invoiceQty,
      originalInvoiceQty: invoiceQty,
      orderPrice,
      invoicePrice,
      amount: inv.amount,
      isInOps,
      status: calcStatus(orderQty, invoiceQty, invoicePrice, orderPrice, isInOps),
    });
  }

  // 주문서에만 있고 인보이스 전무 (Claude 가 BO 항목까지 포함 못 한 경우의 안전망)
  for (const ord of orders) {
    const normOrd = normalizeCode(ord.code);
    if (seen.has(normOrd)) continue;
    const opsName = productNameByCode.get(normOrd);
    const isInOps = opsName !== undefined;
    out.push({
      id: makeId(),
      code: ord.code,
      originalCode: ord.code,
      description: opsName || ord.description,
      unit: ord.unit,
      orderQty: ord.qty,
      invoiceQty: 0,
      originalInvoiceQty: 0,
      orderPrice: ord.price,
      invoicePrice: 0,
      amount: 0,
      isInOps,
      status: calcStatus(ord.qty, 0, 0, ord.price, isInOps),
    });
  }

  // 정렬: 상태 중요도 → 코드 오름차순
  // (수량불일치 → 금액불일치 → 주문서만 → 인보이스만 → 미확인 → 일치)
  const STATUS_ORDER: Record<CompareStatus, number> = {
    qty_diff: 0,
    amount_diff: 1,
    order_only: 2,
    invoice_only: 3,
    unknown: 4,
    match: 5,
  };
  out.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return a.code.localeCompare(b.code, 'ko');
  });
  return out;
}
