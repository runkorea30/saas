# Phase 3 마무리 작업

Phase 3 Shell 구현 완료 후, DB 마이그레이션 기록 + 핸드오프 문서 업데이트 + 커밋까지 한 번에 처리한다.

---

## 1. 마이그레이션 파일 2개 생성

`supabase/migrations/` 디렉터리에 timestamp prefix로 파일 2개 생성.
(기존 마이그레이션 파일명 패턴과 맞추되, 이번 두 파일의 prefix는 적절한 값으로.)

### 파일 1: `..._mochicraft_demo_grant_schema_usage.sql`

```sql
-- Phase 3 중 발견: 어제 테이블 GRANT/RLS 정책은 설정했으나
-- 스키마 자체에 USAGE 권한이 누락되어 anon 키로 접근 시 403 Forbidden.
-- 본 마이그레이션으로 스키마 USAGE 및 기본 권한 체계를 정비.

GRANT USAGE ON SCHEMA mochicraft_demo TO anon, authenticated, service_role;

-- 향후 이 스키마에 추가될 테이블에도 자동 권한 부여 (default privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT ALL ON TABLES TO service_role;

-- 시퀀스 권한 (id 자동생성 등)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mochicraft_demo
  TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
```

### 파일 2: `..._mochicraft_demo_dev_anon_select_all_remaining.sql`

```sql
-- DEV 전용: anon 키로 모든 테이블 SELECT 가능하게 개방.
-- Phase 2 Auth 도입 시 본 마이그레이션 전체와
-- 모든 `_dev_anon_select` 정책을 반드시 원복해야 함.

-- 1) 모든 테이블에 anon SELECT GRANT
GRANT SELECT ON ALL TABLES IN SCHEMA mochicraft_demo TO anon;

-- 2) anon SELECT 정책이 아직 없는 테이블에 한해 `_dev_anon_select` 정책 생성
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

-- 3) PostgREST 스키마/설정 리로드
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
```

두 파일 모두 **이미 원격 DB에 적용 완료됨**. 파일 생성 목적은 레포에 히스토리 남기기.
로컬에서 `supabase db push` 하지 말 것 (중복 실행 방지).

---

## 2. SESSION_HANDOFF.md 업데이트

`docs/SESSION_HANDOFF.md` 파일을 아래 내용으로 교체(또는 없으면 신규 생성):

```markdown
# SESSION HANDOFF — MochiCraft OPS (saas)

> 다음 세션의 Claude가 이 파일을 읽고 상황 파악 후 작업 재개한다.

## 현재 상태 (Phase 3 완료)

### Backend
- Supabase 프로젝트: `adfobvwuzkufsmukdfrt`
- 스키마: `mochicraft_demo` (20 테이블 / 75 인덱스 / 19 트리거)
- RLS: 모든 테이블 활성화
- 시드: 회사 1 / 거래처 14 / 주문 35건 (2026-03-07 ~ 2026-04-18)

### Frontend
- 스택: Vite + React + TypeScript + Tailwind + shadcn/ui
- 라우터: React Router v6 (중첩 라우트, Shell 레이아웃)
- 상태: `@tanstack/react-query` + Supabase JS 클라이언트
- dev: `http://localhost:5173`

### 구현 완료 페이지
- `/` — 홈 대시보드 (스텁)
- `/sales/orders` — 주문내역 (실데이터, KPI/필터/목록/상세패널 전부)

### 네비 구조
- 1단 (홈/판매/재고매입/재무/설정) + 2단 (섹션별 서브메뉴)
- 설정 소스: `src/components/nav/navConfig.ts`
- 미구현 12개는 전부 `<PlaceholderPage />` 연결

## ⚠️ Phase 2 Auth 도입 시 반드시 원복할 것

### RLS / 권한 임시 개방
- `_dev_anon_select` 정책 **총 20개** (테이블별 1개씩, anon USING true)
- 스키마 USAGE to anon
- `GRANT SELECT ON ALL TABLES ... TO anon`
- `ALTER DEFAULT PRIVILEGES ... TO anon`
- 시퀀스 GRANT to anon
- `phase2_orders_status_canceled_and_dev_anon_select` 마이그레이션

### 원복 방법
```sql
-- 모든 _dev_anon_select 정책 제거
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='mochicraft_demo' AND policyname LIKE '%_dev_anon_select'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',
      p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- anon GRANT 회수
REVOKE ALL ON ALL TABLES IN SCHEMA mochicraft_demo FROM anon;
REVOKE USAGE ON SCHEMA mochicraft_demo FROM anon;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mochicraft_demo FROM anon;

-- default privileges 회수
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon;

NOTIFY pgrst, 'reload schema';
```

## 알려진 이슈

- 존재하지 않는 경로 접속 시 React Router 기본 404 화면 출력.
  → 나중에 App.tsx에 `errorElement` 추가 필요.

## 다음 작업 후보

1. **Home Dashboard 페이지 구현** — Claude Design 원본 있음, KPI/차트/최근 주문
2. **Customers 페이지 (설정 > 거래처)** — Claude Design 원본 있음
3. **Auth 도입** — Supabase Auth + 위 원복 작업 병행
4. **404 ErrorBoundary** — 빠르게 처리 가능한 마무리 작업

## 운영 메모

- 사용자 이름: 양시혁 (GitHub: runkorea30)
- 환경: Windows + PowerShell
- 커밋: `@bkit "<message>"` 패턴
- dev 서버 재시작 시: `Ctrl+C` 후 `npm run dev` (포트 먹으면 다음 포트로 올라감)
- DB 수정 시 MochiCraft 브라우저 탭 닫아둘 것 (열려 있으면 프론트가 덮어씀)
```

---

## 3. 커밋

위 작업 모두 완료 후:

```
@bkit "Phase 3 closeout: migration files + SESSION_HANDOFF update"
```
