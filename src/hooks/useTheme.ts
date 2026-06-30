/**
 * OPS 테마 훅 — 라이트 / True Dark / 다크그레이 / 웜 세피아 4종 관리.
 *
 * 동작 흐름:
 *   1. 초기 렌더: localStorage 캐시 값을 즉시 DOM 에 적용 (FOUC 방지).
 *      실제 setAttribute 는 index.html 의 inline script 가 1차로 수행하고,
 *      이 훅은 React 마운트 후 한 번 더 동기화.
 *   2. 로그인 사용자: Supabase mochicraft_demo.user_preferences 조회 후
 *      서버 값으로 덮어쓰기 (Supabase = source of truth).
 *   3. 토글: 낙관적 업데이트로 DOM 즉시 반영 + localStorage 캐시 갱신 +
 *      Supabase upsert 백그라운드 저장. 저장 실패 시 UI 변경은 유지하고
 *      mutation 의 isError 만 노출 (호출부에서 토스트 표시).
 *
 * supabase.ts 가 global Authorization 헤더를 anon key 로 강제하므로
 * RLS 의 auth.uid() 가 NULL. → 프론트에서 user_id 를 명시 필터링한다.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Theme = 'light' | 'dark-true' | 'dark-gray' | 'dark-sepia';

const ALL_THEMES: Theme[] = ['light', 'dark-true', 'dark-gray', 'dark-sepia'];
const STORAGE_KEY = 'mc.theme';
const QUERY_KEY = ['user-theme'] as const;

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (ALL_THEMES as string[]).includes(v);
}

function readCache(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(v) ? v : 'light';
  } catch {
    return 'light';
  }
}

function writeCache(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage 차단 환경 — 무시 */
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

interface UseThemeArgs {
  /** 현재 로그인 사용자 ID (없으면 localStorage 만 사용) */
  userId: string | null | undefined;
  /** 현재 회사 ID (저장 시 NOT NULL 제약 충족용) */
  companyId: string | null | undefined;
}

export function useTheme({ userId, companyId }: UseThemeArgs) {
  const qc = useQueryClient();

  const enabled = !!userId;

  const query = useQuery<Theme>({
    queryKey: [...QUERY_KEY, userId ?? 'anon'],
    queryFn: async () => {
      if (!userId) return readCache();
      const { data, error } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data?.theme && isTheme(data.theme)) return data.theme;
      return readCache();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: readCache(),
  });

  const theme: Theme = isTheme(query.data) ? query.data : readCache();

  useEffect(() => {
    applyTheme(theme);
    writeCache(theme);
  }, [theme]);

  const mutation = useMutation({
    mutationFn: async (next: Theme) => {
      if (!userId || !companyId) {
        // 로그인 전이거나 회사 미확보 — 캐시만 갱신.
        return next;
      }
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          { user_id: userId, company_id: companyId, theme: next },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
      return next;
    },
    onMutate: async (next) => {
      // 낙관적: DOM 과 캐시를 즉시 갱신.
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const previous = qc.getQueryData<Theme>([...QUERY_KEY, userId ?? 'anon']);
      qc.setQueryData<Theme>([...QUERY_KEY, userId ?? 'anon'], next);
      applyTheme(next);
      writeCache(next);
      return { previous };
    },
    onError: (err) => {
      // 사양: 저장 실패 시 UI 는 변경된 상태 유지(재시도 가능).
      // 롤백하지 않음. 호출부에서 isError 보고 토스트 표시.
      console.error('[useTheme] save failed:', err);
    },
  });

  return {
    theme,
    setTheme: (next: Theme) => mutation.mutate(next),
    isLoading: enabled && query.isLoading,
    isSaving: mutation.isPending,
    saveError: mutation.error as Error | null,
  };
}
