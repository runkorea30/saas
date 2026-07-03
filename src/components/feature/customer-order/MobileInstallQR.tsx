/**
 * 파트너 포털 모바일 안내 QR — 컴팩트 바 + 클릭 시 팝오버.
 *
 * - 평소: 헤더 아래 한 줄짜리 컴팩트 바 (아이콘 + 안내 문구 + [QR코드 보기])
 * - 클릭 시: 바 아래 팝오버로 QR + 설명 + 링크 복사 표시.
 * - 바깥 클릭 또는 X / Escape 로 닫힘.
 * - 카톡으로 링크를 직접 보내는 경우를 위해 "링크 복사하기" 버튼 제공.
 *
 * 🔴 스타일은 파트너 포털 --p-* 토큰만 사용 — QR 배경(#ffffff) / 전경(#000000)
 *    만 예외적으로 하드코딩 (스캐너 대비 필수).
 */
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, QrCode, X } from 'lucide-react';

const MOBILE_ORDER_URL = 'https://saas-beta-pied.vercel.app/mobile-order';

export function MobileInstallQR() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MOBILE_ORDER_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 접근 실패 — 조용히 실패 */
    }
  };

  // 바깥 클릭 + Escape 로 닫힘.
  useEffect(() => {
    if (!expanded) return;
    const onDocClick = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-[18px] pt-[10px]">
      <div ref={containerRef} className="relative">
        {/* 컴팩트 바 */}
        <div
          className="flex items-center gap-3 rounded-[8px] px-3 py-2"
          style={{
            background: 'var(--p-card-bg)',
            border: '1px solid var(--p-line)',
            color: 'var(--p-ink)',
            boxShadow: 'var(--p-shadow-card)',
          }}
        >
          <QrCode
            size={16}
            aria-hidden
            style={{ color: 'var(--p-brand)', flexShrink: 0 }}
          />
          <div
            className="flex-1 min-w-0 truncate text-[13px] font-medium"
            title="모바일에서 더 편하게 이용하세요"
          >
            📱 모바일에서 더 편하게 이용하세요
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="mobile-install-qr-popover"
            className="inline-flex items-center gap-1 rounded-[6px] px-3 py-1 text-[12px] font-semibold whitespace-nowrap"
            style={{
              background: expanded ? 'var(--p-brand-deep)' : 'var(--p-brand)',
              color: '#ffffff',
              border: '1px solid var(--p-brand-deep)',
            }}
          >
            <QrCode size={12} aria-hidden />
            QR코드 보기
          </button>
        </div>

        {/* 팝오버 */}
        {expanded && (
          <div
            id="mobile-install-qr-popover"
            role="dialog"
            aria-label="모바일 주문 QR 코드"
            className="absolute right-0 z-30 mt-2 flex w-[320px] max-w-[calc(100vw-36px)] flex-col gap-3 rounded-[10px] p-4"
            style={{
              background: 'var(--p-card-bg)',
              border: '1px solid var(--p-line)',
              color: 'var(--p-ink)',
              boxShadow: 'var(--p-shadow-card)',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[14px] font-semibold leading-tight">
                모바일 주문 페이지 QR
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="닫기"
                className="rounded-[6px] p-1"
                style={{ color: 'var(--p-ink-3)' }}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <div
              className="text-[12px] leading-snug"
              style={{ color: 'var(--p-ink-2)' }}
            >
              휴대폰 카메라로 QR코드를 스캔하면 모바일 주문 페이지로 바로
              이동합니다. 홈 화면에 앱으로 설치해 사용하시면 브라우저 없이 바로
              열 수 있습니다.
            </div>
            <div
              className="mx-auto flex items-center justify-center rounded-[8px] p-2"
              style={{
                background: '#ffffff',
                border: '1px solid var(--p-line)',
              }}
              aria-label="모바일 주문 페이지 QR 코드"
            >
              <QRCodeSVG
                value={MOBILE_ORDER_URL}
                size={160}
                level="M"
                marginSize={0}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
            <div
              className="truncate text-[11.5px]"
              style={{ color: 'var(--p-ink-3)', fontFamily: 'var(--font-num)' }}
              title={MOBILE_ORDER_URL}
            >
              {MOBILE_ORDER_URL}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 rounded-[8px] px-3 py-2 text-[12.5px] font-semibold"
              style={{
                background: copied ? 'var(--p-success-wash)' : 'var(--p-brand)',
                color: copied ? 'var(--p-success)' : '#ffffff',
                border: `1px solid ${copied ? 'var(--p-success)' : 'var(--p-brand-deep)'}`,
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              {copied ? (
                <>
                  <Check size={13} aria-hidden />
                  복사됨
                </>
              ) : (
                <>
                  <Copy size={13} aria-hidden />
                  링크 복사하기
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
