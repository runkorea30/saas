/**
 * Orders 좌측 마스터 리스트. 컬럼 너비 드래그 가능 + localStorage 영속.
 * 행 선택(단일) + 체크박스(다중) 분리 — 클릭=선택, 체크박스=일괄 대상.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Check,
  EmptyState,
  GradeBadge,
  StatusBadge,
  fmtDate,
} from './primitives';
import type { Order } from '@/types/orders';

interface ColumnWidths {
  date: number;
  qty: number;
  total: number;
}

const DEFAULT_COLS: ColumnWidths = { date: 130, qty: 60, total: 120 };
const COLS_KEY = 'mc.orders.cols';

function loadCols(): ColumnWidths {
  try {
    const s = localStorage.getItem(COLS_KEY);
    if (!s) return DEFAULT_COLS;
    return { ...DEFAULT_COLS, ...JSON.parse(s) };
  } catch {
    return DEFAULT_COLS;
  }
}

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

  const [cols, setCols] = useState<ColumnWidths>(loadCols);
  const hdrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(cols));
    } catch {
      /* noop */
    }
  }, [cols]);

  const startColDrag =
    (key: keyof ColumnWidths, min: number, max: number) =>
    (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = cols[key];
      const onMove = (ev: MouseEvent) => {
        const next = Math.max(min, Math.min(max, startW + (ev.clientX - startX)));
        setCols((c) => ({ ...c, [key]: next }));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

  const gridCols = `32px ${cols.date}px minmax(0, 1fr) ${cols.qty}px ${cols.total}px`;

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
      {/* Header row */}
      <div
        ref={hdrRef}
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          gap: 10,
          padding: '10px 14px',
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
        <div style={{ position: 'relative' }}>
          주문일
          <ColHandle onMouseDown={startColDrag('date', 90, 220)} />
        </div>
        <div>거래처</div>
        <div style={{ textAlign: 'right', position: 'relative' }}>
          <ColHandle onMouseDown={startColDrag('qty', 48, 140)} side="left" />
          수량
          <ColHandle onMouseDown={startColDrag('qty', 48, 140)} />
        </div>
        <div style={{ textAlign: 'right', position: 'relative' }}>
          <ColHandle onMouseDown={startColDrag('total', 80, 220)} side="left" />
          총액
        </div>
      </div>

      {/* Body rows */}
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
          const totalQty = o.items.reduce((s, it) => s + Math.abs(it.quantity), 0);
          const hasReturn = o.items.some((it) => it.is_return);
          return (
            <div
              key={o.id}
              onClick={() => onSelect(o.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: 10,
                padding: '11px 14px',
                borderBottom: '1px solid var(--line)',
                borderLeft: sel ? '3px solid var(--brand)' : '3px solid transparent',
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

              <div
                style={{
                  fontFamily: 'var(--font-num)',
                  fontSize: 11.5,
                  color: 'var(--ink-2)',
                  lineHeight: 1.35,
                  minWidth: 0,
                }}
              >
                <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{fmtDate(d)}</div>
                <div
                  style={{
                    color: 'var(--ink-3)',
                    fontSize: 10.5,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {String(d.getHours()).padStart(2, '0')}:
                  {String(d.getMinutes()).padStart(2, '0')} · {o.id.slice(0, 6)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <GradeBadge grade={o.customer?.grade ?? null} size="sm" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {o.customer?.name ?? '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                    <StatusBadge status={o.status} />
                    {hasReturn && (
                      <span
                        style={{
                          fontSize: 9.5,
                          color: 'var(--danger)',
                          fontWeight: 500,
                          fontFamily: 'var(--font-num)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        RET
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-num)',
                  fontSize: 12.5,
                  color: 'var(--ink-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                {totalQty}
                <span style={{ color: 'var(--ink-4)', fontSize: 10.5, marginLeft: 2 }}>ea</span>
              </div>

              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-num)',
                  whiteSpace: 'nowrap',
                }}
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
                  style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.04em' }}
                >
                  KRW
                </div>
              </div>
            </div>
          );
        })
      )}

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

function ColHandle({
  onMouseDown,
  side = 'right',
}: {
  onMouseDown: (e: ReactMouseEvent) => void;
  side?: 'left' | 'right';
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        [side]: -8,
        top: -10,
        bottom: -10,
        width: 14,
        cursor: 'col-resize',
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: hover ? 2 : 1,
          background: hover ? 'var(--brand)' : 'transparent',
          transform: 'translateX(-50%)',
          transition: 'background .12s, width .12s',
        }}
      />
    </div>
  );
}
