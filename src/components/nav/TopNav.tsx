/**
 * 1단 메인 네비게이션.
 * - 좌측: MochiCraft OPS 로고 텍스트 (버건디)
 * - 중앙: 5개 섹션 버튼 (홈/판매/재고매입/재무/설정)
 * - 우측: 발주 예상 위젯 (1m/3m 토글 + USD 금액)
 *
 * 🟠 발주 예상 데이터는 usePurchaseOrder 캐시 재활용 (추가 쿼리 없음).
 *    해상 카테고리(레더다이/스웨이드다이/디글레이저)는 제외 — useOrderNeedEstimate 내부 처리.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isSectionActive, navSections } from './navConfig';
import { useCompany } from '@/hooks/useCompany';
import {
  useOrderNeedEstimate,
  type OrderBasis,
} from '@/hooks/queries/useOrderNeedEstimate';

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
  const { estimatedUsd, isLoading } = useOrderNeedEstimate(companyId, basis);

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
        </nav>

        {/* 우측 — 발주 예상 위젯 */}
        <div className="ml-auto flex items-center gap-3">
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
          <div className="flex flex-col items-end leading-none">
            <span className="text-[10px] text-ink-3">발주 예상</span>
            <span
              className="text-sm font-semibold text-brand mt-0.5"
              style={{ fontFamily: 'var(--font-num)' }}
            >
              {isLoading ? '…' : `$${fmtUsd(estimatedUsd)}`}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
