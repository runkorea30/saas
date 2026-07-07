/**
 * 1단 메인 네비게이션.
 * - 좌측: MochiCraft OPS 로고
 * - 중앙: 5개 섹션 버튼 (홈/판매/재고매입/재무/문서관리/설정)
 * - 설정 바로 오른쪽: 발주 예상 위젯 (1m/3m 토글 + 카테고리 필터 + USD 금액)
 *
 * 🔴 계산식 (2026-07-05):
 *    · useOrderNeedEstimate 로 원복 (판매량 1개월/3개월 기준)
 *    · 재고에 입고예정(useIncomingQuantities) 을 더해 넘겨 이중 발주 방지
 *    · 재주문점 기반은 정보 표시(발주서 페이지 컬럼) 로만 유지
 * 🟠 excludedCategories 는 usePurchaseOrderExcluded 훅 — 발주서 페이지와 공유.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Filter, LogOut, RefreshCw } from 'lucide-react';
import { isSectionActive, navSections } from './navConfig';
import { ThemeToggle } from './ThemeToggle';
import { useCompany } from '@/hooks/useCompany';
import {
  useOrderNeedEstimate,
  type OrderBasis,
} from '@/hooks/queries/useOrderNeedEstimate';
import { usePurchaseOrderExcluded } from '@/hooks/usePurchaseOrderExcluded';
import { useInspectionExpiryAlerts } from '@/hooks/queries/useInspectionExpiryAlerts';
import { ExpiryAlertTicker } from './ExpiryAlertTicker';

function fmtUsd(v: number): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TopNav({ onLogout }: { onLogout: () => Promise<void> }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { companyId, company } = useCompany();
  const [basis, setBasis] = useState<OrderBasis>('1m');
  const { excluded, toggle, includeAll, restoreDefault } =
    usePurchaseOrderExcluded();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  };

  const { estimatedUsd, categories, isLoading } = useOrderNeedEstimate(
    companyId,
    basis,
    excluded,
  );

  const {
    inspectionAlerts,
    importAlerts,
    isLoading: alertsLoading,
  } = useInspectionExpiryAlerts(
    companyId,
    company?.inspection_expiry_threshold_months ?? 3,
    company?.import_expiry_threshold_months ?? 1,
  );

  const alertMessages = alertsLoading
    ? []
    : [
        ...inspectionAlerts.map(
          (a) => `${a.productName} 제품의 검사유효기간 연장요청합니다.`,
        ),
        ...importAlerts.map(
          (a) => `${a.productName} 제품의 수입유효기간 연장요청합니다.`,
        ),
      ];

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

          {/* 설정 바로 오른쪽 — 유효기간 임박 티커 + 발주 예상 위젯 */}
          <span
            className="w-px h-4 bg-line mx-2"
            aria-hidden
          />

          <ExpiryAlertTicker alerts={alertMessages} />

          {alertMessages.length > 0 && (
            <span className="w-px h-4 bg-line mx-2" aria-hidden />
          )}

          <div className="flex items-center gap-2 relative" ref={filterRef}>
            {/*
              🎨 다크모드 안전 토글 (2026-07-05):
              선택 상태에 하드코딩 'bg-brand text-white' → CSS 변수 기반으로 교체.
              두 테마 모두에서 배경-글자 대비 확보. (기존 흰-배경-흰-글자 버그 재발 방지)
            */}
            <div
              className="flex rounded border border-line overflow-hidden text-xs"
            >
              {(['1m', '3m'] as OrderBasis[]).map((b) => {
                const active = basis === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBasis(b)}
                    style={{
                      padding: '4px 8px',
                      background: active ? 'var(--brand)' : 'var(--surface)',
                      color: active ? 'var(--surface)' : 'var(--ink-3)',
                      fontWeight: active ? 600 : 400,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {b === '1m' ? '1개월' : '3개월'}
                  </button>
                );
              })}
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
                className="absolute top-full right-0 mt-1 border border-line rounded-lg p-3 z-50 min-w-[200px] max-h-[400px] overflow-auto"
                style={{
                  background: 'var(--surface)',
                  boxShadow: 'var(--shadow-lg)',
                }}
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

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={refreshing}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-line text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors disabled:cursor-wait"
            title="새로고침"
            aria-label="새로고침"
          >
            <RefreshCw
              size={12}
              className={refreshing ? 'animate-spin' : undefined}
            />
          </button>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-line text-xs text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
            title="로그아웃"
          >
            <LogOut size={12} />
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
