/**
 * Orders 좌측 마스터 리스트.
 *
 * - 컬럼 5개(주문일/거래처/수량/총액/상태) 전부 드래그 리사이즈.
 *   pageKey='orders' → `mc.orders.columns` localStorage 저장.
 * - 공용 `useResizableColumns` + `ResizeHandle` 사용 (hairline → hover → drag).
 * - 체크박스 열은 32px 고정(리사이저 없음).
 * - 행 선택(단일) + 체크박스(다중) 분리 — 클릭=선택, 체크박스=일괄.
 */
import { useMemo, useState } from 'react';
import { Trash2, StickyNote } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import type { OrderWithGroupInfo } from '@/types/orders';

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
  orders: OrderWithGroupInfo[];
  /**
   * §48-F: 이 페이지에 표시된 주문 중 shipping_invoices 로 이관된 주문 id 집합.
   * undefined 면 로딩 중 (배지 표시 없음). 미출력/출력완료 구분 없이 동일 배지.
   */
  transferredOrderIds?: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, orderId: string) => void;
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
    transferredOrderIds,
    selectedId,
    onSelect,
    onContextMenu,
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

  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { widths, draggingKey, onResizeStart, resetColumn } = useResizableColumns({
    pageKey: 'orders',
    columns: COLUMN_DEFS,
  });

  const handleDelete = async (orderId: string) => {
    if (!window.confirm('이 주문을 삭제하면 복구할 수 없습니다. 계속하시겠습니까?')) {
      return;
    }
    setDeletingId(orderId);
    try {
      // 🟠 order_items 는 FK ON DELETE CASCADE 로 자동 삭제됨 (orders → order_items).
      const { error: orderError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (orderError) {
        console.error('orders 삭제 오류:', orderError);
        alert('주문 삭제 중 오류가 발생했습니다: ' + orderError.message);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock', companyId] });
    } catch (err) {
      console.error('삭제 예외:', err);
      alert('예기치 않은 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

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
            const showTrash = hoveredId === o.id || deletingId === o.id;
            const isAdd = o.isAdditional;
            const isImagePending = !!o.attachment_url && o.items.length === 0;
            const isTransferred = transferredOrderIds?.has(o.id) ?? false;
            return (
              <div
                key={o.id}
                onClick={() => onSelect(o.id)}
                onContextMenu={(e) => {
                  if (!onContextMenu) return;
                  e.preventDefault();
                  onContextMenu(e, o.id);
                }}
                style={{
                  position: 'relative',
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
                      : isAdd
                        ? 'var(--row-extra-bg)' // 추가주문 행 식별 (다크그레이 한정 어둡게 오버라이드)
                        : 'transparent',
                  cursor: 'pointer',
                  alignItems: 'center',
                  transition: 'background .12s',
                }}
                onMouseEnter={(e) => {
                  setHoveredId(o.id);
                  if (!sel)
                    e.currentTarget.style.background = isAdd
                      ? 'var(--row-extra-bg-hover)' // 추가주문 호버
                      : 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  setHoveredId((cur) => (cur === o.id ? null : cur));
                  if (!sel)
                    e.currentTarget.style.background = isChecked
                      ? 'var(--surface-2)'
                      : isAdd
                        ? 'var(--row-extra-bg)'
                        : 'transparent';
                }}
              >
                {showTrash && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(o.id);
                    }}
                    disabled={deletingId === o.id}
                    title="주문 삭제"
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 24,
                      height: 24,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      background: 'var(--surface)',
                      color: 'var(--danger)',
                      cursor: deletingId === o.id ? 'wait' : 'pointer',
                      zIndex: 2,
                      opacity: deletingId === o.id ? 0.5 : 1,
                    }}
                  >
                    <Trash2 size={12} strokeWidth={1.8} />
                  </button>
                )}
                <div onClick={(e) => e.stopPropagation()}>
                  <Check on={isChecked} onChange={() => onToggleChecked(o.id)} />
                </div>

                {/* 주문일 — 추가주문은 └ 추가 / 본주문은 날짜·시간 표시 */}
                {isAdd ? (
                  (() => {
                    // 시간 표시는 created_at 기준 — order_date 가 날짜 고정값일 가능성 대비.
                    const ca = new Date(o.created_at);
                    const hh = String(ca.getHours()).padStart(2, '0');
                    const mm = String(ca.getMinutes()).padStart(2, '0');
                    return (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          paddingLeft: 4,
                          minWidth: 0,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                        title={`추가주문 · ${hh}:${mm} · ${o.id.slice(0, 6)}`}
                      >
                        <span
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: '#6B1F2A',
                            lineHeight: 1,
                            marginRight: 2,
                          }}
                        >
                          └
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#92400e',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #f59e0b',
                            borderRadius: 4,
                            padding: '1px 6px',
                            letterSpacing: '0.02em',
                            flexShrink: 0,
                          }}
                        >
                          추가
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: '#6b7280',
                            fontFamily: 'var(--font-num)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {hh}:{mm}
                        </span>
                      </div>
                    );
                  })()
                ) : (
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
                )}

                {/* 거래처 — 추가주문은 비워둠 (RET 만 표시) */}
                {isAdd ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 4,
                      minWidth: 0,
                    }}
                  >
                    {isTransferred && <TransferredBadge />}
                    {o.is_direct_shipping && (
                      <span
                        title="직송 주문"
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '1px 6px',
                          borderRadius: 999,
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        직송
                      </span>
                    )}
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
                ) : (
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
                    {o.internal_note && o.internal_note.trim() && (
                      <span
                        className="memo-badge"
                        title={`내부메모: ${
                          o.internal_note.length > 60
                            ? `${o.internal_note.slice(0, 60)}…`
                            : o.internal_note
                        }`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: 'var(--warning-wash)',
                          color: 'var(--warning)',
                          border: '1px solid var(--warning)',
                        }}
                      >
                        <StickyNote size={11} strokeWidth={1.8} />
                      </span>
                    )}
                    {o.is_direct_shipping && (
                      <span
                        title="직송 주문"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: 9.5,
                          fontWeight: 600,
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '1px 6px',
                          borderRadius: 999,
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        직송
                      </span>
                    )}
                    {isTransferred && <TransferredBadge />}
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
                )}

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

                {/* 총액 — 이미지 대기 주문은 뱃지로 대체 */}
                <div
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-num)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={
                    isImagePending
                      ? '이미지파일 대기'
                      : `₩${o.total_amount.toLocaleString('ko-KR')}`
                  }
                >
                  {isImagePending ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: '#9A3412',
                        background: '#FFEDD5',
                        border: '1px solid #FDBA74',
                        borderRadius: 999,
                        padding: '2px 8px',
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      이미지파일 대기
                    </span>
                  ) : (
                    <>
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
                    </>
                  )}
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

/**
 * §48-F: 이관됨 배지. 미출력/출력완료 구분 없이 하나로 통일 (스펙 확정).
 * 다운로드 상태 세부는 송장대장 탭에서만 확인.
 */
function TransferredBadge() {
  return (
    <span
      title="송장대장으로 이관됨"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 9.5,
        fontWeight: 600,
        background: 'var(--brand-wash, #e0e7ff)',
        color: 'var(--brand, #4338ca)',
        padding: '1px 6px',
        borderRadius: 999,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      이관됨
    </span>
  );
}

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
