/**
 * OPS 운영자 인증 훅 (Supabase Auth 기반).
 *
 * - 로그인: supabase.auth.signInWithPassword
 * - 로그아웃: supabase.auth.signOut
 * - 세션: onAuthStateChange 로 실시간 구독
 *
 * 🟡 RLS는 현재 anon 정책 유지 — 코드 레벨 게이트만 적용.
 * 🔴 Phase 3에서 RLS authenticated 역할로 전환 시 이 훅만 수정하면 됨.
 */
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface UseOpsAuthResult {
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useOpsAuth(): UseOpsAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return { session, isLoading, login, logout };
}
