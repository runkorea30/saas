/**
 * Products 페이지 필터 바 (Phase A).
 *
 * 구성: 검색(코드·상품명) · 카테고리 Select · 재고 미만 숫자 · 활성 Segmented
 *
 * 🟠 Phase A: 카테고리는 단일 선택(MultiChip 폐기). 기본값 PRODUCT_CATEGORY_DEFAULT.
 * 🟠 "전체" 옵션은 PRODUCT_CATEGORY_ALL sentinel 사용 (빈 문자열 카테고리와 충돌 회피).
 * 🟡 빈 문자열 카테고리(DB 38건)는 "(미분류)" 라벨로 드롭다운 맨 하단 표시.
 */
import { RotateCcw, Search } from 'lucide-react';
import { Segmented } from '@/components/feature/orders/primitives';
import {
  PRODUCT_CATEGORY_ALL,
  PRODUCT_CATEGORY_DEFAULT,
  PRODUCT_CATEGORY_EMPTY_LABEL,
} from '@/constants/categories';

export type ProductActiveFilter = 'all' | 'active' | 'inactive';

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  /** 선택된 카테고리. PRODUCT_CATEGORY_ALL 이면 "전체". 빈 문자열이면 "(미분류)". */
  category: string;
  onCategoryChange: (v: string) => void;
  /** DB distinct 카테고리 값 배열 (빈 문자열 포함 가능). 페이지에서 collect. */
  categoryOptions: string[];
  /** "재고 N 미만" 필터. null 이면 미적용. */
  stockLessThan: number | null;
  onStockLessThanChange: (v: number | null) => void;
  activeFilter: ProductActiveFilter;
  onActiveFilterChange: (v: ProductActiveFilter) => void;
  totalFiltered: number;
  totalAll: number;
  /** 활성 필터가 있을 때만 노출되는 "필터 초기화" 버튼 핸들러. 미전달 시 버튼 숨김. */
  onReset?: () => void;
  /** 체크박스로 선택된 행 개수. 0보다 클 때만 카운트 영역에 미니 표시. */
  selectedCount?: number;
}

export function ProductFilterBar({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  categoryOptions,
  stockLessThan,
  onStockLessThanChange,
  activeFilter,
  onActiveFilterChange,
  totalFiltered,
  totalAll,
  onReset,
  selectedCount,
}: Props) {
  const hasActiveFilter =
    query !== '' ||
    category !== PRODUCT_CATEGORY_DEFAULT ||
    stockLessThan != null ||
    activeFilter !== 'all';

  const handleStockInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onStockLessThanChange(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      onStockLessThanChange(null);
      return;
    }
    onStockLessThanChange(n);
  };

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
      {/* 검색 */}
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
          placeholder="제품코드·제품명 검색"
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

      {/* 카테고리 드롭다운 */}
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        style={selectStyle}
        title="카테고리"
      >
        <option value={PRODUCT_CATEGORY_ALL}>전체</option>
        {categoryOptions.map((c) => (
          <option key={c || '__EMPTY__'} value={c}>
            {c === '' ? PRODUCT_CATEGORY_EMPTY_LABEL : c}
          </option>
        ))}
      </select>

      {/* 재고 N 미만 */}
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
        }}
      >
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>재고</span>
        <input
          type="number"
          min={0}
          step={1}
          value={stockLessThan == null ? '' : String(stockLessThan)}
          onChange={(e) => handleStockInput(e.target.value)}
          placeholder="__"
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 12.5,
            fontFamily: 'var(--font-num)',
            width: 60,
            textAlign: 'right',
          }}
        />
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>미만</span>
      </div>

      {/* 활성/비활성 */}
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

      {/* 필터 초기화 — 활성 필터가 있을 때만 노출 */}
      {hasActiveFilter && onReset && (
        <button
          type="button"
          onClick={onReset}
          title="모든 필터 해제"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 30,
            padding: '0 10px',
            fontSize: 12,
            fontFamily: 'var(--font-kr)',
            color: 'var(--ink-2)',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background .12s, color .12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface)';
            e.currentTarget.style.color = 'var(--ink)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-2)';
            e.currentTarget.style.color = 'var(--ink-2)';
          }}
        >
          <RotateCcw size={13} strokeWidth={1.6} />
          필터 초기화
        </button>
      )}

      {/* 우측 카운트 */}
      <div
        style={{
          marginLeft: 'auto',
          fontSize: 11.5,
          color: 'var(--ink-3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {selectedCount != null && selectedCount > 0 && (
          <>
            <span
              className="num"
              style={{ color: 'var(--brand)', fontWeight: 500 }}
            >
              {selectedCount}개 선택
            </span>
            <span style={{ color: 'var(--ink-4)' }}>·</span>
          </>
        )}
        <span>
          <span
            className="num"
            style={{ color: 'var(--ink-2)', fontWeight: 500 }}
          >
            {totalFiltered}
          </span>
          <span> / {totalAll} 제품</span>
        </span>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  fontSize: 12.5,
  fontFamily: 'var(--font-kr)',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 160,
};
