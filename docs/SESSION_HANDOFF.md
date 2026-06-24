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
| Phase 3.7 | Products 페이지 — 조회 + CRUD + 재고현황 스타일 + 사용자 검증 1차 반영 | ✅ 완료 (2026-04-25) |
| Phase 3.8 | Inventory (재고현황) 페이지 — 기초재고 투입 | ✅ 완료 (2026-04-24) |
| Phase 3.9 | Import/Purchase 페이지 Phase 1 — 수동 입력 입고확정 | ✅ 완료 (2026-04-24) |
| Phase 3.10 | 주문 상세 패널 — 6컬럼 테이블 + 인라인 편집 + 등급별 공급가 | ✅ 완료 (2026-06-23) |
| Phase 3.11 | 수동주문입력 페이지 — 스프레드시트 UX + 엑셀 파싱 + RPC 저장 | ✅ 완료 (2026-06-23) |
| Phase 3.12 | 재고현황 — 최근 움직임 robust 표기 + 재고조정 기능 (RPC) | ✅ 완료 (2026-06-23) |
| Phase 3.13 | 수입/매입 Phase 2 — 주문서(XLSX) + 인보이스(PDF) 자동 파싱·비교 (Claude API) | ✅ 완료 (2026-06-23) |
| Phase 3.14 | 발주서 페이지 (`/inventory/purchase-orders`) — `calcOrderSuggestion` 기반 | ✅ 완료 (2026-06-24) |
| Phase 3.15 | 거래처 주문서 포털 (`/customer-order`) — 거래처 로그인 + 주문서 업로드 | ✅ 완료 (2026-06-24) |
| Phase 3.16 | 주문내역 UI 개선 + 단위 일괄정리 + Vercel 배포 | ✅ 완료 (2026-06-24) |
| Phase 3.17 | 은행거래 페이지 (`/finance/banking`) — 3탭 (입출금장부/월별정산/매칭설정) + KB엑셀 파싱 + 자동매칭 | ✅ 완료 (2026-06-24) |
| Phase 3.18 | 미수금 관리 페이지 (`/finance/receivables`) — 카드형 현황 + 월별 상세 모달 | ✅ 완료 (2026-06-24) |
| Phase 3.19 | 은행거래 버그 수정 + 운영 보강 (입금 매출월 매칭 로직 개편, 사업자계좌 포맷, target_sales_month 수동지정) | ✅ 완료 (2026-06-25) |
| Phase 3.20 | 입금 분할 기능 + 허용 오차(100원) 정산완료 처리 (bank_transaction_splits) | ✅ 완료 (2026-06-25, 브라우저 검증 미수행) |
| Phase 4 | 나머지 페이지 + Auth 도입 | 대기 |

**페이지 진도: 11 / 13 구현 완료**

- `/` — 홈 대시보드 (KPI + Today + Chart + Timeline)
- `/sales/orders` — 주문내역 (필터/목록/상세 split, 상세에서 수정/저장/반품추가/주문추가)
- `/sales/order-entry` — 수동주문입력 (좌입력/우미리보기, 자동완성, 엑셀파싱, Ctrl+S)
- `/settings/customers` — 거래처 (목록/필터/상세 split)
- `/inventory/products` — 제품리스트 (CRUD + 모달 + 체크박스 + 필터 초기화)
- `/inventory/stock` — 재고현황 (기초재고 투입 + 재고조정 + KPI)
- `/inventory/purchase` — 수입/매입 Phase 1 + Phase 2 (수동 입력·입고확정 + PDF/XLSX 자동 파싱)
- `/inventory/purchase-orders` — 발주서 (계산식 기반 발주량 추천 + DZ 반올림 + 카테고리 단일선택)
- `/customer-order` — 거래처 주문서 포털 (로그인 + 주문서 업로드 + 직송정보 + 월별 주문내역)
- `/finance/banking` — 은행거래 (KB엑셀 업로드, 자동매칭, 월별정산, 매핑설정)
- `/finance/receivables` — 미수금 관리 (카드형 현황, 월별 누적미수금, 연체일수)
- 나머지 2 경로 (`/finance/tax-invoices`, `/finance/pnl`) 는 `<PlaceholderPage />` 상태

**배포**: https://saas-beta-pied.vercel.app (Vercel 자동 배포, GitHub push)

---

## 후속 PR 로드맵 (2026-06-24 갱신, 은행거래/미수금 완료 후)

- **다음 후보 (택1)**:
  - **세금계산서** (`/finance/tax-invoices`) — 발행/조회
  - **손익계산서** (`/finance/pnl`) — `calcCostOfSales` 선행 필요 (FIFO 로트 소비)
  - **거래처 편집 UI** — CustomerDetailPane 인라인/모달 편집 (정산주기·입금매칭 포함)
  - **송장대장** (`/sales/invoices`)
  - **매출분석 페이지 심화** — 차트·필터·CSV 내보내기 보강
- **PR 2 (예정)**: Products 엑셀 업로드 — XLSX 템플릿, 프리뷰, 일괄 추가
- **PR 3 (예정)**: Products 일괄 수정 — 체크된 행의 판매가/공급가/USD 등 동시 변경. PR 1.5 (#4) 의 체크박스 컬럼이 이 PR을 위한 사전 준비
- **Phase B (예정)**: Products 행 클릭 상세 펼침
- **Phase C (예정)**: 컬럼 선택/드래그 + 사용자별 UI 설정 DB 저장
- **수동주문입력 후속**:
  - 컬럼간격 드래그 리사이저 (현재는 fixed/flex 토글만)
  - 우상단 "자동수집 OFF" + "수집/팩스" 영역 (의미 미정의)
  - 파일 자체를 서버 업로드 (현재는 클라이언트 미리보기만)

---

## 오늘 추가된 작업 요약 (2026-06-25)

### 은행거래 버그 수정 & 운영 보강 (Phase 3.19)

#### 매출월 매칭 로직 개편 — `calcMonthlyReconciliation`
- **초기 단순 매칭 (단일 입금월=매출월) → 입금월 역산 (offset만큼) → due_date ±7일 유예 → "매출월별 입금 허용 구간"** 으로 3단계 진화 (`2d76508` → `5e93363` → `63cef51`).
- 최종 규칙: 각 매출월에 대해
  - `windowStart = (year, month-1+offset, 1)` (offset: 당월 0 / 익월 1 / 2개월 2)
  - `windowEnd = (offset만큼 미룬) 해당월 말일 + 7일`
  - 입금일이 이 구간에 속하면 그 매출월에 귀속, 어느 구간에도 속하지 않으면 미귀속.
- **`calcDueDate` UTC 오프셋 버그**: `due.toISOString().slice(0,10)` 이 KST(+9)에서 말일을 하루 당겨 표시하던 문제 → 로컬 `getFullYear`/`getMonth`/`getDate` 추출로 교체.
- **입금일자 표시**: `MonthlyReconciliation.deposit_dates: string[]` 신설. MonthlyTab/ReceivablesPage 상세 모달의 입금합계 셀이 2줄로 표시 — `₩금액` + `입금일: MM-DD, MM-DD`.

#### `target_sales_month` 수동 지정 기능 (`f045d69`)
- DB: `bank_transactions.target_sales_month VARCHAR(7)` 컬럼 추가 (마이그레이션 `20260624010000_add_target_sales_month_to_bank_transactions.sql`).
- `null` 이면 자동 매칭 로직(±7일 구간) 사용, 값(`'YYYY-MM'`) 있으면 자동 계산 무시하고 그 월로 직접 귀속.
- LedgerTab 매칭 행에 "매출월" 컬럼 추가 — select(자동 / 과거 12개월 YYYY-MM), 값 있으면 `text-blue-600 font-medium` 강조. 변경 즉시 `useUpdateBankTransaction` 호출.
- TS 타입: `BankTransaction` 인터페이스 + `Database` 제네릭의 `bank_transactions` Row/Insert/Update 3종에 필드 추가. `useUpdateBankTransaction` 페이로드 타입에도 추가.
- 호출부 `MonthlyTab.tsx` / `ReceivablesPage.tsx` 의 `calcMonthlyReconciliation` 매핑에 `target_sales_month` 전달.

#### 매핑 룰 추가 시 소급 자동 매칭 (`67fa309`)
- `useAddBankMapping`: INSERT 후 동일 트랜잭션으로 `bank_transactions` 일괄 UPDATE — `company_id` + `type='deposit'` + `match_status='unmatched'` + `depositor_name ILIKE %bank_name%` 조건. `customer_id`/`match_status='matched'`/`match_type='매핑'`/`updated_at` 갱신.
- 반환 `{ mappingId, updatedCount }`. `SettingsTab` toast: `매핑 룰 추가 완료 — 기존 미매칭 N건 자동 매칭되었습니다`.
- `onSuccess` 에 `['bank-transactions', companyId]` invalidate 추가.

#### KB 사업자계좌 엑셀 포맷 자동 감지 (`356a7e9`)
- `parseKBBank`: 헤더행 col 0 값이 `'no'` 이면 사업자 포맷, 아니면 개인 포맷.
- 컬럼 인덱스 변수화: 사업자 (date 1 / depositor 2 / desc 8 / deposit 4) vs 개인 (date 0 / desc 1 / depositor 2 / deposit 5).

#### 정산이동 컬럼 UI 숨김 (`33dee9c`)
- LedgerTab 에서 "정산이동" 컬럼/체크박스/`onToggleMoved` 핸들러 제거 (colSpan 9→8).
- DB 컬럼 `bank_transactions.moved_to_monthly` 는 유지 (롤백 시점에 함께 회수 — §5 기록 그대로).

#### 입금 분할 기능 (`a859b42`)
- **신규 테이블** `mochicraft_demo.bank_transaction_splits` (id / company_id / bank_transaction_id / target_sales_month / amount / memo / created_at) + FK CASCADE 2종 + 인덱스 2종 + RLS + `anon_all_bank_transaction_splits` 정책 + anon GRANT. 마이그레이션 `supabase/migrations/20260625000000_create_bank_transaction_splits.sql`.
- **TS 타입**: `Database.bank_transaction_splits` Row/Insert/Update + 커스텀 `BankTransactionSplit` 인터페이스 추가.
- **훅 (`useBanking.ts`)**: `useBankTransactionSplits()` 조회, `useUpsertBankTransactionSplits()` (한 transaction의 기존 분할 DELETE 후 새 INSERT, 빈 배열이면 해제). onSuccess에 `bank-transaction-splits` + `bank-transactions` invalidate.
- **`calcMonthlyReconciliation`** 시그니처 확장 — `splits = []`, `today = new Date()`, `toleranceAmount` 추가. transactions 항목에 `id` 필수. 분할이 있으면 `splits` 합계로 귀속(원본 금액/`target_sales_month` 무시), 없으면 기존 매칭 로직 (수동 지정 → 허용 구간 자동).
- **LedgerTab UI**: matched 행 액션에 [분할] 버튼 추가, 분할 있으면 `text-blue-600 (N)` 강조. `SplitModal` — 매출월 select + 금액 input + 메모 행 가변, 하단 카드 원본/합계/차이 (0 green / +red / -blue). 저장 버튼은 `차이=0` 일 때만 활성. 기존 분할이 있으면 "분할 해제" 버튼 노출.
- **호출부**: `BankingPage` overdueTotal, `MonthlyTab` recon, `ReceivablesPage` cards 모두 `splits` + `PAYMENT_TOLERANCE_AMOUNT` 전달.

#### 허용 오차 100원 — 정산완료 자동 흡수 (`1e2fcf3`, 이전 `a859b42` 포함)
- **신규 상수** `src/constants/banking.ts` — `PAYMENT_TOLERANCE_AMOUNT = 100`. 추후 회사별 설정 페이지에서 변경 가능하도록 단일 상수로 관리.
- `calcMonthlyReconciliation` 기본값 `toleranceAmount = 100`. status 분기: `|차액| ≤ tolerance` → 정산완료, `is_overdue` → 연체, `difference > 0` → 정산대기, 그 외(초과입금) → 정산완료. `is_overdue` 도 tolerance 초과일 때만.
- 십원 단위 절사(최대 90원) 자동 흡수 → 합산 입금 / 잔돈 차액으로 인한 거짓 미수 노출 제거.

### 신규 DB 객체 (이번 세션, §5 rollback 목록 추가됨)
- 컬럼: `bank_transactions.target_sales_month VARCHAR(7)` — 롤백: `ALTER TABLE mochicraft_demo.bank_transactions DROP COLUMN target_sales_month;`
- 로컬 마이그레이션: `supabase/migrations/20260624010000_add_target_sales_month_to_bank_transactions.sql`

### 알려진 이슈 / 운영 메모 (도그푸딩에서 확정)
- **십원 단위 절사 입금**: 거래처가 입금 시 자투리(예: ₩87)를 절사해서 보내는 케이스 → `target_sales_month` 수동 지정으로 그 매출월에 귀속시키고, 차액 소액은 감수(별도 보정 없음).
- **합산 입금 (복수 매출월)**: 거래처가 2~3 개월치를 한 번에 입금하는 케이스 → `target_sales_month` 로 대표 월(보통 가장 오래된 미수월)에 귀속. 미세 차액은 다음 입금에서 자연 상쇄.
- **에스닷 등 익월 중간일 입금 업체**: 익월 말일+7일 구간을 벗어나 익월 15~20일경 입금 → 자동 매칭 실패. `target_sales_month` 수동 지정 필요.
- **정산이동(`moved_to_monthly`) 컬럼**: UI 숨김 처리. 자동 매칭 + `target_sales_month` 조합으로 충분히 커버되어 더 이상 사용하지 않음. DB 컬럼은 회수 시점까지 유지.
- **KB 엑셀 두 포맷 지원**: 개인계좌(헤더 col0=거래일시)/사업자계좌(헤더 col0=No) 자동 감지. 다른 은행 추가 시 헤더 시그니처 분기 위치는 `parseKBBank` 헤더 판별부.

---

## 오늘 추가된 작업 요약 (2026-06-24)

### 은행거래 페이지 (Phase 3.17) — `/finance/banking`
3탭 구조: 입출금 장부 / 월별 정산 / 매칭 설정.
- **DB 스키마 (3회 마이그레이션)**:
  - `bank_transactions` 컬럼 3종 추가: `exclude_reason TEXT`, `match_type VARCHAR CHECK (IN '자동','수동','매핑')`, `moved_to_monthly BOOLEAN DEFAULT false`
  - `bank_transactions` UNIQUE 제약: `(company_id, transaction_date, depositor_name, amount)` — 동일 파일 재업로드 시 중복 자동 skip
  - `customers.match_type VARCHAR DEFAULT 'monthly' CHECK (IN 'monthly','daily')` — 디엔에스만 daily 로 마이그레이션됨
  - 신규 테이블 `bank_mappings` (id, company_id, bank_name UNIQUE per company, customer_id FK SET NULL, customer_name)
  - 신규 테이블 `bank_exclude_keywords` (id, company_id, keyword UNIQUE per company)
  - v1 (`hhgicytfzmikuavgbgov`) → OPS 데이터 마이그레이션: 48 거래 / 11 매핑 / 7 키워드
- **TS 유틸 신규**:
  - `src/utils/bankParser.ts` — `parseKBBank(file)` (SheetJS cp949, 헤더 자동 탐색, 입금액>0 행만) + `applyAutoMatch(rows, mappings, keywords, customers)` (3단계 우선순위: 제외키워드 → bank_mappings → fuzzy 거래처명)
  - `src/utils/calculations.ts` 추가 함수: `calcDueDate(month, cycle)`, `calcMonthlyReconciliation(orders, txs)`, `calcReceivableCards(recon, lastDepositDates)`
- **훅 (`src/hooks/useBanking.ts`)**:
  - 조회 4종: `useBankTransactions(year, month)` · `useBankMappings()` · `useBankExcludeKeywords()` · `useOrdersForReconciliation()`
  - mutation 6종: `useAdd/UpdateBankTransaction(s)` · `useAdd/DeleteBankMapping` · `useAdd/DeleteBankExcludeKeyword`
  - ⚠️ DB 컬럼 `settlement_cycle` ↔ TS 타입 `payment_cycle` rename 처리는 useBankTransactions / useOrdersForReconciliation 내부에서 흡수
- **페이지 (`src/pages/finance/BankingPage.tsx` + `src/components/feature/banking/`)**:
  - KPI 3개: 이번기간 입금 / 미매칭 건수 / 전체 미수 잔액(연체)
  - **탭1 입출금 장부**: KB엑셀 업로드 → parseKBBank → applyAutoMatch → 미리보기 모달(자동매칭=green/제외=gray strike-through/미매칭=amber) → 일괄 저장 → 중복 N건 안내 toast. 행별 거래처 인라인 select (즉시 matched), [제외] 사유 입력 → 키워드 자동 등록 확인 다이얼로그, [매칭해제]
  - **탭2 월별 정산**: 거래처×월 정산 테이블 + 차액 색상(미수=red/초과=blue/완료=green) + 합계 행
  - **탭3 매칭 설정**: 자동매핑 룰 CRUD (인라인 새 행 추가) + 제외 키워드 칩 CRUD

### 미수금 관리 페이지 (Phase 3.18) — `/finance/receivables`
- **데이터**: `useOrdersForReconciliation()` + `useBankTransactions(year, null)` → `calcMonthlyReconciliation` → `calcReceivableCards`
- **레이아웃**: 반응형 카드 그리드 (`auto-fill, minmax(260px, 1fr)`), 위험 → 경고 → 정상 순 정렬
- **카드**: 거래처명 + 배지(위험 red / 경고 yellow / 정상 green) + 연체금액(또는 '잔액 없음') + 총매출/정산대기/최근입금 3행
- **상세 모달**: 카드 클릭 → 매출월 / 매출합계 / 정산마감일 / 입금합계 / 잔액 / 누적미수금 / 상태 / 연체일수 + 합계 행
- 누적미수금은 difference 누계 (음수는 0으로 클램프)
- 연체일수 = is_overdue 시 `(오늘 - due_date)` 일수, 아니면 '-'

### 신규 DB 객체 (모두 §5 rollback 목록에 기록)
- 테이블: `mochicraft_demo.bank_mappings` · `mochicraft_demo.bank_exclude_keywords`
- 컬럼: `bank_transactions.exclude_reason` · `.match_type` · `.moved_to_monthly`
- 컬럼: `customers.match_type`
- 제약: `bank_transactions` UNIQUE `(company_id, transaction_date, depositor_name, amount)`
- 정책: `anon_all_bank_transactions` · `anon_all_bank_mappings` · `anon_all_bank_exclude_keywords`
- 로컬 마이그레이션 파일: `supabase/migrations/20260624000000_banking_schema_and_v1_seed.sql`

### TS 타입 보강 (`src/types/database.ts`)
- `Database` 제네릭 타입에 `bank_transactions` 신규 3컬럼 + `bank_mappings` + `bank_exclude_keywords` 테이블 정의 + `customers.match_type` 컬럼 수동 추가.
- 첫 `npm run build` 시 TS2769 다발로 실패 → 위 패치 적용 후 빌드 성공.

### 발주서 페이지 (Phase 3.14) — `/inventory/purchase-orders`
- 신규 페이지 `PurchaseOrderPage` — `calcOrderSuggestion(companyId, productId)` 기반 추천 발주량 계산 (과거 6개월 판매 → 3개월치 → DZ).
- 카테고리 필터 단일 선택 토글 + 발주수량 컬럼 반올림(`Math.round`) 로직 정리 (`de0a7de`, `afad672`).
- DB: 신규 테이블 `mochicraft_demo.purchase_order_items` (purchase_order_id FK CASCADE, product_id FK, quantity INT, unit_price_usd NUMERIC). 기존 `purchase_orders` 와 1:N.
- 정책: `anon_all_purchase_orders`, `anon_all_purchase_order_items` (Phase 2 Auth 도입 시 §5 회수 대상).
- 의존성 없음 (수입/매입 Phase 2 와 독립).

### 거래처 주문서 포털 (Phase 3.15) — `/customer-order`
- 신규 페이지 `CustomerOrderPage` — 거래처가 자체 로그인하여 주문서를 업로드하는 외부 포털.
- DB:
  - `customers.login_id varchar`, `customers.login_password varchar` (평문, dogfooding 전용) 컬럼 추가
  - `idx_customers_login_id_unique` 부분 UNIQUE 인덱스 (company_id, login_id)
  - 신규 테이블 `customer_order_uploads` — 업로드 파일 + 파싱 결과 + 직송정보
  - 정책 `anon_all_customer_order_uploads` (anon ALL USING true)
- 거래처 로그인 계정 4개 등록: **안앤리 / 엘케이에프 / dienes / shoescare**
- 페이지 기능:
  - 거래처 로그인(login_id + login_password)
  - 주문서 파일(XLSX) 업로드 → 파싱 후 미리보기 → 주문 전송
  - 직송정보 9컬럼 테이블 (붙여넣기 지원, `0408ac5`)
  - 월별 주문내역 조회 + v1 UI 형식 (`3ac2b88`)
  - 기본 필터(이번달) + 카카오 삭제 등 잔버그 일괄 수정 (`717a8e1`)
- 공급가 계산은 거래처 등급 기반 `calcSupplyPriceByGrade` 로 통일 (`5dc6f5a`).
- 🟠 Phase 2 Auth 도입 시 `customer_users.password_hash` 로 인증 이관 + 위 컬럼/정책 모두 §5 따라 회수.

### 주문내역 UI 개선 (Phase 3.16)
- 헤더 축소, 필터 한 줄 정렬, 수량 인라인 편집, 접수경로 컬럼 삭제 (`311d2cf`).
- 합계를 공급가 기준으로 통일 (`2d7ad4e`).
- 공급가는 `products.grade_a~e` 기반 계산으로 재구성 (`fd3bd26`).
- 주문 INSERT 시 `unit_price` 를 판매가 → **공급가**로 교체 (`9aac91c`).
- 주문상세에서 sell_price 조회 누락으로 판매가 컬럼이 비었던 버그 복원 (`2f64b8e`).
- `useOrderItems` JOIN 에 `sell_price` 명시 추가.

### 단위 일괄 정리
- `products.unit` 컬럼: **DZ 798개 일괄 수정**, EA 유지 3개 (예외 케이스 명시적 보존).
- 발주서/수입매입/주문 전반의 단위 표시 일관성 확보.

### Vercel 배포
- 운영 URL: **https://saas-beta-pied.vercel.app**
- `vercel.json` 추가 — SPA 라우팅 rewrites 설정 (`ee86056`).
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
  ```
- GitHub push → Vercel 자동 배포 (CLAUDE.md 8 규칙 준수, `npx vercel --prod` 사용 금지).

### 신규 DB 객체 (§5 rollback 목록에도 기록)
- 테이블: `mochicraft_demo.purchase_order_items`
- 테이블: `mochicraft_demo.customer_order_uploads`
- 컬럼: `customers.login_id`, `customers.login_password`
- 인덱스: `idx_customers_login_id_unique`
- 정책: `anon_all_purchase_orders`, `anon_all_purchase_order_items`, `anon_all_customer_order_uploads`

---

## 오늘 추가된 작업 요약 (2026-06-23)

### 수입/매입 Phase 2 (Phase 3.13) — 인보이스 자동 파싱·비교
- **신규** `src/utils/orderSheetParser.ts` — SheetJS 로 주문서 XLSX 파싱. `CODE` 헤더 행 자동 감지, 하이픈 제거, TOTAL 행 스킵.
- **신규** `src/utils/invoiceParser.ts` — PDF → base64 → Claude API (`claude-sonnet-4-6`) 호출 → JSON 응답 파싱. 환경변수 `VITE_ANTHROPIC_API_KEY` 사용, `anthropic-dangerous-direct-browser-access: true` 헤더로 브라우저 직접 호출.
- **신규** `src/components/feature/import/InvoiceUploadCard.tsx` — 페이지 상단 카드.
  - 2개 drop zone (XLSX + PDF) + [비교 시작] + [초기화]
  - 비교 결과 4상태 분류: 일치(green) / 수량차이(amber) / 인보이스에만(blue) / 백오더(red)
  - 필터 탭 3종 (전체 / 차이있음 / 백오더) + 결과 테이블
  - [기존 입력 폼에 채우기] → 부모 `rowInputs` 교체 + 헤더(`invoiceNumber`, `invoiceDate`) 자동 패치
  - BO 행은 채우기 시 제외 (실입고 0 행 방지)
- **수정** `src/pages/inventory/ImportReceivingPage.tsx` — 헤더 폼 위에 `<InvoiceUploadCard onFill={...} />` 마운트. 기존 14컬럼 테이블/입고확정 플로우 100% 재사용.
- **수정** `.env.example` — `VITE_ANTHROPIC_API_KEY` 항목 추가.
- **주의 (보안)**: 현재 Claude API 키가 클라이언트 번들에 노출됨. 내부 도구 단계에서만 사용. 외부 사용자 노출 전 Supabase Edge Function (`parse-invoice-pdf`) 으로 이전 필요.

### 재고현황 후속 (Phase 3.12) — 최근 움직임 표기 + 재고조정
- **최근 움직임 표기 robust 수정** (StockDetailPane)
  - `SUBTYPE_META` 에 `adjustment` (label '조정', amber 칩, sign='auto') 추가
  - `UNKNOWN_META` 폴백 + `resolveSign(metaSign, qty)` 헬퍼로 unknown subtype / 음수 quantity 대응
  - quantity 가 0/undefined 가 아닌 한 항상 `{sign}{absQty} {unit}` 형식 표시
  - `useInventoryDetail.TxType` 에 `'adjustment'` 추가
- **재고조정 기능**
  - DB: `inventory_transactions_type_check` 에 `'adjustment'` 허용 (마이그레이션 `add_adjustment_type_to_inventory_transactions`)
  - RPC: `mochicraft_demo.create_stock_adjustment(p_company_id, p_product_id, p_quantity, p_memo, p_date)` (SECURITY DEFINER, anon/authenticated EXECUTE)
    - 0 금지, opening lot 없으면 예외, `opening.quantity + p_quantity < 0` 면 예외 (음수 방지)
    - `inventory_transactions` INSERT (type='adjustment', signed quantity) + `inventory_lots` opening row의 `quantity` 가감
  - 신규 훅 `useCreateAdjustment` — RPC 호출, 성공 시 `inventory-stock`/`inventory-detail` invalidate
  - 신규 폼 `AdjustmentForm` — 방향(증가/감소) 토글 · 수량 · 메모(선택) · 발생일, 음수 방지 UI 검증 + 저장 버튼 비활성
  - StockDetailPane 헤더에 `[재고조정]` 보조 버튼 추가 (기초재고 미등록이면 disabled)
  - StockPage 에 `adjustmentTarget` 상태 + `<Modal>` + `useCreateAdjustment` 와이어업, 성공 토스트 `「{제품}」 재고 ±{수량}{단위} 조정 완료`
- **types/database.ts**: `Functions.create_stock_adjustment` 시그니처 등록 (`insert_order` 는 그대로, 사전 존재 TS 에러)
- **주의 (향후 작업)**: 현재 RPC 는 `opening.quantity` 만 가감. 추후 `current_stock = SUM(remaining_quantity)` 로 재정의 시 `opening.remaining_quantity` 도 함께 가감하도록 RPC 갱신 필요.

### 주문 상세 패널 (Phase 3.10) — `94927df`, `8c6d731`
- 6컬럼 테이블(코드/제품명/수량/판매가/공급가/합계) + 인라인 편집 모드
- 버튼: 수정하기 / 반품추가 / 주문추가 / 저장하기 / 취소
- `useOrderItems` 신규 훅 (order_id + company_id 필터, products JOIN)
- `OrderItemDraft` 타입 (`_dirty` / `_isNew` 트래킹)
- 신규 행 product 미선택 시 저장 차단
- 저장 시 `['order-items', orderId]` + `['orders']` 양쪽 invalidate
- 주문 변경 시 useEffect로 order.id 감지 → draft 재초기화

### 등급별 공급가 — DB 확장
- 마이그레이션 `add_grade_supply_rates_to_products`: `products.grade_a~e numeric(5,4)` 추가
- v1 공급율 데이터 **748건 백필 완료** (`dashboard-v2/data-migration/migrate-grade-rates.mjs` — saas repo 외부)
- `calcSupplyPriceByGrade(unitPrice, gradeRate)` 신규 (`src/utils/calculations.ts`)
- 공급가 = `unit_price × 거래처등급(A~E)의 제품별 공급율` (소수점 반올림)
- `useOrderItems` JOIN에 grade_a~e 포함, OrderDetailPane 공급가 셀에서 사용

### 수동주문입력 페이지 (Phase 3.11) — `27c1d1e` ~ `98ed073` (8커밋)
- 라우트: `/sales/order-entry` (App.tsx 교체)
- 레이아웃: **좌(입력) / 우(420px 미리보기)** 분할
- 헤더 폼: 주문구분(일반주문/반품(정상)/반품(파손)) · 거래처 select · 날짜 · 메모 · 초기화
- 최근 거래처 칩 (localStorage `order_entry_recent_customers`, 7개)
- 스프레드시트 테이블:
  - thead 고정 + tbody 360px 스크롤 (10행 × 36px)
  - 초기 50행 미리 생성, 마지막 행 채워지면 빈 행 자동 추가
  - 컬럼: # / 코드 / 제품명 / 수량 / 판매가 / 공급가 / 합계 / 삭제
  - **셀이 input** (`h-9` + 패딩 제거 + focus 시 brand-wash 배경)
  - 컬럼간격고정 / 컬럼간격초기화 토글
- 자동완성:
  - 코드: prefix 매칭 8건
  - 제품명: 부분 매칭 8건
  - 드롭다운 ↓/↑/Enter/Escape 키보드 탐색
  - 외부 클릭 시 자동 닫힘 (document mousedown)
- 키 동작:
  - 코드 Enter/Tab → 정확/유일 매칭 적용 → 수량 셀로 포커스
  - 제품명 Enter/Tab → 매칭 적용 → 수량으로
  - 수량 Enter/Tab → 다음 행 코드로 (없으면 빈 행 추가)
  - Ctrl+S / Cmd+S → 전역 저장 (ref 패턴으로 stale closure 방지)
- 수량 0 → 빈 문자열 표시 (placeholder)
- 거래처 변경 시 입력된 행들의 공급가 일괄 재계산
- **엑셀 파싱** (`xlsx` 패키지 추가, 동적 import):
  - 모든 시트 순회, 첫 10행 내 '코드' 헤더 자동 인식
  - 컬럼 매핑: 코드/수량/제품명 (없으면 기본 A/B/C)
  - 수량 > 0 행만 추출 → products 코드 매칭 → 미매칭은 codeError 빨간 테두리
- **저장**: RPC `mochicraft_demo.insert_order(...)` 호출
  - SECURITY DEFINER, anon/authenticated EXECUTE 권한
  - orders + order_items 트랜잭션 일괄 INSERT
  - 반품 모드: quantity / amount 음수로 INSERT
  - 성공 시 `['orders']` invalidate → `/sales/orders` 이동 + `state.selectedOrderId` 전달
- **OrdersPage 연동**: `location.state.selectedOrderId` 수신 → 해당 주문 자동 선택

### 신규 DB 객체 (모두 §5 rollback 목록에 기록)
- 함수: `mochicraft_demo.insert_order(uuid, uuid, date, text, text, text, jsonb) → uuid`
- 정책: `orders_dev_anon_insert` (anon WITH CHECK true)
- 정책: `order_items_dev_anon_insert` (anon WITH CHECK true)
- 컬럼: `products.grade_a~e numeric(5,4) DEFAULT 0`

### 신규 의존성
- `xlsx` (SheetJS) — 엑셀 파싱. `npm audit` 경고 있으나 신뢰된 사용자 입력만 처리하므로 위험도 낮음. 추후 `exceljs` 교체 검토 여지.

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

### `src/hooks/useResizableSplit.ts`
좌우 스플릿 폭 리사이저 공용 훅.
- **시그니처**: `useResizableSplit({ pageKey: string, defaultLeftPercent?: number })`
- **반환**: `{ leftPercent, onDragStart, containerRef }`
- **저장 키**: `mc.${pageKey}.split` (숫자 퍼센트)
- **범위**: 25~75% 강제 clamp. 저장값이 범위 밖이면 defaultLeftPercent 로 복원.
- **사용처 (Phase C 완료)**:
  - `ProductsPage` pageKey='products', default 58
  - `OrdersPage` pageKey='orders', default 55
  - `CustomersPage` pageKey='customers', default 58
- 기존 `mc.{orders|customers|products}.split` 저장값은 형식 동일 → 마이그레이션 불필요.

### `src/hooks/useResizableColumns.ts`
테이블 컬럼 폭 리사이저 공용 훅.
- **시그니처**: `useResizableColumns({ pageKey, columns: { key, defaultWidth, minWidth? }[] })`
- **반환**: `{ widths: Record<key, px>, draggingKey: string|null, onResizeStart: (key) => (e) => void, resetColumn: (key) => void, reset: () => void }`
- **저장 키**: `mc.${pageKey}.columns` (JSON {key: width})
- **minWidth 기본값**: 60px. 이하로 못 줄어듦.
- **신규 컬럼 하위 호환**: 저장값에 없는 key 는 defaultWidth 적용.
- **사용처 (Phase C 완료)**:
  - `ProductListTable` 7컬럼 (code 140 / name 280 / category 90 / sell_price 100 / supply_price 100 / unit_price_usd 90 / status 80)
  - `OrderListTable` 5컬럼 (order_date 120 / customer_name 220 / quantity 90 / total_amount 120 / status 90) — status 컬럼 분리, RET 플래그는 거래처 컬럼에 인라인
  - `CustomerListTable` 8컬럼 (grade 44 / customer_name 260 / contact 150 / settlement 80 / total_sales 130 / balance 130 / last_order 110 / status 60)
- **체크박스 열**: Products 40px / Orders·Customers 32px 고정 (리사이저 없음).
- **구 저장 키 `mc.orders.cols`** — OrderListTable 구버전(3개 컬럼)에서 사용. 새 키 `mc.orders.columns` 와 공존하되 읽지 않음 (고아 상태). 수동 정리 불필요.

### `src/components/common/ResizeHandle.tsx`  🆕
컬럼 헤더 우측에 부착하는 공용 드래그 핸들.
- **히트 영역**: 12px (시각선 양쪽 ~5px 투명 패딩). 헤더 위아래 10px 바깥까지 잡힘.
- **3단계 시각 피드백**:
  - idle: 1px hairline `var(--line-strong)` opacity 0.6
  - hover: 2px `var(--brand)` opacity 1
  - drag: 3px `var(--brand)` opacity 1 (transition 제거 → 즉각 반응)
- **더블클릭**: `onReset` 콜백으로 해당 컬럼 기본 폭 복원.
- **자동 title**: "드래그로 폭 조절 · 더블클릭으로 기본값 복원".
- **호스트 요구사항**: 부모 셀에 `position: relative`.

### 잘린 텍스트 자동 tooltip (전 테이블 공통)
`overflow: hidden + text-overflow: ellipsis` 셀 전부에 `title={value}` 속성 부착 — 호버 시 브라우저 기본 tooltip 으로 전체 텍스트 확인 가능.

### `src/components/ui/Modal.tsx`  🆕 (Phase B)
공용 모달 — `createPortal` 로 body 에 렌더.
- **시그니처**: `<Modal open onClose title width? footer?>{children}</Modal>`
- ESC · backdrop 클릭 · X 버튼으로 닫기. 오픈 시 body scroll 잠금.
- 오픈 시 자동 포커스, 닫힘 시 원래 활성 요소로 복귀.
- busy 중 닫기를 막으려면 호출부에서 `onClose={busy ? () => {} : actualClose}`.

### `src/components/ui/ConfirmDialog.tsx`  🆕 (Phase B)
Modal 위에 빌드된 확인 다이얼로그.
- **시그니처**: `<ConfirmDialog open onClose title body confirmLabel? cancelLabel? confirmVariant?: 'default'|'danger' onConfirm busy? />`
- `variant='danger'` 시 확인 버튼 danger 색 — 삭제 플로우 기본값.
- `busy=true` 시 버튼 disabled + "처리 중…" 레이블.

### `src/components/ui/Toast.tsx`  🆕 (Phase B, 페이지 로컬)
라이트웨이트 토스트 — Portal 기반, 2.5s 자동 닫힘, 호버 시 타이머 일시정지.
- **시그니처**: `<Toast kind text duration? onClose />`, `type ToastMsg = { kind: 'success'|'error'|'info', text, duration? }`
- **현재 사용**: `ProductsPage` 로컬 state `useState<ToastMsg|null>` 로 관리.
- 🟡 **TODO**: 전역 Toast Provider + `useToast()` 훅으로 승격 (여러 페이지에서 쓸 때).

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
- `calcSupplyPriceByGrade(unitPrice, gradeRate)` — 거래처 등급(A~E)별 공급율로 공급가 계산. `products.grade_a~e` 컬럼 + `customers.grade` 조합으로 사용.
- `calcSupplyAmount(totalAmount)` — VAT 역산 (÷ 1.1 → supply/vat)

스텁 유지 (Phase 4/5):
- `calcCostOfSales` — FIFO 로트 소비 로직 필요
- `calcMRR` — Super Admin 페이지와 함께

### 체크박스 컴포넌트 활용 확장 (2026-04-25, PR #4)
ProductListTable에서 `Check` 컴포넌트(`orders/primitives.tsx`)를 신규 import하여 체크박스 컬럼 구현. CustomersListTable / 기타 ListTable에서도 동일 패턴 재사용 가능. ProductFilterBar에 `hasActiveFilter` / `RotateCcw` / `selectedCount` 미니 표시 패턴 도입 — 다른 FilterBar에 이식 가능.

---

## 5. Phase 2 Auth 도입 시 반드시 원복

### RLS / 권한 임시 개방 (제거 대상)
- `_dev_anon_select` 정책 **총 20개** (테이블별 1개씩, `anon USING true`)
- 스키마 `USAGE` to anon
- `GRANT SELECT ON ALL TABLES ... TO anon`
- `ALTER DEFAULT PRIVILEGES ... TO anon`
- 시퀀스 `GRANT` to anon
- `phase2_orders_status_canceled_and_dev_anon_select` 마이그레이션 내 `anon SELECT` 6개
- **Phase B 추가** (`20260424000000_phase_b_products_dev_anon_write.sql`):
  - `products_dev_anon_insert` 정책
  - `products_dev_anon_update` 정책
  - `GRANT INSERT, UPDATE ON mochicraft_demo.products TO anon`
- **Phase B 추가** (`20260424100000_phase_b_inventory_lots_dev_anon_insert.sql`):
  - `inventory_lots_dev_anon_insert` 정책
  - `GRANT INSERT ON mochicraft_demo.inventory_lots TO anon` (UPDATE 제외)
- **수동주문입력 추가** (`add_anon_insert_orders` 마이그레이션):
  - `orders_dev_anon_insert` 정책 (anon WITH CHECK true)
  - `order_items_dev_anon_insert` 정책 (anon WITH CHECK true)
- **수동주문입력 추가** (`create_insert_order_rpc` 마이그레이션):
  - `mochicraft_demo.insert_order(uuid, uuid, date, text, text, text, jsonb)` 함수 (SECURITY DEFINER)
  - `GRANT EXECUTE ... TO anon` — Phase 2 Auth 도입 후 회수 또는 authenticated 전용으로 변경
- **발주서 추가** (Phase 3.14):
  - `mochicraft_demo.purchase_order_items` 테이블 신규 생성 (purchase_order_id FK CASCADE, product_id FK, quantity INT, unit_price_usd NUMERIC)
  - `anon_all_purchase_orders` 정책 (anon ALL USING true WITH CHECK true) — 롤백 SQL: `DROP POLICY "anon_all_purchase_orders" ON mochicraft_demo.purchase_orders;`
  - `anon_all_purchase_order_items` 정책 (anon ALL USING true WITH CHECK true) — 롤백 SQL: `DROP POLICY "anon_all_purchase_order_items" ON mochicraft_demo.purchase_order_items;`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON mochicraft_demo.purchase_order_items TO anon`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON mochicraft_demo.purchase_orders TO anon`
  - 롤백 시 테이블도 제거: `DROP TABLE mochicraft_demo.purchase_order_items;`
- **거래처 주문서 포털 추가** (Phase 3.15 — `customer_order_portal_phase_3_14` 마이그레이션):
  - `mochicraft_demo.customers.login_id varchar` 컬럼 추가 (NULL 허용) — 롤백: `ALTER TABLE mochicraft_demo.customers DROP COLUMN login_id;`
  - `mochicraft_demo.customers.login_password varchar` 컬럼 추가 (평문, dogfooding 전용) — 롤백: `ALTER TABLE mochicraft_demo.customers DROP COLUMN login_password;`
  - `idx_customers_login_id_unique` 부분 UNIQUE 인덱스 (company_id, login_id) — 롤백: `DROP INDEX mochicraft_demo.idx_customers_login_id_unique;`
  - `mochicraft_demo.customer_order_uploads` 테이블 — 롤백: `DROP TABLE mochicraft_demo.customer_order_uploads CASCADE;`
  - `anon_all_customer_order_uploads` 정책 (anon ALL USING true) — 롤백: `DROP POLICY "anon_all_customer_order_uploads" ON mochicraft_demo.customer_order_uploads;`
  - `GRANT SELECT, INSERT ON mochicraft_demo.customer_order_uploads TO anon`
  - 🟠 Phase 2 Auth 도입 시 `customer_users.password_hash` 로 인증 이관 + 위 컬럼/정책 모두 회수
- **은행거래/미수금 추가** (Phase 3.17~3.18 — `20260624000000_banking_schema_and_v1_seed.sql`):
  - `bank_transactions.exclude_reason TEXT` — 롤백: `ALTER TABLE mochicraft_demo.bank_transactions DROP COLUMN exclude_reason;`
  - `bank_transactions.match_type VARCHAR CHECK (자동/수동/매핑)` — 롤백: `ALTER TABLE mochicraft_demo.bank_transactions DROP COLUMN match_type;`
  - `bank_transactions.moved_to_monthly BOOLEAN NOT NULL DEFAULT false` — 롤백: `ALTER TABLE mochicraft_demo.bank_transactions DROP COLUMN moved_to_monthly;`
  - `bank_transactions` UNIQUE `(company_id, transaction_date, depositor_name, amount)` — 롤백: `ALTER TABLE mochicraft_demo.bank_transactions DROP CONSTRAINT uq_bank_tx_date_depositor_amount;`
  - `customers.match_type VARCHAR NOT NULL DEFAULT 'monthly' CHECK (monthly/daily)` — 롤백: `ALTER TABLE mochicraft_demo.customers DROP COLUMN match_type;`
  - `customers.settlement_cycle` CHECK `(당월/익월/2개월)` 제약 + DEFAULT '익월' 적용 — 롤백: `ALTER TABLE mochicraft_demo.customers DROP CONSTRAINT customers_settlement_cycle_check; ALTER TABLE mochicraft_demo.customers ALTER COLUMN settlement_cycle DROP DEFAULT;`
  - `mochicraft_demo.bank_mappings` 테이블 — 롤백: `DROP TABLE mochicraft_demo.bank_mappings;`
  - `mochicraft_demo.bank_exclude_keywords` 테이블 — 롤백: `DROP TABLE mochicraft_demo.bank_exclude_keywords;`
  - `anon_all_bank_transactions` / `anon_all_bank_mappings` / `anon_all_bank_exclude_keywords` 정책 (모두 anon ALL USING true) — 일반 `_dev_anon_select` 일괄 DROP 스크립트와 별도 회수 필요
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON bank_transactions/bank_mappings TO anon`
  - `GRANT SELECT, INSERT, DELETE ON bank_exclude_keywords TO anon`
  - v1 → OPS 데이터 (bank_transactions 48 / mappings 11 / keywords 7) 는 일회성 INSERT 라 별도 롤백 불필요 (`DELETE FROM ... WHERE company_id = '...'` 로 일괄 제거 가능)
- **은행거래 보강 (Phase 3.19 — `20260624010000_add_target_sales_month_to_bank_transactions.sql`):**
  - `bank_transactions.target_sales_month VARCHAR(7)` 컬럼 — 롤백: `ALTER TABLE mochicraft_demo.bank_transactions DROP COLUMN target_sales_month;`
- **입금 분할 (Phase 3.20 — `20260625000000_create_bank_transaction_splits.sql`):**
  - 신규 테이블 `mochicraft_demo.bank_transaction_splits` (FK CASCADE 2종 + idx 2종 + RLS) — 롤백: `DROP TABLE mochicraft_demo.bank_transaction_splits CASCADE;`
  - `anon_all_bank_transaction_splits` 정책 (anon ALL USING true) — 테이블 DROP 시 함께 제거됨
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON mochicraft_demo.bank_transaction_splits TO anon` — Phase 2 Auth 도입 시 회수

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

## 주문/재고 도메인 규칙 (2026-04-24 확정)

### A. 재고 차감 방식 — 옵션 A (정석 FIFO)

주문 확정 시 inventory_transactions 테이블에 type='out' 레코드 생성.
orders.quantity만 보고 추론하는 방식(옵션 B)은 폐기.

이유:
- DB 스키마가 이미 FIFO 전제로 설계됨 (remaining_quantity, cost_krw/usd, type='out')
- 손익계산서(Phase 5)에서 FIFO 실원가 계산 필요
- 감사 추적 가능 (시점별 재고 재현)

### B. 주문 상태별 재고 연동

- pending: 재고 차감 안 함 (장바구니 단계)
- confirmed / shipped / delivered: 재고 차감 (inventory_transactions insert)
- canceled: 재고 복원 (기존 out 트랜잭션을 삭제하지 않고, 역방향 복원 트랜잭션 추가)

상태 전이 트리거:
- pending → confirmed: out 트랜잭션 생성
- (any) → canceled: 복원 트랜잭션 생성 (감사 추적 위해 기존 것 삭제 금지)

### C. 재고 음수 금지 + 저장 시점 스냅샷 원칙

**핵심**: 재고는 어떤 경우에도 음수가 될 수 없음.
**핵심**: 주문서는 저장되는 그 순간의 재고 상태로 확정되고, 이후 다른 주문 변동에 소급 영향받지 않음.

작동 방식:
1. 주문 저장 시점에 가용 재고 확인
2. 요청 수량 > 재고면 → 확정 수량 = 재고로 clamp (부족분은 0 출고)
3. 저장 후 다른 주문이 취소/수정되어 재고가 복구되어도 → 이미 저장된 주문서는 건드리지 않음
4. 복구된 재고는 그 이후 새로 들어오는 주문서에만 적용

### D. 이중 수량 모델 (order_items)

거래처 요청 의도를 보존하기 위해 한 라인에 두 수량을 공존시킴:

- requested_quantity (신규 추가 필요) = 거래처가 원래 요청한 양
- quantity (기존 컬럼) = 실제 출고 확정 양

UX 표시 규칙:
- 두 값이 다르면: 흐린 숫자(placeholder)로 requested_quantity 표시 + 진한 input으로 quantity 편집
- 두 값이 같으면: quantity 하나만 표시 (중복 제거)

재고 0 상품 처리 (중요):
- 거래처가 재고 0인 상품을 10개 요청해도 라인을 삭제하지 않음
- requested_quantity = 10, quantity = 0 으로 저장
- 이유: 거래명세서에서 "주문했지만 품절이어서 못 받았다"를 거래처가 확인할 수 있어야 함

### E. 수동 수량 편집 시 규칙

사용자가 UI에서 quantity를 수정할 수 있음. 단:
- 변경된 quantity는 재고에 반영됨 (증가분은 재고 차감 추가, 감소분은 재고 복원)
- 재고가 음수가 될 편집은 거부 + 경고 표시
- requested_quantity는 편집 불가 (거래처 원래 의도 보존)

### F. Race condition 처리

- 도그푸딩 환경(1~10인 팀)이므로 복잡한 락킹 불필요
- 단, 주문 저장 시 Supabase RPC 함수로 원자성 보장
  (재고 SELECT FOR UPDATE + inventory_transactions insert를 하나의 트랜잭션으로)

### G. 기존 데이터 처리

- 현재 orders/order_items/inventory_lots/inventory_transactions 전부 truncate 후 시작
- 시드/더미 데이터라 보존 가치 없음
- 향후 기초재고 투입(lot_type='opening')부터 실데이터 축적 시작

### H. 수입/매입 도메인 규칙 (2026-04-24 확정)

Phase 1 (수동 입력) 기준. Phase 2 에서 PDF 파싱이 추가되어도 계산식은 불변.

1. **운송비 배분 — 금액 비율**
   - 공식: `(이 행 합계 USD / 전체 실제 합계 USD) × 운송비 총액 USD`
   - 분모(실제 합계)는 EA 행도 그대로 포함 (예: `992E-20-PAX` 30 EA / $92.40 이슈 해결)
   - 분모 0 또는 운송비 0 이면 배분액 0 — 사용자 경고 후 진행

2. **수입단가 USD = 합계 USD / 입고수량**
   - 입고수량 = DZ 단위면 `qty × 12`, EA 면 `qty` (사용자 override 가능)
   - 별도 "수입원가(USD)" 컬럼은 표시 전용 (= `합계 USD / 원래 수량`, PDF PRICE 칸과 일치, DB 저장 안 됨)

3. **원가 KRW = round((수입단가 + 운송비배분/입고수량) × 환율)**
   - `inventory_lots.cost_krw` 가 INTEGER 제약이라 반드시 `Math.round`
   - `cost_usd` = 수입단가 + 낱개 배분 운송비 (numeric)
   - 환율·입고수량 0 이하면 계산 결과 0 (UI "—" 표시)

4. **Invoice # 중복 — DB UNIQUE 차단**
   - `idx_import_invoices_unique_number` : `UNIQUE(company_id, invoice_number) WHERE deleted_at IS NULL`
   - Postgres 23505 → "이미 등록된 Invoice #" Toast (애플리케이션 레벨 사전 체크 없음, DB 강제)
   - 멀티테이블 트랜잭션 부재 → `inventory_lots` bulk INSERT 실패 시 `import_invoices` HARD DELETE 보상

5. **코드 매칭 — 대시 제거 정규화**
   - 원본 `"720-01-001"` → `"72001001"`, `"992E-20-PAX"` → `"992E20PAX"`
   - `products.code` 와 정확 일치해야 매칭. 미매칭 행은 입고확정 비활성 사유.

---

## 6. 알려진 TODO (나중에 일괄 정리)

### 수입/매입 Phase 2 — PDF 업로드 + 자동 파싱
- 의존성: `pdfjs-dist` 도입 (브라우저 PDF 파싱)
- Angelus 인보이스 포맷 정규식 파서 (PO# · Date · Item # · Description · QTY · PRICE · AMOUNT · Total)
- 행 순서 무관 필드 매칭 (컬럼 정렬 흐트러져도 추출)
- 파싱 결과 → 기존 `ImportRowsTable` 에 바로 주입 (수동 입력 UI 재사용)
- 파서 실패 케이스: 사용자 수동 입력으로 폴백

### 주문 페이지 착수 시 선결 작업
- 마이그레이션: mochicraft_demo.order_items 에 requested_quantity INT NOT NULL DEFAULT 0 컬럼 추가
- Supabase RPC 함수 작성: create_order_with_stock_check(주문 저장 + 재고 검증 + out 트랜잭션 생성을 원자적으로)
- src/utils/inventory.ts 는 수입/매입 계산 전용으로 이미 사용 중 — 주문용은 다른 파일로 분리 (예: `src/utils/ordering.ts`) 또는 기존 파일에 네임스페이스 추가
- 기존 orders/order_items/inventory_* 테이블 truncate

## 🟠 알려진 이슈 — Supabase 타입 재생성 한계 (2026-06-24)

- **Supabase MCP `generate_typescript_types` 는 `public` 스키마만 반환** — 본 프로젝트의 `mochicraft_demo` 스키마는 미지원.
- 결과: DB 스키마 변경 (테이블/컬럼 추가) 시 `src/types/database.ts` 의 `Database` 제네릭을 **수동 패치 필요**.
- 미패치 상태로 `npm run build` (`tsc -b`) 시 TS2769 다발로 실패.
- 회피: 새 테이블/컬럼 마이그레이션 직후 동일 세션에서 `src/types/database.ts` 의 `mochicraft_demo.Tables` 블록에 Row/Insert/Update 3종을 직접 추가.
- 🟡 단순 `npx tsc --noEmit` 만 돌리면 통과해버림(루트 `tsconfig.json` 이 `files: []` 라 아무것도 포함 안 함). **반드시 `npm run build` 또는 `npx tsc -b --noEmit` 로 검증**.

## ⏸ 보류 항목 (2026-06-24)

- **거래처 정산주기/입금매칭 필드 편집 UI** — 현재 `CustomerDetailPane` 은 read-only. 정산주기(`settlement_cycle`) / 입금매칭(`match_type`) 편집은 인라인 select 또는 별도 편집 모달 신설 필요. 비활성 상태인 "거래처 추가" 모달과 함께 일괄 신설 권장. 별도 세션에서 처리.

---

## 🔴 미해결 이슈 — 리사이저 (2026-04-24)

### Split 리사이저 회귀
- 증상: 좌우 split에서 오른쪽 패널 너비를 키우면 왼쪽 패널과 겹침 (덮어쓰기)
- 범위: 4페이지(Home/Orders/Customers/Products) 전부
- 시점: Phase A 2차(전역 핸들 UX 개선 + 전체 페이지 적용) 이후 회귀
- 원인 미확정: 1차 구현 비교 diff 필요

### UX 방향 재검토 (우선 고려)
- 사용자 제안: **우측 상세 패널 제거 → 행 클릭 시 Drawer/Modal 표시**
- 장점:
  · Split 리사이저 자체가 불필요 → 회귀 이슈 소멸
  · 목록 영역 100% 활용, 컬럼 가독성 개선
  · 상세는 더 넓은 공간에서 깊이 있게 표현 가능
- 영향 페이지: Products / Customers / Orders 3개
- 접근 방식 결정 필요: 우측 Drawer (슬라이드) vs 중앙 Modal
- 결정되면 공용 `<DetailDrawer>` 또는 `<DetailModal>` 컴포넌트 제작 후 일괄 적용

### 임시 운영
- 현재 split 회귀가 있으므로, 사용 중 좌우 패널 너비 조정은 최소화 권장
- 컬럼 드래그는 정상 동작 (`useResizableColumns` 는 문제 없음)

> ⚠️ PR #4 (2026-04-25) 머지로 ProductsPage / ProductListTable / ProductFilterBar 코드 변경됨. 위 회귀 이슈 재검증 필요.

---

### ✅ 카테고리 영/한 매핑 일원화 — 완료 (2026-04-24, `c48e53b`)
- **결과물**: `src/constants/categories.ts`
  - `PRODUCT_CATEGORIES` (as const) + `ProductCategoryKey` union
  - `CATEGORY_LABELS` / `getCategoryLabel(key)` / `CATEGORY_OPTIONS`
  - 매핑 누락 키는 원본 반환(안전 폴백) — 레거시/커스텀 카테고리 보호
- **사용법**:
  ```ts
  import { getCategoryLabel, CATEGORY_OPTIONS } from '@/constants/categories';
  // 목록·상세: getCategoryLabel(p.category) → '페인트'
  // select: CATEGORY_OPTIONS.map(o => <option value={o.value}>{o.label}</option>)
  ```
- **적용**: ProductFilterBar / ListTable / DetailPane / Form 전부 이 모듈 경유. DB 저장값은 영문 유지.

### ✅ Toast 전역 Provider 승격 — 완료 (2026-04-24, `220d27d`)
- **결과물**: `ToastProvider`, `useToast()` 훅 (`src/components/ui/Toast.tsx`)
- **Provider 래핑**: `main.tsx` — `BrowserRouter > ToastProvider > App`. 다른 페이지는 훅만 호출하면 즉시 사용 가능.
- **사용법**:
  ```ts
  const { showToast } = useToast();
  showToast({ kind: 'success', text: '저장했습니다' });
  // kind: 'success' | 'error' | 'info', duration 생략 시 2500ms
  ```
- **정책**: 단일 슬롯(한 번에 하나). 연속 호출 시 기존 토스트 즉시 교체 + 타이머 재시작.

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

### 🔴 (최우선) 입금 분할 + 허용 오차 브라우저 검증 — Phase 3.20
이번 세션에서 `a859b42` + `1e2fcf3` 로 구현 완료. **브라우저 검증 미수행**. 다음 세션 진입 시 다음을 우선 확인:

- **`bank_transaction_splits` 테이블** (신규) — Supabase 대시보드에서 정상 생성 / RLS 정책 / GRANT 확인.
- **LedgerTab [분할] 버튼**:
  - matched 행 우측 액션에 [분할] 노출, 기존 분할 있으면 `text-blue-600 (N)` 강조 + tooltip `분할 N건`.
  - 클릭 → `SplitModal` 오픈, 기존 분할이 있으면 그대로 로드, 없으면 원본 금액으로 1행 시드.
  - 행 추가/삭제, 매출월 select(과거 12개월), 금액 input, 메모(선택).
  - 하단 카드 — 원본 / 합계 / 차이. `차이 = 0` 일 때만 [저장] 활성.
  - 기존 분할이 있으면 좌측 [분할 해제] 버튼 — 빈 배열 저장으로 전체 DELETE.
  - 저장 후 토스트 (`분할 N건 저장 완료` / `분할 해제 완료`).
- **`calcMonthlyReconciliation` 동작** — 분할이 있는 입금은 `splits` 합계로 매출월 귀속, `target_sales_month` / 자동 매칭은 무시됨. MonthlyTab / ReceivablesPage 가 즉시 반영하는지 확인.
- **허용 오차 100원** — 매출-입금 차액이 ±100 이내일 때 상태가 '정산완료' / 색상 green / 미수 카드의 잔액 카운트 제외. 십원 절사 / 합산 입금 / 잔돈 차액 케이스로 테스트.
- 확인된 버그는 우선 수정.

### (그 다음 후보) 거래처 편집 UI
- `CustomerDetailPane` read-only → 인라인 편집 또는 편집 모달 신설.
- 필수 필드: `settlement_cycle` (당월/익월/2개월) · `match_type` (monthly/daily) · contact1/2 / email / 등급 / 별칭 / 활성 여부.
- 비활성 상태인 "거래처 추가" 모달도 같이 신설 권장.
- `useUpdateCustomer` / `useCreateCustomer` mutation 훅 신설 필요.

### (그 다음 후보) 송장대장 — `/sales/invoices`
- 주문/매출 데이터 기반 송장 발행/조회 화면. 거래처별·월별 묶음 출력.

### (그 다음 후보) 세금계산서 — `/finance/tax-invoices`
- `mochicraft_demo.tax_invoices` 테이블 기존 존재 (조회만 필요 시 그대로, 발행 플로우는 별도 RPC 설계).
- 공급가액 역산은 `calcSupplyAmount(totalAmount)` 활용.

### (그 다음 후보) 손익계산서 — `/finance/pnl`
- **`calcCostOfSales` 선행 구현 필요** (FIFO 로트 소비 로직 — `inventory_lots.remaining_quantity` × `cost_krw` 차감 누적).

### (참고) Phase 3.17~3.19 잔여 브라우저 검증
- KB 엑셀 (개인 + **사업자**) 업로드 → 미리보기 모달 → 저장 → 중복 검증
- 거래처 인라인 select, 제외 → 키워드 자동 등록 confirm
- 매핑 룰 추가 시 소급 자동 매칭 toast (N건) 확인
- 월별 정산표 합계/색상 + 입금일자 2번째 줄 표시
- LedgerTab matched 행 "매출월" select — 자동/YYYY-MM 변경 즉시 DB 반영 → MonthlyTab/ReceivablesPage 반영, '자동' 선택 시 자동 매칭 복귀
- 미수금 카드 정렬 + 상세 모달 누적미수금/연체일수 계산

### ~~(완료) 매출분석 페이지~~ ✅ Phase 매출분석 (`5853096`)
### ~~(완료) 은행거래~~ ✅ Phase 3.17 (2026-06-24)
### ~~(완료) 미수금 관리~~ ✅ Phase 3.18 (2026-06-24)
### ~~(완료) 수입/매입 Phase 2~~ ✅ Phase 3.13 (2026-06-23)
### ~~(완료) 발주서 페이지~~ ✅ Phase 3.14 (2026-06-24)
### ~~(완료) 거래처 주문서 포털~~ ✅ Phase 3.15 (2026-06-24)
### ~~(대안) 수동주문입력 페이지~~ ✅ 완료 (Phase 3.11)
- 구현됨: `/sales/order-entry`
- 단, 도메인 규칙 D(`requested_quantity` 이중 수량 모델)과 B/C(주문 상태별 재고 차감, `inventory_transactions` out)는 **미적용**. 현재는 단순 INSERT (재고 검증/차감 없이) → 본격 운영 전 RPC를 `create_order_with_stock_check` 로 보강 필요.

### 후속 페이지 (우선순위 무관)
- `/sales/invoices` — 송장대장
- `/finance/tax-invoices` — 세금계산서 발행
- `/finance/pnl` — 손익계산서 (`calcCostOfSales` 선행 필요)

### 사용 가능한 공용 인프라 (재확인)
- `useToast()` · `Modal` · `ConfirmDialog` · `useResizableSplit` · `useResizableColumns`
- `koreanSort` · `getCategoryLabel` / `CATEGORY_OPTIONS`
- `fetchAllRows` · `useCompany()` · `calcCurrentStockByProduct`
- **신규 (Phase 3.9)**: `src/utils/inventory.ts` 순수 계산 9종 (`normalizeSourceCode` · `computeAdjustedQuantityDefault` · `computeSourceUnitPriceUsd` · `computeUnitPriceUsd` · `computeShippingAllocationUsd` · `computeCostKrw` · `computeLineTotalKrw` · `computeInvoiceActualTotalUsd` · `hasSignificantTotalDiff`)
- **신규 (Phase 3.17~3.18)**:
  - `src/utils/bankParser.ts` — `parseKBBank(file)` · `applyAutoMatch(rows, mappings, keywords, customers)` · `ParsedBankRow` / `MatchedBankRow`
  - `src/utils/calculations.ts` — `calcDueDate` · `calcMonthlyReconciliation` · `calcReceivableCards`
  - `src/hooks/useBanking.ts` — 조회 4 + mutation 6 = 10 훅

### 옵션 — Auth 우선
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
- 타입체크: `npx tsc --noEmit` (커밋 전 필수) — **단, 루트 tsconfig.json 이 files:[] 라 이걸로는 미감지. `npm run build` 로 검증할 것**

### 최근 커밋 (2026-06-25 세션 — 은행거래 버그수정 & 운영 보강)
- `1e2fcf3` fix(banking): 허용 오차 100원 이하 차액 정산완료 처리
- `a859b42` feat(banking): 입금 분할 기능 + 허용 오차 정산완료 처리 (bank_transaction_splits 신설)
- `0df63f0` docs: SESSION_HANDOFF 갱신 — 은행거래 버그수정 및 운영 메모
- `33dee9c` feat(banking): 입출금 장부 정산이동 컬럼 UI 숨김 (DB 컬럼 유지)
- `356a7e9` fix(banking): KB 사업자계좌 엑셀 포맷 자동 감지 지원
- `63cef51` fix(banking): 입금 허용 구간 기반 매출월 매칭 (익월=다음달 1일~말일+7일)
- `f045d69` feat(banking): 입금 매출월 수동 지정 기능 (target_sales_month)
- `67fa309` feat(banking): 매핑 룰 추가 시 기존 미매칭 거래 소급 자동 매칭
- `5e93363` fix(banking): 정산마감일 UTC 오프셋 수정 + ±7일 유예범위 매칭
- `2d76508` fix(banking): 익월정산 입금-매출월 역산 매칭 + 입금일자 표시

### 최근 커밋 (2026-06-24 세션 후반 — 은행거래/미수금)
- `f1a25a1` docs: SESSION_HANDOFF 갱신 — 은행거래/미수금 페이지 완료 (Phase 3.17~3.18)
- `7516bae` feat(banking): 은행거래/미수금 페이지 구현 (3탭 + 카드형 현황)
- `541f415` feat(banking): 파서/계산/훅 — KB엑셀 파싱, 자동매칭, 미수금 계산
- `118e1f8` feat(banking): DB 스키마 + TS 타입 — bank_mappings/exclude_keywords/payment_cycle

### 이전 커밋 (2026-06-24 세션 전반)
- `5853096` feat: 매출분석 페이지 구현 (월별/일별/제품별)
- `2f64b8e` fix: 주문상세 판매가 컬럼 복원 (sell_price 조회 추가)
- `311d2cf` feat: 주문내역 UI 개선 (헤더축소/필터한줄/수량인라인편집)
- `55bc563` fix: 주문상세 판매가/공급가 컬럼 표시 오류 수정
- `2d7ad4e` fix: 주문내역 합계를 공급가 기준으로 수정
- `fd3bd26` fix: 주문내역 공급가 grade 기반 계산으로 수정
- `9aac91c` fix: 주문 INSERT unit_price를 판매가→공급가로 수정
- `e648662` fix: 파일 업로드 주문서 파싱 및 전송 구현
- `5dc6f5a` fix: 거래처 주문입력 공급가 calcSupplyPriceByGrade로 수정
- `bcc83e7` fix: 거래처 주문 INSERT/조회 컬럼명 오류 수정
- `0408ac5` feat: 거래처 직송 정보 테이블 9컬럼 재구성
- `3ac2b88` feat: 거래처 주문내역 UI v1 형식으로 개선
- `717a8e1` fix: 거래처 페이지 버그 수정 (주문전송/직송붙여넣기/카카오삭제/월별조회/기본필터)
- `9cc9d6f` fix: 거래처 로그인 schema 명시 수정
- `ee86056` fix: Vercel SPA 라우팅 설정 추가 (vercel.json)
- `e5971a5` feat: 거래처 주문서 업로드 페이지 구현 (/customer-order)
- `de0a7de` fix: 발주수량 컬럼명 변경 및 반올림 로직 수정
- `afad672` fix: 발주서 카테고리 단일 선택으로 변경
- `5b72555` feat: 발주서 페이지 구현 (PurchaseOrderPage)
- `a01155e` feat: 발주서 페이지 구현 (PurchaseOrderPage)

### 이전 세션 커밋 (2026-06-23 세션)
- `98ed073` fix(order-entry): 10행 고정 스크롤 + 수량 초기값 제거
- `d10a195` fix(order-entry): 초기 입력 행 수 10 → 50
- `ff868dd` fix(order-entry): 레이아웃 좌우 분할 — 우측 미리보기 패널 확대
- `ca6d7a2` feat(order-entry): 스프레드시트 UX 전면 재구현
- `8c9aace` feat(order-entry): 엑셀 파싱 활성화 (xlsx 패키지 추가)
- `f3487c6` feat(order-entry): 좌입력/우미리보기 분할 + 파일업로드 + 거래처검색 + 단축키
- `27c1d1e` feat(sales): 수동주문입력 페이지 구현 (Phase 3.11 시작)
- `8c6d731` feat(orders): 등급별 공급율 컬럼 추가 및 공급가 계산 로직 수정
- `94927df` feat(orders): 상세 패널 아이템 테이블 개선 — 공급가 컬럼, 수량 수정, 반품추가/주문추가/저장

### 이전 세션 커밋
- `975584a` PR 1.5: Products 페이지 사용자 검증 후속 개선 (요약/초기화/체크박스) (#4) [2026-04-25]
- `b61d6ef` feat(products): Phase A — 재고현황 스타일 레이아웃 + 재고수량 필터 (#3)
- `695a562` feat(inventory): 안전재고/발주점 풀패키지 (마이그레이션 + UI + 홈 경고) (#2)
- `34c4a13` feat(dogfooding): Supabase 연동 + N+1 리팩토링 + 타입 엄격화 (#1)
- `810a6ea` docs: SESSION_HANDOFF 갱신 — 수입/매입 Phase 1 완료 반영
