-- bank_transaction_splits: 입금 1건 → 여러 매출월 분할 귀속.
-- splits 가 있는 transaction 은 splits 합계로 귀속, 원본 amount/target_sales_month 무시.

CREATE TABLE IF NOT EXISTS mochicraft_demo.bank_transaction_splits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL
    REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  bank_transaction_id UUID NOT NULL
    REFERENCES mochicraft_demo.bank_transactions(id) ON DELETE CASCADE,
  target_sales_month  VARCHAR(7) NOT NULL,
  amount              INTEGER NOT NULL,
  memo                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_tx
  ON mochicraft_demo.bank_transaction_splits(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_company
  ON mochicraft_demo.bank_transaction_splits(company_id);

ALTER TABLE mochicraft_demo.bank_transaction_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_all_bank_transaction_splits
  ON mochicraft_demo.bank_transaction_splits
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON mochicraft_demo.bank_transaction_splits TO anon;

COMMENT ON TABLE mochicraft_demo.bank_transaction_splits IS
  '입금 1건을 여러 매출월로 분할 귀속. splits가 있으면 원본 amount 무시하고 splits 합계로 귀속.';
