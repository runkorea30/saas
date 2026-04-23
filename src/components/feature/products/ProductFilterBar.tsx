/**
 * Products 페이지 필터 바.
 * 검색 (코드·상품명) · 카테고리 MultiChip · 상태 Segmented.
 */
import { Search, Tag } from 'lucide-react';
import { MultiChip, Segmented } from '@/components/feature/orders/primitives';
import { getCategoryLabel } from '@/constants/categories';

export type ProductActiveFilter = 'all' | 'active' | 'inactive';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  categorySel: string[];
  onCategoryChange: (v: string[]) => void;
  activeFilter: ProductActiveFilter;
  onActiveFilterChange: (v: ProductActiveFilter) => void;
  categoryOptions: string[];
  totalFiltered: number;
  totalAll: number;
}

export function ProductFilterBar({
  query,
  onQueryChange,
  categorySel,
  onCategoryChange,
  activeFilter,
  onActiveFilterChange,
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

      <Segmented<ProductActiveFilter>
        value={activeFilter}
        onChange={onActiveFilterChange}
        options={[
          { id: 'all', label: '전체' },
          { id: 'active', label: '활성' },
          { id: 'inactive', label: '비활성' },
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
