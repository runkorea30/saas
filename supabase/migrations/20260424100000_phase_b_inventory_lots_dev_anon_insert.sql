-- Phase B: inventory_lots 테이블에 대한 anon INSERT 임시 개방.
--
-- 🔴 Phase 2 인증 도입 시 반드시 원복. docs/SESSION_HANDOFF.md §5 원복 SQL에
--    아래 항목 포함:
--    - DROP POLICY inventory_lots_dev_anon_insert
--    - REVOKE INSERT ON mochicraft_demo.inventory_lots FROM anon
--
-- INSERT 만 필요 (기초재고 투입). 이 페이지에서 lot 수정/삭제는 하지 않으므로
-- UPDATE 권한/정책은 포함하지 않음 — 원복 면적 최소화.
-- 기존 inventory_lots_dev_anon_select / inventory_lots_tenant_all 정책은 유지.

BEGIN;

-- 1) 테이블 레벨 권한
GRANT INSERT ON mochicraft_demo.inventory_lots TO anon;

-- 2) RLS 정책: anon 에 대해 모든 row 허용 (company_id 필터링은 프론트가 담당)
CREATE POLICY inventory_lots_dev_anon_insert ON mochicraft_demo.inventory_lots
  FOR INSERT TO anon
  WITH CHECK (true);

-- 3) PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

COMMIT;
