-- ============================================================================
-- 최근 스키마 추가사항 정리
--   본 파일은 현행 mochicraft_demo 스키마에서 마이그레이션 폴더에 반영되지 않은
--   최근 변경사항을 재현 가능한 SQL 로 정리한 것.
--   (comprehensive snapshot 은 별도 pg_dump 작업 필요 — 이 파일은 언급된 항목만 커버)
--
--   포함 항목:
--     1) orders.is_direct_shipping BOOLEAN DEFAULT false
--     2) orders.shipping_info JSONB
--     3) user_preferences 테이블 (theme 컬럼 + light/dark-true/dark-gray/dark-sepia)
--     4) portal_preferences 테이블 (theme 컬럼 + light/dark-gray)
--
--   IF NOT EXISTS 로 감싸 재실행 안전. company_id 는 RLS 정책에서 처리.
-- ============================================================================

-- 1) orders 컬럼 추가 — 거래처 포털 직송 주문 지원
ALTER TABLE mochicraft_demo.orders
  ADD COLUMN IF NOT EXISTS is_direct_shipping BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE mochicraft_demo.orders
  ADD COLUMN IF NOT EXISTS shipping_info JSONB;

COMMENT ON COLUMN mochicraft_demo.orders.is_direct_shipping IS
  '거래처 포털에서 직송(파트너 배송) 으로 접수된 주문 여부. true 면 shipping_info 배열 필수.';
COMMENT ON COLUMN mochicraft_demo.orders.shipping_info IS
  '직송 주문의 배송지 목록. [{name, zipcode, address, phone1, phone2, blank, product, customer, credit}, ...].';

-- 2) user_preferences — OPS 운영자 테마 설정
CREATE TABLE IF NOT EXISTS mochicraft_demo.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  theme TEXT NOT NULL DEFAULT 'light'
    CHECK (theme = ANY (ARRAY['light','dark-true','dark-gray','dark-sepia'])),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mochicraft_demo.user_preferences IS
  'OPS 운영자별 UI 설정. 1 user = 1 row (UNIQUE user_id).';

-- 3) portal_preferences — 거래처 포털 사용자별 테마 설정
CREATE TABLE IF NOT EXISTS mochicraft_demo.portal_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES mochicraft_demo.customers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  theme TEXT NOT NULL DEFAULT 'dark-gray'
    CHECK (theme = ANY (ARRAY['light','dark-gray'])),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mochicraft_demo.portal_preferences IS
  '거래처 포털 로그인 사용자별 UI 설정. 1 customer = 1 row (UNIQUE customer_id).';

-- 4) RLS + dev-anon 정책 (Phase 2 dev anon 정책 패턴 유지)
ALTER TABLE mochicraft_demo.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.portal_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_dev_anon_all
  ON mochicraft_demo.user_preferences;
CREATE POLICY user_preferences_dev_anon_all
  ON mochicraft_demo.user_preferences
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS portal_preferences_dev_anon_all
  ON mochicraft_demo.portal_preferences;
CREATE POLICY portal_preferences_dev_anon_all
  ON mochicraft_demo.portal_preferences
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

GRANT ALL ON mochicraft_demo.user_preferences TO anon;
GRANT ALL ON mochicraft_demo.portal_preferences TO anon;

-- 5) 인덱스 (company_id 필터 성능)
CREATE INDEX IF NOT EXISTS user_preferences_company_id_idx
  ON mochicraft_demo.user_preferences(company_id);
CREATE INDEX IF NOT EXISTS portal_preferences_company_id_idx
  ON mochicraft_demo.portal_preferences(company_id);
