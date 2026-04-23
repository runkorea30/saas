-- Phase B: products 테이블에 대한 anon INSERT/UPDATE 임시 개방.
--
-- 🔴 Phase 2 인증 도입 시 반드시 원복. docs/SESSION_HANDOFF.md §5 원복 SQL에
--    아래 항목 포함:
--    - DROP POLICY products_dev_anon_insert / products_dev_anon_update
--    - REVOKE INSERT, UPDATE ON mochicraft_demo.products FROM anon
--
-- Soft delete 는 UPDATE(deleted_at = now()) 로 수행하므로 DELETE 권한/정책 불필요.
-- 기존 products_dev_anon_select / products_tenant_all 정책은 유지.

BEGIN;

-- 1) 테이블 레벨 권한
GRANT INSERT, UPDATE ON mochicraft_demo.products TO anon;

-- 2) RLS 정책: anon 에 대해 모든 row 허용 (company_id 필터링은 프론트가 담당)
CREATE POLICY products_dev_anon_insert ON mochicraft_demo.products
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY products_dev_anon_update ON mochicraft_demo.products
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- 3) PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

COMMIT;
