/**
 * 전역 Shell 레이아웃.
 * - 1단 TopNav (sticky)
 * - 2단 SectionNav (sticky, 홈에서는 숨김)
 * - 본문 <Outlet />
 */
import { Outlet } from 'react-router-dom';
import { SectionNav } from './nav/SectionNav';
import { TopNav } from './nav/TopNav';

export function Shell() {
  return (
    <div
      className="min-h-screen text-ink"
      style={{ background: 'var(--bg)' }}
    >
      <TopNav />
      <SectionNav />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
