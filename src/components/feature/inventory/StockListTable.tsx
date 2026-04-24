/**
 * 재고현황 목록 테이블 — 컬럼 폭 드래그 리사이즈 지원.
 *
 * - 컬럼 7개 (체크박스 없음 — 현재 벌크 액션이 없어 단순화).
 * - 현재재고: 0 이하 → danger 색, 0 < n <= 임계값 → warning 색, 그 외 기본.
 * - 상태 dot: 품절(red) / 부족(amber) / 정상(green).
 * - `last_movement_at` 이 null 이면 `—` 표시.
 */
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
                <CellText value={r.name} bold ink="ink" />
                <CellText value={getCategoryLabel(r.category)} small muted />
                <CellText value={r.unit} small muted />

                <CellText
                  value={fmtQty(r.current_stock)}
                  numeric
                  align="right"
                  weight={600}
                  color={stockColor}
                />

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

function fmtQty(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
