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

**Phase 1 완료 (프로젝트 초기화 — 이번 세션)**
- Vite 5 + React 18 + TypeScript 스캐폴딩
- 의존성: supabase-js v2, @tanstack/react-query v5, zustand v4, recharts, react-router v6, react-hook-form + zod, lucide-react, tailwindcss-animate, CVA, clsx, tailwind-merge
- dev deps: ESLint 8, TypeScript 5.6, vite 5.4, postcss, autoprefixer, tailwindcss 3.4
- `src/lib/supabase.ts` — **🔴 `db.schema: 'mochicraft_demo'` 전역 고정**
- `src/lib/fetchAllRows.ts` — 1000건 제한 우회 유틸 (CLAUDE.md 규칙)
- `src/utils/calculations.ts` — 비즈니스 계산식 8종 시그니처 (calcSupplyAmount만 구현, 나머지 Phase 3)
- `src/utils/permissions.ts` — 권한 체크 8개 함수 전부 구현 (docs/pages.md 권한표 기반)
- `src/utils/planLimits.ts` — 플랜 한도 체크 5개 시그니처 (Phase 3 구현)
- `src/types/common.ts` — 도메인 열거형 (Role, PlanId, OrderStatus 등)
- `src/types/database.ts` — Supabase 자동생성 타입 placeholder (Phase 3에서 `supabase gen types`로 덮어쓰기)
- 디자인 토큰 이식: `claude-design-bundle/src/tokens.css` → `src/index.css` (HEX 31개 + shadcn HSL 브릿지 19개 + 재사용 원자 `.num/.disp/.card-surface/.chip/.btn-base/.kbd/.hair/.ico/.hover-arrow/.focus-ring`)
- Tailwind config 확장: shadcn 표준 + Claude Design 고유 토큰(ink/brand/tan/status/side 등)
- 폰트 CDN 연결: Pretendard Variable (한글), Inter Tight (숫자/영문), Fraunces (디스플레이)
- `npm install` → 318 packages / `npx tsc -b --noEmit` → exit 0 / `npx vite` dev server → ready in 389ms

---

## ⚠️ 발견 사항 (Phase 2 선결 이슈)

**claude-design-bundle/src/에 JSX 번들 없음.**
`tokens.css`, 상위 폴더의 `README.md`와 `DESIGN_SPEC.md` 3개 파일만 존재.
이전 버전의 이 핸드오프 문서와 `docs/claude-code-execution-prompts.md` Phase 2 섹션이 언급한 **"14개 React JSX" (`shell.jsx`, `topnav.jsx`, `kpi.jsx`, `chart.jsx`, `today.jsx`, `timeline.jsx`, `orders-app.jsx`, `icons.jsx`, `tweaks.jsx` 등)는 실제로 존재하지 않음.** `Home Dashboard.html` / `Customers.html` / `Orders*.html` 같은 HTML 파일도 번들에 없음.

`claude-design-bundle/README.md`는 "핵심 자산만 이 번들에 포함"이라고 명시 — 현 상태가 의도된 것일 가능성도 있음.

**Phase 2 진입 전 해결 방안 (택일):**
- **A) Claude Design에서 컴포넌트 재익스포트** → `claude-design-bundle/src/`에 14개 JSX 추가
- **B) HTML 파일 확보 후 TSX로 변환** → Claude Design에서 HTML 다운로드 후 Claude Code가 컴포넌트화
- **C) `DESIGN_SPEC.md`만 의존하여 Claude Code가 TSX 컴포넌트 처음부터 작성** → 디자인 스펙은 상세하지만 실제 레이아웃 코드는 새로 짜야 함

→ **양시혁님 결정 필요.**

---

## ⏭️ 다음 작업

### 1. 양시혁님 (수동)
- [ ] `.env` 파일에 실제 값 입력:
  ```env
  VITE_SUPABASE_URL=https://adfobvwuzkufsmukdfrt.supabase.co
  VITE_SUPABASE_ANON_KEY=<Supabase Dashboard > Project Settings > API에서 복사>
  ```
- [ ] `npm run dev` 실행 → `http://localhost:5173` 접속 → 폰트(Pretendard + Inter Tight + Fraunces) / 버건디 브랜드 / 종이 질감 배경 / `.card-surface` 컨테이너 / chip 4종 / 버튼 3종 렌더 확인
- [ ] GitHub `runkorea30/saas` 레포에 이번 Phase 1 커밋 푸시되었는지 확인
- [ ] "발견 사항" 섹션의 JSX 번들 문제 결정 (A/B/C 중 택일)

### 2. Phase 2 시작 조건
- 위 .env 검증 완료
- JSX 번들 이슈 결정 완료

### 3. Phase 2 작업 범위
`docs/claude-code-execution-prompts.md`의 Phase 2 섹션 참고.
- AuthProvider + `useAuth` / `useCompany` 훅
- `RequireAuth` / `RequireRole` 라우트 가드
- 공개 페이지 p1~p5 (랜딩/가격/가입/로그인/초대 수락)
- 온보딩 p6~p7 (회사 생성 + 플랜 선택)
- 홈 대시보드 p8 (AppShell + TopNav + KPI 4장 + TodaySection + RevenueChart + Timeline — **더미 데이터 유지**, 실데이터는 Phase 3)
- 다크모드 토글 (`data-theme` attribute + localStorage)

---

## ❓ 결정 필요 사항

- JSX 번들 부재 문제 (위 "발견 사항" 참조) — Phase 2 진입 전 결정 필요.

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
