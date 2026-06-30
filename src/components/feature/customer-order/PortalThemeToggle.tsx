/**
 * 거래처 포털 헤더 테마 토글 — 2종(라이트/다크그레이).
 *
 * OPS ThemeToggle 과 분리된 별도 컴포넌트:
 *   - useCustomerAuth 로 customerId/companyId 획득 (로그인 전엔 null)
 *   - usePortalTheme 로 portal_preferences 동기화
 *   - 로그인 전: localStorage 캐시만 (서버 저장은 로그인 후 첫 변경부터)
 *   - 저장 실패 시 toast 알림 (UI 변경은 유지 — 사양)
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { usePortalTheme, type PortalTheme } from '@/hooks/usePortalTheme';
import { useToast } from '@/components/ui/Toast';

interface ThemeOption {
  value: PortalTheme;
  label: string;
  swatch: { bg: string; accent: string; border: string };
}

const OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: '라이트',
    swatch: { bg: '#FFFFFF', accent: '#6B1F2A', border: '#E7E5E4' },
  },
  {
    value: 'dark-gray',
    label: '다크그레이',
    swatch: { bg: '#2C2C2A', accent: '#9A4250', border: '#4A4A47' },
  },
];

export function PortalThemeToggle() {
  const { customer } = useCustomerAuth();
  const { theme, setTheme, saveError } = usePortalTheme({
    customerId: customer?.customerId ?? null,
    companyId: customer?.companyId ?? null,
  });
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastReportedErr = useRef<Error | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (saveError && saveError !== lastReportedErr.current) {
      lastReportedErr.current = saveError;
      showToast({
        kind: 'error',
        text: '테마 저장 실패 — 다음 변경 시 재시도됩니다.',
      });
    }
  }, [saveError, showToast]);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="테마 선택"
        aria-label="테마 선택"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 32,
          height: 32,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          color: 'var(--p-ink-3)',
          cursor: 'pointer',
          transition: 'color .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--p-ink)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--p-ink-3)';
        }}
      >
        <Palette size={15} strokeWidth={1.8} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 180,
            background: 'var(--p-bg-header)',
            border: '1px solid var(--p-line-header)',
            borderRadius: 8,
            padding: 4,
            boxShadow: 'var(--p-shadow-soft)',
            zIndex: 50,
          }}
        >
          {OPTIONS.map((opt) => {
            const active = opt.value === theme;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: 'none',
                  background: active ? 'var(--p-surface-2)' : 'transparent',
                  color: active ? 'var(--p-ink)' : 'var(--p-ink-2)',
                  fontWeight: active ? 500 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'var(--p-surface-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: opt.swatch.bg,
                    border: `1px solid ${opt.swatch.border}`,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: opt.swatch.accent,
                    }}
                  />
                </span>
                <span style={{ flex: 1 }}>{opt.label}</span>
                {active && (
                  <Check
                    size={13}
                    strokeWidth={2.2}
                    style={{ color: 'var(--p-brand)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
