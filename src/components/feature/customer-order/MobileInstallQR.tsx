/**
 * 파트너 포털 모바일 안내 QR 카드.
 *
 * - 데스크탑에서 /customer-order 열어 본 파트너에게, 자기 폰 카메라로 QR 스캔 →
 *   /mobile-order 로 바로 이동하도록 유도.
 * - 카톡으로 링크를 직접 보내는 경우를 위해 "링크 복사하기" 버튼도 제공.
 * - QR SVG 는 다크 테마에서도 스캔 가능하도록 흰색 배경 박스로 감싼다.
 *
 * 🔴 스타일은 파트너 포털 --p-* 토큰만 사용 — QR 배경(#ffffff) / 전경(#000000)
 *    만 예외적으로 하드코딩 (스캐너 대비 필수).
 */
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check } from 'lucide-react';

const MOBILE_ORDER_URL = 'https://saas-beta-pied.vercel.app/mobile-order';

export function MobileInstallQR() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MOBILE_ORDER_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 접근 실패 — 사용자에게 표시할 UI 없음 (조용히 실패) */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-[18px] pt-[12px]">
      <div
        className="flex items-center gap-4 rounded-[10px] px-4 py-4"
        style={{
          background: 'var(--p-card-bg)',
          border: '1px solid var(--p-line)',
          color: 'var(--p-ink)',
          boxShadow: 'var(--p-shadow-card)',
        }}
      >
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          <div className="text-[15px] font-semibold leading-tight">
            📱 모바일에서 더 편하게 이용하세요
          </div>
          <div
            className="text-[12.5px] leading-snug"
            style={{ color: 'var(--p-ink-2)' }}
          >
            휴대폰 카메라로 QR코드를 스캔하면 모바일 주문 페이지로 바로
            이동합니다. 홈 화면에 앱으로 설치해 사용하시면 브라우저 없이 바로
            열 수 있습니다.
          </div>
          <div
            className="mt-1 truncate text-[12px]"
            style={{ color: 'var(--p-ink-3)', fontFamily: 'var(--font-num)' }}
            title={MOBILE_ORDER_URL}
          >
            {MOBILE_ORDER_URL}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold"
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
        <div
          className="flex flex-shrink-0 items-center justify-center rounded-[8px] p-2"
          style={{
            background: '#ffffff',
            border: '1px solid var(--p-line)',
          }}
          aria-label="모바일 주문 페이지 QR 코드"
        >
          <QRCodeSVG
            value={MOBILE_ORDER_URL}
            size={120}
            level="M"
            marginSize={0}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
      </div>
    </div>
  );
}
