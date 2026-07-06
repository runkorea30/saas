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
 * `rows` 를 각각 1건씩 INSERT (복제 없음, label_count=1 기본).
 *
 * 🔴 (2026-07-06 §48) 스펙 §B: label_count 만큼 물리적 복제하던 이전 방식 폐지.
 *    출력 시점에 xlsx 반복으로만 해결. 라벨수 조정은 UPDATE 로 컬럼 값 갱신.
 *
 * 방어적 검증: 응답 개수 ≠ payload 개수면 throw.
 */
async function insertShippingInvoices(
  companyId: string,
  rows: ShippingInvoiceRow[],
): Promise<ShippingInvoiceDbRow[]> {
  if (rows.length === 0) return [];
  const payload: Array<
    Omit<ShippingInvoiceDbRow, 'id' | 'printed_at' | 'downloaded_at' | 'created_at' | 'deleted_at'>
  > = rows.map((r) => ({
    company_id: companyId,
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
    label_count: 1,
  }));
  const { data, error } = await DB.from('shipping_invoices')
    .insert(payload)
    .select('*');
  if (error) throw error;
  const dbRows = (data ?? []) as ShippingInvoiceDbRow[];
  if (dbRows.length !== payload.length) {
    throw new Error(
      `INSERT 응답 개수 불일치: 요청 ${payload.length}건, 응답 ${dbRows.length}건.`,
    );
  }
  return dbRows;
}

/** 단일 행 label_count UPDATE. 라벨수 인라인 편집(§B). */
async function updateShippingInvoiceLabelCount(
  companyId: string,
  id: string,
  labelCount: number,
): Promise<void> {
  const value = Math.max(1, Math.floor(labelCount));
  const { error } = await DB.from('shipping_invoices')
    .update({ label_count: value })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw error;
}

/**
 * 대상 order id 들 중, 이미 shipping_invoices 로 이관되었으나 아직 미출력
 * (`downloaded_at IS NULL`, `deleted_at IS NULL`) 상태로 대기 중인 행을 반환.
 *
 * §D: 중복 이관 차단용. 반환값이 비어있지 않으면 이관 자체를 실행하지 않는다.
 */
async function findPendingTransferConflicts(
  companyId: string,
  orderIds: readonly string[],
): Promise<ShippingInvoiceDbRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await DB.from('shipping_invoices')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .is('downloaded_at', null)
    .overlaps('source_order_ids', orderIds as string[]);
  if (error) throw error;
  return (data ?? []) as ShippingInvoiceDbRow[];
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
    }) => {
      return insertShippingInvoices(args.companyId, args.rows);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shipping-invoices'] });
      void qc.invalidateQueries({ queryKey: ['transferred-order-ids'] });
    },
  });
}

/** §B: 라벨수 인라인 편집 mutation. */
export function useUpdateShippingInvoiceLabelCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      companyId: string;
      id: string;
      labelCount: number;
    }) => {
      await updateShippingInvoiceLabelCount(args.companyId, args.id, args.labelCount);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shipping-invoices'] });
    },
  });
}

export { findPendingTransferConflicts };

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
      void qc.invalidateQueries({ queryKey: ['transferred-order-ids'] });
    },
  });
}

/**
 * §F: 주어진 주문 id 들 중 이미 shipping_invoices(소프트 삭제 제외) 로 이관된 것 반환.
 *
 * 화면 페이지 단위로 orderIds 를 넘겨 IN 절 배치 조회 — N+1 방지.
 * 출력 완료 여부는 구분하지 않음(스펙 §F: 배지는 미출력/출력완료 구분 없이 동일).
 */
export function useTransferredOrderIds(
  companyId: string | null,
  orderIds: readonly string[],
) {
  const sortedKey = [...orderIds].sort().join(',');
  return useQuery<Set<string>>({
    queryKey: ['transferred-order-ids', companyId, sortedKey],
    enabled: Boolean(companyId) && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await DB.from('shipping_invoices')
        .select('source_order_ids')
        .eq('company_id', companyId!)
        .is('deleted_at', null)
        .overlaps('source_order_ids', orderIds as string[]);
      if (error) throw error;
      const set = new Set<string>();
      const targetSet = new Set(orderIds);
      for (const row of (data ?? []) as Array<{ source_order_ids: string[] }>) {
        for (const oid of row.source_order_ids ?? []) {
          if (targetSet.has(oid)) set.add(oid);
        }
      }
      return set;
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
 * 발송(출력) 수량 통계.
 *
 * 🔴 (2026-07-06 §48-E) 실제 출력완료 기준으로 변경:
 *   · 필터: `downloaded_at IS NOT NULL` (미출력 대기 행 제외)
 *   · 그룹키: downloaded_at 을 KST 로 변환한 일별/월별
 *   · 기간 범위(dateFrom/dateTo) 도 downloaded_at 기준으로 적용.
 *
 * 각 행 = 1건의 발송 대상. label_count 는 xlsx 반복 매수 (§B) 라 실제 발송된
 * "라벨 매수" 를 세려면 SUM(label_count). "발송 건수"(주문 단위 기준) 로 세려면
 * COUNT(*). 이 훅은 후자(건수) 를 반환 — 이전 semantics 유지.
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
      const rows = await fetchAllRows<{ downloaded_at: string | null }>(() => {
        let q = DB.from('shipping_invoices')
          .select('downloaded_at')
          .eq('company_id', companyId!)
          .is('deleted_at', null)
          .not('downloaded_at', 'is', null);
        if (filter?.dateFrom) q = q.gte('downloaded_at', kstStartOfDayUtcIso(filter.dateFrom));
        if (filter?.dateTo) q = q.lt('downloaded_at', kstNextDayStartUtcIso(filter.dateTo));
        return q.order('downloaded_at', { ascending: true });
      });

      const dailyMap = new Map<string, number>();
      const monthlyMap = new Map<string, number>();
      for (const r of rows) {
        if (!r.downloaded_at) continue;
        const d = toKstDateKey(r.downloaded_at); // 'YYYY-MM-DD' (KST)
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
