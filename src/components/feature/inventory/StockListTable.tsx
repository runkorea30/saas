/**
 * 재고현황 목록 테이블 — 컬럼 폭 드래그 리사이즈 지원.
 *
 * - 컬럼 7개 (체크박스 없음 — 현재 벌크 액션이 없어 단순화).
 * - 현재재고: 0 이하 → danger 색, 0 < n <= 임계값 → warning 색, 그 외 기본.
 * - 상태 dot: 품절(red) / 부족(amber) / 정상(green).
 * - 제품별 안전재고 배지: current < safety_stock 이면 'danger',
 *   safety_stock ≤ current < reorder_point 이면 'warning'. 둘 다 NULL 이면 배지 없음.
 * - `last_movement_at` 이 null 이면 `—` 표시.
 */
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/feature/orders/primitives';
import { ResizeHandle } from '@/components/common/ResizeHandle';
import {
  useResizableColumns,
  type ColumnDef,
} from '@/hooks/useResizableColumns';
import { getCategoryLabel } from '@/constants/categories';
import type { StockStatus } from '@/utils/calculations';
import type { Product } from '@/hooks/queries/useProducts';

export interface StockRow extends Product {
  current_stock: number;
  opening_qty: number;
  sold_this_year: number;
  last_movement_at: string | null;
  status: StockStatus;
}

interface Props {
  rows: StockRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  onResetFilters?: () => void;
  /**
   * 현재재고 셀 클릭 → 인라인 편집 → 저장 핸들러.
   * `newStock` 은 사용자가 입력한 **절대값**. 호출자가 delta 변환 후 RPC 전송.
   * 미지정 시 셀은 read-only.
   */
  onSaveStock?: (productId: string, newStock: number) => Promise<void>;
}

type Align = 'left' | 'right' | 'center';

interface StockColumnDef extends ColumnDef {
  label: string;
  align: Align;
}

const ROW_GAP_PX = 10;
const ROW_PADDING_X_PX = 14;

const COLUMN_DEFS: ReadonlyArray<StockColumnDef> = [
  { key: 'code',          defaultWidth: 130, minWidth: 100, label: '제품코드', align: 'left' },
  { key: 'name',          defaultWidth: 240, minWidth: 140, label: '상품명',   align: 'left' },
  { key: 'category',      defaultWidth: 90,  minWidth: 70,  label: '카테고리', align: 'left' },
  { key: 'unit',          defaultWidth: 60,  minWidth: 48,  label: '단위',     align: 'left' },
  { key: 'current_stock', defaultWidth: 110, minWidth: 80,  label: '현재재고', align: 'right' },
  { key: 'status',        defaultWidth: 80,  minWidth: 60,  label: '상태',     align: 'center' },
  { key: 'last_movement', defaultWidth: 110, minWidth: 80,  label: '최근움직임', align: 'right' },
];

const STATUS_META: Record<StockStatus, { label: string; color: string }> = {
  out:    { label: '품절', color: 'var(--danger)' },
  low:    { label: '부족', color: 'var(--warning)' },
  normal: { label: '정상', color: 'var(--success)' },
};

export function StockListTable({
  rows,
  selectedId,
  onSelect,
  isLoading,
  onResetFilters,
  onSaveStock,
}: Props) {
  const { widths, draggingKey, onResizeStart, resetColumn } = useResizableColumns({
    pageKey: 'inventory-stock',
    columns: COLUMN_DEFS,
  });

  const gridTemplate = COLUMN_DEFS.map((c) => `${widths[c.key]}px`).join(' ');

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
            gridTemplateColumns: gridTemplate,
            alignItems: 'center',
            gap: ROW_GAP_PX,
            padding: `10px ${ROW_PADDING_X_PX}px`,
            borderBottom: '1px solid var(--line)',
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'var(--surface-2)',
          }}
        >
          {COLUMN_DEFS.map((col) => (
            <HeaderCell
              key={col.key}
              label={col.label}
              align={col.align}
              onResizeStart={onResizeStart(col.key)}
              isDragging={draggingKey === col.key}
              onReset={() => resetColumn(col.key)}
            />
          ))}
        </div>

        {/* 본문 */}
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            재고 데이터를 불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="조건에 맞는 제품이 없습니다"
            body="필터를 해제하거나 검색어를 지워 보세요."
            secondary={onResetFilters ? '필터 초기화' : undefined}
            onSecondary={onResetFilters}
          />
        ) : (
          rows.map((r) => {
            const isSelected = selectedId === r.id;
            const stockColor =
              r.current_stock <= 0
                ? 'var(--danger)'
                : r.status === 'low'
                  ? 'var(--warning)'
                  : 'var(--ink)';
            const statusMeta = STATUS_META[r.status];

            return (
              <div
                key={r.id}
                onClick={() => onSelect(r.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  alignItems: 'center',
                  gap: ROW_GAP_PX,
                  padding: `11px ${ROW_PADDING_X_PX}px`,
                  borderBottom: '1px solid var(--line)',
                  background: isSelected ? 'var(--brand-wash)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
                }}
              >
                <CellText value={r.code} numeric muted />
                <NameWithBadge
                  name={r.name}
                  badge={stockThresholdBadge(
                    r.current_stock,
                    r.safety_stock,
                    r.reorder_point,
                  )}
                />
                <CellText value={getCategoryLabel(r.category)} small muted />
                <CellText value={r.unit} small muted />

                {onSaveStock ? (
                  <EditableStockCell
                    productId={r.id}
                    currentStock={r.current_stock}
                    color={stockColor}
                    onSave={onSaveStock}
                  />
                ) : (
                  <CellText
                    value={fmtQty(r.current_stock)}
                    numeric
                    align="right"
                    weight={600}
                    color={stockColor}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span
                    className="chip"
                    style={{
                      color: statusMeta.color,
                      background:
                        r.status === 'out'
                          ? 'var(--danger-wash)'
                          : r.status === 'low'
                            ? 'var(--warning-wash)'
                            : 'var(--success-wash)',
                      fontSize: 11,
                    }}
                  >
                    <span className="dot" style={{ background: statusMeta.color }} />
                    {statusMeta.label}
                  </span>
                </div>

                <CellText
                  value={r.last_movement_at ? fmtDateShort(r.last_movement_at) : '—'}
                  numeric
                  align="right"
                  small
                  muted
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function HeaderCell({
  label,
  align,
  onResizeStart,
  isDragging,
  onReset,
}: {
  label: string;
  align: Align;
  onResizeStart: (e: React.MouseEvent) => void;
  isDragging: boolean;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        textAlign: align,
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        paddingRight: 8,
      }}
      title={label}
    >
      {label}
      <ResizeHandle
        onResizeStart={onResizeStart}
        isDragging={isDragging}
        onReset={onReset}
      />
    </div>
  );
}

function CellText({
  value,
  numeric,
  align,
  bold,
  small,
  muted,
  ink,
  weight,
  color,
}: {
  value: string;
  numeric?: boolean;
  align?: Align;
  bold?: boolean;
  small?: boolean;
  muted?: boolean;
  ink?: 'ink' | 'ink-2' | 'ink-3';
  weight?: number;
  color?: string;
}) {
  const fontSize = small ? 11.5 : bold ? 13 : 12.5;
  const resolved =
    color ??
    (muted
      ? 'var(--ink-3)'
      : ink === 'ink-2'
        ? 'var(--ink-2)'
        : 'var(--ink)');
  return (
    <div
      className={numeric ? 'num' : undefined}
      style={{
        fontSize,
        fontWeight: weight ?? (bold ? 500 : 400),
        color: resolved,
        textAlign: align ?? 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={value}
    >
      {value}
    </div>
  );
}

function NameWithBadge({
  name,
  badge,
}: {
  name: string;
  badge: { label: string; color: string; bg: string } | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      }}
      title={name}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </span>
      {badge && (
        <span
          className="chip"
          style={{
            color: badge.color,
            background: badge.bg,
            fontSize: 10.5,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}

function stockThresholdBadge(
  current: number,
  safety: number | null,
  reorder: number | null,
): { label: string; color: string; bg: string } | null {
  if (safety !== null && current < safety) {
    return { label: '안전재고 미달', color: 'var(--danger)', bg: 'var(--danger-wash)' };
  }
  if (reorder !== null && current < reorder) {
    return { label: '발주 권장', color: 'var(--warning)', bg: 'var(--warning-wash)' };
  }
  return null;
}

function fmtQty(n: number): string {
  return n.toLocaleString('ko-KR');
}

/**
 * 현재재고 인라인 편집 셀.
 * - 평소: 숫자만 표시. 호버 시 파란 점선 밑줄 + 배경 강조 → 클릭 가능 힌트.
 * - 클릭: input 으로 전환, 기존 숫자 전체 선택.
 * - Enter / blur: 저장. Escape: 취소.
 * - 행 클릭(선택) 이벤트와 충돌 회피 위해 wrapper 에 stopPropagation.
 * - 저장 중 disabled.
 * - 0 이상 정수만 허용. 값 동일하면 noop.
 */
function EditableStockCell({
  productId,
  currentStock,
  color,
  onSave,
}: {
  productId: string;
  currentStock: number;
  color: string;
  onSave: (productId: string, newStock: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentStock));
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 외부에서 currentStock 갱신되면 표시값도 동기화.
  useEffect(() => {
    if (!editing) setValue(String(currentStock));
  }, [currentStock, editing]);

  // 편집 진입 시 포커스 + 전체 선택.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const cancel = () => {
    setEditing(false);
    setValue(String(currentStock));
  };

  const commit = async () => {
    const trimmed = value.trim();
    const num = Number(trimmed);
    if (!trimmed || !Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
      cancel();
      return;
    }
    if (num === currentStock) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(productId, num);
      setEditing(false);
    } catch {
      // 저장 실패 시 편집 모드 유지 → 사용자가 재시도/취소 가능.
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'flex-end' }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          disabled={saving}
          style={{
            width: '100%',
            maxWidth: 90,
            height: 26,
            padding: '0 8px',
            border: '1.5px solid var(--brand, #2563EB)',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'right',
            fontFamily: 'var(--font-num)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--ink)',
            background: '#FFFFFF',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="num"
      role="button"
      tabIndex={0}
      title="클릭하여 재고 수정"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }
      }}
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color,
        textAlign: 'right',
        cursor: saving ? 'wait' : 'pointer',
        padding: '2px 6px',
        borderRadius: 4,
        background: hover ? 'var(--brand-wash, #EFF6FF)' : 'transparent',
        textDecoration: hover ? 'underline dashed' : 'none',
        textUnderlineOffset: 2,
        userSelect: 'none',
        opacity: saving ? 0.6 : 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {saving ? '저장 중…' : fmtQty(currentStock)}
    </div>
  );
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
