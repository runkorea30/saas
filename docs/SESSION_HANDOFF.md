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
| Phase 4 | 나머지 6 페이지 + Auth 도입 | 대기 |

**페이지 진도: 7 / 13 구현 완료**

- `/` — 홈 대시보드 (KPI + Today + Chart + Timeline)
- `/sales/orders` — 주문내역 (필터/목록/상세 split, 상세에서 수정/저장/반품추가/주문추가)
- `/sales/order-entry` — 수동주문입력 (좌입력/우미리보기, 자동완성, 엑셀파싱, Ctrl+S)
- `/settings/customers` — 거래처 (목록/필터/상세 split)
- `/inventory/products` — 제품리스트 (CRUD + 모달 + 체크박스 + 필터 초기화)
- `/inventory/stock` — 재고현황 (기초재고 투입 + 재고조정 + KPI)
- `/inventory/purchase` — 수입/매입 Phase 1 (수동 입력 + 입고확정, PDF 파싱은 Phase 2)
- 나머지 6 경로는 전부 `<PlaceholderPage />` 상태

---

## 후속 PR 로드맵 (2026-06-23 갱신)

- **다음 후보 (택1)**:
  - **수입/매입 Phase 2** — PDF 업로드 + Angelus 인보이스 자동 파싱
  - **발주서 페이지** (`/inventory/purchase-orders`) — `calcOrderSuggestion` 이미 구현됨
  - **송장대장** (`/sales/invoices`)
  - **미수금** (`/finance/receivables`)
- **PR 2 (예정)**: Products 엑셀 업로드 — XLSX 템플릿, 프리뷰, 일괄 추가
- **PR 3 (예정)**: Products 일괄 수정 — 체크된 행의 판매가/공급가/USD 등 동시 변경. PR 1.5 (#4) 의 체크박스 컬럼이 이 PR을 위한 사전 준비
- **Phase B (예정)**: Products 행 클릭 상세 펼침
- **Phase C (예정)**: 컬럼 선택/드래그 + 사용자별 UI 설정 DB 저장
- **수동주문입력 후속**:
  - 컬럼간격 드래그 리사이저 (현재는 fixed/flex 토글만)
  - 우상단 "자동수집 OFF" + "수집/팩스" 영역 (의미 미정의)
  - 파일 자체를 서버 업로드 (현재는 클라이언트 미리보기만)

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

### (권장) 수입/매입 Phase 2 — PDF 업로드 + 자동 파싱
- 경로: `/inventory/purchase` (기존 페이지 확장)
- 지위: Phase 1 수동 입력이 이미 동작하므로 PDF 파서만 끼워 넣으면 됨. Angelus Invoice #80966 실사용 검증 완료.
- 작업 범위:
  - `pdfjs-dist` 의존성 추가
  - 헤더 폼 상단에 "PDF 업로드" 버튼 신설 → 파일 선택 시 파싱 실행
  - Angelus 포맷 파서: PO# / Invoice Date / Total USD / Shipping / Line items 추출
  - 파싱 결과를 `setHeader` + `setRowInputs` 로 주입 → 나머지 로직(계산·매칭·입고확정)은 전부 재사용
  - 파서 실패 시 Toast 경고 + 수동 입력 폴백 유지

### (대안) 발주서 페이지
- 경로: `/inventory/purchase-orders`
- 독립적이며 `purchase_orders` 테이블 이미 존재. 수입/매입 의존성 없음.
- `calcOrderSuggestion(companyId, productId)` 이미 구현됨 (과거 6개월 판매 기반 DZ 추천).

### ~~(대안) 수동주문입력 페이지~~ ✅ 완료 (Phase 3.11)
- 구현됨: `/sales/order-entry`
- 단, 도메인 규칙 D(`requested_quantity` 이중 수량 모델)과 B/C(주문 상태별 재고 차감, `inventory_transactions` out)는 **미적용**. 현재는 단순 INSERT (재고 검증/차감 없이) → 본격 운영 전 RPC를 `create_order_with_stock_check` 로 보강 필요.

### 후속 페이지 (우선순위 무관)
- `/sales/invoices` — 송장대장
- `/finance/receivables` — 미수금
- `/finance/banking` — 은행거래 (입금 매칭)
- `/finance/tax-invoices` — 세금계산서 발행
- `/finance/pnl` — 손익계산서 (`calcCostOfSales` 선행 필요)

### 사용 가능한 공용 인프라 (재확인)
- `useToast()` · `Modal` · `ConfirmDialog` · `useResizableSplit` · `useResizableColumns`
- `koreanSort` · `getCategoryLabel` / `CATEGORY_OPTIONS`
- `fetchAllRows` · `useCompany()` · `calcCurrentStockByProduct`
- **신규 (Phase 3.9)**: `src/utils/inventory.ts` 순수 계산 9종 (`normalizeSourceCode` · `computeAdjustedQuantityDefault` · `computeSourceUnitPriceUsd` · `computeUnitPriceUsd` · `computeShippingAllocationUsd` · `computeCostKrw` · `computeLineTotalKrw` · `computeInvoiceActualTotalUsd` · `hasSignificantTotalDiff`)

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
- 타입체크: `npx tsc --noEmit` (커밋 전 필수)

### 최근 커밋 (2026-06-23 세션)
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
