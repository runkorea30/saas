/**
 * 현재 사용자의 회사 컨텍스트 훅.
 *
 * 🟡 Phase 2 임시: 로그인 세션 부재 상태에서 mochicraft_demo.companies의 첫 행을
 *    현재 회사로 간주. RLS가 anon SELECT 허용으로 완화되어 있어 동작 가능.
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

export function useCompany() {
  const query = useQuery<Company | null>({
    queryKey: ['current-company'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
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
