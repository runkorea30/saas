-- 2026-06-24: 은행거래/미수금 도메인 스키마 + v1 데이터 마이그레이션
-- 작업 범위:
--   1-A. customers.settlement_cycle CHECK/DEFAULT + customers.match_type 신규
--   1-B. bank_transactions 컬럼 3종 추가 (exclude_reason / match_type / moved_to_monthly)
--   1-C. bank_transactions UNIQUE (company_id, transaction_date, depositor_name, amount)
--   1-D. bank_mappings 테이블 + RLS + anon GRANT
--   1-E. bank_exclude_keywords 테이블 + RLS + anon GRANT
--   1-F. bank_transactions anon 정책 + GRANT
--   1-G. v1(hhgicytfzmikuavgbgov) → OPS 데이터 마이그레이션은 별도 INSERT 스크립트로 실행됨

-- ───────────────────────────────────────────────────────────────────────────
-- 1-A. customers
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE mochicraft_demo.customers
  ALTER COLUMN settlement_cycle SET DEFAULT '익월';

ALTER TABLE mochicraft_demo.customers
  DROP CONSTRAINT IF EXISTS customers_settlement_cycle_check;

ALTER TABLE mochicraft_demo.customers
  ADD CONSTRAINT customers_settlement_cycle_check
  CHECK (settlement_cycle IS NULL OR settlement_cycle IN ('당월', '익월', '2개월'));

UPDATE mochicraft_demo.customers
SET settlement_cycle = '익월'
WHERE settlement_cycle IS NULL;

ALTER TABLE mochicraft_demo.customers
  ADD COLUMN IF NOT EXISTS match_type VARCHAR NOT NULL DEFAULT 'monthly'
    CHECK (match_type IN ('monthly', 'daily'));

-- ───────────────────────────────────────────────────────────────────────────
-- 1-B. bank_transactions 컬럼 3종 추가
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE mochicraft_demo.bank_transactions
  ADD COLUMN IF NOT EXISTS exclude_reason TEXT,
  ADD COLUMN IF NOT EXISTS match_type VARCHAR
    CHECK (match_type IS NULL OR match_type IN ('자동', '수동', '매핑')),
  ADD COLUMN IF NOT EXISTS moved_to_monthly BOOLEAN NOT NULL DEFAULT false;

-- ───────────────────────────────────────────────────────────────────────────
-- 1-C. bank_transactions UNIQUE 제약 (중복 업로드 방지)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE mochicraft_demo.bank_transactions
  DROP CONSTRAINT IF EXISTS uq_bank_tx_date_depositor_amount;

ALTER TABLE mochicraft_demo.bank_transactions
  ADD CONSTRAINT uq_bank_tx_date_depositor_amount
    UNIQUE (company_id, transaction_date, depositor_name, amount);

-- ───────────────────────────────────────────────────────────────────────────
-- 1-D. bank_mappings 신규 테이블
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mochicraft_demo.bank_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL
    REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  bank_name     VARCHAR NOT NULL,
  customer_id   UUID
    REFERENCES mochicraft_demo.customers(id) ON DELETE SET NULL,
  customer_name VARCHAR NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, bank_name)
);

ALTER TABLE mochicraft_demo.bank_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all_bank_mappings ON mochicraft_demo.bank_mappings;
CREATE POLICY anon_all_bank_mappings
  ON mochicraft_demo.bank_mappings
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON mochicraft_demo.bank_mappings TO anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 1-E. bank_exclude_keywords 신규 테이블
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mochicraft_demo.bank_exclude_keywords (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL
    REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  keyword    VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, keyword)
);

ALTER TABLE mochicraft_demo.bank_exclude_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all_bank_exclude_keywords ON mochicraft_demo.bank_exclude_keywords;
CREATE POLICY anon_all_bank_exclude_keywords
  ON mochicraft_demo.bank_exclude_keywords
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE
  ON mochicraft_demo.bank_exclude_keywords TO anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 1-F. bank_transactions anon 정책
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'mochicraft_demo'
      AND tablename = 'bank_transactions'
      AND policyname = 'anon_all_bank_transactions'
  ) THEN
    EXECUTE 'CREATE POLICY anon_all_bank_transactions
      ON mochicraft_demo.bank_transactions
      FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON mochicraft_demo.bank_transactions TO anon;
