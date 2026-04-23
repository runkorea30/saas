/**
 * Products 목록 테이블 — 컬럼 폭 드래그 리사이즈 지원.
 *
 * - 체크박스 열은 40px 고정(리사이저 없음).
 * - 나머지 7개 컬럼은 `useResizableColumns` 로 개별 폭 관리 + 저장.
 * - 공용 `ResizeHandle` 사용 (hairline → hover 2px → drag 3px, 더블클릭 리셋).
 * - 컬럼 합계가 컨테이너보다 크면 가로 스크롤, 작으면 우측 여백.
 *
 * 🟠 재고/판매 통계 컬럼은 Round 1에서 숨김 (inventory_lots 데이터 부재).
 */
import { Check, EmptyState } from '@/components/feature/orders/primitives';
import { ResizeHandle } from '@/components/common/ResizeHandle';
import {
  useResizableColumns,
  type ColumnDef,
} from '@/hooks/useResizableColumns';
import type { Product } from '@/hooks/queries/useProducts';
import { categoryLabel } from './ProductFilterBar';

interface Props {
  products: Product[];
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

type Align = 'left' | 'right' | 'center';

interface ProductColumnDef extends ColumnDef {
  label: string;
  align: Align;
}

const CHECKBOX_COL_PX = 40;
const ROW_GAP_PX = 10;
const ROW_PADDING_X_PX = 14;

const COLUMN_DEFS: ReadonlyArray<ProductColumnDef> = [
  { key: 'code',           defaultWidth: 140, minWidth: 100, label: '제품코드', align: 'left' },
  { key: 'name',           defaultWidth: 280, minWidth: 160, label: '상품명',   align: 'left' },
  { key: 'category',       defaultWidth: 90,  minWidth: 70,  label: '카테고리', align: 'left' },
  { key: 'sell_price',     defaultWidth: 100, minWidth: 80,  label: '판매가',   align: 'right' },
  { key: 'supply_price',   defaultWidth: 100, minWidth: 80,  label: '공급가',   align: 'right' },
  { key: 'unit_price_usd', defaultWidth: 90,  minWidth: 70,  label: 'USD',     align: 'right' },
  { key: 'status',         defaultWidth: 80,  minWidth: 60,  label: '상태',     align: 'center' },
];

export function ProductListTable({
  products,
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
    pageKey: 'products',
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
          <Check
            on={allChecked}
            indet={!allChecked && someChecked}
            onChange={onToggleAllChecked}
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

        {/* 본문 */}
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            제품 데이터를 불러오는 중…
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            title="조건에 맞는 제품이 없습니다"
            body="필터를 해제하거나 검색어를 지워 보세요."
            secondary={onResetFilters ? '필터 초기화' : undefined}
            onSecondary={onResetFilters}
          />
        ) : (
          products.map((p) => {
            const isSelected = selectedId === p.id;
            const isChecked = Boolean(checked[p.id]);
            return (
              <div
                key={p.id}
                onClick={() => onSelect(p.id)}
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
                <Check on={isChecked} onChange={() => onToggleChecked(p.id)} />

                <CellText value={p.code} numeric muted />

                <CellText value={p.name} bold ink="ink" />

                <CellText value={categoryLabel(p.category)} small muted />

                <CellText
                  value={fmtWon(p.sell_price)}
                  numeric
                  align="right"
                  weight={500}
                />

                <CellText
                  value={fmtWon(p.supply_price)}
                  numeric
                  align="right"
                  ink="ink-2"
                />

                <CellText
                  value={
                    p.unit_price_usd !== null
                      ? `$${Number(p.unit_price_usd).toFixed(2)}`
                      : '—'
                  }
                  numeric
                  align="right"
                  small
                  muted
                />

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span
                    title={p.is_active ? '활성' : '비활성'}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: p.is_active ? 'var(--success)' : 'var(--ink-4)',
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

function CellText({
  value,
  numeric,
  align,
  bold,
  small,
  muted,
  ink,
  weight,
}: {
  value: string;
  numeric?: boolean;
  align?: Align;
  bold?: boolean;
  small?: boolean;
  muted?: boolean;
  ink?: 'ink' | 'ink-2' | 'ink-3';
  weight?: number;
}) {
  const fontSize = small ? 11.5 : bold ? 13 : 12.5;
  const color = muted
    ? 'var(--ink-3)'
    : ink === 'ink-2'
      ? 'var(--ink-2)'
      : 'var(--ink)';
  return (
    <div
      className={numeric ? 'num' : undefined}
      style={{
        fontSize,
        fontWeight: weight ?? (bold ? 500 : 400),
        color,
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

function fmtWon(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('ko-KR');
}
