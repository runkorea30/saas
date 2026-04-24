/**
 * 재고현황 페이지 필터 바.
 * 검색(코드·상품명) · 카테고리 MultiChip · 재고상태 Segmented.
 *
 * 🟡 상태 Segmented: 전체/품절/부족/정상 — 품절을 우선 노출.
 */
import { Search, Tag } from 'lucide-react';
import { MultiChip, Segmented } from '@/components/feature/orders/primitives';
import { getCategoryLabel } from '@/constants/categories';

export type StockFilterValue = 'all' | 'out' | 'low' | 'normal';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  categorySel: string[];
  onCategoryChange: (v: string[]) => void;
  stockFilter: StockFilterValue;
  onStockFilterChange: (v: StockFilterValue) => void;
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

      <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-3)' }}>
        <span className="num" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
          {totalFiltered}
        </span>
        <span> / {totalAll} 제품</span>
      </div>
    </div>
  );
}
