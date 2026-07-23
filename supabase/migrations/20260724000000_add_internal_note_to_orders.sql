-- 주문 내부 전용 메모 (직원↔직원). 거래처 포털에 절대 노출 금지.
-- orders.memo(거래처가 포털에서 작성) 와 별개의 컬럼.
ALTER TABLE mochicraft_demo.orders
  ADD COLUMN IF NOT EXISTS internal_note TEXT;

COMMENT ON COLUMN mochicraft_demo.orders.internal_note IS
  'Internal-only memo (staff-to-staff). Never exposed in customer portal. Separate from orders.memo (written by customer).';
