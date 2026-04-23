# 세션 핸드오프 (Session Handoff)

이 문서는 Claude와의 작업 세션을 이어가기 위한 공유 메모입니다.
대화가 끊기거나 새 대화를 열 때, Claude는 이 파일을 먼저 읽어 상태를 파악합니다.

---

## 📋 프로토콜

### 새 대화 시작 시 (Claude의 행동)
1. 이 파일의 **"현재 상태"**, **"다음 작업"** 섹션을 먼저 읽는다
2. 이전 세션에서 이어가는 작업임을 사용자에게 간단히 요약 보고
3. 바로 다음 작업 단계부터 시작

### 세션 종료 전 (Claude의 행동)
Claude는 종료 전에 다음을 업데이트해야 한다:
- **현재 상태** — 이번 세션에서 완료한 것
- **다음 작업** — 바로 다음에 해야 할 구체적인 단계
- **결정 필요 사항** — 사용자 확인이 필요한 항목
- **세션 로그** — 날짜 + 한 줄 요약

업데이트 후 반드시 커밋/푸시.

### 사용자 트리거 문구
- **"핸드오프 저장"** → 지금까지 작업을 이 파일에 반영 + commit + push
- **"이어서 작업"** → 이 파일 읽고 요약 + 다음 단계 제안

### 대화가 길어질 때
Claude는 정확한 컨텍스트 % 를 측정할 수 없다. 숫자 추측 금지.
대신, 긴 세션이 이어지면 **"슬슬 새 대화로 옮길 시점이에요"** 라고 경고하고, 핸드오프 저장을 제안한다.

---

## 🎯 프로젝트 개요

- **레포:** https://github.com/runkorea30/saas
- **목적:** MochiCraft OPS 데모 — 한국 소형 도매 유통업체(1–10인) 대상 B2B SaaS 관리 대시보드
- **Dogfooding 레퍼런스:** 엔젤러스(Angelus) 가죽용품 수입·유통업
- **스택:** React + Vite, Tailwind, shadcn/ui, Supabase, Vercel, GitHub, Claude Code

**Supabase**
- 프로젝트 ID: `adfobvwuzkufsmukdfrt`
- 스키마: `mochicraft_demo`
- 상태: 20 테이블 / 75 인덱스 / 19 트리거 / 31 RLS / 요금제 4종 시드 완료

**핵심 원칙**
- 멀티테넌시: `company_id` UUID + RLS (JWT claims 아님, memberships 테이블 기반)
- 요금제: Free / Starter ₩29K / Pro ₩79K / Business ₩199K

---

## ✅ 현재 상태

**최근 업데이트:** 2026-04-24

**Phase 0 완료 (설계·스키마·디자인)**
- Supabase 스키마 `mochicraft_demo` 전체 구축 (20 테이블 + 인덱스/트리거/RLS/시드)
- Claude Design 디자인 토큰 (`claude-design-bundle/src/tokens.css`)
- ERD/API/workflows/pages/execution-prompts 문서화 (`docs/`)
- 로컬 프로젝트 → GitHub `runkorea30/saas` 레포 초기 푸시

**Phase 1 완료** — Vite 5 + React 18 + TS + Tailwind + Supabase 클라이언트 + 디자인 토큰 이식.
(`src/lib/supabase.ts`로 `mochicraft_demo` 스키마 전역 고정, `fetchAllRows` 1000건 우회 유틸,
계산·권한·플랜한도 유틸 시그니처, shadcn HSL 브릿지, Pretendard/Inter Tight/Fraunces 폰트.)

**Phase 2 — Orders 페이지 완료 (이번 세션)**
- 디자인 번들 확보: `claude-design-bundle/` 아래 Orders.html · Orders v2.html · Home Dashboard.html ·
  Customers.html + 14개 JSX 프로토타입(orders-app/orders-data/shell/topnav/components 등) 저장.
- 신규 파일 10개:
  - `src/types/orders.ts` — Order/OrderItem/DateRange/PeriodKey/SourceFilter
  - `src/hooks/useCompany.ts` — 현재 회사 컨텍스트 (Phase 2 임시: 첫 회사 반환)
  - `src/hooks/queries/useOrders.ts` — TanStack Query + fetchAllRows, 기간 서버 / 나머지 클라이언트 필터
  - `src/components/feature/orders/primitives.tsx` — StatusBadge · GradeBadge · SourceIcon · Check ·
    Segmented · MultiChip · EmptyState · fmtWon/fmtDate/fmtDateTime · periodRange
  - `src/components/feature/orders/OrderFilterBar.tsx` — 기간·검색·거래처·상태·접수경로
  - `src/components/feature/orders/OrderListTable.tsx` — 컬럼 리사이즈 + localStorage + 페이지네이션
  - `src/components/feature/orders/OrderDetailPane.tsx` — 상세 헤더·라인·합계(VAT 역산)·액션
  - `src/components/feature/orders/OrderBulkBar.tsx` — 선택 시 하단 고정 일괄 액션
  - `src/pages/Orders.tsx` — 페이지 컨테이너 (master-detail split + summary KPI 헤더)
- 수정: `src/main.tsx` (QueryClientProvider + BrowserRouter + Devtools), `src/App.tsx` (/orders 라우트),
  `src/types/common.ts` (OrderStatus에 `canceled` 추가).

**Phase 2 DB 마이그레이션 2건 적용**
- `phase2_orders_status_canceled_and_dev_anon_select` —
  · orders.status check constraint에 `canceled` 추가
  · anon 역할 SELECT 전용 정책 6개 + GRANT (companies/user_profiles/customers/products/orders/order_items)
  · **🔴 TODO(phase-2-auth): Supabase Auth 연결 시 anon_select 정책 6개 전부 DROP**
- `phase2_seed_orders_demo` — 앤젤러스 코리아 1 + 거래처 14 + 상품 15 + 주문 35 + order_items 124건
  (멱등성: business_number 기준 스킵). 작성자(user_profiles) 시드는 Phase 2 auth 단계로 연기.

**검증**
- `npx tsc -b --noEmit` → exit 0
- `npm run dev` → `http://localhost:5177/orders`
- Playwright 확인: KPI 헤더, 필터 바 (기간/검색/MultiChip/Segmented), 좌측 14건 페이지 + 페이지네이션,
  우측 상세 패널 (라인·VAT·합계·액션), BulkBar, 콘솔 에러 0건, 기간 "90일" 전환 시 35건 재쿼리 확인.

---

## ⏭️ 다음 작업

### 1. 양시혁님 (수동)
- [x] ~~`.env` 값 입력 완료~~
- [ ] GitHub `runkorea30/saas` 레포에 이번 Phase 2 커밋 푸시 확인
- [ ] 브라우저에서 http://localhost:5177/orders 접속 (포트는 5173~5177 중 사용 가능한 곳) →
  마스터-디테일 스플릿 드래그, 컬럼 너비 드래그, 기간 필터, 거래처/상태 MultiChip, 페이지네이션 동작 확인

### 2. Phase 2 남은 범위 (우선순위 순)
- **AppShell + TopNav 공용 네비게이션** — Orders의 page header를 추출 + 홈/판매/재고·매입/재무/리포트/설정 드롭다운 구성
- **인증 (가장 중요)** — Supabase Auth 이메일/소셜 로그인 + memberships 조회 + RequireAuth / RequireRole 가드
  · 완료 시점에 `phase2_orders_status_canceled_and_dev_anon_select` 마이그레이션의 anon_select 6개 정책 **제거**
  · `useCompany`를 세션 기반으로 재작성 (첫 회사 하드코딩 → memberships)
- 공개 페이지 p1~p5 (랜딩/가격/가입/로그인/초대 수락)
- 온보딩 p6~p7 (회사 생성 + 플랜 선택)
- 홈 대시보드 p8 (KPI 4장 + TodaySection + RevenueChart + Timeline)
- 다크모드 토글 (`data-theme` attribute + localStorage) — 토큰은 이미 준비됨

### 3. Orders 페이지 추가 기능 (다음 스프린트 후보)
- "+ 주문 추가" 모달 + 서버 INSERT
- "출고 처리" 액션 (status 업데이트 + inventory_transactions 기록)
- 엑셀 내보내기 / 세금계산서 / 송장 인쇄
- 거래처 목록을 customers 테이블 독립 쿼리로 교체 (현재는 로드된 주문에서 파생)

---

## 🚨 원복 대기 (Phase 2 auth 시점)

**임시 RLS 완화 정책 6개**
`phase2_orders_status_canceled_and_dev_anon_select` 마이그레이션에서 생성한 다음 정책들은
Supabase Auth 도입 후 반드시 DROP할 것:
```sql
DROP POLICY IF EXISTS "orders_dev_anon_select" ON mochicraft_demo.orders;
DROP POLICY IF EXISTS "order_items_dev_anon_select" ON mochicraft_demo.order_items;
DROP POLICY IF EXISTS "customers_dev_anon_select" ON mochicraft_demo.customers;
DROP POLICY IF EXISTS "products_dev_anon_select" ON mochicraft_demo.products;
DROP POLICY IF EXISTS "companies_dev_anon_select" ON mochicraft_demo.companies;
DROP POLICY IF EXISTS "user_profiles_dev_anon_select" ON mochicraft_demo.user_profiles;
-- GRANT는 유지 (RLS가 차단하므로 안전)
```
원복 시 useCompany 훅도 세션 기반으로 동시 교체. 코드 상 `TODO(phase-2-auth)` 주석으로 표시됨.

---

## 📚 참고 / 주의사항

**한글 인코딩 (Windows PowerShell)**
기본 인코딩이 한글을 깨뜨림. 파일 수정 시 반드시 UTF-8 명시:
```powershell
[System.IO.File]::WriteAllText("$PWD\파일.md", ([System.IO.File]::ReadAllText("$PWD\파일.md") -replace '찾을문자', '바꿀문자'), [System.Text.UTF8Encoding]::new($false))
```

**MochiCraft 프론트엔드 자동 저장 충돌**
`project_data` 테이블을 직접 SQL로 수정하면 브라우저 탭이 열려있을 때 덮어쓰기됨.
벌크 스키마 업데이트는 MochiCraft UI의 Import 기능을 사용.

**MCP 도구 우회**
`mochi_generate_docs` / `mochi_update_design` 실패 시 ("Cannot coerce the result to a single JSON object" 에러) →
`Supabase:apply_migration` 또는 `Supabase:execute_sql` 직접 사용.

**마이그레이션 패턴**
큰 SQL 블록은 분할해서 순차 적용 (`_01_schema_and_tables`, `_02_indexes` 형태). 한 번에 올리는 것보다 안정적.

**대용량 JSONB 페이로드**
이스케이프 문제 회피를 위해 달러 쿼팅 사용: `$MOCHI_KR_V2$...$MOCHI_KR_V2$::jsonb`

**MochiCraft ↔ Claude Design 워크플로**
1. MochiCraft에서 DB 스키마·비즈니스 로직 먼저 설계
2. 그 스키마의 컬럼명을 Claude Design 프롬프트에 명시적으로 전달 (필드명 일치)
3. Claude Code가 데이터 바인딩 자동 처리
— 자동 연동 없음, 전부 수동.

**Supabase 타입 재생성 (Phase 3에서 사용 예정)**
```bash
npx supabase gen types typescript \
  --project-id adfobvwuzkufsmukdfrt \
  --schema mochicraft_demo > src/types/database.ts
```
그 후 `src/lib/supabase.ts`에서 `createClient<Database>(...)` 제네릭 주입.

**Tailwind opacity modifier 제약**
현재 디자인 토큰은 HEX 기반이라 `bg-brand/50` 같은 opacity modifier 미지원.
필요 시 `rgba()` 인라인 또는 토큰을 RGB 채널 방식으로 마이그레이션.

---

## 📝 세션 로그

| 날짜 | 주요 작업 |
|------|-----------|
| 2026-04-24 | GitHub 레포 `saas` 생성 및 초기 푸시 완료, SESSION_HANDOFF 도입 |
| 2026-04-24 | **Phase 1 완료** — Vite + TS + Tailwind + Supabase 클라이언트 + 디자인 토큰 이식. 발견: claude-design-bundle에 JSX 번들 없음 (Phase 2 선결 이슈) |
| 2026-04-24 | **Phase 2 Orders 완료** — Claude Design 번들 gzip tar 받아서 complete 해제 (14 JSX + HTML 4종 + debug PNG), `/orders` 라우트 구현 (10 신규 파일). DB 마이그레이션 2건: canceled 상태 추가 + dev anon SELECT 완화 + 시드(회사1/거래처14/상품15/주문35/라인124). tsc exit 0, Playwright 에러 0. |
