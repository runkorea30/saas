/**
 * 파트너 모바일 주문 페이지 (/mobile-order).
 *
 * 팩스/카톡 기반 거래처가 모바일에서 주문서를 제출하는 독립 페이지.
 * OPS / 거래처 포털(/customer-order) / MobileApp(/mobile) 과 완전 분리.
 *
 * 🔴 자체 로그인(useMobileSession) — Supabase Auth 미사용.
 * 🟠 테마는 data-mobile-theme (독립 CSS 변수 --mo-*). OPS 전역 테마 무관.
 * 🟠 컨테이너는 뷰(로그인/사진업로드/직접입력/주문확인) 라우팅만 담당,
 *    각 뷰의 실제 구현은 하위 컴포넌트에서.
 */
import { useEffect, useState } from 'react';
import { LogOut, Moon, Sun, Camera, ClipboardList, ListChecks } from 'lucide-react';
import {
  clearMobileSession,
  useMobileSession,
  type MobileSession,
} from '@/lib/mobileOrderAuth';
import { supabase } from '@/lib/supabase';
import { MobileOrderLogin } from '@/components/mobile-order/MobileOrderLogin';
import { MobileOrderUpload } from '@/components/mobile-order/MobileOrderUpload';
import { MobileOrderForm } from '@/components/mobile-order/MobileOrderForm';
import { MobileOrderHistory } from '@/components/mobile-order/MobileOrderHistory';
import { MobileOrderInstallBanner } from '@/components/mobile-order/MobileOrderInstallBanner';
import '@/styles/mobile-order.css';

type ViewKey = 'upload' | 'form' | 'history';
type ThemeKey = 'dark' | 'light';

const THEME_STORAGE_KEY = 'mo_theme';

function readInitialTheme(): ThemeKey {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export default function MobileOrderPage() {
  const session = useMobileSession();
  const [view, setView] = useState<ViewKey>('upload');
  const [theme, setTheme] = useState<ThemeKey>(readInitialTheme);

  // 테마 전환 시 localStorage 반영. DOM 속성은 렌더 시 root div 에 직접 부여.
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = (): void => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = async (): Promise<void> => {
    // 서버 세션 정리(best effort) — 실패해도 로컬 세션은 반드시 제거.
    const token = session?.token;
    if (token) {
      try {
        await supabase.from('mobile_order_sessions').delete().eq('session_token', token);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[mo.logout.serverDelete]', err);
      }
    }
    clearMobileSession();
    // 세션 제거 후 view state 는 다음 로그인 사용자를 위해 기본값으로.
    setView('upload');
  };

  return (
    <div className="mo-root" data-mobile-theme={theme}>
      <div className="mo-frame">
        <MobileOrderInstallBanner />
        {session ? (
          <AuthenticatedShell
            session={session}
            view={view}
            onChangeView={setView}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <UnauthenticatedShell theme={theme} onToggleTheme={toggleTheme} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 로그인 이전 (Step 2 에서 실제 로그인 폼으로 교체)
// ───────────────────────────────────────────────────────────

function UnauthenticatedShell({
  theme,
  onToggleTheme,
}: {
  theme: ThemeKey;
  onToggleTheme: () => void;
}) {
  return (
    <MobileOrderLogin
      headerActions={
        <button
          type="button"
          className="mo-icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      }
    />
  );
}

// ───────────────────────────────────────────────────────────
// 로그인 이후
// ───────────────────────────────────────────────────────────

function AuthenticatedShell({
  session,
  view,
  onChangeView,
  onLogout,
  theme,
  onToggleTheme,
}: {
  session: MobileSession;
  view: ViewKey;
  onChangeView: (v: ViewKey) => void;
  onLogout: () => void;
  theme: ThemeKey;
  onToggleTheme: () => void;
}) {
  return (
    <>
      <header className="mo-header">
        <div className="mo-header__brand">Angelus</div>
        <div className="mo-header__title" title={session.customerName}>
          {session.customerName}
        </div>
        <div className="mo-header__actions">
          <button
            type="button"
            className="mo-icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            className="mo-icon-btn"
            onClick={onLogout}
            aria-label="로그아웃"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mo-main">
        {view === 'upload' ? (
          <MobileOrderUpload
            session={session}
            onSubmitted={() => onChangeView('history')}
          />
        ) : view === 'form' ? (
          <MobileOrderForm
            session={session}
            onSubmitted={() => onChangeView('history')}
          />
        ) : (
          <MobileOrderHistory session={session} />
        )}
      </main>

      <nav className="mo-tabs" aria-label="주문 탭">
        <div className="mo-tabs__inner">
          <button
            type="button"
            className="mo-tab"
            data-active={view === 'upload'}
            onClick={() => onChangeView('upload')}
          >
            <Camera size={20} />
            <span>사진 주문</span>
          </button>
          <button
            type="button"
            className="mo-tab"
            data-active={view === 'form'}
            onClick={() => onChangeView('form')}
          >
            <ClipboardList size={20} />
            <span>주문서입력</span>
          </button>
          <button
            type="button"
            className="mo-tab"
            data-active={view === 'history'}
            onClick={() => onChangeView('history')}
          >
            <ListChecks size={20} />
            <span>주문 확인</span>
          </button>
        </div>
      </nav>
    </>
  );
}

