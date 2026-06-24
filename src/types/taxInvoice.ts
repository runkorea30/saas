/**
 * 세금계산서 도메인 타입.
 *
 * 발행 단위 정책:
 *  - 독립 거래처 (group_id IS NULL, 본인 사업자번호 보유) → customer_id 사용
 *  - 그룹 소속 거래처들 → customer_group_id 사용 (그룹 멤버 매출 합산)
 *  - DB CHECK 제약으로 두 컬럼 중 하나만 NOT NULL.
 *
 * 금액 정책 (CLAUDE.md §4 + 본 페이지 지시):
 *  - total_amount: orders.total_amount 합계 (VAT 포함)
 *  - supply_amount = Math.floor(total_amount / 1.1)
 *  - vat_amount = total_amount - supply_amount
 */

export interface TaxInvoice {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_group_id: string | null;
  invoice_year: number;
  invoice_month: number;
  total_amount: number;
  supply_amount: number;
  vat_amount: number;
  /** '01': 일반, '02': 영세율 */
  invoice_type: string;
  /** '01': 영수, '02': 청구 */
  payment_type: string;
  /** 'draft' | 'issued' */
  status: string;
  issued_at: string | null;
  memo: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // JOIN 데이터 (조회 시에만 채워짐)
  customer?: TaxInvoiceSubject | null;
  customer_group?: TaxInvoiceSubject | null;
}

/**
 * 독립 거래처 / 그룹 양쪽을 동일 인터페이스로 정규화한 발행 주체.
 * - 독립 거래처: customers 컬럼 그대로
 * - 그룹: customer_groups 컬럼 그대로 (name = 그룹명, billing_name 별도)
 */
export interface TaxInvoiceSubject {
  id: string;
  name: string;
  business_registration_number: string;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
}

/**
 * 발행 가능 행 (테이블 1행 = 사업자번호 1개).
 * 매출 집계와 발행 현황을 병합한 결과.
 */
export interface TaxInvoiceRow {
  subjectType: 'customer' | 'group';
  subjectId: string;
  subject: TaxInvoiceSubject;

  // 매출 집계 (VAT 포함)
  total_amount: number;
  supply_amount: number;
  vat_amount: number;
  order_count: number;

  // 발행 상태 (null = 미발행)
  invoice: TaxInvoice | null;
}
