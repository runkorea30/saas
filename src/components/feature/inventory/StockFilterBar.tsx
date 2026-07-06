/**
 * 재고현황 페이지 필터 바.
 * 검색(코드·상품명) · 카테고리 MultiChip · 재고상태 Segmented · 빠른필터(입고예정/발주권장).
 *
 * 🟡 상태 Segmented: 전체/품절/부족/정상 — 품절을 우선 노출.
 * 🟠 빠른필터 2버튼(입고예정/발주권장)은 상호배타 토글. Segmented 와 AND 결합.
 */
import { PackageOpen, Search, ShoppingCart, Tag } from 'lucide-react';
import { MultiChip, Segmented } from '@/components/feature/orders/primitives';
import { getCategoryLabel } from '@/constants/categories';

export type StockFilterValue = 'all' | 'out' | 'low' | 'normal';
export type StockQuickFilter = 'none' | 'incoming' | 'reorder';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  categorySel: string[];
  onCategoryChange: (v: string[]) => void;
  stockFilter: StockFilterValue;
  onStockFilterChange: (v: StockFilterValue) => void;
  quickFilter: StockQuickFilter;
  onQuickFilterChange: (v: StockQuickFilter) => void;
  incomingCount: number;
  reorderCount: number;
  categoryOptions: string[];
  totalFiltered: number;
  totalAll: number;
}

export function StockFilterBar({
  query,
  onQueryChange,
  categorySel,
  onCategoryChange,
  stockFilter,
  onStockFilterChange,
  quickFilter,
  onQuickFilterChange,
  incomingCount,
  reorderCount,
  categoryOptions,
  totalFiltered,
  totalAll,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          height: 30,
          background: 'var(--surface-2)',
          borderRadius: 8,
          border: '1px solid var(--line)',
          minWidth: 240,
          flex: '0 1 340px',
        }}
      >
        <Search size={13} color="var(--ink-3)" strokeWidth={1.6} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="제품코드·상품명 검색"
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 12.5,
            fontFamily: 'var(--font-kr)',
            width: '100%',
          }}
        />
      </div>

      <MultiChip
        label="카테고리"
        icon={<Tag size={12} color="var(--ink-3)" strokeWidth={1.6} />}
        selected={categorySel}
        onChange={onCategoryChange}
        options={categoryOptions.map((c) => ({
          id: c,
          label: getCategoryLabel(c),
        }))}
      />

      <Segmented<StockFilterValue>
        value={stockFilter}
        onChange={onStockFilterChange}
        options={[
          { id: 'all', label: '전체' },
          { id: 'out', label: '품절' },
          { id: 'low', label: '부족' },
          { id: 'normal', label: '정상' },
        ]}
        compact
      />

      <QuickToggle
        label="입고예정"
        icon={<PackageOpen size={12} strokeWidth={1.8} />}
        active={quickFilter === 'incoming'}
        count={incomingCount}
        onClick={() =>
          onQuickFilterChange(quickFilter === 'incoming' ? 'none' : 'incoming')
        }
        title="발주해서 오고 있는 (미확정 인보이스검증) 제품만"
      />
      <QuickToggle
        label="발주권장"
        icon={<ShoppingCart size={12} strokeWidth={1.8} />}
        active={quickFilter === 'reorder'}
        count={reorderCount}
        onClick={() =>
          onQuickFilterChange(quickFilter === 'reorder' ? 'none' : 'reorder')
        }
        title="지금 발주 필요 (발주서 페이지의 '지금 발주' 배지와 동일)"
      />

      <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-3)' }}>
        <span className="num" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
          {totalFiltered}
        </span>
        <span> / {totalAll} 제품</span>
      </div>
    </div>
  );
}

/**
 * 입고예정/발주권장 빠른필터 토글 버튼.
 * active 시 브랜드 색상, 라벨 옆에 카운트 배지.
 */
function QuickToggle({
  label,
  icon,
  active,
  count,
  onClick,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count: number;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 10px',
        borderRadius: 8,
        border: `1px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
        background: active ? 'var(--brand-wash, var(--surface-2))' : 'var(--surface)',
        color: active ? 'var(--brand)' : 'var(--ink-2)',
        fontSize: 12,
        fontFamily: 'var(--font-kr)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        transition: 'all .12s',
      }}
    >
      {icon}
      <span>{label}</span>
      <span
        className="num"
        style={{
          minWidth: 18,
          padding: '0 5px',
          height: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: active ? 'var(--brand)' : 'var(--surface-2)',
          color: active ? 'var(--on-brand, #fff)' : 'var(--ink-3)',
          fontSize: 10.5,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  );
}
