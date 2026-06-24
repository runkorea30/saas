/**
 * 거래처 그룹 관련 타입.
 *
 * - CustomerGroup: 여러 거래처를 묶어 세금계산서/입금을 통합 관리.
 * - GroupPayment: 그룹(또는 독립 거래처) 단위 입금 기록.
 *
 * NOTE: 멤버(거래처 목록)는 호출부에서 도메인별 Customer 타입과 합성해
 *       자체 합성 타입을 정의해 사용한다 (페이지마다 필요 컬럼이 달라서).
 */

export interface CustomerGroup {
  id: string;
  company_id: string;
  name: string;
  billing_name: string;
  monthly_deduction: number;
  deduction_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupPayment {
  id: string;
  company_id: string;
  group_id: string | null;
  customer_id: string | null;
  paid_at: string;
  amount: number;
  deduction_applied: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 미수금 요약 (receivables_summary 뷰).
 *
 * - entity_key: 'group:{uuid}' 또는 'customer:{uuid}'
 * - is_group=true: 그룹 멤버들의 매출/입금 합산
 * - total_paid: bank_transactions(matched) + group_payments 합산
 */
export interface ReceivableSummary {
  entity_key: string;
  display_name: string;
  billing_name: string;
  is_group: boolean;
  group_id: string | null;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  monthly_deduction: number;
  deduction_note: string | null;
  company_id: string;
}
