/**
 * 파트너 포털 PWA 설치 안내 배너.
 *
 * - Android/Chrome: `beforeinstallprompt` 이벤트가 발생하면 배너의 "홈 화면에 설치"
 *   버튼으로 네이티브 설치 프롬프트 즉시 호출.
 * - iOS/Safari: `beforeinstallprompt` 미지원 → iOS 감지 시 "공유(⬆️) → 홈 화면에
 *   추가" 수동 안내 배너 표시.
 * - 이미 설치되어 standalone 으로 실행 중이면 배너 렌더 자체 스킵.
 * - 우측 X 로 닫으면 localStorage 에 영구 저장 (`p_install_banner_dismissed=1`).
 *   다시 보고 싶으면 localStorage 정리 필요.
 *
 * 🔴 스타일은 파트너 포털 --p-* 토큰만 사용 — 하드코딩 색상 금지.
 */
import { useEffect, useState } from 'react';
import { Share, X, Download, Plus } from 'lucide-react';

const DISMISS_KEY = 'p_install_banner_dismissed';

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

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());

  useEffect(() => {
    // standalone(이미 설치되어 실행 중) 감지 — iOS Safari 는 navigator.standalone.
    const standaloneMedia =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone =
      typeof navigator !== 'undefined' &&
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standaloneMedia || iosStandalone));

    // iOS 기기 감지 (iPadOS 13+ 은 데스크톱 UA 로 보고되지만 touch 로 구분).
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
    // 설치 완료 이벤트 시 배너 감춤.
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

  if (isStandalone || dismissed) return null;

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

  // 안드로이드/크롬 계열: 원클릭 설치.
  if (deferredPrompt) {
    return (
      <div
        role="region"
        aria-label="앱 설치 안내"
        className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-[18px] pt-[12px]"
      >
        <div
          className="flex flex-1 items-center gap-3 rounded-[10px] px-4 py-3"
          style={{
            background: 'var(--p-info-wash)',
            border: '1px solid var(--p-info-strong-border)',
            color: 'var(--p-ink)',
            boxShadow: 'var(--p-shadow-soft)',
          }}
        >
          <Download
            size={20}
            aria-hidden
            style={{ color: 'var(--p-info)', flexShrink: 0 }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold leading-tight">
              앱처럼 편하게 쓰시려면?
            </div>
            <div
              className="mt-0.5 text-[12.5px] leading-tight"
              style={{ color: 'var(--p-ink-2)' }}
            >
              홈 화면에 설치하면 브라우저 없이 바로 열립니다.
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="rounded-[8px] px-3 py-2 text-[13px] font-semibold whitespace-nowrap"
            style={{
              background: 'var(--p-brand)',
              color: '#ffffff',
              border: '1px solid var(--p-brand-deep)',
            }}
          >
            홈 화면에 설치
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="닫기"
            className="rounded-[6px] p-1"
            style={{ color: 'var(--p-ink-3)' }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  // iOS/Safari: 수동 안내.
  if (isIOS) {
    return (
      <div
        role="region"
        aria-label="앱 설치 안내"
        className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-[18px] pt-[12px]"
      >
        <div
          className="flex flex-1 items-start gap-3 rounded-[10px] px-4 py-3"
          style={{
            background: 'var(--p-info-wash)',
            border: '1px solid var(--p-info-strong-border)',
            color: 'var(--p-ink)',
            boxShadow: 'var(--p-shadow-soft)',
          }}
        >
          <Share
            size={20}
            aria-hidden
            style={{ color: 'var(--p-info)', flexShrink: 0, marginTop: 2 }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold leading-tight">
              앱처럼 편하게 쓰시려면?
            </div>
            <div
              className="mt-1 text-[12.5px] leading-snug"
              style={{ color: 'var(--p-ink-2)' }}
            >
              하단 <strong style={{ color: 'var(--p-ink)' }}>공유 버튼</strong>
              <Share
                size={13}
                aria-hidden
                style={{
                  display: 'inline',
                  verticalAlign: 'text-bottom',
                  margin: '0 3px',
                  color: 'var(--p-info)',
                }}
              />
              을 누른 뒤{' '}
              <strong style={{ color: 'var(--p-ink)' }}>
                &quot;홈 화면에 추가
                <Plus
                  size={13}
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
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="닫기"
            className="rounded-[6px] p-1"
            style={{ color: 'var(--p-ink-3)', flexShrink: 0 }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  // 데스크톱 또는 지원 안 되는 브라우저 — 아무것도 표시하지 않음.
  return null;
}
