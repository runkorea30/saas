/**
 * 1단 메인 네비게이션.
 * - 좌측: MochiCraft OPS 로고
 * - 중앙: 5개 섹션 버튼 (홈/판매/재고매입/재무/문서관리/설정)
 * - 설정 바로 오른쪽: 발주 예상 위젯 (1m/3m 토글 + 카테고리 필터 + USD 금액)
 *
 * 🔴 계산식은 발주서 페이지와 완전 일치 (useOrderNeedEstimate 주석 참조).
 * 🟠 excludedCategories 는 usePurchaseOrderExcluded 훅 — 발주서 페이지와 공유.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { isSectionActive, navSections } from './navConfig';
import { useCompany } from '@/hooks/useCompany';
import {
  useOrderNeedEstimate,
  type OrderBasis,
} from '@/hooks/queries/useOrderNeedEstimate';
import { usePurchaseOrderExcluded } from '@/hooks/usePurchaseOrderExcluded';

function fmtUsd(v: number): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { companyId } = useCompany();
  const [basis, setBasis] = useState<OrderBasis>('1m');
  const { excluded, toggle, includeAll, restoreDefault } =
    usePurchaseOrderExcluded();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const { estimatedUsd, categories, isLoading } = useOrderNeedEstimate(
    companyId,
    basis,
    excluded,
  );

  // 팝오버 외부 클릭 시 닫기.
  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  return (
    <header
      className="sticky top-0 z-20 h-14 flex items-center border-b border-line"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-[1400px] mx-auto w-full px-6 flex items-center gap-8">
        <div className="font-semibold tracking-tight text-brand">
          MochiCraft OPS
        </div>
        <nav className="flex items-center gap-1 h-full">
          {navSections.map((section) => {
            const active = isSectionActive(section.path, pathname);
            return (
              <button
                key={section.path}
                type="button"
                onClick={() => navigate(section.indexRedirect)}
                className={
                  active
                    ? 'h-14 px-4 text-sm font-medium transition-colors relative text-brand'
                    : 'h-14 px-4 text-sm font-medium transition-colors relative text-ink-3 hover:text-ink'
                }
              >
                {section.label}
                {active && (
                  <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-brand" />
                )}
              </button>
            );
          })}

          {/* 설정 바로 오른쪽 — 발주 예상 위젯 */}
          <span
            className="w-px h-4 bg-line mx-2"
            aria-hidden
          />

          <div className="flex items-center gap-2 relative" ref={filterRef}>
            <div className="flex rounded border border-line overflow-hidden text-xs">
              {(['1m', '3m'] as OrderBasis[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBasis(b)}
                  className={
                    basis === b
                      ? 'px-2 py-1 bg-brand text-white transition-colors'
                      : 'px-2 py-1 text-ink-3 hover:bg-stone-50 transition-colors'
                  }
                >
                  {b === '1m' ? '1개월' : '3개월'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className="p-1 text-ink-3 hover:text-ink transition-colors"
              title="발주 예상 카테고리 필터"
              aria-label="발주 예상 카테고리 필터"
            >
              <Filter size={13} />
            </button>

            <div className="flex flex-col items-end leading-none">
              <span className="text-[10px] text-ink-3">발주 예상</span>
              <span
                className="text-sm font-semibold text-brand mt-0.5"
                style={{ fontFamily: 'var(--font-num)' }}
              >
                {isLoading ? '…' : `$${fmtUsd(estimatedUsd)}`}
              </span>
            </div>

            {filterOpen && (
              <div
                className="absolute top-full right-0 mt-1 bg-white border border-line rounded-lg shadow-lg p-3 z-50 min-w-[200px] max-h-[400px] overflow-auto"
                style={{ background: 'var(--surface)' }}
              >
                <p className="text-xs font-medium text-ink-2 mb-2">
                  발주 예상 포함 카테고리
                </p>
                {categories.length === 0 && (
                  <p className="text-xs text-ink-3">카테고리 없음</p>
                )}
                {categories.map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-2 py-0.5 cursor-pointer text-xs text-ink-2"
                  >
                    <input
                      type="checkbox"
                      checked={!excluded.has(cat)}
                      onChange={() => toggle(cat)}
                      className="accent-brand"
                    />
                    <span>{cat}</span>
                  </label>
                ))}
                {categories.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-line flex justify-between">
                    <button
                      type="button"
                      onClick={includeAll}
                      className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                    >
                      전체 포함
                    </button>
                    <button
                      type="button"
                      onClick={restoreDefault}
                      className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                    >
                      기본값 복원
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
