/**
 * 모바일 PWA 레이아웃.
 * - 접힘(≤600px): 하단 탭바 (BottomNav)
 * - 펼침(>600px): 좌측 사이드레일 (SideRail) + 우측 콘텐츠
 *
 * 🟠 OPS 글로벌 스타일 격리:
 *   index.css 가 body 에 burgundy paper-grain 배경 + Pretendard 폰트를 강제하므로
 *   마운트 시 body.mobile-active 클래스를 부여해 mobile.css 에서 명시적으로 리셋.
 *   언마운트 시 다시 OPS 페이지로 돌아갈 때 원상복구.
 */
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useMobileTheme } from './hooks/useMobileTheme';
import { BottomNav } from './components/BottomNav';
import { SideRail } from './components/SideRail';
import { IconMoon, IconSun } from './components/MobileIcons';

export function MobileLayout() {
  const isFolded = useMediaQuery('(max-width: 600px)');
  const { isDark, toggle } = useMobileTheme();

  // 🔴 body 에 식별 클래스 부여 → mobile.css 의 body.mobile-active 규칙으로
  //    OPS 글로벌 배경/폰트/스크롤바를 모바일 토큰으로 강제 교체.
  useEffect(() => {
    document.body.classList.add('mobile-active');
    return () => {
      document.body.classList.remove('mobile-active');
    };
  }, []);

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
