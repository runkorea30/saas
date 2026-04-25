/**
 * Products 목록 테이블 (Phase A + PR 1.5).
 *
 * 컬럼: [체크] · 분류 · 제품코드 · 제품명 · 단위 · 판매가 · 공급가 · 현재재고 · USD · 편집/삭제
 * - 체크박스 컬럼은 가장 왼쪽 40px 고정. useResizableColumns에는 등록하지 않음
 *   (Orders 패턴 — localStorage 영향 회피, 리사이즈 불가).
 * - 헤더 체크박스: filtered 전체 기준 (페이지네이션 없음). indeterminate 지원.
 * - 현재재고: useInventoryStock 결과(`stockByProduct`)에서 조회. 미로드 시 "—".
 * - 편집/삭제: 행 hover 관계없이 항상 Pencil / Trash2 아이콘 노출.
 * - 재고현황 페이지(StockListTable) 행 높이/호버/숫자 정렬 규칙 계승.
 */
import { Pencil, Trash2 } from 'lucide-react';
import { Check, EmptyState } from '@/components/feature/orders/primitives';
import { ResizeHandle } from '@/components/common/ResizeHandle';
import {
  useResizableColumns,
  type ColumnDef,
} from '@/hooks/useResizableColumns';
import type { Product } from '@/hooks/queries/useProducts';
import type { ProductStockInfo } from '@/utils/calculations';

interface Props {
  products: Product[];
  isLoading: boolean;
  onResetFilters?: () => void;
  /** 제품별 현재 재고 스냅샷. 로드 전이면 undefined → "—" 표시. */
  stockByProduct: Map<string, ProductStockInfo> | undefined;
  onEditClick: (product: Product) => void;
  onDeleteClick: (product: Product) => void;
  /** 체크박스 상태 — id별 boolean. 미체크 ID는 키가 없거나 false. */
  checked: Record<string, boolean>;
  /** 단일 행 토글. next는 다음 상태(true=체크). */
  onToggleChecked: (id: string, next: boolean) => void;
  /** 헤더 체크박스 토글. next=true면 filtered 전체 체크, false면 전체 해제. */
  onTogglePageChecked: (next: boolean) => void;
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
  { key: 'category',       defaultWidth: 140, minWidth: 100, label: '분류',     align: 'left' },
  { key: 'code',           defaultWidth: 130, minWidth: 100, label: '제품코드', align: 'left' },
  { key: 'name',           defaultWidth: 280, minWidth: 160, label: '제품명',   align: 'left' },
  { key: 'unit',           defaultWidth: 60,  minWidth: 48,  label: '단위',     align: 'left' },
  { key: 'sell_price',     defaultWidth: 100, minWidth: 80,  label: '판매가',   align: 'right' },
  { key: 'supply_price',   defaultWidth: 100, minWidth: 80,  label: '공급가',   align: 'right' },
  { key: 'current_stock',  defaultWidth: 90,  minWidth: 70,  label: '현재재고', align: 'right' },
  { key: 'unit_price_usd', defaultWidth: 90,  minWidth: 70,  label: 'USD',     align: 'right' },
  { key: 'actions',        defaultWidth: 90,  minWidth: 80,  label: '',         align: 'center' },
];

export function ProductListTable({
  products,
  isLoading,
  onResetFilters,
  stockByProduct,
  onEditClick,
  onDeleteClick,
  checked,
  onToggleChecked,
  onTogglePageChecked,
}: Props) {
  const { widths, draggingKey, onResizeStart, resetColumn } = useResizableColumns({
    pageKey: 'products',
    columns: COLUMN_DEFS,
  });

  const gridTemplate = `${CHECKBOX_COL_PX}px ${COLUMN_DEFS.map(
    (c) => `${widths[c.key]}px`,
  ).join(' ')}`;

  // 헤더 체크박스 상태 — filtered 전체 기준
  const allChecked =
    products.length > 0 && products.every((p) => !!checked[p.id]);
  const someChecked = Object.keys(checked).some((id) => checked[id]);
  const headerIndet = someChecked && !allChecked;

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
          {/* 체크박스 헤더 */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Check
              on={allChecked}
              indet={headerIndet}
              onChange={() => onTogglePageChecked(!allChecked)}
            />
          </div>
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
            const stockVal = stockByProduct?.get(p.id)?.current;
            const isRowChecked = !!checked[p.id];
            return (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  alignItems: 'center',
                  gap: ROW_GAP_PX,
                  padding: `11px ${ROW_PADDING_X_PX}px`,
                  borderBottom: '1px solid var(--line)',
                  background: 'var(--surface)',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    'var(--surface-2)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background =
                    'var(--surface)')
                }
              >
                {/* 체크박스 셀 */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Check
                    on={isRowChecked}
                    onChange={() => onToggleChecked(p.id, !isRowChecked)}
                  />
                </div>

                <CellText value={categoryDisplay(p.category)} small muted={!p.category} />

                <CellText value={p.code} numeric muted />

                <CellText value={p.name} bold ink="ink" />

                <CellText value={p.unit} small muted />

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
                  value={stockVal == null ? '—' : fmtQty(stockVal)}
                  numeric
                  align="right"
                  weight={500}
                  muted={stockVal == null}
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

                {/* 편집/삭제 */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <IconButton
                    title="편집"
                    onClick={() => onEditClick(p)}
                    ariaLabel={`「${p.name}」 편집`}
                  >
                    <Pencil size={13} strokeWidth={1.6} />
                  </IconButton>
                  <IconButton
                    title="삭제"
                    onClick={() => onDeleteClick(p)}
                    ariaLabel={`「${p.name}」 삭제`}
                    danger
                  >
                    <Trash2 size={13} strokeWidth={1.6} />
                  </IconButton>
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

function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={ariaLabel}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: '1px solid transparent',
        background: 'transparent',
        color: danger ? 'var(--danger)' : 'var(--ink-2)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background .1s, border-color .1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? 'var(--danger-wash)'
          : 'var(--surface-2)';
        e.currentTarget.style.borderColor = danger
          ? 'var(--danger-wash)'
          : 'var(--line)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function fmtWon(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('ko-KR');
}

function fmtQty(n: number): string {
  return n.toLocaleString('ko-KR');
}

function categoryDisplay(c: string): string {
  return c === '' ? '(미분류)' : c;
}
