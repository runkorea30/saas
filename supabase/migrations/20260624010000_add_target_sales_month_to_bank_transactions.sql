-- bank_transactions.target_sales_month: 매출월 수동 지정용.
-- null이면 calcMonthlyReconciliation 의 ±7일 자동 매칭 로직 사용.
-- 값 ('YYYY-MM') 있으면 자동 계산 무시하고 해당 월로 직접 귀속.

ALTER TABLE mochicraft_demo.bank_transactions
  ADD COLUMN IF NOT EXISTS target_sales_month VARCHAR(7);

COMMENT ON COLUMN mochicraft_demo.bank_transactions.target_sales_month IS
  '수동 지정 매출월 (YYYY-MM). null이면 자동 계산(±7일 유예) 사용, 값 있으면 우선 적용';
