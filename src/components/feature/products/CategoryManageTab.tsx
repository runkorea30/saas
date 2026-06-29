/**
 * 제품분류 관리 탭 — 분류 단위로 거래처 노출(is_active) 일괄 토글.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만.
 * 🟠 DB 변경 없음 — 기존 products.is_active 컬럼을 (company_id, category) 조건으로 일괄 UPDATE.
 * 🟠 캐시 키 ['products', companyId] 무효화로 제품목록 탭과 즉시 동기화.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useProducts } from '@/hooks/queries/useProducts';
import { useToast } from '@/components/ui/Toast';

interface CategoryStat {
  category: string;
  /** 빈 문자열 분류는 정렬·UPDATE 시 빈 문자열 그대로 사용 — UI 만 '(분류없음)' 으로 표시. */
  displayName: string;
  total: number;
  active: number;
  isAllActive: boolean;
  isAllInactive: boolean;
}

export function CategoryManageTab() {
  const { companyId } = useCompany();
  const productsQuery = useProducts(companyId);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [updating, setUpdating] = useState<string | null>(null);

  const products = productsQuery.data ?? [];

  const categoryStats: CategoryStat[] = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    for (const p of products) {
      const cat = p.category ?? '';
      const cur = map.get(cat) ?? { total: 0, active: 0 };
      map.set(cat, {
        total: cur.total + 1,
        active: cur.active + (p.is_active ? 1 : 0),
      });
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        // 빈 분류는 항상 맨 뒤.
        if (a === '' && b !== '') return 1;
        if (a !== '' && b === '') return -1;
        return a.localeCompare(b, 'ko');
      })
      .map(([category, stats]) => ({
        category,
        displayName: category === '' ? '(분류없음)' : category,
        total: stats.total,
        active: stats.active,
        isAllActive: stats.active === stats.total,
        isAllInactive: stats.active === 0,
      }));
  }, [products]);

  const handleToggleCategory = async (category: string, activate: boolean) => {
    if (!companyId || updating) return;
    setUpdating(category);
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: activate })
        .eq('company_id', companyId)
        .eq('category', category);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['products', companyId] });
      const label = category === '' ? '(분류없음)' : category;
      showToast({
        kind: 'success',
        text: activate
          ? `${label} 분류 전체를 노출했습니다`
          : `${label} 분류 전체를 노출금지했습니다`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[category.toggle]', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '업데이트 중 오류가 발생했습니다.',
      });
    } finally {
      setUpdating(null);
    }
  };

  if (productsQuery.isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
        제품 데이터를 불러오는 중…
      </div>
    );
  }

  if (categoryStats.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
        등록된 제품이 없습니다.
      </div>
    );
  }

  return (
    <div
      className="card-surface"
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'auto',
      }}
    >
      <p
        style={{
          fontSize: 12.5,
          color: 'var(--ink-3)',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        분류 단위로 주문서 노출 여부를 일괄 설정합니다. 비활성화된 분류는 거래처
        주문서에서 제외됩니다. 일부만 활성인 분류는 호박색(혼합) 으로 표시됩니다.
      </p>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12.5,
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '1px solid var(--line)',
              background: 'var(--surface-2)',
            }}
          >
            <th style={th('left')}>분류명</th>
            <th style={{ ...th('center'), width: 70 }}>전체</th>
            <th style={{ ...th('center'), width: 70 }}>활성</th>
            <th style={{ ...th('center'), width: 70 }}>비활성</th>
            <th style={{ ...th('center'), width: 160 }}>주문서 노출</th>
          </tr>
        </thead>
        <tbody>
          {categoryStats.map((row) => {
            const isUpdatingThis = updating === row.category;
            return (
              <tr
                key={row.category}
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <td style={td('left', 600)}>{row.displayName}</td>
                <td
                  style={{
                    ...td('center'),
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--font-num)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.total}
                </td>
                <td
                  style={{
                    ...td('center'),
                    color: '#16a34a',
                    fontFamily: 'var(--font-num)',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                  }}
                >
                  {row.active}
                </td>
                <td
                  style={{
                    ...td('center'),
                    color: row.total - row.active > 0 ? '#dc2626' : 'var(--ink-4)',
                    fontFamily: 'var(--font-num)',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                  }}
                >
                  {row.total - row.active}
                </td>
                <td style={td('center')}>
                  {isUpdatingThis ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        color: 'var(--ink-3)',
                      }}
                    >
                      <Loader2
                        size={13}
                        style={{ animation: 'spin 1s linear infinite' }}
                      />
                      처리 중…
                    </span>
                  ) : (
                    <CategoryToggle
                      row={row}
                      disabled={updating !== null}
                      onToggle={() =>
                        handleToggleCategory(row.category, !row.isAllActive)
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CategoryToggle({
  row,
  disabled,
  onToggle,
}: {
  row: CategoryStat;
  disabled: boolean;
  onToggle: () => void;
}) {
  const trackColor = row.isAllActive
    ? '#22c55e'
    : row.isAllInactive
      ? '#d1d5db'
      : '#f59e0b';
  const label = row.isAllActive ? '노출' : row.isAllInactive ? '숨김' : '혼합';
  const labelColor = row.isAllActive
    ? '#16a34a'
    : row.isAllInactive
      ? 'var(--ink-4)'
      : '#b45309';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={
          row.isAllActive
            ? '전체 노출금지로 전환'
            : '전체 노출로 전환'
        }
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          width: 38,
          height: 20,
          padding: 0,
          background: trackColor,
          border: 'none',
          borderRadius: 999,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: row.isAllActive ? 20 : 2,
            width: 16,
            height: 16,
            background: '#fff',
            borderRadius: 999,
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
            transition: 'left .15s',
          }}
        />
      </button>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: labelColor,
          letterSpacing: '0.02em',
          minWidth: 28,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 셀 스타일 헬퍼

function th(align: 'left' | 'center'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--ink-3)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-num)',
  };
}

function td(
  align: 'left' | 'center' | 'right',
  weight: number = 400,
): React.CSSProperties {
  return {
    textAlign: align,
    padding: '11px 12px',
    fontWeight: weight,
    color: 'var(--ink)',
  };
}
