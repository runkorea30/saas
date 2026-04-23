/**
 * Orders 좌측 마스터 리스트.
 *
 * - 컬럼 5개(주문일/거래처/수량/총액/상태) 전부 드래그 리사이즈.
 *   pageKey='orders' → `mc.orders.columns` localStorage 저장.
 * - 공용 `useResizableColumns` + `ResizeHandle` 사용 (hairline → hover → drag).
 * - 체크박스 열은 32px 고정(리사이저 없음).
 * - 행 선택(단일) + 체크박스(다중) 분리 — 클릭=선택, 체크박스=일괄.
 */
import { useMemo } from 'react';
import {
  Check,
  EmptyState,
  GradeBadge,
  StatusBadge,
  fmtDate,
} from './primitives';
import { ResizeHandle } from '@/components/common/ResizeHandle';
import {
  useResizableColumns,
  type ColumnDef,
} from '@/hooks/useResizableColumns';
import type { Order } from '@/types/orders';

type Align = 'left' | 'right' | 'center';

interface OrderColumnDef extends ColumnDef {
  label: string;
  align: Align;
}

const CHECKBOX_COL_PX = 32;
const ROW_GAP_PX = 10;
const ROW_PADDING_X_PX = 14;

const COLUMN_DEFS: ReadonlyArray<OrderColumnDef> = [
  { key: 'order_date',    defaultWidth: 120, minWidth: 100, label: '주문일', align: 'left' },
  { key: 'customer_name', defaultWidth: 220, minWidth: 140, label: '거래처', align: 'left' },
  { key: 'quantity',      defaultWidth: 90,  minWidth: 70,  label: '수량',   align: 'right' },
  { key: 'total_amount',  defaultWidth: 120, minWidth: 100, label: '총액',   align: 'right' },
  { key: 'status',        defaultWidth: 90,  minWidth: 70,  label: '상태',   align: 'center' },
];

export interface OrderListTableProps {
  orders: Order[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  checked: Record<string, boolean>;
  onToggleChecked: (id: string) => void;
  onTogglePageChecked: () => void;
  pageIds: string[];
  allPageChecked: boolean;
  somePageChecked: boolean;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  perPage: number;
  totalFiltered: number;
  isLoading: boolean;
  onResetFilters?: () => void;
}

function pagesAround(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (cur > 3) out.push('…');
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
  if (cur < total - 2) out.push('…');
  out.push(total);
  return out;
}

function pageBtnStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    minWidth: 26,
    height: 26,
    padding: '0 6px',
    border: `1px solid ${active ? 'var(--brand-wash-2)' : 'var(--line)'}`,
    borderRadius: 6,
    background: active ? 'var(--brand-wash)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--ink-2)',
    fontFamily: 'var(--font-num)',
    fontSize: 11,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}

export function OrderListTable(props: OrderListTableProps) {
  const {
    orders,
    selectedId,
    onSelect,
    checked,
    onToggleChecked,
    onTogglePageChecked,
    allPageChecked,
    somePageChecked,
    page,
    totalPages,
    onPageChange,
    perPage,
    totalFiltered,
    isLoading,
    onResetFilters,
  } = props;

  const { widths, draggingKey, onResizeStart, resetColumn } = useResizableColumns({
    pageKey: 'orders',
    columns: COLUMN_DEFS,
  });

  const gridTemplate = `${CHECKBOX_COL_PX}px ${COLUMN_DEFS.map(
    (c) => `${widths[c.key]}px`,
  ).join(' ')}`;

  const rangeText = useMemo(() => {
    if (totalFiltered === 0) return '0건';
    const from = (page - 1) * perPage + 1;
    const to = Math.min(page * perPage, totalFiltered);
    return `${totalFiltered}건 중 ${from}–${to}`;
  }, [page, perPage, totalFiltered]);

  return (
    <div
      className="card-surface"
      style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}
    >
      <div style={{ overflowX: 'auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridTemplate,
            gap: ROW_GAP_PX,
            padding: `10px ${ROW_PADDING_X_PX}px`,
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            fontSize: 10.5,
            fontWeight: 500,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-num)',
            alignItems: 'center',
          }}
        >
          <Check
            on={allPageChecked}
            indet={!allPageChecked && somePageChecked}
            onChange={onTogglePageChecked}
          />
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

        {/* Body */}
        {isLoading ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            주문 내역 불러오는 중…
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="조건에 맞는 주문이 없어요"
            body="기간을 넓히거나 필터를 초기화해 보세요."
            secondary="필터 초기화"
            onSecondary={onResetFilters}
          />
        ) : (
          orders.map((o) => {
            const d = new Date(o.order_date);
            const sel = o.id === selectedId;
            const isChecked = !!checked[o.id];
            const totalQty = o.items.reduce(
              (s, it) => s + Math.abs(it.quantity),
              0,
            );
            const hasReturn = o.items.some((it) => it.is_return);
            const customerName = o.customer?.name ?? '—';
            return (
              <div
                key={o.id}
                onClick={() => onSelect(o.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  gap: ROW_GAP_PX,
                  padding: `11px ${ROW_PADDING_X_PX}px`,
                  borderBottom: '1px solid var(--line)',
                  borderLeft: sel
                    ? '3px solid var(--brand)'
                    : '3px solid transparent',
                  paddingLeft: sel ? 11 : 14,
                  background: sel
                    ? 'var(--brand-wash)'
                    : isChecked
                      ? 'var(--surface-2)'
                      : 'transparent',
                  cursor: 'pointer',
                  alignItems: 'center',
                  transition: 'background .12s',
                }}
                onMouseEnter={(e) => {
                  if (!sel) e.currentTarget.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!sel)
                    e.currentTarget.style.background = isChecked
                      ? 'var(--surface-2)'
                      : 'transparent';
                }}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Check on={isChecked} onChange={() => onToggleChecked(o.id)} />
                </div>

                {/* 주문일 */}
                <div
                  style={{
                    fontFamily: 'var(--font-num)',
                    fontSize: 11.5,
                    color: 'var(--ink-2)',
                    lineHeight: 1.35,
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      color: 'var(--ink)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={fmtDate(d)}
                  >
                    {fmtDate(d)}
                  </div>
                  <div
                    style={{
                      color: 'var(--ink-3)',
                      fontSize: 10.5,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${o.id.slice(0, 6)}`}
                  >
                    {String(d.getHours()).padStart(2, '0')}:
                    {String(d.getMinutes()).padStart(2, '0')} · {o.id.slice(0, 6)}
                  </div>
                </div>

                {/* 거래처 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <GradeBadge grade={o.customer?.grade ?? null} size="sm" />
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flex: 1,
                      minWidth: 0,
                    }}
                    title={customerName}
                  >
                    {customerName}
                  </div>
                  {hasReturn && (
                    <span
                      title="반품 포함"
                      style={{
                        fontSize: 9.5,
                        color: 'var(--danger)',
                        fontWeight: 500,
                        fontFamily: 'var(--font-num)',
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                      }}
                    >
                      RET
                    </span>
                  )}
                </div>

                {/* 수량 */}
                <div
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-num)',
                    fontSize: 12.5,
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={`${totalQty} ea`}
                >
                  {totalQty}
                  <span
                    style={{ color: 'var(--ink-4)', fontSize: 10.5, marginLeft: 2 }}
                  >
                    ea
                  </span>
                </div>

                {/* 총액 */}
                <div
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-num)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={`₩${o.total_amount.toLocaleString('ko-KR')}`}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {o.total_amount.toLocaleString('ko-KR')}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-4)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    KRW
                  </div>
                </div>

                {/* 상태 */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minWidth: 0,
                  }}
                >
                  <StatusBadge status={o.status} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalFiltered > 0 && totalPages > 1 && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
          }}
        >
          <span>{rangeText}</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={page === 1}
              style={pageBtnStyle(false, page === 1)}
            >
              «
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              style={pageBtnStyle(false, page === 1)}
            >
              ‹
            </button>
            {pagesAround(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={i} style={{ padding: '0 6px', color: 'var(--ink-4)' }}>
                  …
                </span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPageChange(p)}
                  style={pageBtnStyle(p === page, false)}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={pageBtnStyle(false, page === totalPages)}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={page === totalPages}
              style={pageBtnStyle(false, page === totalPages)}
            >
              »
            </button>
          </div>
        </div>
      )}
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
