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

export type ImportNoticeStatus =
  | '주문완료'
  | '운송중'
  | '통관진행중'
  | '도착예정';

export interface ImportNoticeProduct {
  code: string;
  name: string;
}

export interface Company {
  id: string;
  name: string;
  // Fedex (기존)
  import_notice_status: ImportNoticeStatus | null;
  import_notice_date: string | null;
  import_notice_products: ImportNoticeProduct[];
  import_notice_order_date: string | null;
  import_notice_ship_date: string | null;
  import_notice_customs_date: string | null;
  import_notice_arrival_text: string | null;
  // 해상운송
  import_notice_sea_status: ImportNoticeStatus | null;
  import_notice_sea_products: ImportNoticeProduct[];
  import_notice_sea_order_date: string | null;
  import_notice_sea_ship_date: string | null;
  import_notice_sea_customs_date: string | null;
  import_notice_sea_arrival_text: string | null;
}

async function fetchFirstCompany() {
  return supabase
    .from('companies')
    .select(
      'id, name, import_notice_status, import_notice_date, import_notice_products, import_notice_order_date, import_notice_ship_date, import_notice_customs_date, import_notice_arrival_text, import_notice_sea_status, import_notice_sea_products, import_notice_sea_order_date, import_notice_sea_ship_date, import_notice_sea_customs_date, import_notice_sea_arrival_text',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

type CompanyRow = NonNullable<Awaited<ReturnType<typeof fetchFirstCompany>>['data']>;

function normalizeProductsJson(raw: unknown): ImportNoticeProduct[] {
  if (!Array.isArray(raw)) return [];
  //  DB(jsonb) 에 두 가지 shape 이 혼재:
  //   1) {code, name} 객체 배열 — 현재 프론트가 저장하는 형태
  //   2) 문자열 배열 ["72001001", ...] — v1→OPS 이관 초기 데이터 / 다른 경로에서
  //      code 만 저장돼 들어온 레거시. 필터로 전부 걸러버리면 사용자에게
  //      "0개" 로 표시돼 데이터 소실로 오해됨.
  //   → 문자열은 {code: str, name: str} 로 감싸 살려낸다. 정식 이름은 사용자가
  //      "저장" 하는 순간 현재 state 로 덮여 자연 치유됨.
  const out: ImportNoticeProduct[] = [];
  for (const p of raw as unknown[]) {
    if (typeof p === 'string' && p.trim()) {
      out.push({ code: p, name: p });
      continue;
    }
    if (
      !!p &&
      typeof p === 'object' &&
      typeof (p as { code?: unknown }).code === 'string' &&
      typeof (p as { name?: unknown }).name === 'string'
    ) {
      out.push(p as ImportNoticeProduct);
    }
  }
  return out;
}

function normalizeCompany(row: CompanyRow | null): Company | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    // Fedex
    import_notice_status: (row.import_notice_status as ImportNoticeStatus | null) ?? null,
    import_notice_date: row.import_notice_date ?? null,
    import_notice_products: normalizeProductsJson(row.import_notice_products),
    import_notice_order_date: row.import_notice_order_date ?? null,
    import_notice_ship_date: row.import_notice_ship_date ?? null,
    import_notice_customs_date: row.import_notice_customs_date ?? null,
    import_notice_arrival_text: row.import_notice_arrival_text ?? null,
    // 해상운송
    import_notice_sea_status: (row.import_notice_sea_status as ImportNoticeStatus | null) ?? null,
    import_notice_sea_products: normalizeProductsJson(row.import_notice_sea_products),
    import_notice_sea_order_date: row.import_notice_sea_order_date ?? null,
    import_notice_sea_ship_date: row.import_notice_sea_ship_date ?? null,
    import_notice_sea_customs_date: row.import_notice_sea_customs_date ?? null,
    import_notice_sea_arrival_text: row.import_notice_sea_arrival_text ?? null,
  };
}

export function useCompany() {
  const query = useQuery<Company | null>({
    queryKey: ['current-company'],
    queryFn: async () => {
      const { data, error } = await fetchFirstCompany();
      if (error) throw error;
      if (data) return normalizeCompany(data);

      // 빈 결과 + 인증 세션 존재 → stale 세션 가능성. signOut 후 anon 으로 재시도.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        await supabase.auth.signOut();
        const retry = await fetchFirstCompany();
        if (retry.error) throw retry.error;
        return normalizeCompany(retry.data);
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
