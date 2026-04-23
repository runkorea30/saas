# SESSION HANDOFF — MochiCraft OPS (saas)

> 다음 세션의 Claude가 이 파일을 읽고 상황 파악 후 작업 재개한다.

---

## 1. Phase 상태

| Phase | 내용 | 상태 |
|---|---|---|
| Phase 1 | 프로젝트 스캐폴딩 (Vite + TS + Tailwind + Supabase client) | ✅ 완료 |
| Phase 2 | Orders 페이지 실데이터 연동 | ✅ 완료 |
| Phase 3 | 전역 Shell + 2단 Nav + 라우트 스텁 | ✅ 완료 |
| Phase 3.5 | Home Dashboard 실구현 | ✅ 완료 (2026-04-24) |
| Phase 3.6 | Customers 페이지 실구현 | ✅ 완료 (2026-04-24) |
| Phase 4 | 나머지 11 페이지 + Auth 도입 | 대기 |

**페이지 진도: 3 / 14 구현 완료**

- `/` — 홈 대시보드 (KPI + Today + Chart + Timeline)
- `/sales/orders` — 주문내역 (필터/목록/상세 split)
- `/settings/customers` — 거래처 (목록/필터/상세 split)
- 나머지 11 경로는 전부 `<PlaceholderPage />` 상태

---

## 2. 환경 요약

### Backend
- Supabase 프로젝트: `adfobvwuzkufsmukdfrt`
- 스키마: `mochicraft_demo` (20 테이블 / 75 인덱스 / 19 트리거)
- RLS: 모든 테이블 활성화 + Phase 2 임시 `_dev_anon_select` 정책 (아래 §5 참조)
- 시드: 회사 1 / 거래처 14 / 주문 35 / 주문아이템 124 / 상품 15. 재고·발주·은행·세금계산서는 0건.

### Frontend
- 스택: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- 라우터: React Router v6 (중첩 라우트, Shell 레이아웃)
- 상태: `@tanstack/react-query` + Supabase JS 클라이언트
- dev: `http://localhost:5173`
- 배포: GitHub push → Vercel 자동 배포

---

## 3. 확립된 구현 패턴 (나머지 페이지 템플릿)

**Orders / Home / Customers 3개가 템플릿**. 새 페이지는 아래 패턴을 따른다.

### 폴더 구조
```
src/
├── components/feature/{domain}/    # 도메인별 컴포넌트 (FilterBar / Table / DetailPane ...)
├── hooks/queries/use{Domain}.ts    # TanStack Query 훅 (도메인별)
├── pages/{section}/{Domain}Page.tsx # 라우트 페이지
└── utils/calculations.ts           # 🔴 모든 비즈니스 계산식 단일 파일
```

### 필수 규칙 (CLAUDE.md)
- 🔴 **모든 Supabase 조회**: `fetchAllRows()` 경유 + `company_id` 필터
- 🔴 **`company_id`**: `useCompany()` 훅에서만 획득, 하드코딩 금지
- 🔴 **계산 로직**: `src/utils/calculations.ts`에만 존재 (§2)
- 🟠 **중복 금지**: 같은 로직 여러 파일 복사 금지 (§8)
- 🟡 **부분 로딩 허용**: 섹션별 `useQuery` 분리 + `Promise.allSettled` (한 쿼리 실패가 전체를 막지 않게)
- 🟡 **Empty state 정직 처리**: 데이터 없을 때 더미 데이터 금지. "데이터 준비 전" 등 안내 문구

### 재사용 atoms (Orders primitives)
- `StatusBadge` · `GradeBadge` · `SourceIcon` · `Avatar`
- `Segmented<T>` · `MultiChip` · `Check` · `EmptyState`
- `fmtWon` · `fmtDate` · `fmtDateTime` · `periodRange`

### UI 토큰 (src/index.css)
- `.card-surface` · `.chip` · `.disp` · `.num` · `.btn-base` · `.hair` · `.kbd` · `.row-link` · `.hover-arrow`
- CSS 변수 전체 (`--brand` / `--ink-*` / `--success-wash` 등)

### master-detail split 패턴
Orders/Customers 페이지 공통:
- 상단: PageHeader (breadcrumb · title · summary · 우측 액션 버튼)
- 다음: FilterBar (검색 + MultiChip + Segmented)
- 본문: `grid-template-columns: {splitPct}% 6px 1fr` + 드래그 핸들
- localStorage 키: `mc.{domain}.split`

---

## 4. 오늘 추가된 공용 인프라

### `src/utils/koreanSort.ts`
- `companyNameSortKey(name)`: 접두사 "(주)", "(유)", "(재)", "(사)", "(합)", "주식회사", "유한회사", "재단법인", "사단법인", "합자회사" 제거 후 반환
- `compareCompanyName(a, b)`: `localeCompare('ko')` 기반 비교자
- **재사용 대상**: 향후 공급처(vendors), 사업자(businesses) 목록 정렬 시 동일 유틸

### `src/index.css` disabled 공용 스타일
- `.btn-base:disabled`, `.btn-base[disabled]` → `opacity: 0.5` + `cursor: not-allowed`
- 기존 `:hover` 셀렉터 전부 `:not(:disabled):hover` 로 수정 → disabled 상태에선 hover 색 변화 없음
- **적용 범위**: 모든 페이지의 `<button className="btn-base ..." disabled>` 에 자동 적용 (인라인 스타일 불필요)

### `src/utils/calculations.ts` 확장 (이번 세션)
신규 구현:
- `calcMonthlySales(companyId, year, month)`
- `calcDailySales(companyId, startIso, endIso)`
- `calcReceivables(companyId, customerId)` — 단일
- `calcTotalReceivables(companyId)` — 전체 거래처 합계 + 경과 메타
- `calcCustomerAggregates(companyId)` — 거래처별 매출·미수·주문수·최근 주문일
- `calcInventoryValue(companyId)` — 가중평균 × 1.1
- `calcCurrentStock(companyId, productId)` — 올해 판매수량 반영
- `calcOrderSuggestion(companyId, productId)` — 6개월 판매 기준 DZ
- `calcApproxProfitMargin(companyId, year, month)` — supply_price 근사치

스텁 유지 (Phase 4/5):
- `calcCostOfSales` — FIFO 로트 소비 로직 필요
- `calcMRR` — Super Admin 페이지와 함께

---

## 5. Phase 2 Auth 도입 시 반드시 원복

### RLS / 권한 임시 개방 (제거 대상)
- `_dev_anon_select` 정책 **총 20개** (테이블별 1개씩, `anon USING true`)
- 스키마 `USAGE` to anon
- `GRANT SELECT ON ALL TABLES ... TO anon`
- `ALTER DEFAULT PRIVILEGES ... TO anon`
- 시퀀스 `GRANT` to anon
- `phase2_orders_status_canceled_and_dev_anon_select` 마이그레이션 내 `anon SELECT` 6개

### 원복 SQL
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

ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA mochicraft_demo
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon;

NOTIFY pgrst, 'reload schema';
```

### Frontend 변경
- `src/hooks/useCompany.ts` — 현재 "첫 회사 fallback". `memberships` 조회 + 사용자 선택 회사 우선으로 교체
- 홈 헤더 — `companies.name` 대신 로그인 사용자명 표시

---

## 6. 알려진 TODO (나중에 일괄 정리)

### 포맷·표시
- **KPI 통화 포맷 혼재**: "540만" / "12.8M" / "₩128,430,000" 섞임 → 전체 페이지 완성 후 `fmtMoney()` 공용 함수로 통일

### 데이터 정확도
- **이익률**: `supply_price` 기반 근사치 → Phase 4에서 FIFO 로트 소비로 교체 (`calcCostOfSales` 구현)
- **Sparkline**: 매출 KPI 카드만 실데이터, 나머지 3개(미수금/재고/이익률)는 플레이스홀더 → Phase 4

### 스텁 유지
- `calcCostOfSales` — Phase 4
- `calcMRR` — Phase 5 (Super Admin)

### 기타
- 존재하지 않는 경로 → React Router 기본 404 화면. `errorElement` 필요
- Orders/Customers의 "엑셀 내보내기", Customers "거래처 추가" 버튼 — Phase 4 실구현

---

## 7. 다음 세션 진입점

### 옵션 A (권장) — 나머지 11 페이지 병렬 구현
도메인별 일관 패턴 확립됐으므로 병렬 진행 가능:
- `/sales/order-entry` — 수동주문입력
- `/sales/invoices` — 송장대장
- `/inventory/stock` — 재고현황
- `/inventory/purchase` — 수입/매입
- `/inventory/purchase-orders` — 발주서 (PO 템플릿 필요)
- `/inventory/products` — 제품리스트
- `/finance/receivables` — 미수금
- `/finance/banking` — 은행거래 (입금 매칭)
- `/finance/tax-invoices` — 세금계산서 발행
- `/finance/pnl` — 손익계산서 (calcCostOfSales 선행 필요)

### 옵션 B — Auth 우선
- Supabase Auth + memberships 도입
- §5 원복 작업 병행
- 이후 나머지 페이지 구현

### 빠른 마무리
- 404 ErrorBoundary — 단일 파일 추가

---

## 8. 운영 메모

- 사용자: 양시혁 (GitHub: runkorea30, email: runkorea30@gmail.com)
- 환경: Windows + Git Bash / PowerShell
- 커밋 컨벤션: `@bkit "<message>"` 패턴 (사용자가 지시할 때만 커밋/푸시)
- dev 서버 재시작: `Ctrl+C` 후 `npm run dev` (포트 점유 시 다음 포트로)
- DB 수정 시 MochiCraft 브라우저 탭 닫아둘 것 (열려 있으면 프론트가 덮어쓸 가능성)
- 타입체크: `npx tsc --noEmit` (커밋 전 필수)

### 최근 커밋
- `1fcf1cc` feat(customers): Customers 페이지 + disabled 스타일 공용화 + 회사명 정렬 규칙
- `5d5db6f` feat(home): Home Dashboard 페이지 구현
- `87bd298` Phase 3 closeout: migration files + SESSION_HANDOFF update
- `835e7cb` feat(shell): Phase 3 global Shell with 2-tier top nav + route stubs
- `451c4d3` feat(orders): Phase 2 Orders page with live Supabase data
