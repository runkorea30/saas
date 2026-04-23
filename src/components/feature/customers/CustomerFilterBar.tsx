/**
 * Customers 페이지 필터 바.
 * 검색 · 등급 MultiChip · 상태 Segmented · 미수금 토글.
 */
import { Search, Star } from 'lucide-react';
import {
  GradeBadge,
  MultiChip,
  Segmented,
} from '@/components/feature/orders/primitives';

export type ActiveFilter = 'all' | 'active' | 'inactive';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  gradeSel: string[];
  onGradeChange: (v: string[]) => void;
  activeFilter: ActiveFilter;
  onActiveFilterChange: (v: ActiveFilter) => void;
  receivableOnly: boolean;
  onReceivableOnlyChange: (v: boolean) => void;
  totalFiltered: number;
  totalAll: number;
}

const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'E'].map((g) => ({
  id: g,
  label: `${g}등급`,
  prefix: <GradeBadge grade={g} />,
}));

export function CustomerFilterBar({
  query,
  onQueryChange,
  gradeSel,
  onGradeChange,
  activeFilter,
  onActiveFilterChange,
  receivableOnly,
  onReceivableOnlyChange,
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
          flex: '0 1 320px',
        }}
      >
        <Search size={13} color="var(--ink-3)" strokeWidth={1.6} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="거래처명·연락처·사업자명 검색"
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
        label="등급"
        icon={<Star size={12} color="var(--ink-3)" strokeWidth={1.6} />}
        selected={gradeSel}
        onChange={onGradeChange}
        options={GRADE_OPTIONS}
      />

      <Segmented<ActiveFilter>
        value={activeFilter}
        onChange={onActiveFilterChange}
        options={[
          { id: 'all', label: '전체' },
          { id: 'active', label: '활성' },
          { id: 'inactive', label: '비활성' },
        ]}
        compact
      />

      <button
        type="button"
        onClick={() => onReceivableOnlyChange(!receivableOnly)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 12px',
          borderRadius: 8,
          border: `1px solid ${receivableOnly ? 'var(--danger)' : 'var(--line)'}`,
          background: receivableOnly ? 'var(--danger-wash)' : 'var(--surface)',
          color: receivableOnly ? 'var(--danger)' : 'var(--ink-2)',
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: 'var(--font-kr)',
          cursor: 'pointer',
        }}
      >
        미수금 있음
      </button>

      <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-3)' }}>
        <span className="num" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
          {totalFiltered}
        </span>
        <span> / {totalAll} 거래처</span>
      </div>
    </div>
  );
}
