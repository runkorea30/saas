/**
 * 헤더 테마 토글 — 4종 옵션 드롭다운.
 * 라이트 / True Dark / 다크그레이 / 웜 세피아.
 *
 * 각 옵션은 색상 스와치(배경+포인트) 미리보기와 함께 표시되고,
 * 현재 선택된 항목은 우측에 체크. 외부 클릭 시 자동 닫힘.
 *
 * useTheme 훅을 내부에서 직접 호출 — App.tsx 의 호출과 동일 queryKey 라
 * useQuery 캐시는 공유되고 mutation 만 컴포넌트 인스턴스 단위로 발생.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useOpsAuth } from '@/hooks/useOpsAuth';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/Toast';

interface ThemeOption {
  value: Theme;
  label: string;
  swatch: { bg: string; accent: string; border: string };
}

const OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: '라이트',
    swatch: { bg: '#F6F1E9', accent: '#6B1F2A', border: '#E3DAC9' },
  },
  {
    value: 'dark-true',
    label: 'True Dark',
    swatch: { bg: '#0B0B0B', accent: '#8A3340', border: '#2C2C2A' },
  },
  {
    value: 'dark-gray',
    label: '다크그레이',
    swatch: { bg: '#2C2C2A', accent: '#9A4250', border: '#4A4A47' },
  },
  {
    value: 'dark-sepia',
    label: '웜 세피아',
    swatch: { bg: '#2B2620', accent: '#BA7517', border: '#4A4233' },
  },
];

export function ThemeToggle() {
  const { session } = useOpsAuth();
  const { companyId } = useCompany();
  const { theme, setTheme, saveError } = useTheme({
    userId: session?.user?.id ?? null,
    companyId,
  });
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastReportedErr = useRef<Error | null>(null);

  // 외부 클릭 시 닫기 (TopNav 발주 위젯과 동일 패턴).
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

  // 저장 실패 토스트 — 사양: UI 는 변경 유지, 실패는 알림으로 통지.
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
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-3 transition-colors theme-toggle-btn"
        title="테마 선택"
        aria-label="테마 선택"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Palette size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 border border-line rounded-lg p-1 z-50 min-w-[180px]"
          style={{
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-lg)',
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
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors theme-option"
                style={{
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: active ? 500 : 400,
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded shrink-0"
                  style={{
                    background: opt.swatch.bg,
                    border: `1px solid ${opt.swatch.border}`,
                  }}
                  aria-hidden
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: opt.swatch.accent }}
                  />
                </span>
                <span className="flex-1 text-left">{opt.label}</span>
                {active && (
                  <Check size={12} style={{ color: 'var(--brand)' }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
