/**
 * 1단 메인 네비게이션.
 * - 좌측: MochiCraft OPS 로고 텍스트 (버건디)
 * - 우측: 5개 섹션 버튼 (홈/판매/재고매입/재무/설정)
 * - 클릭 시 `indexRedirect`로 이동
 * - 활성 섹션 하단에 3px 버건디 라인
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { isSectionActive, navSections } from './navConfig';

export function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

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
      </div>
    </header>
  );
}
