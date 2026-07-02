/**
 * 인보이스 검증 상태(`invoice_verifications`) 조작 헬퍼.
 *
 * 🔴 CLAUDE.md §1: company_id 필수.
 * 🟠 CLAUDE.md §8: 같은 로직을 여러 파일에 복사하지 않도록 발주서 페이지가 공유한다.
 *
 * `invoice_verifications` 는 company 당 1행 (UNIQUE on company_id) 이고,
 * 발주서 최종결정에서 엑셀 다운로드가 이뤄지는 순간 이 행을 "새 세션"으로 리셋한다.
 */
import { supabase } from '@/lib/supabase';
import type { OrderSheetRow } from '@/utils/orderSheetParser';
import type { Json } from '@/types/database';

/**
 * 발주서 엑셀 다운로드 시 호출: `invoice_verifications` 의 해당 company 행을
 * 새 주문서로 완전히 초기화한다.
 *
 * 초기화 정책 (안전 방식):
 *  - `order_rows` / `order_file_name` → 새 발주서 값으로 교체
 *  - `comparison_rows` / `invoice_rows` / `invoice_file_name` → 초기화 (인보이스 재업로드 필요)
 *  - `transfer_rows` / `transfer_saved_at` → 초기화 (입고이관 다시 진행)
 *  - `invoice_no` / `invoice_date` → 빈 문자열
 *  - `last_tab` → 'all' (기본 탭)
 *
 * 이유: 옛 인보이스가 옛 주문서 기준으로 남아 있으면 매칭이 어긋난 상태가 되어
 * 사용자가 혼란을 겪음. 새 발주서를 다운로드하는 순간부터는 인보이스도 새로 올려
 * 다시 비교하는 흐름이 옳다.
 */
export async function resetInvoiceVerificationForNewOrder(params: {
  companyId: string;
  orderRows: OrderSheetRow[];
  orderFileName: string;
}): Promise<void> {
  const { companyId, orderRows, orderFileName } = params;
  const { error } = await supabase.from('invoice_verifications').upsert(
    {
      company_id: companyId,
      invoice_no: '',
      invoice_date: '',
      comparison_rows: [] as unknown as Json,
      order_rows: orderRows as unknown as Json,
      invoice_rows: [] as unknown as Json,
      order_file_name: orderFileName,
      invoice_file_name: null,
      // 🟠 인보이스 Storage 경로도 초기화. 이전 세션에 업로드된 PDF 파일 실체는
      //    orphan 으로 남지만 dev 단계 수용 · 필요 시 별도 정리 작업으로.
      invoice_file_path: null,
      last_tab: 'all',
      transfer_rows: [] as unknown as Json,
      transfer_saved_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  );
  if (error) throw error;
}
