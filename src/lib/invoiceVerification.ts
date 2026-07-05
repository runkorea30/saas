/**
 * 인보이스 검증 세션(`invoice_verifications`) 조작 헬퍼 — 다중 세션 지원.
 *
 * 🔴 CLAUDE.md §1: company_id 필수.
 * 🟠 CLAUDE.md §8: 같은 로직을 여러 파일에 복사하지 않도록 발주서 페이지가 공유한다.
 *
 * 스키마 변경 (2026-07-05 마이그레이션):
 *   · UNIQUE(company_id) 제거 → PARTIAL UNIQUE(company_id, invoice_no) WHERE invoice_no <> ''
 *   · `resolved_at TIMESTAMPTZ NULL` 컬럼 추가 (입고확정 완료 시각)
 *
 * 결과: 회사당 여러 세션이 공존 가능. 미확정(`resolved_at IS NULL`) 세션이
 * 여러 개면 25번(구매 예측) 의 "입고예정 수량" 계산에 모두 합산된다.
 */
import { supabase } from '@/lib/supabase';
import type { OrderSheetRow } from '@/utils/orderSheetParser';
import type { Json } from '@/types/database';

/**
 * 스키마 확장(2026-07-05 resolved_at 컬럼) 은 자동 생성 Database 타입에 미반영
 * (memory: supabase_types_desync). update payload 검증만 우회하는 좁은 캐스팅.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntyped = supabase as unknown as { from: (t: string) => any };

/**
 * 발주서 엑셀 다운로드 시 호출.
 *
 * 🔴 기존 동작(회사의 유일 행을 UPSERT 로 덮어씀) 은 미확정 이관본을 삭제하는
 *    부작용이 있었다. 이번엔 **항상 새 드래프트 세션을 INSERT** 하고 신규 세션의
 *    id 를 반환한다. 기존 미확정 세션은 절대 건드리지 않는다.
 *
 * 반환값 id 는 이후 InvoiceUploadCard 가 auto-save 시 UPDATE 대상으로 사용.
 */
export async function resetInvoiceVerificationForNewOrder(params: {
  companyId: string;
  orderRows: OrderSheetRow[];
  orderFileName: string;
}): Promise<{ id: string }> {
  const { companyId, orderRows, orderFileName } = params;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('invoice_verifications')
    .insert({
      company_id: companyId,
      invoice_no: '',
      invoice_date: '',
      comparison_rows: [] as unknown as Json,
      order_rows: orderRows as unknown as Json,
      invoice_rows: [] as unknown as Json,
      order_file_name: orderFileName,
      invoice_file_name: null,
      invoice_file_path: null,
      last_tab: 'all',
      transfer_rows: [] as unknown as Json,
      transfer_saved_at: null,
      updated_at: nowIso,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (!data) throw new Error('세션 생성 응답이 비어 있습니다.');
  return { id: (data as { id: string }).id };
}

/**
 * 현재 회사의 "미확정 세션 목록" 조회.
 * `resolved_at IS NULL` 인 행을 updated_at DESC 로.
 * 목록 UI · Part B(입고예정 수량) 계산 · 현재 세션 자동선택 셋 모두가 사용.
 */
export interface PendingSession {
  id: string;
  invoice_no: string;
  invoice_date: string;
  transfer_saved_at: string | null;
  transfer_row_count: number;
  updated_at: string | null;
}

export async function fetchPendingSessions(
  companyId: string,
): Promise<PendingSession[]> {
  const { data, error } = await supabase
    .from('invoice_verifications')
    .select('id, invoice_no, invoice_date, transfer_saved_at, transfer_rows, updated_at')
    .eq('company_id', companyId)
    .is('resolved_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: (r as { id: string }).id,
    invoice_no: (r as { invoice_no: string }).invoice_no ?? '',
    invoice_date: (r as { invoice_date: string }).invoice_date ?? '',
    transfer_saved_at: (r as { transfer_saved_at: string | null }).transfer_saved_at ?? null,
    transfer_row_count: Array.isArray((r as { transfer_rows: unknown }).transfer_rows)
      ? ((r as { transfer_rows: unknown[] }).transfer_rows.length)
      : 0,
    updated_at: (r as { updated_at: string | null }).updated_at ?? null,
  }));
}

/**
 * 입고확정 성공 시 호출 — 해당 invoice_no 의 세션 행에 resolved_at=now() 설정하고
 * transfer_rows/transfer_saved_at 정리. 회사 전체를 건드리지 않도록 invoice_no 로 좁힘.
 *
 * invoice_no 매칭은 TRIM + LOWER 로 관대하게 (varchar/text/공백 차이 흡수).
 */
export async function markSessionResolved(params: {
  companyId: string;
  invoiceNumber: string;
}): Promise<void> {
  const key = params.invoiceNumber.trim();
  if (!key) return;
  // resolved_at 는 스키마 확장 컬럼 (memory: supabase_types_desync). 자동 생성 타입에
  // 미반영이라 update payload 를 unknown 으로 캐스팅.
  const payload = {
    resolved_at: new Date().toISOString(),
    transfer_rows: [] as unknown as Json,
    transfer_saved_at: null,
  };
  const { error } = await supabaseUntyped
    .from('invoice_verifications')
    .update(payload)
    .eq('company_id', params.companyId)
    .is('resolved_at', null)
    .ilike('invoice_no', key);
  if (error) throw error;
}
