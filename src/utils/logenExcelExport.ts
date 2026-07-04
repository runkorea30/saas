/**
 * 로젠택배 업로드용 xlsx 생성.
 *
 * ⚠️ 헤더(컬럼명) 행 없음 — 로젠 프로그램이 컬럼 위치로 인식하므로 1행부터
 *    바로 데이터가 시작한다.
 *
 * 규칙(런코리아 승인):
 * - "배송메시지"/6번째 빈칸 컬럼: 항상 공란 유지
 * - 7번째 컬럼: shipping_invoices.product 대신 항상 '엔젤러스' 브랜드 고정값
 *   (product 컬럼 자체는 DB 에 남겨두지만 로젠 export 에서는 사용하지 않음)
 * - 컬럼 순서(총 10열, 헤더 없음):
 *     1) 수취인명   → recipient_name
 *     2) 우편번호   → zipcode
 *     3) 주소       → address
 *     4) 연락처1    → phone
 *     5) 연락처2    → phone2
 *     6) 빈칸       → ''
 *     7) 브랜드     → '엔젤러스' (고정)
 *     8) 업체명     → customer_name
 *     9) 신용       → credit
 *    10) 배송메시지 → ''
 */
import * as XLSX from 'xlsx';
import type { ShippingInvoiceDbRow } from '@/hooks/useShippingInvoices';

/**
 * 엑셀 순서를 결정적으로 만들기 위한 정렬 키.
 * Postgres INSERT ... RETURNING 은 원래 삽입 순서를 반드시 보장하지 않으므로
 * xlsx 로 내보내기 전에 자체 정렬을 적용한다.
 *
 * 우선순위: order_date DESC → is_direct(직송 먼저) → customer_name → recipient_name → id
 * → 같은 실행에서 같은 인쇄 대상은 항상 동일 순서로 파일에 기록됨.
 */
export function sortShippingInvoiceRowsForExport<T extends ShippingInvoiceDbRow>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.order_date !== b.order_date) return a.order_date < b.order_date ? 1 : -1;
    if (a.is_direct !== b.is_direct) return a.is_direct ? -1 : 1;
    const cA = a.customer_name ?? '';
    const cB = b.customer_name ?? '';
    if (cA !== cB) return cA.localeCompare(cB, 'ko');
    const rA = a.recipient_name ?? '';
    const rB = b.recipient_name ?? '';
    if (rA !== rB) return rA.localeCompare(rB, 'ko');
    return a.id.localeCompare(b.id);
  });
}

/**
 * DB 행 목록을 로젠 양식 데이터 행 배열로 변환 (헤더 없음).
 * 순서 자체가 계약이므로 배열 리터럴로 명시.
 */
export function buildLogenExportRows(
  rows: readonly ShippingInvoiceDbRow[],
): string[][] {
  return rows.map((r) => [
    r.recipient_name ?? '',   // 1. 수취인명
    r.zipcode ?? '',          // 2. 우편번호
    r.address ?? '',          // 3. 주소
    r.phone ?? '',            // 4. 연락처1
    r.phone2 ?? '',           // 5. 연락처2
    '',                       // 6. 빈칸 (고정)
    '엔젤러스',                // 7. 브랜드 (발송인 고정값 — shipping_invoices 값과 무관)
    r.customer_name ?? '',    // 8. 업체명
    r.credit ?? '신용',       // 9. 신용 (builder 에서 항상 '신용' 이지만 legacy row 대비 폴백)
    '',                       // 10. 배송메시지 (고정 공란)
  ]);
}

/**
 * rows 를 로젠 양식 xlsx workbook 의 ArrayBuffer 로 변환.
 * `aoa_to_sheet` 를 써서 헤더 행 없이 데이터만 그대로 넣는다.
 * 내부에서 자동으로 결정적 정렬 적용 (엑셀 파일 재현성 보장).
 */
export function buildLogenWorkbookArrayBuffer(
  rows: readonly ShippingInvoiceDbRow[],
): ArrayBuffer {
  const sorted = sortShippingInvoiceRowsForExport(rows);
  const aoa = buildLogenExportRows(sorted);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '로젠송장');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buf as ArrayBuffer;
}

