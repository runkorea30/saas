/**
 * 모바일 PWA 레이아웃.
 * - 접힘(≤600px): 하단 탭바 (BottomNav)
 * - 펼침(>600px): 좌측 사이드레일 (SideRail) + 우측 콘텐츠
 */
import { Outlet } from 'react-router-dom';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useMobileTheme } from './hooks/useMobileTheme';
import { BottomNav } from './components/BottomNav';
import { SideRail } from './components/SideRail';
import { IconMoon, IconSun } from './components/MobileIcons';

export function MobileLayout() {
  const isFolded = useMediaQuery('(max-width: 600px)');
  const { isDark, toggle } = useMobileTheme();

  return (
    <div
      className={`mobile-app ${isDark ? 'dark' : ''} ${
        isFolded ? 'is-folded' : 'is-unfolded'
      }`}
    >
      {!isFolded && <SideRail />}
      <main className="mobile-content" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={toggle}
          className="m-theme-toggle"
          aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? <IconSun /> : <IconMoon />}
        </button>
        <Outlet />
      </main>
      {isFolded && <BottomNav />}
    </div>
  );
}
