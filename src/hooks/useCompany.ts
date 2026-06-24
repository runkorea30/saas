/**
 * 현재 사용자의 회사 컨텍스트 훅.
 *
 * 🟡 Phase 2 임시: 로그인 세션 부재 상태에서 mochicraft_demo.companies의 첫 행을
 *    현재 회사로 간주. RLS의 *_dev_anon_select(USING true, anon role 전용) 정책이
 *    anon 접근을 허용해야 동작.
 *
 * 🟠 Phase 2 가드: 과거 테스트로 인해 브라우저에 Supabase 인증 세션이 남아있으면
 *    요청이 authenticated 역할로 나가고, memberships 미등록 시 RLS 의
 *    current_company_ids() 가 NULL 을 반환해 companies/orders 조회가 모두
 *    0건이 되어 "데이터 미표시" 증상 발생. → 이 경우 자동 signOut 후 anon 으로
 *    재조회해 Phase 2 dev 상태를 복구한다.
 *
 * 🔴 TODO(phase-2-auth):
 *    - Supabase Auth + memberships 조회로 교체
 *    - 여러 회사 소속 시 사용자가 선택한 회사(localStorage `mc.activeCompany`)를 우선
 *    - 이 훅 결과의 shape은 유지 → 호출부(useOrders 등) 교체 불필요
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface Company {
  id: string;
  name: string;
}

async function fetchFirstCompany() {
  return supabase
    .from('companies')
    .select('id, name')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export function useCompany() {
  const query = useQuery<Company | null>({
    queryKey: ['current-company'],
    queryFn: async () => {
      const { data, error } = await fetchFirstCompany();
      if (error) throw error;
      if (data) return data;

      // 빈 결과 + 인증 세션 존재 → stale 세션 가능성. signOut 후 anon 으로 재시도.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        await supabase.auth.signOut();
        const retry = await fetchFirstCompany();
        if (retry.error) throw retry.error;
        return retry.data;
      }
      return null;
    },
    staleTime: Infinity,
  });

  return {
    companyId: query.data?.id ?? null,
    company: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
