/**
 * 파트너 포털 헤더에 인라인 배치되는 모바일 안내 QR 트리거 + 팝오버.
 *
 * - 평소: 헤더 타이틀/거래처 배지 옆의 작은 아이콘 버튼 하나 (📱 + "QR").
 * - 클릭 시: 버튼 아래로 팝오버 (QR + 설명 + 링크 복사).
 * - 바깥 클릭 / X / Escape 로 닫힘.
 * - 카톡으로 링크를 직접 보내는 경우를 위해 "링크 복사하기" 버튼 제공.
 *
 * 🔴 스타일은 파트너 포털 --p-* 토큰만 사용 — QR 배경(#ffffff) / 전경(#000000)
 *    만 예외적으로 하드코딩 (스캐너 대비 필수).
 */
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Smartphone, X } from 'lucide-react';

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
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* 트리거 버튼 — 헤더 로그아웃 버튼과 동일한 32px 높이 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="mobile-install-qr-popover"
        title="모바일에서 더 편하게 이용하세요"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 32,
          padding: '0 10px',
          background: expanded ? 'var(--p-brand-deep)' : 'var(--p-brand)',
          border: '1px solid var(--p-brand-deep)',
          borderRadius: 6,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Smartphone size={13} aria-hidden />
        모바일 QR
      </button>

      {/* 팝오버 */}
      {expanded && (
        <div
          id="mobile-install-qr-popover"
          role="dialog"
          aria-label="모바일 주문 QR 코드"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 30,
            width: 320,
            maxWidth: 'calc(100vw - 36px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 16,
            background: 'var(--p-card-bg)',
            border: '1px solid var(--p-line)',
            borderRadius: 10,
            color: 'var(--p-ink)',
            boxShadow: 'var(--p-shadow-card)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
              모바일 주문 페이지 QR
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="닫기"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 4,
                borderRadius: 6,
                color: 'var(--p-ink-3)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: 'var(--p-ink-2)',
            }}
          >
            휴대폰 카메라로 QR코드를 스캔하면 모바일 주문 페이지로 바로
            이동합니다. 홈 화면에 앱으로 설치해 사용하시면 브라우저 없이 바로
            열 수 있습니다.
          </div>
          <div
            style={{
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
              background: '#ffffff',
              border: '1px solid var(--p-line)',
              borderRadius: 8,
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
            title={MOBILE_ORDER_URL}
            style={{
              fontSize: 11.5,
              color: 'var(--p-ink-3)',
              fontFamily: 'var(--font-num)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {MOBILE_ORDER_URL}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              background: copied ? 'var(--p-success-wash)' : 'var(--p-brand)',
              color: copied ? 'var(--p-success)' : '#ffffff',
              border: `1px solid ${copied ? 'var(--p-success)' : 'var(--p-brand-deep)'}`,
              borderRadius: 8,
              cursor: 'pointer',
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
  );
}
