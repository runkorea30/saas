/**
 * 거래처 포털 테마 훅 — 라이트 / 다크그레이 2종만 지원.
 *
 * OPS useTheme 과 분리된 별도 시스템:
 *   - 저장: mochicraft_demo.portal_preferences (customer_id 기준 UNIQUE upsert)
 *   - 식별: useCustomerAuth 의 customerId / companyId (Supabase Auth 무관)
 *   - DOM: html[data-portal-theme='light' | 'dark-gray'] (OPS 의 data-theme 와 분리)
 *   - 캐시: localStorage 'mc.portal.theme'
 *   - 기본값: dark-gray (사양 명시)
 *
 * 마운트 시 OPS data-theme 를 제거해 OPS 테마(dark-true/sepia 등)가 포털에
 * 새지 않도록 격리. 언마운트 시 data-portal-theme 만 제거 (OPS data-theme 는
 * App.tsx 의 useTheme 가 다음 effect 에서 다시 적용).
 *
 * 보안: 거래처 인증이 평문 비밀번호 + localStorage 라 auth.uid() NULL.
 * RLS 는 anon 에 열려있고 프론트에서 customer_id 명시 필터링. dev/dogfooding
 * 단계 수용 — OPS user_preferences 와 동일 수준.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type PortalTheme = 'light' | 'dark-gray';

const ALL_THEMES: PortalTheme[] = ['light', 'dark-gray'];
const STORAGE_KEY = 'mc.portal.theme';
const QUERY_KEY = ['portal-theme'] as const;
const DEFAULT_THEME: PortalTheme = 'dark-gray';

function isPortalTheme(v: unknown): v is PortalTheme {
  return typeof v === 'string' && (ALL_THEMES as string[]).includes(v);
}

function readCache(): PortalTheme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isPortalTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeCache(theme: PortalTheme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 차단 환경 — 무시 */
  }
}

function applyTheme(theme: PortalTheme) {
  const root = document.documentElement;
  // OPS data-theme 를 명시적으로 제거 — 포털은 자체 attribute 만 사용.
  if (root.hasAttribute('data-theme')) {
    root.removeAttribute('data-theme');
  }
  root.setAttribute('data-portal-theme', theme);
}

function clearTheme() {
  document.documentElement.removeAttribute('data-portal-theme');
}

interface UsePortalThemeArgs {
  customerId: string | null | undefined;
  companyId: string | null | undefined;
}

export function usePortalTheme({ customerId, companyId }: UsePortalThemeArgs) {
  const qc = useQueryClient();
  const enabled = !!customerId;

  const query = useQuery<PortalTheme>({
    queryKey: [...QUERY_KEY, customerId ?? 'anon'],
    queryFn: async () => {
      if (!customerId) return readCache();
      const { data, error } = await supabase
        .from('portal_preferences')
        .select('theme')
        .eq('customer_id', customerId)
        .maybeSingle();
      if (error) throw error;
      if (data?.theme && isPortalTheme(data.theme)) return data.theme;
      return readCache();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: readCache(),
  });

  const theme: PortalTheme = isPortalTheme(query.data)
    ? query.data
    : readCache();

  useEffect(() => {
    applyTheme(theme);
    writeCache(theme);
    return () => {
      clearTheme();
    };
  }, [theme]);

  const mutation = useMutation({
    mutationFn: async (next: PortalTheme) => {
      if (!customerId || !companyId) return next;
      const { error } = await supabase
        .from('portal_preferences')
        .upsert(
          { customer_id: customerId, company_id: companyId, theme: next },
          { onConflict: 'customer_id' },
        );
      if (error) throw error;
      return next;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const previous = qc.getQueryData<PortalTheme>([
        ...QUERY_KEY,
        customerId ?? 'anon',
      ]);
      qc.setQueryData<PortalTheme>(
        [...QUERY_KEY, customerId ?? 'anon'],
        next,
      );
      applyTheme(next);
      writeCache(next);
      return { previous };
    },
    onError: (err) => {
      console.error('[usePortalTheme] save failed:', err);
    },
  });

  return {
    theme,
    setTheme: (next: PortalTheme) => mutation.mutate(next),
    isLoading: enabled && query.isLoading,
    isSaving: mutation.isPending,
    saveError: mutation.error as Error | null,
  };
}
