/**
 * 수입/매입 — 행 테이블 (14열, 편집 가능).
 *
 * 컬럼: 수량 · 단위 · 입고수량 · 코드(원본) · 코드(변환) · 제품명 · 수입원가(USD) ·
 *       합계(USD) · 수입단가(USD) · 운송비배분(USD) · 원가(KRW) · 원가합계(KRW) ·
 *       DB매칭 · 삭제
 *
 * 🟡 read-only 셀은 값이 0 이면 "—" 로 표시.
 * 🟡 `adjustedQuantity` 는 기본값이 DZ×12 / EA 이지만 사용자가 직접 편집 가능.
 *    부모 쪽에서 "이전 기본값과 동일하면 auto-update" 로직을 수행한다.
 */
import { Plus, Trash2 } from 'lucide-react';
import type {
  ImportRow,
  ImportRowInput,
  ImportRowStatus,
  ImportUnit,
} from '@/types/import';

interface Props {
  rows: ImportRow[];
  onUpdateRow: (id: string, patch: Partial<ImportRowInput>) => void;
  onRemoveRow: (id: string) => void;
  onAddRow: () => void;
  disabled?: boolean;
}

// 컬럼 정의 — px 고정폭으로 overflow-x 스크롤 허용.
const COLS = {
  qty:        80,
  unit:       72,
  adjusted:   88,
  sourceCode: 120,
  converted:  110,
  productName: 220,
  sourceUnit: 104,
  totalUsd:   110,
  unitPrice:  104,
  shipping:   108,
  costKrw:    104,
  lineKrw:    128,
  match:      80,
  trash:      44,
};

const GRID_TEMPLATE = Object.values(COLS).map((w) => `${w}px`).join(' ');
const MIN_WIDTH = Object.values(COLS).reduce((s, n) => s + n, 0) + 14 * 10;

export function ImportRowsTable({
  rows,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  disabled,
}: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        {/* 헤더 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID_TEMPLATE,
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderBottom: '1px solid var(--line)',
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'var(--surface-2)',
            minWidth: MIN_WIDTH,
          }}
        >
          <HeaderCell>수량</HeaderCell>
          <HeaderCell>단위</HeaderCell>
          <HeaderCell>입고수량</HeaderCell>
          <HeaderCell>코드(원본)</HeaderCell>
          <HeaderCell>코드(변환)</HeaderCell>
          <HeaderCell>제품명</HeaderCell>
          <HeaderCell align="right">수입원가(USD)</HeaderCell>
          <HeaderCell align="right">합계(USD)</HeaderCell>
          <HeaderCell align="right">수입단가(USD)</HeaderCell>
          <HeaderCell align="right">운송비배분(USD)</HeaderCell>
          <HeaderCell align="right">원가(KRW)</HeaderCell>
          <HeaderCell align="right">원가합계(KRW)</HeaderCell>
          <HeaderCell align="center">DB매칭</HeaderCell>
          <HeaderCell align="center">삭제</HeaderCell>
        </div>

        {/* 본문 */}
        {rows.length === 0 ? (
          <div
            style={{
              padding: 30,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
              minWidth: MIN_WIDTH,
            }}
          >
            아래 [행 추가] 버튼을 눌러 첫 행을 만드세요.
          </div>
        ) : (
          rows.map((r) => (
            <RowView
              key={r.id}
              row={r}
              onUpdate={(patch) => onUpdateRow(r.id, patch)}
              onRemove={() => onRemoveRow(r.id)}
              disabled={disabled}
            />
          ))
        )}
      </div>

      {/* 행 추가 */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--line)',
          background: 'var(--surface-2)',
        }}
      >
        <button
          type="button"
          onClick={onAddRow}
          disabled={disabled}
          className="btn-base"
          style={{ height: 28, fontSize: 12 }}
        >
          <Plus size={12} /> 행 추가
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function RowView({
  row,
  onUpdate,
  onRemove,
  disabled,
}: {
  row: ImportRow;
  onUpdate: (patch: Partial<ImportRowInput>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const parseNum = (s: string): number => {
    if (!s.trim()) return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const parseInt10 = (s: string): number => {
    if (!s.trim()) return 0;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const numStr = (v: number) => (Number.isFinite(v) && v !== 0 ? String(v) : '');

  const hasSourceInput = row.sourceCode.trim().length > 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderBottom: '1px solid var(--line)',
        minWidth: MIN_WIDTH,
      }}
    >
      {/* 수량 */}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={numStr(row.quantity)}
        onChange={(e) => onUpdate({ quantity: parseInt10(e.target.value) })}
        disabled={disabled}
        style={editInputRight}
      />

      {/* 단위 */}
      <select
        value={row.unit}
        onChange={(e) => onUpdate({ unit: e.target.value as ImportUnit })}
        disabled={disabled}
        style={selectStyle}
      >
        <option value="DZ">DZ</option>
        <option value="EA">EA</option>
      </select>

      {/* 입고수량 */}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={numStr(row.adjustedQuantity)}
        onChange={(e) =>
          onUpdate({ adjustedQuantity: parseInt10(e.target.value) })
        }
        disabled={disabled}
        style={editInputRight}
      />

      {/* 코드(원본) */}
      <input
        type="text"
        value={row.sourceCode}
        onChange={(e) => onUpdate({ sourceCode: e.target.value })}
        placeholder="720-01-001"
        disabled={disabled}
        style={editInputLeft}
      />

      {/* 코드(변환) */}
      <ReadOnlyCell
        value={row.convertedCode || (hasSourceInput ? '' : '—')}
        numeric
        muted
        title={row.convertedCode}
      />

      {/* 제품명 */}
      <ReadOnlyCell
        value={
          row.productName ||
          (hasSourceInput
            ? row.status === 'unmatched'
              ? '(미매칭)'
              : ''
            : '—')
        }
        muted={!row.productName}
        color={row.status === 'unmatched' && hasSourceInput ? 'var(--danger)' : undefined}
        title={row.productName}
      />

      {/* 수입원가(USD) — 표시 전용 derive */}
      <ReadOnlyCell value={fmtUsd(row.sourceUnitPriceUsd)} numeric align="right" muted />

      {/* 합계(USD) — 입력 */}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={numStr(row.totalUsd)}
        onChange={(e) => onUpdate({ totalUsd: parseNum(e.target.value) })}
        disabled={disabled}
        style={editInputRight}
      />

      {/* 수입단가(USD) */}
      <ReadOnlyCell value={fmtUsd(row.unitPriceUsd)} numeric align="right" />

      {/* 운송비배분(USD) */}
      <ReadOnlyCell
        value={fmtUsd(row.shippingAllocatedUsd)}
        numeric
        align="right"
        muted
      />

      {/* 원가(KRW) */}
      <ReadOnlyCell
        value={row.costKrw > 0 ? `₩${row.costKrw.toLocaleString('ko-KR')}` : '—'}
        numeric
        align="right"
      />

      {/* 원가합계(KRW) */}
      <ReadOnlyCell
        value={
          row.lineTotalKrw > 0 ? `₩${row.lineTotalKrw.toLocaleString('ko-KR')}` : '—'
        }
        numeric
        align="right"
        bold
      />

      {/* DB매칭 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MatchChip status={row.status} hasInput={hasSourceInput} />
      </div>

      {/* 삭제 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="행 삭제"
          title="행 삭제"
          style={{
            height: 26,
            width: 26,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink-3)',
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trash2 size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function HeaderCell({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <div
      style={{
        textAlign: align,
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </div>
  );
}

function ReadOnlyCell({
  value,
  numeric,
  align = 'left',
  bold,
  muted,
  color,
  title,
}: {
  value: string;
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  bold?: boolean;
  muted?: boolean;
  color?: string;
  title?: string;
}) {
  const resolved = color ?? (muted ? 'var(--ink-3)' : 'var(--ink)');
  return (
    <div
      className={numeric ? 'num' : undefined}
      style={{
        fontSize: 12.5,
        fontWeight: bold ? 600 : 400,
        color: resolved,
        textAlign: align,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontVariantNumeric: 'tabular-nums',
      }}
      title={title ?? value}
    >
      {value}
    </div>
  );
}

function MatchChip({
  status,
  hasInput,
}: {
  status: ImportRowStatus;
  hasInput: boolean;
}) {
  if (!hasInput) {
    return (
      <span
        className="chip"
        style={{ color: 'var(--ink-3)', background: 'var(--surface-2)', fontSize: 10.5 }}
      >
        —
      </span>
    );
  }
  if (status === 'matched') {
    return (
      <span
        className="chip"
        style={{
          color: 'var(--success)',
          background: 'var(--success-wash)',
          fontSize: 10.5,
        }}
      >
        <span className="dot" style={{ background: 'var(--success)' }} />
        매칭
      </span>
    );
  }
  return (
    <span
      className="chip"
      style={{
        color: 'var(--danger)',
        background: 'var(--danger-wash)',
        fontSize: 10.5,
      }}
    >
      <span className="dot" style={{ background: 'var(--danger)' }} />
      미매칭
    </span>
  );
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ───────────────────────────────────────────────────────────

const baseInput: React.CSSProperties = {
  height: 28,
  border: '1px solid var(--line)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 12,
  fontFamily: 'var(--font-num)',
  outline: 'none',
  width: '100%',
  minWidth: 0,
};

const editInputLeft: React.CSSProperties = {
  ...baseInput,
  padding: '0 8px',
  textAlign: 'left',
};
const editInputRight: React.CSSProperties = {
  ...baseInput,
  padding: '0 8px',
  textAlign: 'right',
};
const selectStyle: React.CSSProperties = {
  ...baseInput,
  padding: '0 6px',
};
