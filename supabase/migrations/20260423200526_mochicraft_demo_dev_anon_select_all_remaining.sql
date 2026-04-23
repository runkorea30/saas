-- 나머지 13개 테이블에 대해 anon SELECT 개방 (dev 전용, Phase 2 Auth 시 전부 원복)
-- 1) 테이블 레벨 GRANT
GRANT SELECT ON ALL TABLES IN SCHEMA mochicraft_demo TO anon;

-- 2) 테이블별 _dev_anon_select 정책 (이미 있는 건 건너뜀)
DO $$
DECLARE
  t_name text;
BEGIN
  FOR t_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'mochicraft_demo'
      AND tablename NOT IN (
        SELECT DISTINCT tablename FROM pg_policies
        WHERE schemaname = 'mochicraft_demo'
          AND 'anon' = ANY(roles)
          AND cmd IN ('SELECT', 'ALL')
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON mochicraft_demo.%I FOR SELECT TO anon USING (true)',
      t_name || '_dev_anon_select',
      t_name
    );
  END LOOP;
END $$;

-- 3) PostgREST에 리로드 신호
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
