/**
 * /mobile-order PWA 설치 안내 배너.
 *
 * - Android/Chromium: `beforeinstallprompt` → "홈 화면에 설치" 버튼 → 네이티브 프롬프트.
 * - iOS/Safari: `beforeinstallprompt` 미지원 → "공유(⬆️) → 홈 화면에 추가" 수동 안내.
 * - 이미 standalone 실행 중이면 렌더 스킵.
 * - 우측 X 로 닫으면 localStorage 에 영구 저장 (`mo_install_banner_dismissed=1`).
 *
 * 🔴 스타일은 /mobile-order 전용 --mo-* 토큰만 사용 — 하드코딩 색상 금지.
 */
import { useEffect, useState } from 'react';
import { Share, X, Download, Plus } from 'lucide-react';

const DISMISS_KEY = 'mo_install_banner_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* localStorage 차단 환경 — 무시 */
  }
}

interface MobileOrderInstallBannerProps {
  /**
   * true 이면 localStorage 의 닫힘 기록을 무시하고 항상 렌더 + X 버튼 숨김.
   * 로그인 이전 화면에서 배너가 항상 눈에 띄도록 강제.
   */
  forceShow?: boolean;
}

export function MobileOrderInstallBanner({
  forceShow = false,
}: MobileOrderInstallBannerProps = {}) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  useEffect(() => {
    const standaloneMedia =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone =
      typeof navigator !== 'undefined' &&
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standaloneMedia || iosStandalone));

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const iOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (ua.includes('Mac') &&
        typeof navigator !== 'undefined' &&
        navigator.maxTouchPoints > 1);
    setIsIOS(iOS);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    const installedHandler = () => setDeferredPrompt(null);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handler as EventListener,
      );
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  if (isStandalone) return null;
  if (dismissed && !forceShow) return null;

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 16px',
    margin: '14px 12px 0',
    background: 'var(--mo-bg-card)',
    border: '1px solid var(--mo-border)',
    borderRadius: 12,
    color: 'var(--mo-text-primary)',
  };

  const closeBtnStyle: React.CSSProperties = {
    flexShrink: 0,
    width: 32,
    height: 32,
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--mo-text-secondary)',
    cursor: 'pointer',
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // 안드로이드/크롬 계열: 원클릭 설치
  if (deferredPrompt) {
    return (
      <div role="region" aria-label="앱 설치 안내" style={wrapperStyle}>
        <Download
          size={28}
          aria-hidden
          style={{ color: 'var(--mo-accent)', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}
          >
            앱처럼 편하게 쓰시려면?
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 14,
              lineHeight: 1.35,
              color: 'var(--mo-text-secondary)',
            }}
          >
            홈 화면에 설치하면 브라우저 없이 바로 열립니다.
          </div>
        </div>
        <button
          type="button"
          onClick={handleInstallClick}
          style={{
            flexShrink: 0,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            border: '1px solid var(--mo-accent)',
            borderRadius: 10,
            background: 'var(--mo-accent)',
            color: '#ffffff',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          홈 화면에 설치
        </button>
        {!forceShow && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="닫기"
            style={closeBtnStyle}
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  // iOS/Safari: 수동 안내
  if (isIOS) {
    return (
      <div
        role="region"
        aria-label="앱 설치 안내"
        style={{ ...wrapperStyle, alignItems: 'flex-start' }}
      >
        <Share
          size={28}
          aria-hidden
          style={{
            color: 'var(--mo-accent)',
            flexShrink: 0,
            marginTop: 3,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}
          >
            앱처럼 편하게 쓰시려면?
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 14,
              lineHeight: 1.45,
              color: 'var(--mo-text-secondary)',
            }}
          >
            하단{' '}
            <strong style={{ color: 'var(--mo-text-primary)' }}>
              공유 버튼
            </strong>
            <Share
              size={14}
              aria-hidden
              style={{
                display: 'inline',
                verticalAlign: 'text-bottom',
                margin: '0 3px',
                color: 'var(--mo-accent)',
              }}
            />
            을 누른 뒤{' '}
            <strong style={{ color: 'var(--mo-text-primary)' }}>
              &quot;홈 화면에 추가
              <Plus
                size={14}
                aria-hidden
                style={{
                  display: 'inline',
                  verticalAlign: 'text-bottom',
                  margin: '0 2px',
                }}
              />
              &quot;
            </strong>
            를 선택해 주세요.
          </div>
        </div>
        {!forceShow && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="닫기"
            style={closeBtnStyle}
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return null;
}
