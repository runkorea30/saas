/**
 * 회사(공급자) 프로필 — 세금계산서 발행용 사업자 정보.
 * 설정 > 회사정보 페이지와 세금계산서 엑셀 다운로드(TaxInvoicesPage)에서 공용으로 사용.
 *
 * 🔴 CLAUDE.md §1: companyId 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §8: 같은 조회/수정 로직을 여러 파일에 중복 작성 금지 → 이 파일에만.
 *
 * 🟠 자동생성 database.ts 타입에 ceo_name 등 새 컬럼이 아직 반영 안 됨 → PortalNoticePage 와
 *    동일하게 untypedSupabase(as any) 우회. 타입 재생성 시 그대로 제거해도 무방.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CompanyProfile {
  id: string;
  name: string;
  business_number: string | null;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
}

export type CompanyProfileInput = Omit<CompanyProfile, 'id'>;

const COMPANY_PROFILE_SELECT =
  'id, name, business_number, ceo_name, business_address, business_type, business_category, tax_email';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

export function useCompanyProfile(companyId: string | null) {
  return useQuery<CompanyProfile | null>({
    queryKey: ['company-profile', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await untypedSupabase
        .from('companies')
        .select(COMPANY_PROFILE_SELECT)
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompanyProfile | null;
    },
    staleTime: Infinity,
  });
}

export function useUpdateCompanyProfile(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<CompanyProfileInput>) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { error } = await untypedSupabase
        .from('companies')
        .update(changes)
        .eq('id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      // 이 페이지의 캐시 + useCompany() 전역 캐시(회사명 등 표시용) + 세금계산서
      // 엑셀에서 쓰던 기존 캐시 키 전부 무효화 — staleTime: Infinity라 반드시 필요.
      qc.invalidateQueries({ queryKey: ['company-profile', companyId] });
      qc.invalidateQueries({ queryKey: ['current-company'] });
    },
  });
}
