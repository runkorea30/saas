/**
 * Customers 목록 테이블 — 컬럼 폭 드래그 리사이즈 지원.
 *
 * - 체크박스 열은 32px 고정(리사이저 없음).
 * - 나머지 8개 컬럼(등급/거래처·사업자/연락처/정산/총매출/미수금/최근 주문/상태)
 *   전부 `useResizableColumns` 로 폭 관리. pageKey='customers'.
 * - 공용 `ResizeHandle` 사용 (hairline → hover 2px → drag 3px, 더블클릭 리셋).
 * - 14건 소량이므로 페이지네이션 생략, 전체 표시.
 */
import { Check, EmptyState, GradeBadge } from '@/components/feature/orders/primitives';
import { ResizeHandle } from '@/components/common/ResizeHandle';
import {
  useResizableColumns,
  type ColumnDef,
} from '@/hooks/useResizableColumns';
import type { Customer } from '@/hooks/queries/useCustomers';
import type { CustomerAggregate } from '@/utils/calculations';

type Align = 'left' | 'right' | 'center';

interface CustomerColumnDef extends ColumnDef {
  label: string;
  align: Align;
}

const CHECKBOX_COL_PX = 32;
const ROW_GAP_PX = 10;
const ROW_PADDING_X_PX = 14;

const COLUMN_DEFS: ReadonlyArray<CustomerColumnDef> = [
  { key: 'grade',         defaultWidth: 44,  minWidth: 40,  label: '등급',         align: 'left'   },
  { key: 'customer_name', defaultWidth: 260, minWidth: 200, label: '거래처·사업자', align: 'left'   },
  { key: 'contact',       defaultWidth: 150, minWidth: 120, label: '연락처',       align: 'left'   },
  { key: 'settlement',    defaultWidth: 80,  minWidth: 60,  label: '정산',         align: 'left'   },
  { key: 'total_sales',   defaultWidth: 130, minWidth: 100, label: '총매출',       align: 'right'  },
  { key: 'balance',       defaultWidth: 130, minWidth: 100, label: '미수금',       align: 'right'  },
  { key: 'last_order',    defaultWidth: 110, minWidth: 90,  label: '최근 주문',    align: 'left'   },
  { key: 'status',        defaultWidth: 60,  minWidth: 50,  label: '상태',         align: 'center' },
];

interface Props {
  customers: Customer[];
  aggregates: Map<string, CustomerAggregate> | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  checked: Record<string, boolean>;
  onToggleChecked: (id: string) => void;
  onToggleAllChecked: () => void;
  allChecked: boolean;
  someChecked: boolean;
  isLoading: boolean;
  onResetFilters?: () => void;
}

export function CustomerListTable({
  customers,
  aggregates,
  selectedId,
  onSelect,
  checked,
  onToggleChecked,
  onToggleAllChecked,
  allChecked,
  someChecked,
  isLoading,
  onResetFilters,
}: Props) {
  const { widths, draggingKey, onResizeStart, resetColumn } = useResizableColumns({
    pageKey: 'customers',
    columns: COLUMN_DEFS,
  });

  const gridTemplate = `${CHECKBOX_COL_PX}px ${COLUMN_DEFS.map(
    (c) => `${widths[c.key]}px`,
  ).join(' ')}`;

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
          <Check on={allChecked} indet={!allChecked && someChecked} onChange={onToggleAllChecked} />
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
            거래처 데이터를 불러오는 중…
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            title="조건에 맞는 거래처가 없습니다"
            body="필터를 해제하거나 검색어를 지워 보세요."
            secondary={onResetFilters ? '필터 초기화' : undefined}
            onSecondary={onResetFilters}
          />
        ) : (
          customers.map((c) => {
            const agg = aggregates?.get(c.id);
            const balance = agg?.balance ?? 0;
            const isSelected = selectedId === c.id;
            const isChecked = Boolean(checked[c.id]);
            const bizName = c.business?.name ?? '사업자 미연결';
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
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
                <Check on={isChecked} onChange={() => onToggleChecked(c.id)} />

                {/* 등급 */}
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <GradeBadge grade={c.grade} />
                </div>

                {/* 거래처·사업자 */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={c.name}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: 'var(--font-num)',
                    }}
                    title={bizName}
                  >
                    {bizName}
                  </div>
                </div>

                {/* 연락처 */}
                <div
                  className="num"
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={c.contact1 ?? '—'}
                >
                  {c.contact1 ?? '—'}
                </div>

                {/* 정산 */}
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={c.settlement_cycle ?? '—'}
                >
                  {c.settlement_cycle ?? '—'}
                </div>

                {/* 총매출 */}
                <div
                  className="num"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    textAlign: 'right',
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={fmtWon(agg?.total_sales ?? 0)}
                >
                  {fmtWon(agg?.total_sales ?? 0)}
                </div>

                {/* 미수금 */}
                <div
                  className="num"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    textAlign: 'right',
                    color: balance > 0 ? 'var(--danger)' : 'var(--ink-3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={balance > 0 ? fmtWon(balance) : '—'}
                >
                  {balance > 0 ? fmtWon(balance) : '—'}
                </div>

                {/* 최근 주문 */}
                <div
                  className="num"
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={fmtDateShort(agg?.last_order_date ?? null)}
                >
                  {fmtDateShort(agg?.last_order_date ?? null)}
                </div>

                {/* 상태 */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span
                    title={c.is_active ? '활성' : '비활성'}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: c.is_active ? 'var(--success)' : 'var(--ink-4)',
                    }}
                  />
                </div>
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

function fmtWon(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('ko-KR');
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
