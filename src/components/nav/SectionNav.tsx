/**
 * 2단 서브 네비게이션.
 * 현재 활성 섹션의 `items`를 NavLink로 렌더. items가 비어있으면 렌더하지 않음 (홈).
 * 활성 아이템: 연한 버건디 배경(brand-wash) + 버건디 텍스트.
 * 비활성 아이템: hover 시 surface-2 배경 + ink 색상.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { isSectionActive, navSections } from './navConfig';

export function SectionNav() {
  const { pathname } = useLocation();
  const activeSection = navSections.find((s) => isSectionActive(s.path, pathname));
  if (!activeSection || activeSection.items.length === 0) return null;

  return (
    <div className="sticky top-14 z-10 border-b border-line bg-surface">
      <nav className="max-w-[1400px] mx-auto px-6 h-11 flex items-center gap-1">
        {activeSection.items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive
                ? 'px-3 h-8 flex items-center rounded-md text-sm font-medium transition-colors bg-brand-wash text-brand'
                : 'px-3 h-8 flex items-center rounded-md text-sm transition-colors text-ink-3 hover:bg-surface-2 hover:text-ink'
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
