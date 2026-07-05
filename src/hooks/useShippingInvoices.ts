/**
 * shipping_invoices INSERT/UPDATE/SELECT 쿼리 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🔴 anon_rls_dev_stage 메모: 현 단계 anon 전체 권한. 상용화 전 재설계 예정.
 *
 * shipping_invoices 테이블은 마이그레이션 완료, 자동 생성 Database 타입은 미반영.
 * (memory: supabase_types_desync) — supabase 정밀 타입을 우회해 untyped 빌더로 사용.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { ShippingInvoiceRow } from '@/utils/shippingInvoiceBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DB = supabase as unknown as { from: (table: string) => any };

export interface ShippingInvoiceDbRow {
  id: string;
  company_id: string;
  customer_id: string | null;
  source_order_ids: string[];
  is_direct: boolean;
  order_date: string;
  recipient_name: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  zipcode: string | null;
  customer_name: string | null;
  credit: string | null;
  brand: string;
  product: string | null;
  label_count: number;
  printed_at: string;
  downloaded_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

/**
 * `rows` 각각을 `labelCounts` 만큼 복제하여 INSERT. `labelCounts` 가 없으면 전부 1건.
 * 반환: 저장된 DB 행 목록 (엑셀 파일 생성 및 downloaded_at 업데이트에 사용).
 *
 * 방어적 검증: 응답 개수가 payload 개수와 다르면 명시적으로 throw 하여 조용한 부분
 * 저장/누락이 상위 파이프라인(엑셀 생성) 으로 흘러가는 것을 차단.
 */
async function insertShippingInvoices(
  companyId: string,
  rows: ShippingInvoiceRow[],
  labelCounts?: number[],
): Promise<ShippingInvoiceDbRow[]> {
  if (rows.length === 0) return [];
  if (labelCounts && labelCounts.length !== rows.length) {
    throw new Error(
      `labelCounts 길이 불일치: rows=${rows.length}, counts=${labelCounts.length}`,
    );
  }
  const payload: Array<
    Omit<ShippingInvoiceDbRow, 'id' | 'printed_at' | 'downloaded_at' | 'created_at' | 'deleted_at'>
  > = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const count = Math.max(1, Math.floor(labelCounts?.[i] ?? 1));
    for (let n = 0; n < count; n += 1) {
      payload.push({
        company_id: companyId,
        // 복제본끼리 배열 참조를 공유하면 후속 조작 시 위험 — 슬라이스로 분리.
        source_order_ids: [...r.sourceOrderIds],
        customer_id: r.customerId,
        is_direct: r.isDirect,
        order_date: r.orderDate,
        recipient_name: r.recipientName || null,
        phone: r.phone || null,
        phone2: r.phone2 || null,
        address: r.address || null,
        zipcode: r.zipcode || null,
        customer_name: r.customerName || null,
        credit: r.credit || null,
        brand: r.brand,
        product: r.product || null,
        label_count: count,
      });
    }
  }
  const { data, error } = await DB.from('shipping_invoices')
    .insert(payload)
    .select('*');
  if (error) throw error;
  const dbRows = (data ?? []) as ShippingInvoiceDbRow[];
  if (dbRows.length !== payload.length) {
    throw new Error(
      `INSERT 응답 개수 불일치: 요청 ${payload.length}건, 응답 ${dbRows.length}건. 저장이 부분 성공했을 수 있어 엑셀 생성을 중단합니다.`,
    );
  }
  return dbRows;
}

/** downloaded_at = now() 로 다중 UPDATE. */
async function markShippingInvoicesDownloaded(
  companyId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  const { error } = await DB.from('shipping_invoices')
    .update({ downloaded_at: nowIso })
    .in('id', ids as string[])
    .eq('company_id', companyId);
  if (error) throw error;
}

/** deleted_at = now() 로 다중 소프트 삭제. 하드 DELETE 금지 (프로젝트 원칙). */
async function softDeleteShippingInvoices(
  companyId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  const { error } = await DB.from('shipping_invoices')
    .update({ deleted_at: nowIso })
    .in('id', ids as string[])
    .eq('company_id', companyId);
  if (error) throw error;
}

/** 검색어를 postgres LIKE 패턴으로 변환 (%, _ escape 후 양옆에 %). */
function toLikePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

/**
 * 'YYYY-MM-DD' (KST 달력일자) → 해당일 KST 00:00 의 UTC ISO 문자열.
 * printed_at (timestamptz) 범위 필터에 사용.
 */
function kstStartOfDayUtcIso(kstDate: string): string {
  return new Date(`${kstDate}T00:00:00+09:00`).toISOString();
}

/**
 * 'YYYY-MM-DD' (KST 달력일자) → 그 다음 날 KST 00:00 의 UTC ISO 문자열.
 * 종료일 포함 필터를 `printed_at < 다음날KST자정` 형태로 만들기 위함.
 */
function kstNextDayStartUtcIso(kstDate: string): string {
  const start = new Date(`${kstDate}T00:00:00+09:00`);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * timestamptz ISO → KST 기준 'YYYY-MM-DD'.
 * UTC 값에 +9h 를 더한 뒤 getUTC* 로 추출 (프로젝트 확정 KST 변환 규칙).
 */
function toKstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ────────────────────────────────────────────────────────────
// Hooks
// ────────────────────────────────────────────────────────────

export interface ShippingInvoicesFilter {
  dateFrom?: string;
  dateTo?: string;
  /** 수취인명 부분일치 (ilike). 빈 문자열/undefined 는 미적용. */
  recipientQuery?: string;
  /** 업체명 부분일치 (ilike). 빈 문자열/undefined 는 미적용. */
  customerQuery?: string;
}

export function useShippingInvoices(
  companyId: string | null,
  filter?: ShippingInvoicesFilter,
) {
  const recipient = filter?.recipientQuery?.trim() ?? '';
  const customer = filter?.customerQuery?.trim() ?? '';
  return useQuery<ShippingInvoiceDbRow[]>({
    queryKey: [
      'shipping-invoices',
      companyId,
      filter?.dateFrom,
      filter?.dateTo,
      recipient,
      customer,
    ],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<ShippingInvoiceDbRow>(() => {
        let q = DB.from('shipping_invoices')
          .select('*')
          .eq('company_id', companyId!)
          .is('deleted_at', null);
        // 화면에 보이는 '날짜' 는 printed_at (인쇄 클릭 시각) 기준.
        // KST 달력일자 → UTC ISO 범위로 변환하여 timestamptz 비교.
        if (filter?.dateFrom) q = q.gte('printed_at', kstStartOfDayUtcIso(filter.dateFrom));
        if (filter?.dateTo) q = q.lt('printed_at', kstNextDayStartUtcIso(filter.dateTo));
        if (recipient) q = q.ilike('recipient_name', toLikePattern(recipient));
        if (customer) q = q.ilike('customer_name', toLikePattern(customer));
        return q.order('printed_at', { ascending: false });
      });
      return rows;
    },
  });
}

export function useSaveShippingInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      companyId: string;
      rows: ShippingInvoiceRow[];
      labelCounts?: number[];
    }) => {
      return insertShippingInvoices(args.companyId, args.rows, args.labelCounts);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shipping-invoices'] });
    },
  });
}

export function useMarkShippingInvoicesDownloaded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { companyId: string; ids: string[] }) => {
      await markShippingInvoicesDownloaded(args.companyId, args.ids);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shipping-invoices'] });
    },
  });
}

export function useSoftDeleteShippingInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { companyId: string; ids: string[] }) => {
      await softDeleteShippingInvoices(args.companyId, args.ids);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shipping-invoices'] });
    },
  });
}

// ────────────────────────────────────────────────────────────
// 통계
// ────────────────────────────────────────────────────────────

export interface ShippingStatsBucket {
  /** 'YYYY-MM-DD' (일별) 또는 'YYYY-MM' (월별) */
  key: string;
  count: number;
}

export interface ShippingInvoiceStats {
  daily: ShippingStatsBucket[];
  monthly: ShippingStatsBucket[];
  total: number;
}

/**
 * 발송 수량 통계 — printed_at (인쇄 클릭 시각) 을 KST 로 변환한 뒤 일별/월별 그룹핑.
 *
 * 각 행 = 1건의 발송 라벨(운송장). label_count 는 이미 복제되어 여러 행으로
 * 저장되어 있으므로 COUNT(*) 로 세면 됨. `SUM(label_count)` 는 이중 계산이라 금지.
 * `deleted_at IS NULL` 은 useShippingInvoices 와 동일 규칙.
 *
 * 응답 크기 축소 위해 select 는 printed_at 만 요청 (PostgREST 는 GROUP BY 직접
 * 불가하니 원시 값 받아서 클라이언트에서 KST 변환 후 집계).
 */
export function useShippingInvoiceStats(
  companyId: string | null,
  filter?: { dateFrom?: string; dateTo?: string },
) {
  return useQuery<ShippingInvoiceStats>({
    queryKey: [
      'shipping-invoice-stats',
      companyId,
      filter?.dateFrom,
      filter?.dateTo,
    ],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<{ printed_at: string }>(() => {
        let q = DB.from('shipping_invoices')
          .select('printed_at')
          .eq('company_id', companyId!)
          .is('deleted_at', null);
        if (filter?.dateFrom) q = q.gte('printed_at', kstStartOfDayUtcIso(filter.dateFrom));
        if (filter?.dateTo) q = q.lt('printed_at', kstNextDayStartUtcIso(filter.dateTo));
        return q.order('printed_at', { ascending: true });
      });

      const dailyMap = new Map<string, number>();
      const monthlyMap = new Map<string, number>();
      for (const r of rows) {
        if (!r.printed_at) continue;
        const d = toKstDateKey(r.printed_at); // 'YYYY-MM-DD' (KST)
        dailyMap.set(d, (dailyMap.get(d) ?? 0) + 1);
        const ym = d.slice(0, 7); // 'YYYY-MM'
        monthlyMap.set(ym, (monthlyMap.get(ym) ?? 0) + 1);
      }
      const daily: ShippingStatsBucket[] = Array.from(dailyMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => a.key.localeCompare(b.key));
      const monthly: ShippingStatsBucket[] = Array.from(monthlyMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => a.key.localeCompare(b.key));
      return { daily, monthly, total: rows.length };
    },
  });
}
