-- 스키마 USAGE 권한 부여 (어제 테이블 GRANT만 하고 스키마 USAGE가 빠져있었음)
GRANT USAGE ON SCHEMA mochicraft_demo TO anon, authenticated, service_role;

-- 향후 이 스키마에 새로 만들어질 테이블에 대해서도 자동 권한 부여
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT ALL ON TABLES TO service_role;

-- 시퀀스 권한도 (insert/update 시 id 생성용)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mochicraft_demo TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
