# Claude Code 실행 프롬프트 (saas 초기 세팅)

> 이 문서는 로컬에서 Claude Code를 실행할 때 단계별로 복사·붙여넣기할 프롬프트입니다.
> **한 번에 다 넣지 마세요.** 각 Phase가 완료된 후 다음 Phase로 진행합니다.

---

## 사전 준비 체크리스트

- [ ] GitHub에 `saas` 빈 레포 생성 (README/gitignore/license 체크 **해제**)
- [ ] 로컬에 이 폴더(saas) 준비
- [ ] Supabase Dashboard → Project Settings → API → **Exposed schemas**에 `mochicraft_demo` 추가 후 Save
- [ ] Supabase URL + anon key 복사 메모 (Phase 1에서 입력)
- [ ] 터미널에서 이 폴더로 이동 후 `claude` 실행

---

## Phase 1: 프로젝트 초기화 + Supabase 연결

Claude Code 실행 후 다음 프롬프트를 복사해서 붙여넣으세요.

```
이 폴더에서 Vite + React 18 + TypeScript 프로젝트를 세팅해줘.

## 기술 스택
- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase JS v2
- TanStack Query v5 (React Query)
- Zustand v4
- Recharts
- React Router v6
- React Hook Form + Zod

## 사전 자료
- `CLAUDE.md` — 프로젝트 불변 규칙 (반드시 먼저 읽기)
- `docs/ERD.md` — 20개 테이블 DB 스키마
- `docs/api.md` — 26개 API 엔드포인트 계획
- `docs/workflows.md` — 8개 비즈니스 워크플로우
- `docs/pages.md` — 30개 페이지 라우팅
- `supabase/migrations/` — 이미 Supabase에 실행된 마이그레이션 SQL 파일들
- `claude-design-bundle/` — Claude Design 결과물 (React JSX + CSS 토큰)

## Phase 1 작업 (여기서 멈추고 결과 확인)

1. **Vite 프로젝트 초기화**
   - TypeScript 템플릿으로
   - package manager: npm

2. **의존성 설치**
   - 위 기술 스택 전부
   - shadcn/ui는 CLI로 초기화 (`npx shadcn@latest init`)
   - 추후 필요한 shadcn 컴포넌트는 그때그때 추가

3. **디렉토리 구조 생성** (CLAUDE.md의 구조 참고)
   src/
   ├── components/ (ui, layout, feature)
   ├── pages/
   ├── hooks/
   ├── lib/
   ├── utils/
   ├── types/
   └── app/

4. **Supabase 클라이언트 세팅**
   - `.env` 파일 생성 (gitignore에 포함)
     VITE_SUPABASE_URL=[내가 나중에 입력]
     VITE_SUPABASE_ANON_KEY=[내가 나중에 입력]
   - `src/lib/supabase.ts`:
     - createClient 호출 시 `db: { schema: 'mochicraft_demo' }` 지정
     - 환경변수 누락 시 명확한 에러 던지기

5. **기본 계산 유틸 파일 생성** (빈 구현으로)
   - `src/utils/calculations.ts` — 8개 함수 시그니처만 (calcCurrentStock 외)
   - `src/utils/permissions.ts` — canRead/canWrite/canDelete 시그니처
   - `src/utils/planLimits.ts` — canAddUser/canAddProduct 등 시그니처
   - `src/lib/fetchAllRows.ts` — 1000건 제한 해결 유틸

6. **디자인 토큰 통합**
   - `claude-design-bundle/src/tokens.css` 내용을 `src/index.css`에 이식
   - Tailwind config에서 이 CSS 변수들을 참조하도록 `theme.extend.colors` 설정

7. **git 추가 커밋**
   - 현재 git init 되어 있음 (초기 커밋 하나 있음)
   - Phase 1 작업 후 `git add . && git commit -m "chore: Phase 1 project scaffolding"`
   - 원격 설정되어 있으면 `git push`

## 제약사항 (CLAUDE.md에 있음, 중요)
- `npx vercel --prod` 금지 (GitHub push만)
- 하드코딩된 company_id 금지
- 모든 쿼리 `fetchAllRows()` 경유
- schema: 'mochicraft_demo' 전역 지정

완료되면 "Phase 1 완료" 보고하고 대기. 내가 .env 값을 입력한 뒤 Phase 2 지시할 거야.
```

---

## Phase 1 완료 후 본인이 할 일

1. `.env` 파일 열어서 실제 값 입력:
   ```
   VITE_SUPABASE_URL=https://adfobvwuzkufsmukdfrt.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc... (복사한 anon key)
   ```

2. 연결 테스트:
   ```bash
   npm run dev
   ```
   → 에러 없이 실행되면 OK

3. GitHub 푸시 확인 — https://github.com/runkorea30/saas 에서 파일 보이는지

---

## Phase 2: 인증 + 온보딩 + 홈 대시보드

Phase 1 완료 확인 후 다음 프롬프트:

```
Phase 1 성공. 이제 인증 레이어와 홈 대시보드를 만들자.

## Phase 2 작업

1. **인증 플로우**
   - `src/app/AuthProvider.tsx`: Supabase Auth 상태 구독
   - `src/hooks/useAuth.ts`: user, session, loading 반환
   - `src/hooks/useCompany.ts`: 현재 선택된 company_id + role 반환
     - localStorage에 `selectedCompanyId` 저장
     - memberships 조회해서 자동으로 첫 회사 선택
   - `src/components/layout/RequireAuth.tsx`: 미로그인 시 /login 리다이렉트
   - `src/components/layout/RequireRole.tsx`: role 권한 체크

2. **공개 페이지 (p1~p5)**
   - `/` (p1 랜딩) — 간단 hero + CTA
   - `/pricing` (p2) — plans 테이블에서 불러와서 4개 플랜 카드
   - `/signup` (p3), `/login` (p4), `/invite` (p5)
   - 이메일/비밀번호 기본 제공. OAuth는 Phase 5에서.

3. **온보딩 (p6, p7)**
   - `/onboarding/company` — 회사 정보 입력 → companies insert → memberships insert (role='owner') → subscriptions insert (status='active', plan_id='free', trial_ends_at=+14일)
   - `/onboarding/plan` — 스킵 가능, 나중에 설정에서 변경

4. **홈 대시보드 (p8)**
   - `claude-design-bundle/src/app.jsx` 참고
   - React CDN 기반 코드를 Vite + TS 기반으로 변환:
     * `const { useState: useStateA } = React` → 일반 import
     * `ReactDOM.createRoot(...).render(...)` 제거, 라우트 엘리먼트로
     * window.parent.postMessage 호출 제거 (iframe edit mode 전용)
     * TWEAKS 전역 변수 → Zustand 스토어로
   - 컴포넌트 이식:
     * `shell.jsx` → `src/components/layout/AppShell.tsx`
     * `topnav.jsx` → `src/components/layout/TopNav.tsx`
     * `kpi.jsx`, `chart.jsx`, `today.jsx`, `timeline.jsx` → `src/components/feature/dashboard/`
     * `icons.jsx` → lucide-react로 대체 (거의 다 유사 아이콘 있음)
     * `tokens.css` → 이미 Phase 1에서 index.css에 이식됨
     * `tweaks.jsx` → `src/components/dev/TweaksPanel.tsx` (개발 모드에서만 렌더)
   - **이 단계에서는 아직 더미 데이터 유지**. 실제 Supabase 연결은 Phase 3.

5. **다크모드 토글**
   - `data-theme="dark"` attribute 토글 (tokens.css에 이미 대응)
   - localStorage에 저장

## 작업 규칙
- 컴포넌트 TypeScript로 작성 (bundle의 .jsx → .tsx)
- Tailwind + CSS 변수 혼용 (기존 토큰 활용)
- shadcn/ui 컴포넌트 필요 시 CLI로 추가 (`npx shadcn@latest add button card`)
- 한 페이지 완료할 때마다 커밋

완료되면 "Phase 2 완료" 보고.
```

---

## Phase 3: 실제 데이터 연결 + 핵심 업무 페이지

```
Phase 2 성공. 이제 더미 데이터를 Supabase 실데이터로 교체하고 주문/재고/거래처를 만든다.

## Phase 3 작업

1. **TanStack Query 쿼리 훅 작성**
   - `src/hooks/queries/useCompanies.ts`, `useMemberships.ts`
   - `src/hooks/queries/useCustomers.ts`, `useOrders.ts`, `useProducts.ts`
   - `src/hooks/queries/useInventory.ts` (calcCurrentStock 호출 포함)
   - `src/hooks/queries/useReceivables.ts` (calcReceivables 호출 포함)
   - 모든 훅은 useCompany()에서 company_id 받아서 자동 필터
   - 모든 조회는 fetchAllRows() 사용

2. **계산식 구현** (`src/utils/calculations.ts`)
   - 8개 공식 전부 구현 (docs/ERD.md 참고)
   - 각 함수의 JSDoc에 공식 명시
   - 단위 테스트 권장 (선택)

3. **홈 대시보드 실데이터 연결**
   - KPI 4장 → calcMonthlySales, calcReceivables, calcInventoryValue
   - "오늘 처리할 것" → orders/inventory_lots/bank_transactions 조회
   - 30일 매출 차트 → orders 기간 집계
   - Timeline → audit_logs 최근 10건

4. **거래처 페이지 (p19)**
   - claude-design-bundle의 Customers 참고 (components.jsx 내부)
   - Drawer 3탭 구조 (기본정보/사업자정보/거래이력)
   - 등급 뱃지 A~E
   - 엑셀 내보내기 (SheetJS)

5. **주문내역 (p9) + 수동 입력 (p10)**
   - `orders-app.jsx` (40KB, bundle 최대 파일) 참고해서 변환
   - 필터 바, DataTable, 행 확장, 다중 선택 액션 바
   - /orders/new (p10): 거래처 선택 → 제품 선택 → 수량 → 저장

6. **재고현황 (p15)**
   - Drawer 3탭: 로트히스토리 / 이동내역 / 판매추세
   - calcCurrentStock 실시간 표시
   - 재고 부족 경보

각 페이지 완료할 때마다 커밋 + push. 하나 완료 후 내가 확인하고 다음 지시 줌.

먼저 1~3번 (쿼리훅 + 계산식 + 홈 대시보드 실연결)만 해줘. 이게 잘 되면 4~6번 진행.
```

---

## Phase 4: 재무 3화면 + 발주서

```
Phase 3 성공. 이제 재무 영역과 발주서를 만든다.

1. **재무-미수금 (p16)**
   - w4 은행 입금 3단계 매칭 구현
   - 엑셀 업로드 → bank_transactions 저장
   - 자동 매칭 + 수동 매칭 UI
   - bank_aliases 학습 누적

2. **재무-세금계산서 (p17)**
   - w5 세금계산서 엑셀 생성
   - 연/월 선택 → businesses별 집계 → 홈택스 양식 xlsx

3. **재무-손익계산서 (p18)**
   - calcCostOfSales 기반 P&L

4. **발주서 (p14)**
   - w3 추천 워크플로우
   - 스텝 인디케이터 (추천→조정→검토→발송)
   - calcOrderSuggestion 기반

5. **수입/매입 (p13), 매출 (p12)**
   - CRUD 페이지

완료 후 커밋/푸시.
```

---

## Phase 5: 설정 + 포털 + Super Admin + Toss

```
마지막 단계.

1. **설정 6개 페이지** (p20~p25)
   - 회사정보, 팀원 초대(w8), 요금제, 프로필, 모듈관리, 택배연동(v1.1 스켈레톤)

2. **거래처 포털** (p26, p27)
   - customer_users 별도 인증 (Supabase Auth 아님, bcrypt 비밀번호)
   - /portal/login, /portal/order

3. **Toss Payments 구독** (w7)
   - Edge Function 2개: `/api/billing/webhook`, `/api/billing/change-plan`
   - subscriptions.status 관리

4. **Super Admin** (p28~p30)
   - is_super_admin 체크
   - service_role로 전체 회사 목록

5. **Playwright MCP 검증**
   - 멀티테넌트 격리 테스트
   - 권한별 접근 제어 테스트
   - 콘솔 에러 0건

완료 후 최종 푸시. Vercel 자동 배포 확인.
```

---

## 디버깅 팁

**"Phase 1에서 막힌다면":**
- Supabase URL/Key가 정확한지 확인
- Exposed schemas에 `mochicraft_demo` 추가했는지
- `npm run dev`로 그냥 Hello World만 뜨는지 먼저 확인

**"디자인이 안 먹는다면":**
- index.css에 tokens.css 내용 제대로 복사됐는지
- Tailwind config에서 CSS 변수 참조 설정 됐는지
- 폰트 로드 (Pretendard, Inter Tight, Fraunces) 확인

**"RLS 에러가 난다면":**
- auth.uid()가 memberships에 등록되어 있는지
- 새 사용자라면 온보딩 거쳐서 companies + memberships insert 됐는지
- Claude Code에게 "test user 만들어서 디버깅 도와줘"

**"Claude Code가 끝없이 작업한다면":**
- CLAUDE.md에 "한 번에 1기능씩" 원칙이 있음 — 상기시켜 주기
- 막히면 중단시키고 다른 접근 제안시키기

---

## 예상 소요 시간

| Phase | 예상 | 비고 |
|---|---|---|
| 사전 준비 | 10분 | 본인이 수동 |
| Phase 1 (초기화) | 15-30분 | Claude Code 자동 |
| Phase 2 (인증+홈) | 1-2시간 | 디자인 변환이 핵심 |
| Phase 3 (핵심 업무) | 2-3시간 | 가장 큼 |
| Phase 4 (재무+발주) | 2시간 |  |
| Phase 5 (설정+결제+Admin) | 2-3시간 | Toss 연동 포함 |

**총 약 8-12시간** 분량. 하루에 몰아 할 필요 없고, Phase별로 나눠서 진행 권장.
