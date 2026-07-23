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
| Phase 3.21 | 세금계산서대장 페이지 (`/finance/tax-invoices`) — 사업자번호 단위 발행 + 국세청 일괄발급 엑셀 다운로드 | ✅ 완료 (2026-06-25) |
| Phase 3.22 | 미수금 페이지 — 월별 정산마감 기준 미수금/정산대기 재계산 + 카드 배경색 3단계 + 필터 4종 | ✅ 완료 (2026-06-25) |
| Phase 3.23 | 주문내역 UI 정리 + 거래명세서 인쇄 + 재고부족 자동조정 + 수동주문 공급가 폴백 | ✅ 완료 (2026-06-25) |
| Phase 3.24 | 수입 입고 예정일 4탭 카드 (페덱스/해상운송/품절/재고부족) + 제품 일괄삭제/일괄수정/노출금지 | ✅ 완료 (2026-06-25) |
| Phase 3.25 | 청구서 페이지 (`/sales/billing`) — 거래처+연월 선택, 날짜별 그룹핑, 알파문구 거래명세서 분기, 인쇄 | ✅ 완료 (2026-06-25) |
| Phase 3.26 | 청구서 이메일 발송 탭 — Gmail SMTP (Vercel API Route + nodemailer), billing_email 기반 거래처 체크박스, 알파문구 PDF+XLSX 첨부 | ✅ 완료 (2026-06-25, 배포 후 발송 검증 필요) |
| Phase 3.27 | 통관서류 탭 (`/inventory/purchase` 통관서류) — PDF→Claude 파싱 + 엑셀 다운로드, 원산지증명서 업로드/다운로드, 코드매핑 관리 UI | ✅ 완료 (2026-06-27) |
| Phase 3.28 | 인보이스 검증 대폭 개선 — 셀 포커스 시각화, sessionStorage→DB 저장(`invoice_verifications`), 단가/주문수량/주문단가 편집, 행 개별 삭제/수동 추가, order_only 행 주문코드 편집 병합 재매칭, 제품분류/제품명 정렬+불일치 최상단, 금액 합계 요약 바, products 로드 전 비교 가드+unknown 자동 재매칭 | ✅ 완료 (2026-06-27) |
| Phase 3.29 | 발주서 페이지 — 1개월/3개월 기준 토글 (`calcSalesQty1m` 폴백) | ✅ 완료 (2026-06-27) |
| Phase 3.30 | 홈 발주 필요 금액 위젯 (`OrderNeedWidget`) — 1m/3m 기준 + 목표금액 입력, 재고 부족분 실시간 계산. 발주서 페이지 목표금액 위젯은 제거(홈으로 통합) | ✅ 완료 (2026-06-28) |
| Phase 3.31 | 미수금 페이지 — 이번달/다음달 입금예정 정산대기 카드 2개 추가, `due_date` 기반 `pendingByEntity` 월별 분리 | ✅ 완료 (2026-06-28) |
| Phase 3.32 | 재고실사 페이지 (`/inventory/audit`) 신규 — 실사 목록/시작/입력/확정 4단계, `inventory_audits` + `inventory_audit_items` 테이블, GENERATED `diff` 컬럼 사용, 카테고리 정렬+필터, counted_qty=null은 일치로 간주, 확정 시 `inventory_transactions` adjustment_in/out 생성 | ✅ 완료 (2026-06-28) |
| Phase 3.33 | 모바일 동기화 — 발주서 1m/3m 토글 + 목표금액 KPI 카드, 재고실사 페이지(`/mobile/audit`, 인라인 confirm 시트), `BottomNav` 더보기 메뉴에 재고실사 추가, ImportPage `companyId` prop + 전체삭제 버튼 + 통관서류 탭 | ✅ 완료 (2026-06-28) |
| Phase 4 | 나머지 페이지 + Auth 도입 | 대기 |

**페이지 진도: 14 / 15 구현 완료** (`/finance/pnl` 만 남음, `/sales/invoices` 는 placeholder 유지)

- `/` — 홈 대시보드 (KPI + Today + Chart + Timeline)
- `/sales/orders` — 주문내역 (필터/목록/상세 split, 상세에서 수정/저장/반품추가/주문추가)
- `/sales/order-entry` — 수동주문입력 (좌입력/우미리보기, 자동완성, 엑셀파싱, Ctrl+S)
- `/settings/customers` — 거래처 (목록/필터/상세 split)
- `/inventory/products` — 제품리스트 (CRUD + 모달 + 체크박스 + 필터 초기화)
- `/inventory/stock` — 재고현황 (기초재고 투입 + 재고조정 + KPI)
- `/inventory/purchase` — 수입/매입 Phase 1 + Phase 2 (수동 입력·입고확정 + PDF/XLSX 자동 파싱)
- `/inventory/purchase-orders` — 발주서 (계산식 기반 발주량 추천 + DZ 반올림 + 카테고리 단일선택 + 1m/3m 토글)
- `/inventory/audit` — 재고실사 (실사 목록/시작/입력/확정, GENERATED diff 컬럼, 카테고리 정렬·필터)
- `/customer-order` — 거래처 주문서 포털 (로그인 + 주문서 업로드 + 직송정보 + 월별 주문내역)
- `/finance/banking` — 은행거래 (KB엑셀 업로드, 자동매칭, 월별정산, 매핑설정)
- `/finance/receivables` — 미수금 관리 (카드형 현황, 월별 누적미수금, 연체일수)
- `/finance/tax-invoices` — 세금계산서대장 (사업자번호 단위 발행, 국세청 일괄발급 엑셀 다운로드)
- `/sales/billing` — 청구서 (거래처+연월 선택, 날짜별 그룹핑, 알파문구 거래명세서 분기, A4 인쇄)
- 나머지 1 경로 (`/finance/pnl`) 는 `<PlaceholderPage />` 상태. `/sales/invoices` 도 placeholder 유지.

**배포**: https://saas-beta-pied.vercel.app (Vercel 자동 배포, GitHub push)

---

## 후속 PR 로드맵 (2026-06-24 갱신, 은행거래/미수금 완료 후)

- **다음 후보 (택1)**:
  - **손익계산서** (`/finance/pnl`) — `calcCostOfSales` 선행 필요 (FIFO 로트 소비)
  - **거래처 편집 UI** — CustomerDetailPane 인라인/모달 편집 (정산주기·입금매칭 포함)
  - **송장대장** (`/sales/invoices`)
  - **매출분석 페이지 심화** — 차트·필터·CSV 내보내기 보강
  - **Auth 도입 + RLS 정책 복원** (§5)
  - **재고 조정 RPC 보강** — 현재 opening lot 의 `quantity` 만 가감, FIFO 도입 시 `remaining_quantity` 동기화 필요
- **PR 2 (예정)**: Products 엑셀 업로드 — XLSX 템플릿, 프리뷰, 일괄 추가
- **PR 3 (예정)**: Products 일괄 수정 — 체크된 행의 판매가/공급가/USD 등 동시 변경. PR 1.5 (#4) 의 체크박스 컬럼이 이 PR을 위한 사전 준비
- **Phase B (예정)**: Products 행 클릭 상세 펼침
- **Phase C (예정)**: 컬럼 선택/드래그 + 사용자별 UI 설정 DB 저장
- **수동주문입력 후속**:
  - 컬럼간격 드래그 리사이저 (현재는 fixed/flex 토글만)
  - 우상단 "자동수집 OFF" + "수집/팩스" 영역 (의미 미정의)
  - 파일 자체를 서버 업로드 (현재는 클라이언트 미리보기만)
- **청구서 페이지 후속** (Phase 3.25 + 수정 2건 완료 후 사용자 명시):
  - [x] ~~알파문구 종합청구서 엑셀 다운로드 기능 구현~~ — `fa7fd7d` 로 완료 (단일 거래처/지점 기준 1행 종합청구서)
  - [ ] 브라우저 실 확인 — 알파문구 거래처 + 데이터 있는 월 선택 → 미리보기/인쇄/엑셀 다운로드 동작 확인 (사용자 진행 예정)
  - [x] ~~이메일 발송 기능 구현~~ — Phase 3.26 (`58ecb34` → `bf8e976`) Gmail SMTP 방식으로 완료
  - [ ] 발송 기록 DB 저장 (발송 일시, 수신자, 상태)
  - [ ] 매월 3일 자동 발송 스케줄 (pg_cron 또는 Edge Function cron)

- **이메일 발송 — 후속 작업** (Phase 3.26 후속):
  - [ ] 이메일 발송 실패 원인 파악 및 수정
    - Vercel 배포 후 테스트 필요 (Deployment created 확인됨)
    - F12 → Network 탭에서 `/api/send-billing-email` 응답 확인
    - Vercel Logs 에서 서버사이드 에러 확인
  - [ ] `BillingEmailTab` "Gmail 연결됨" 버튼 제거 (SMTP 전환 후 불필요)
    - 프롬프트 파일: `remove_gmail_connect_button_prompt.txt` 이미 작성됨
  - [ ] 발송 성공/실패 상태 표시 정상화 (현재 성공해도 실패로 표시될 수 있음)
  - [ ] 발송 이력 DB 저장 (발송 일시, 수신자, 상태) — 추후

- **Gmail 앱 비밀번호 보안** (긴급):
  - [ ] 채팅창에 노출된 앱 비밀번호 삭제 후 재발급
    - https://myaccount.google.com/apppasswords 에서 기존 EmailJS 앱 삭제
    - 새 앱 비밀번호 발급 후 Vercel 환경변수 `GMAIL_APP_PASSWORD` 업데이트

---

## 오늘 추가된 작업 요약 (2026-07-24, 발주서 기준토글·품절필터 + 수입 입고처리 자동화 + 문서관리 1~8)

### 발주서 페이지 (2건)
- **1/2/3개월 기준 토글** (완료, commit `754b2c0`) — `calcSalesQty2m(qty3m)=round(qty3m/3*2)` + `calcSalesQtyByBasis` 헬퍼 추가(`calculations.ts`). 조사 결과 기존 1m/3m도 실제 DB 집계가 아니라 6개월평균 파생값이었음 → 2m도 동일 파생 방식으로 통일.
- **한달내 품절예상 필터** (완료, commit `3866bd1`) — 기존 `days_until_reorder <= 30`(리드타임+입고예정 반영됨) 재사용, 카테고리 필터 옆 토글, 제외카테고리와 독립.

### 수입/매입 — 입고처리 (2건)
- **운임 인보이스 PDF 업로드 → Shipping Cost 자동채움** (완료, commit `a0bc1f1`) — 기존 `parseInvoicePDF` 재사용, Σrows.amount 자동채움(수동수정 가능), 실패 시 fallback.
- **입고확정 시 인보이스 2건 자동 업로드** (완료, commit `45cf576`) — 신규 헬퍼 `src/lib/angelusReceivingUpload.ts`. 제품 인보이스는 `invoice_verifications` 세션 파일 Storage `copy()` 재활용, 운임은 fresh 업로드 → `document_files`(category=angelus_invoice) INSERT, `related_po_reference`로 페어링. `AngelusInvoiceTab` SubtypeBadge graceful 폴백 포함(기존 118건 배지 정상화).

### 문서관리 페이지 (1~8번, 전부 push 완료)
1. 시험검사번호 탭 컬럼 클릭 정렬 — `a093f40`
2. 엔젤러스인보이스 PDF 새 탭에서 열기(다운로드 대신) — `6716de6`
3. 인보이스 합계(total_usd) 표시 — `1d45326`
4. 수신일자 → Ship Date 로 변경 — `898af94`
5. 수입면장 "수입합계금액(KRW)" = (제품_total_usd + 운임_usd) × 환율, 89/93건 계산됨 — `3418229`
6. 화학제품관리시스템 링크(`0be717d`), 주문시스템 탭(`9e5dcd1`), ETD/ETA PDF삽입도구(`901c896`), 입고확정 안내삭제 확인창(`2fd2e78`), 거래처정보 우클릭 팝업(`e4b874a`), 주문내역 내부메모(`orders.internal_note`, 거래처 포털 미노출)(`b7f100d`)
7. **엔젤러스인보이스 제품코드/명 필터** — `3d87520` (+ 백필 스크립트 `1852b28`). 제품 인보이스 60건 전체 `extracted_metadata.line_items` 백필 완료(2,377개 라인, DB 반영). 신규 입고분도 `angelusReceivingUpload`에서 자동 저장. 필터 UI(검색창, line_items 부분일치). 수입면장은 스캔이미지(textLen=0)라 직접 검색 제외.
8. 매칭 품목 카드 UI chip 강조 — `ec228b9` (PDF 자체는 미수정). ✅ 커밋·push 확인 완료(2026-07-24 세션 시작 시 검증).

### 다음 세션 할 일 (우선순위 순)
- **신규 지시서 `documents_new_8features_prompt.md` (9~16번)** — ⚠️ 세션 시작 시점에 레포/홈/Downloads 어디에도 파일 없음. 재확보 필요. 항목 요약:
  - 9. 송금용 PDF 편집 — ETD/ETA 마지막 입력값 기본값 저장
  - 10. 수입면장 — 제품코드/명 간접 검색(엔젤러스 인보이스 line_items 경유, `matched_product_invoice_no` 연결)
  - 11. 은행 송금용 PDF — 제품+운임 인보이스 병합(pdf-lib copyPages)
  - 12. 은행 송금용 PDF — Statement 파일 맨 앞 페이지 선택적 삽입
  - 13. 설정 페이지 — 거래처 탭 기본 선택
  - 14. 제품코드 검색 시 "-" 무시
  - 15. 제품명 다중 검색(쉼표/공백 구분)
  - 16. 매칭 인보이스 요약 팝업(파일명/인보이스번호/Ship Date/제품/수량/금액)
  - 권장 순서: 14 → 15 → 10 → 16 → 9 → 11 → 12 → 13
- **별도 검토 대기**: 인보이스 76474 total_usd 불일치(§ "알려진 데이터 이슈" 참조, 원본 PDF 수동 확인 후 처리). 백필 스크립트 `scripts/phase7-*.mjs` 커밋 여부 확인.

---

## 오늘 추가된 작업 요약 (2026-07-09~10, 주문상세 수량편집 개선 + 인보이스검증 대대적 버그수정 + OCR 오독 관리 신규)

### 1. 주문상세 패널 — 재고음수 방지 · 전체선택 · 자동저장 제거 (완료, commit `040759c`)
- 기존 주문 품목 수량을 인라인으로 수정할 때 blur 시 자동저장되던 것을 제거하고
  "저장하기" 버튼으로 통일. 저장 시 재고 초과분은 신규 행 추가와 동일한 로직으로
  자동 축소(원래 요청 수량은 `original_quantity` 에 남겨 취소선 표시) — 재고가
  음수로 내려가는 것을 방지.
- 수량 입력창 클릭 시 기존 값이 전체선택되도록 `onFocus` 에 `select()` 추가.
- 파일: `src/components/feature/orders/OrderDetailPane.tsx`

### 2. 인보이스검증 — 파일 삭제해도 재업로드되는 문제 (완료, commit `46459c2`)
- 원인 A: 주문서/인보이스 파일 카드의 X 버튼이 로컬 상태만 지우고 DB에 반영 안 됨.
- 원인 B: 발주서 페이지에서 엑셀 다운로드할 때마다 미확정 세션이 무제한 중복 적재
  (실측: 동일 파일명 미확정 세션 3개 발견).
- 재발방지 코드 수정 완료. 기존에 쌓여있던 중복 세션 2건 + Storage 고아 PDF 33개는
  Claude(웹)가 Supabase MCP + Storage API로 직접 정리 완료 (코드 변경 아님).
- 파일: `src/components/feature/import/InvoiceUploadCard.tsx`, `src/lib/invoiceVerification.ts`

### 3. 인보이스검증 — 필터 버튼 다중선택 (완료, commit `1e47c9f`)
- 라디오 방식 단일 `tab` state → `activeTabs`(Set) 다중선택 + OR 필터링으로 전환.
- DB `last_tab`(text 컬럼)엔 콤마로 이어붙인 문자열로 저장/복원 (`serializeTabs`/`parseLastTab`).

### 4. OCR 오독 코드 관리 신규 페이지 (완료, commit `60a6564`)
- 인보이스 PDF 파싱 시 제품코드가 잘못 인식되는 문제(OCR 오독 백로그와 동일 종류) 전체를
  관리하는 용도. "잘못된 코드 ↔ 올바른 코드" 수동 1:1 등록 방식, 한 번 등록하면 이후
  모든 인보이스 비교에 자동 적용.
- 신규 테이블 `mochicraft_demo.code_corrections` (company_id, wrong_code, correct_code,
  note, UNIQUE(company_id, wrong_code)) — Claude(웹)가 Supabase MCP로 직접 생성.
  RLS: `company_anon_access` (FOR ALL USING true), anon에 SELECT/INSERT/UPDATE/DELETE GRANT 완료.
- 신규 탭 "OCR 오독 관리" — `src/components/feature/import/CodeCorrectionsTab.tsx` (신규 파일).
- `compareOrderInvoice` 매칭 직전에 등록된 규칙으로 인보이스 코드를 선치환하도록 통합.
- `normalizeCode` 를 `InvoiceUploadCard.tsx` 에서 export 로 변경해 새 탭에서 재사용.
- 실사용 등록 규칙 4건 이미 등록됨(2-하드/2-소프트 관련, `72201000h/s`, `72204000h/s`).

### 5. 인보이스검증 — "비교 시작" 직후 결과가 사라지는 레이스컨디션 (완료, commit `d8529d8`)
- 마운트 시 진행 중이던 DB 복원 fetch가 사용자가 방금 만든 비교 결과보다 늦게
  도착해 예전 데이터로 덮어쓰는 버그. `restoreObsolete` ref 추가로 방지
  (`handleCompare` 시작 시 무효화 표시, 두 복원 경로 모두에서 체크).
- 잔여 엣지케이스 있음(파싱이 세션목록 로딩보다 오래 걸리는 아주 드문 경우) —
  재현되면 복원 effect에 "비교 진행 중이면 스킵" 가드 추가 필요.

### 6. OCR 오독 매칭 실패 — 코드 끝에 점(...) 미제거 (완료, commit `f69ff4f`)
- 인보이스 PDF 파싱 시 코드가 잘리면 `"72204000H..."` 처럼 끝에 점이 붙어 나오는데
  `normalizeCode` 가 점을 제거하지 않아 등록된 교정 규칙(`72204000h`)과 문자열이
  달라 매칭 실패. `normalizeCode` 에 끝점 제거(`.replace(/\.+$/, '')`) 추가.

### 7. 주문수량 직접입력 시 금액비교 스킵되어 오판정 (완료, commit `4a7070a`)
- "인보이스만" 행에서 `orderPrice` 가 `undefined`(주문 데이터 자체가 없던 상태)로
  남아있으면 `calcStatus` 가 금액 비교를 스킵하고 수량만 같으면 "일치"로 오판정.
  `handleOrderQtyChange` 에서 주문수량 직접 입력 시 `orderPrice` 를 그 순간 0으로
  확정하도록 수정 (화면엔 이미 "0"으로 보이고 있어 시각적 변화 없음).

### ⏸ 보류 중 — 코드 병합 직후 순간적 "일치" 오표시 의심 사례
- `720PT105`(정상 금액불일치 표시) 인접의 `72001004` 행이 코드 편집으로 주문서와
  병합된 직후 화면엔 "일치"로 보였으나, DB에 저장된 실제 데이터는 `amount_diff` 로
  정상이었음(Claude 웹이 직접 조회 확인). 계산 로직(`calcStatus`)도 이 케이스에서
  정확하다는 것을 코드로 재검증함. 스스로 바로잡히는 화면 표시 지연/깜빡임일 가능성.
  **다시 재현되면 추가 조사 필요** — 발생 시 어느 조작(코드 편집 vs 수량 편집) 직후인지,
  화면이 계속 "일치"로 남아있는지 vs 잠깐 그랬다가 바뀌는지 확인 필요.

### 참고 — 코드 변경 아닌 데이터 정리 작업 (Claude 웹이 Supabase MCP/Storage API로 직접 처리)
- `invoice_verifications` 중복 미확정 세션 2건 삭제 (동일 파일명, 인보이스 미첨부 상태)
- `documents` Storage 버킷의 고아 PDF 33개 삭제 (DB에서 참조 안 되는 파일들)

---

## 오늘 추가된 작업 요약 (2026-07-03, 보안 사고 대응 + 인보이스 PDF 자동 이관 + 안내 제품 wipe 재발 방지)

### 1. 보안 사고 대응 (완료)
- **Anthropic API 키 클라이언트 노출**: `VITE_ANTHROPIC_API_KEY` → 서버리스 함수(`api/analyze-invoice.ts`)로 이전. 키 rotate 완료, Vercel에 `ANTHROPIC_API_KEY`(VITE_ 없음)로 등록 완료.
- **Supabase service_role 키 git 히스토리 유출** (`.env.migration`, 커밋 `afa9a59`): 레거시 anon/service_role 키 체계 완전 폐지 → 신규 publishable/secret 키 체계로 전환 완료. `@supabase/supabase-js` `^2.46.1` → `^2.110.0` 업그레이드. Supabase 대시보드에서 "Disable JWT-based API keys" 실행 완료 — 레거시 키 완전 무효화됨.
- **부수 발견 및 조치**: 로컬 개발환경(`npm run dev`)에서 `/api/*` 호출이 안 되던 문제 → `vite.config.ts`에 프로덕션 함수로 프록시 추가.
- git 히스토리 재작성(filter-repo/BFG)은 보류 — rotate로 이미 무력화되어 급하지 않음. 필요 시 별도 승인 후 진행.

### 2. 발주서/수입매입 기능 개선 (완료)
- 재고매입 하위 탭 순서 변경 (수입/매입 ↔ 발주서)
- 발주서 최종결정 화면 엑셀다운로드 버그 수정 (조정된 수량이 반영 안 되던 문제 → DB 재조회 방식으로 수정)
- 발주서 엑셀다운로드에 V1 브랜드 서식 적용 (네이비 헤더, 줄무늬, TOTAL 합계행) — `exceljs` 라이브러리로 전환
- 발주서 엑셀다운로드 → 수입/매입 "인보이스 자동입고"에 자동 반영 (`invoice_verifications` UPSERT, 기존 비교/인보이스 데이터는 안전 방식(a)로 전체 초기화)

### 3. 인보이스 검증 다중 세션 지원 (완료)
- 항공/해상을 동시에 진행 중인 검증을 별도 세션으로 관리 (company_id UNIQUE 제약 제거, 세션 탭 UI 추가)
- 세션 라벨은 다운로드 시각 기준, 완료 시 즉시 삭제

### 4. 인보이스 검증 화면 개선 (완료)
- 코드 인라인 수정 시 자동 재매칭 (`rebuildComparisonFromEdits`)
- "인보이스만" 행에 "↑ 주문서 코드로 수정" 힌트로 방향 정정 (원래 반대 방향으로 잘못 구현됐던 것 수정)
- 인라인 편집 input 글자 안 보이는 문제 수정 (다크 테마 배경/글자색 충돌)
- "비교 시작" 클릭 시 `e.arrayBuffer is not a function` 에러 수정 (자동입고 세션은 File 객체가 아니라 이미 파싱된 order_rows를 직접 사용하도록 분기 처리)

### 5. 인보이스 PDF 자동 이관 → 거래처 안내 설정 (완료, 긴 디버깅 끝에 해결)
- "입고처리로 이관" 클릭 시 인보이스 PDF를 거래처 안내 설정(`document_files`, category=`import_notice_invoice_air`/`sea`)에 자동 반영
- 항공/해상 라디오 선택 후 이관, 매번 최신 파일로 덮어쓰기
- **디버깅 과정에서 밝혀진 것들**:
  - write(이관 저장) 로직은 처음부터 정상 동작했으나, read(화면 표시) 쪽 JSX 조건문이 `rec && publicUrl` 형태로 되어있어 `publicUrl`이 falsy일 때 데이터가 있어도 "없음"으로 표시되던 버그 → `rec` 존재 여부만으로 조건 완화하여 해결
  - `document_files.category` CHECK 제약에 `import_notice_invoice_air`/`sea` 값 누락되어 있어 INSERT 가 조용히 실패하던 문제 → 마이그레이션 `20260703010000_...` 로 allowlist 추가
  - `handleFill` 이 `attachInvoiceToNotice` 를 fire-and-forget 후 즉시 tab 전환 → 타이밍 레이스 → `handleFill` async 화 + await 로 수정, `attaching` 로딩 state 추가
  - `noticeInvoiceReloadKey` counter 를 useEffect deps 에 추가 — portal 탭이 이미 열려있어도 이관 시 재조회 트리거
  - `attachInvoiceToNotice` 실패 시 `setError` (곧 언마운트) 대신 `showToast` (전역, 탭 전환 후에도 표시) 로 변경
  - **부수 사고**: 이 작업 도중 `companies.import_notice_products`(거래처 안내 설정의 "표시할 제품" 목록)가 저장 로직의 전체 필드 UPDATE 방식 때문에 **두 차례 실수로 빈 배열로 초기화됨**. 매번 SQL로 수동 복구함. 최종적으로 원인 수정 완료 및 재현 테스트 통과 확인됨 (날짜 필드만 수정 후 저장해도 제품 목록 유지되는 것 확인).

### 6. UX 개선 (완료)
- 거래처 안내 설정 "전체 삭제" 버튼 — 확인 팝업 + 즉시 자동저장으로 변경 (기존엔 삭제 후 별도로 "저장"까지 눌러야 실제 반영되어 혼란 있었음)

### 7. import_notice_products wipe 재발 방지 (완료, 근본 수정)
- **재발 이력**: 2026-07-03 하루에만 두 차례 `import_notice_products` 가 `[]` 로 wipe.
- **근본 원인**: `handleNoticeSave` payload 가 활성 탭의 전체 필드를 UPDATE. `noticeProducts` state 는 `useEffect(company)` 로 늦게 hydrate. 사용자가 hydration 완료 전에 다른 필드만 수정하고 저장하면 초기값 `[]` 이 DB 를 덮어씀.
- **수정** (커밋 `6a76dc0`): 
  - `persistProducts(nextProducts, seaTab)` 신규 — products 컬럼만 targeted UPDATE
  - `mutateProducts(next)` 신규 — 낙관적 UI + 실패 시 롤백
  - add/remove/PDF 파싱/전체삭제 시 즉시 `mutateProducts` 호출
  - `handleNoticeSave` payload 에서 `import_notice_products` / `import_notice_sea_products` 두 필드 **완전 제거** — 어떤 상황에서도 저장 버튼이 products 를 못 만짐 (구조적 불가능)
  - 데스크톱 `ImportReceivingPage.tsx` + 모바일 `mobile/pages/ImportPage.tsx` 동일 패턴
  - 모바일 `PortalSection` 는 `setActiveProducts` prop → `onRemoveProduct` 콜백 prop 으로 변경 (로컬 state 만 조작하던 경로 제거)

### 8. `import_notice_products` shape drift 대응 (완료)
- DB 에 flat string 배열 `["72001001", ...]` 로 저장된 레거시 데이터가 있으면 `normalizeProductsJson` / `pickNoticeProducts` 가 filter 로 전부 제거 → 화면 0개로 표시되던 문제
- 두 정규화 함수 모두 flat string 도 통과되게 수정 (`{code: str, name: str}` 로 wrap). 정식 shape `{code, name}` 도 그대로 통과.

### 임시 진단 로그 (남겨둠, 별도 커밋으로 정리 예정)
- `[notice-invoice]` (ImportReceivingPage): useEffect 진입/스킵/응답/setState/렌더 시점 state 값
- `[portal-notice]` (CustomerOrderPage): 파트너 포털의 companies row / pickNoticeProducts / render 결과
- 문제 재발 시 즉시 원인 파악 가능하도록 현재는 유지

### 현재 데이터 상태 (2026-07-03 기준)
- `companies.id = 9e13f035-ed4f-4a41-9043-6a585beab221` (런코리아 회사)
  - `import_notice_status`: "도착예정"
  - `notice_title`: "항공운송 수입 입고예정"
  - `import_notice_products`: 14개 항목, `{code, name}` 객체 배열로 정상 저장됨 (복구 완료, 재발 방지 수정도 검증 완료)
  - `import_notice_sea_products`: `[]` (해상 쪽은 아직 데이터 없음)
- `document_files` 에 `import_notice_invoice_air` 카테고리로 인보이스 PDF 1건 정상 연동됨

### 남은 항목 (급하지 않음, 여유 있을 때)
1. `docs/claude-code-execution-prompts.md`, `supabase/migrations/README.md` 에 레거시 `VITE_SUPABASE_ANON_KEY` 예시 문구가 남아있음 — 코드 동작과 무관, 문서만 정리하면 됨
2. git 히스토리 재작성 — rotate로 이미 안전하지만, 완전히 깨끗하게 하고 싶으면 `git filter-repo` 로 별도 진행 (강제 푸시 필요, 진행 전 재승인 필요)
3. 해상(sea) 쪽 거래처 안내 설정 데이터는 아직 입력 안 됨 — 필요 시 나중에 채울 것
4. `[notice-invoice]` / `[portal-notice]` 진단 로그 제거 (별도 커밋)

### 작업 원칙 리마인더
- 모든 Claude Code 지시는 `.md` 파일로 저장 후 전달하는 방식 유지
- 새 기능은 "분석 → 승인 → 진행" 체크포인트 유지
- **오늘의 교훈**: "수정 완료" 라는 보고만 믿지 말고, 가능하면 실제 콘솔 로그/DB 조회로 직접 검증할 것 (오늘 인보이스 PDF 이관 건에서 여러 차례 "고쳤다" 는 보고가 실제로는 미반영이었음이 드러남)

---

## 오늘 추가된 작업 요약 (2026-06-28, 인보이스 검증 + 재고실사 + 홈 위젯)

이번 세션은 Phase 3.27 → 3.33 까지 7개 페이즈가 연달아 진행된 큰 세션. 핵심 변경:

### 1. 통관서류 탭 (Phase 3.27) — `/inventory/purchase` 통관서류 탭
- PDF 업로드 → Claude 파싱 → 통관 메타 자동 매핑 후 엑셀 다운로드
- 원산지증명서 업로드/다운로드 섹션 (합계 패널 내부 버튼 아래에 배치)
- 코드매핑 관리 UI (HS코드 ↔ 제품코드)
- 데스크톱 + 모바일 양쪽 공통 컴포넌트(`CustomsDocTab`) 재사용 — 모바일은 import만

### 2. 인보이스 검증 대폭 개선 (Phase 3.28) — `InvoiceUploadCard`

| 항목 | 내용 |
|---|---|
| 셀 포커스 시각화 | 코드/수량/단가 input 포커스 시 accent 강조 + 행 배경 변경 |
| sessionStorage → DB 저장 | `invoice_verifications` 테이블 (`UNIQUE(company_id)` upsert), 마운트 시 복원, 변경 시 자동 저장 |
| 단가 편집 input | 인보이스 단가 + 주문수량 + 주문단가 모두 인라인 편집, 수정 시 amount/status 재계산 |
| 행 개별 삭제 | `handleDeleteRow` + 행 우측 ✕ 버튼 |
| 행 수동 추가 | `+ 행 추가` 버튼 → 빈 `invoice_only` 행을 최상단 삽입 |
| order_only 코드 편집 | `orderCode` 별도 input → 매칭 행과 자동 병합 (주문 데이터 이식 후 order_only 행 삭제) |
| 정렬 | 1차 불일치 상태 우선(qty_diff/amount_diff/order_only/…→match 맨아래), 2차 제품분류, 3차 제품명 |
| 금액 합계 요약 바 | 인보이스/주문서/차이/검증현황 4카드 — 탭 아래 표시 |
| products 로드 가드 | `canCompare` 에 `products.length > 0`, DB 복원 직후 unknown 행 자동 재매칭 useEffect |

### 3. 발주서 1m/3m 토글 (Phase 3.29) — 데스크톱 + 모바일
- `salesBasis` 상태 → `handleGenerate` 가 `calcSalesQty1m`/`calcSalesQty3m` 분기
- 토스트에 기준 표기 (`X개 품목 · 1개월 기준`)

### 4. 홈 발주 필요 금액 위젯 (Phase 3.30) — `OrderNeedWidget`
- `useOrderNeedEstimate` 훅 신규 — `usePurchaseOrder` 캐시 재활용 (N+1 없음)
- 부족분(DZ) × `unit_price_usd`(DZ당 단가) 합산 — **발주서 페이지 `totalUsd` 와 동일 공식**
  - 초기 버전은 `unit_price_usd × 12` 잘못 곱해서 12배 과대계산 → 수정함
- 1m/3m 토글 + 목표금액 input + 부족/달성 메시지 + 진행률 바
- 발주서 페이지의 목표금액 위젯은 제거 (홈으로 이동)

### 5. 미수금 입금예정 카드 (Phase 3.31) — `ReceivablesPage`
- `pendingByEntity` useMemo 에서 `due_date.slice(0,7)` 기준 이번달/다음달 분리
- 요약 카드 3개 → 5개 (이번달 입금예정 / 다음달 입금예정 추가)
- `SummaryCard.tone` 에 `'warning'` 추가

### 6. 재고실사 페이지 신규 (Phase 3.32) — `/inventory/audit` + `/mobile/audit`
- DB: `inventory_audits` (status: draft/confirmed) + `inventory_audit_items` (UNIQUE(audit_id, product_id))
- `diff` 컬럼은 **GENERATED ALWAYS AS** (counted_qty - snapshot_qty) — 클라이언트 write 금지
  - 초기 v1 은 트리거인 줄 알고 클라이언트에서 diff 작성 시도 → PostgREST 거부 → 제거
- 실사 시작 시 `calcCurrentStockByProduct` 로 전 제품 스냅샷 일괄 insert (100개씩 청크)
- counted_qty = null → 일치로 간주 (확정 시 조정 트랜잭션 생성 안 함)
- 확정 시 차이 항목만 `inventory_transactions` 의 adjustment_in/out 으로 insert (재고 반영)
  - 스펙의 `reference_id` 컬럼은 실제 테이블에 없어서 제외, `memo` 에 실사명 기록
- 정렬: category ASC → name ASC, 카테고리 select 필터
- 모바일은 인라인 confirm 시트 (ConfirmDialog 미사용)

### 7. 빌드 오류 수정
- `inventory_audits.status` 가 `database.ts` 에서 `string` 으로 선언되어 `AuditHeader.status: 'draft' | 'confirmed'` 와 타입 불일치 → narrowing
- 주의: `tsc --noEmit` 단독은 mobile 하위 프로젝트를 다 못 잡음. `npm run build` (`tsc -b`) 로 검증 필수

### 후속 작업
- [ ] 모바일 재고실사 — 큰 데이터셋(800+ 제품) 성능 검증
- [ ] 인보이스 검증 DB 자동 저장의 첫 화면 깜빡임 (skipNextAutoSave 가 가끔 누락되어 즉시 재저장) 정밀 검토
- [ ] 홈 위젯 목표금액 — localStorage 저장 여부 검토 (현재 새로고침 시 4000으로 리셋)

---

## 오늘 추가된 작업 요약 (2026-06-25, 청구서 이메일 발송 탭)

### 청구서 이메일 발송 탭 (Phase 3.26) — `/sales/billing`

이번 세션 4건 커밋 (`58ecb34` → `4ed0dba` → `282ee2b` → `bf8e976`).

#### UI — BillingPage 탭 구성
- 기존 단일 화면을 **"청구서 미리보기" / "이메일 발송"** 두 탭으로 분리.
- 이메일 발송 탭: 연/월 선택 + 거래처 체크박스 목록.
- `customers.billing_email` 이 있는 거래처만 체크박스 활성화 (없으면 disabled + 안내).
- 청구금액 0원 거래처는 목록에서 숨김.
- 알파문구 계열은 PDF + XLSX 2개 첨부, 일반 거래처는 PDF 1개 첨부.

#### 발송 방식 — Gmail SMTP (Vercel API Route + nodemailer)
이전 시도하던 OAuth 방식을 폐기하고 SMTP 로 단순화.

- `api/send-billing-email.ts` (Vercel API Route, nodemailer 사용)
- `src/utils/sendBillingEmail.ts` (프론트 fetch 래퍼)
- `BillingEmailTab` 에서 OAuth 발송 코드 제거, SMTP 호출로 전환 (`282ee2b`).
- 기존 OAuth 관련 코드 정리 (`bf8e976`).

#### DB / 권한 변경
- `customers.billing_email` 컬럼 추가 (DB 마이그레이션 완료).
- `customers` 테이블에 anon UPDATE/INSERT/DELETE 권한 추가 + RLS 정책 수정 (거래처 편집 저장 버그 동시 수정).

#### 환경변수 (Vercel)
- `GMAIL_USER` — 발신 Gmail 주소
- `GMAIL_APP_PASSWORD` — Gmail 앱 비밀번호 (16자리)
- 둘 다 Vercel 환경변수 등록 완료.

#### 거래처 편집 저장 버그 수정 (사이드 픽스)
- **원인**: anon 역할에 `customers` 테이블 UPDATE 권한 없음.
- **수정**: `GRANT INSERT, UPDATE, DELETE ON customers TO anon` + RLS 정책 추가.

#### 알려진 이슈 / 미해결
- Vercel 배포는 트리거되었으나 **실제 이메일 발송 검증은 미수행**.
- 발송 실패 시 원인 파악 절차: F12 Network 탭 + Vercel Logs.
- `BillingEmailTab` 의 "Gmail 연결됨" 버튼은 OAuth 잔재 → 제거 필요 (`remove_gmail_connect_button_prompt.txt` 작성됨).
- 성공/실패 상태 표시가 정상 동작 안 할 수 있음 (성공해도 실패로 표시 가능성).
- **보안 주의**: 채팅창에 노출된 Gmail 앱 비밀번호는 재발급 후 Vercel 환경변수 교체 필요.

---

## 오늘 추가된 작업 요약 (2026-06-25, 청구서 페이지)

### 청구서 페이지 (Phase 3.25) — `/sales/billing`

이번 세션 3건 커밋 (`6708bf3` → `31b5a27`, 범위 `1646779..31b5a27`).

#### 커밋 구성
1. **`6708bf3`** — `feat: BillingPrintView 컴포넌트 신설 (날짜별 청구서/거래명세서)` — 357줄.
2. **`1dc5666`** — `feat: 청구서 페이지 신설 (거래처+연월 선택, 인쇄, 이메일버튼 UI)` — `BillingPage` + `.no-print` CSS, 381줄.
3. **`31b5a27`** — `feat: 청구서 라우팅 및 네비 메뉴 추가` — `/sales/billing` 라우트 + SectionNav 탭 (3줄).

#### 신규 파일
- `src/pages/sales/BillingPage.tsx` — 페이지 (필터 + 미리보기 + 인쇄 portal).
- `src/components/feature/billing/BillingPrintView.tsx` — 인쇄 뷰 (날짜별 그룹핑, 알파문구 거래명세서 분기).

#### 주요 동작
- **필터**: 연도 select (2023 ~ 현재+1) + 월 select (1~12) + 거래처 select (`useCustomers` 재사용, `compareCompanyName` 정렬).
- **데이터**: `useBillingOrders` 신규 훅 — `orders` + 중첩 `order_items` + `products` (sell_price + grade_a~e) 단일 쿼리, `fetchAllRows` 경유.
  - 필터: `company_id` + `customer_id` + `status='confirmed'` + `deleted_at IS NULL` + `order_date .gte(YYYY-MM-01).lt(다음달 1일)`.
  - 정렬: `order_date asc`.
- **날짜 그룹핑**: `useMemo` 로 `order_date` (timestamptz) → KST `YYYY-MM-DD` 변환 후 Map 그룹핑 (`toKstDateKey` 헬퍼, +9h 보정).
- **알파문구 분기**: `customer.name.includes('알파문구')` → 제목 `'거 래 명 세 서'`, 그 외 → `'청 구 서'` (`spacedTitle` 헬퍼로 글자 사이 공백).
  - 알파문구 계열 거래처 7개 모두 `grade='D'`, `email=NULL` 확인.
- **공급가 계산**: 기존 `calcSupplyPriceByCustomerGrade(sell_price, grade, gradeRates)` 재사용 — 새 계산식 함수 없음. `grade`/`gradeRate` 없거나 0 이면 `unit_price` 폴백.

#### 인쇄 인프라 — 기존 거래명세서와 동일 패턴 재사용
- 기존 `.invoice-print-portal` 클래스 (`src/index.css`) + `@media print { body > #root { display:none } body > .invoice-print-portal { display:block } @page { size: A4 portrait; margin: 12mm 10mm } }` 그대로 활용.
- 추가: `.no-print { display:none !important }` 유틸 클래스 추가 (필터 바에 적용).
- 인쇄 트리거: `setIsPrinting(true)` → `setTimeout(() => { window.print(); setIsPrinting(false); }, 300)` — OrdersPage 패턴 그대로.
- `createPortal` 로 `document.body` 직속에 `<div className="invoice-print-portal"><BillingPrintView /></div>` 렌더.

#### 이메일 발송 — UI만 (기능 미구현)
- `useToast` 훅 사용 — `showToast({ kind: 'info', text: '이메일 발송 기능은 준비 중입니다.' })`.
- 후속 구현 시 결정사항 (이전 합의):
  - 서버사이드 PDF 생성 후 이메일 첨부 발송
  - 발송 기록 DB 저장 (발송 일시, 수신자, 상태)
  - 매월 3일 자동 발송 스케줄 (pg_cron 또는 Edge Function cron)

#### 라우팅 / 네비
- `src/App.tsx` — `<Route path="billing" element={<BillingPage />} />` 추가 (송장대장 placeholder 다음).
- `src/components/nav/navConfig.ts` — `/sales` 섹션 items 마지막에 `{ path: '/sales/billing', label: '청구서' }` 추가. 순서: 주문내역 / 수동주문입력 / 매출분석 / 송장대장 / **청구서**.

#### 검증
- `npx tsc --noEmit` → 0 errors.
- `npm run build` → 성공 (5.80s, 1757 modules).
- 브라우저 실 확인은 사용자가 진행 예정 (위 "청구서 페이지 후속" 항목).

### Phase 3.25 후속 패치 (2026-06-25 추가, `890c1ff` → `fa7fd7d`, 범위 `2b1d864..fa7fd7d`)

청구서 페이지 수정 2건 — 3건 커밋.

#### `890c1ff` — 청구서 테이블 컬럼 순서 변경
- **BillingPrintView** thead/tbody 컬럼 순서: `No | 제품명 | 코드 | …` → **`No | 코드 | 제품명 | 수량 | 공급가 | 판매가 | 합계`**.
- 스타일(thCenter/thLeft) 함수는 그대로, 컬럼 자리만 스왑.

#### `57863df` — 알파문구 종합청구서 엑셀 생성 유틸 신설
- **신규 파일** `src/utils/generateAlphaBillingExcel.ts` (+191줄).
- `import * as XLSX from 'xlsx'` 정적 import — 기존 7개 파일과 동일 패턴.
- 14열 aoa 그리드로 원본 양식 재현 (xlrd 분석 기반).
- 시트 구조 (총 13행):
  1. row0 제목 `종   합   청   구   서`
  2. row1 접수일자 `접 수 일 자 :   {nextYear}년    {nextMonth}월  3 일                      ( {month}  )월분`
  3. row2 헤더 (사업장명/건수/청구금액/반품금액/D/C/기타공제/결제액/비고)
  4. row3~ 지점 데이터 (단일 거래처 = 단일 row)
  5. 합계 행
  6. 회사정보 (런코리아/양시혁/대표/010-8981-1434)
  7. 특이사항 + 입고상품명("엔젤러스")
  8. 자금팀 헤더 + 팀장/주임/사원 3행 + 마지막 인사문
- `!cols` 열 너비 14개 (원본 xlrd width 단위 / 256 ≈ 문자 수 근사 변환).
- 파일명: `알파문구_종합청구서_{year}년{month}월.xlsx`.

#### `fa7fd7d` — BillingPage 종합청구서 다운로드 버튼 추가
- `Download` 아이콘 + `import { generateAlphaBillingExcel }`.
- 버튼 위치: 이메일 ↔ 인쇄 사이. `isAlpha === true` 일 때만 노출.
- **집계 로직 변경**: spec 의 `o.total_amount ?? 0` 은 `useBillingOrders` SELECT 에 `total_amount` 컬럼 미포함이라 항상 0 → `order_items.amount` 기반 분리 집계로 변경.
  - 청구금액 = `is_return=false` 항목 amount 합
  - 반품금액 = `is_return=true` 항목 amount **절대값** 합 (DB 저장값이 음수일 수 있음을 가정)
  - 결제액 = 청구금액 − 반품금액
- 단일 거래처(=한 지점) 기준 `branches: [{ branchName, count, totalAmount, returnAmount, settlementAmount }]` 1행 전달.

#### 검증
- `npx tsc --noEmit` → 0 errors.
- `npm run build` → 성공 (5.57s, 1758 modules).
- 브라우저 실 확인은 사용자가 진행 예정 (실제 알파문구 거래처 데이터로 다운로드된 엑셀 양식 비교).

---

## 오늘 추가된 작업 요약 (2026-06-25, 주문내역 UI · 거래명세서 · 재고 자동조정)

### 판매 > 주문내역 페이지 (Phase 3.23) — `/sales/orders`

이번 세션 11건 커밋 (`8ffbece` → `b8b2c5d`).

#### 주문 삭제 기능 (`8ffbece`, `c7ac9d6`)
- `OrderListTable` 행 hover 시 `Trash2` 아이콘 표시. confirm 후 soft delete.
- `order_items` 우선 `deleted_at = NOW()` UPDATE → `orders` UPDATE → invalidate (`orders`, `inventory-stock`).
- 재고는 `calcCurrentStockByProduct`가 `order_items` 판매수량 차감으로 계산하므로 자동 복원 (별도 `inventory_lots` 조작 불필요).
- 에러 핸들링: 단계별 분기 + `error.message` alert 노출. 캐시 키도 `companyId` 포함으로 정확화.
- DB 정책: `anon UPDATE` on `orders` / `order_items` 추가 (사용자가 직접 적용 — 세션 중 RLS 거부 발생 후 보강).

#### 오른쪽 패널 헤더 정리 (`8ffbece`)
- 라인 N건 / 수량 N ea / 총액 N원 stats row 삭제.
- 거래처명 옆에 `138,840원` 형태로 총액 표시.
- 반품추가 / 주문추가 버튼을 헤더 우측으로 이동 (테이블 위 중복 버튼 제거).

#### 인라인 추가 행 자동완성 (`8ffbece`, `4f0fb24`)
- 기존 `<select>` → 코드/제품명 input + 드롭다운 양방향 자동완성.
- 매칭 방식: `includes` (대소문자 무시 부분일치, prefix 아님 — 사용자 명시).
- Enter/Tab 키보드 확정 핸들러 (`handleAutocompleteKeyDown`): 정확일치 / 단일 후보 → 즉시 적용.
- 거래처 grade 기반 공급가 자동계산: `calcSupplyPriceByCustomerGrade(sell_price, grade, product)`.
- 수량 input: 신규 행은 `min=1`, `value` 0일 때 빈 문자열 + `placeholder="수량"`. 기존 행은 0 명시 표시.
- 저장 검증: `'제품을 선택해주세요'` / `'수량을 입력해주세요'` alert 2종.
- 반품 INSERT 시 `quantity`·`amount` 음수 저장 (`calculations.ts`·OrderEntry RPC와 정합).
- 저장 후 `orders.total_amount` 재계산 UPDATE.

#### 헤더·필터·소계 정리 (`4f0fb24`)
- 페이지 헤더 1열에 제목·기간 Segmented·날짜 picker·거래처/상태 MultiChip·엑셀·주문추가 통합 → 요약(건수/총액/순액/평균)은 2열로 분리.
- `OrderFilterBar.tsx` 컴포넌트 사용 0건 → 파일 통째 `git rm`.
- 우측 디테일에서 판매소계/VAT 포함분/합계 KRW 블록 + `TotalRow` 컴포넌트 + `calcSupplyAmount` import 삭제.
- 출고처리/거래명세서/송장인쇄 액션 row 삭제 + `Truck`·`Printer` lucide import 정리.

### 거래명세서 인쇄 (`24f2c02` → `dc6ca94`)

#### 신규 파일 `src/components/feature/orders/InvoicePrintView.tsx`
- 헤더 2단: 좌(거래처 귀하 / 날짜 / 안내문 / 은행계좌) | 우(공급자 테이블).
- 공급자 박스: `rowSpan=4` + width 48px 가로쓰기 + 2컬럼 `&nbsp;` 라벨/값 단순 구조 (초기 `writingMode: vertical-rl` 깨짐 → `91f3863`에서 가로쓰기로 전환).
- 주문 섹션 N개: "주문서" / "추가주문" 배지 + `memo` 에 "직송" 포함 시 옵션 칩 추가. 섹션 헤더에서 날짜·order id 제거 (`9551b8d`).
- 카테고리(`products.category`) 기준 `localeCompare('ko')` 오름차순 정렬 + 변경 시점에 sub-row 삽입 (`dc6ca94`). 빈 카테고리는 헤더 없이 표시.
- 표 컬럼: `No · 제품명 · 코드 · 수량 · 공급가 · 판매가 · 합계` + 소계. No는 섹션 내 카테고리 가로질러 연속 증가.
- 푸터: 받는사람(이름만, 주소/전화 모두 삭제) + 그랜드 합계 (섹션 ≥ 2 일 때만 표시).
- 공급가 계산: `computeSupplyPrice(item, customerGrade)` → `calcSupplyPriceByCustomerGrade`. grade 없거나 결과 0이면 `unit_price` 폴백.
- 합계는 `it.amount` (DB 저장값) 그대로 사용 — 수량 × 공급가 재계산 금지.

#### `OrdersPage` 인쇄 트리거
- 헤더에 `거래명세서 (N)` 버튼 (체크 0건이면 disabled).
- 클릭 시 `filtered.filter(checked)` → `customer_id` 그룹핑 → 각 그룹 주문 날짜 오름차순 정렬 → 거래처명순 정렬.
- `createPortal` 로 body 직속 `.invoice-print-portal` 렌더 → setTimeout 300ms 후 `window.print()` → state 초기화.

#### CSS — `src/index.css`
- `@media print { body > #root { display: none } body > .invoice-print-portal { display: block } @page { size: A4; margin: 12mm 10mm } }`.
- `.invoice-page-break` / `.invoice-no-break` 클래스 추가 후 빈 페이지 원인으로 판명 → 인라인 `pageBreakAfter: isLast ? 'auto' : 'always'` 로 이전 + 클래스 삭제 (`91f3863`).
- `page-break-inside: avoid` 가 헤더·주문 섹션·합계 바 3곳에 모두 적용되어 페이지 잔여 공간 발생 시 다음 페이지로 통째 미루며 빈 페이지 생성 → 모두 제거.

#### `useOrders` ORDER_SELECT 확장
- `customer:customers(id, name, grade)` 유지 (initially `delivery_address`, `contact1` 추가했다가 받는사람 행 제거하면서 롤백).
- `product:products(... category, sell_price, grade_a..e)` 추가 — 카테고리 그룹핑·공급가 계산용.

### 재고부족 자동조정 (`17a2fbb` → `fd15a17`)

#### DB 변경
- `mochicraft_demo.order_items.original_quantity INTEGER DEFAULT NULL` 컬럼 추가 (사용자 사전 적용).
- `insert_order` RPC 갱신 (마이그레이션 `insert_order_with_original_quantity`): `order_items` INSERT 컬럼에 `original_quantity` 포함, jsonb 매핑 `NULLIF(v_item->>'original_quantity', '')::integer`.

#### 저장 시점 자동조정 (`fd15a17`) — 기존 "재고 확인" 수동 버튼 폐기
- **OrderDetailPane.handleSave**: 신규 draft 행 중 비반품·재고부족 행 추출 → `finalQty = max(0, stock)`, `originalQty = item.quantity` → INSERT payload `original_quantity` 포함. 조정된 수량 기준 `orders.total_amount` 재계산. 누적 메시지 alert.
- **OrderEntryPage.handleSave** (수동주문입력): RPC 호출 전 valid 행에 동일 패스. `finalQty=0` 행은 RPC에서 제외 (insert_order amount 합산 무의미). 전 품목 결품이면 저장 차단.
- 화면 갱신: `['order-items', orderId]` + `['orders', companyId]` + `['inventory-stock', companyId]` 무효화.

#### 수량 셀 표시
- **OrderDetailPane**: 사전 조정 시 input 빨간색 + bold + tooltip `재고부족 — 현재재고 N (요청 M)`. `original_quantity != null` 이면 옆에 `~~original_quantity~~` 회색 취소선. 신규 행만 `0 → 빈문자열` 변환, 기존 행은 `0` 명시 (품절 자동조정 결과를 가시화).
- **InvoicePrintView**: `original_quantity != null` 이면 수량 셀에 `{quantity} ~~{original_quantity}~~` (`marginLeft 4px`, `color #aaa`, `line-through`, `fontSize 0.85em`). 품절(0) 행도 거래처 안내 목적으로 그대로 출력.
- **(`8af8b49` 갱신)** 두 곳 모두 표시 순서를 `~~원본수량~~ {quantity}` 로 변경 (취소선이 앞, 실제 수량이 뒤). 글자 크기는 `fontSize: 'inherit'` 로 통일 — 기존 `0.85em` 은 너무 작아 가독성 저하.

#### 알려진 이슈
- `OrderDetailPane.handleSave`의 INSERT payload는 Supabase 자동생성 타입에 `original_quantity` 미반영 → 타입 단언(`as unknown as {...}`)으로 우회. `supabase gen types typescript --schema mochicraft_demo` 재실행 후 단언 제거 권장.
- ~~**재고 자동조정 quantity=0 INSERT 누락**~~ → `060045e` 에서 해결. `OrderEntryPage.handleSave` 의 `itemsForRpc` filter 제거 — 결품(finalQty=0) 행도 RPC 에 전달되어 `OrderDetailPane` 정책(0 INSERT)과 통일됨. `insert_order` RPC 및 `order_items.original_quantity` 컬럼은 이전 마이그레이션에서 이미 반영되어 추가 DDL 불필요.

### 수동주문입력 공급가 자동계산 폴백 (`b8b2c5d`)

#### 진단
- 기존 `gradeRateOf(product, grade)`가 grade null/undefined일 때 빈 키 `grade_` 생성 → `0` 반환.
- `calcSupplyPriceByGrade(sell_price, 0)`은 `if (!gradeRate) return 0` 조기 종료 → 공급가 0 출력.
- 결과: grade 미설정 거래처에서 공급가가 `—` 로 표시.

#### 수정
- `import { calcSupplyPriceByGrade }` → `calcSupplyPriceByCustomerGrade` (단일 진입점).
- 상수 `DEFAULT_CUSTOMER_GRADE = 'a'` 정의.
- `gradeRateOf` 헬퍼 삭제. 신규 `computeSupply(product, grade)` — 내부에서 `grade ?? 'a'` 폴백 후 `calcSupplyPriceByCustomerGrade(sell_price, grade, product)` 호출.
- 적용 위치: `applyProduct`, `handleCustomerChange`, Excel 파싱 — 모두 동일 호출로 통일.
- DB의 `products.grade_a..grade_e` 자체가 NULL이면 폴백 의미 없음 → products 페이지에서 등급별 공급율 등록 필요.

### Phase 3.23 후속 패치 (2026-06-25 추가, `060045e` → `7bb68d1`)

오늘 6건 추가 커밋. Phase 3.23 마무리.

#### `060045e` — 재고 자동조정 quantity=0 INSERT 정책 통일
- `OrderEntryPage.handleSave` 의 `itemsForRpc = adjusted.filter(a => Math.abs(a.finalQty) > 0)` 한 줄 제거 → `const itemsForRpc = adjusted;`.
- 결품(finalQty=0) 행도 RPC 에 전달되어 DB INSERT. `OrderDetailPane` 정책과 통일.
- 진단: 사전 DB 검증 결과 `insert_order` RPC 와 `order_items.original_quantity` 컬럼은 이미 마이그레이션 반영 상태, 추가 DDL 불필요.

#### `8af8b49` — 수량 셀 표시 순서/크기 + handleSave 공급가 재계산 패스
- **OrderDetailPane** 수량 셀: input 다음에 있던 strikethrough span 을 input 앞으로 이동. inline-flex 에 `justifyContent: 'flex-end'` 추가. `fontSize: '0.85em' → 'inherit'`.
- **InvoicePrintView** 수량 셀: 동일 순서, `marginLeft → marginRight`, `fontSize: '0.85em' → 'inherit'`.
- **OrderEntryPage.handleSave**: RPC 호출 직전 `productById` 맵 + `calcSupplyPriceByCustomerGrade` 재계산 패스 추가. `unit_price` 와 `amount` 가 공급가 기반으로 저장. supply=0 시 sell_price 폴백.

#### `c12833c` — 🔴 useProducts grade 컬럼 누락 root cause fix
- **진짜 버그**: `useProducts` 의 `PRODUCT_SELECT` 에 `grade_a, grade_b, grade_c, grade_d, grade_e` 5컬럼 누락. Supabase 가 grade rate 없이 row 반환 → `calcSupplyPriceByCustomerGrade(price, grade, product)` 가 `product.grade_X` 를 항상 undefined 로 읽어 0 반환 → 이전 커밋의 폴백 (`supply > 0 ? supply : sell_price`) 으로 sell_price 가 저장되며 grade 할인이 무시되던 문제.
- 5컬럼 SELECT 추가 + `Product.grade_a..e` 타입을 `number?` → `number | null` 로 정정 (DB numeric NULL 허용과 일치).
- `OrderEntryPage.computeSupply` 헬퍼에 `supply > 0 ? supply : product.sell_price` 폴백 일원화. `handleSave` 의 finalItems 매핑도 `computeSupply` 단일 진입점으로 정리. 4개 진입점 (applyProduct/handleCustomerChange/Excel/handleSave) 모두 동일 동작.
- DB 검증: `mochicraft_demo.products` 에 `grade_a..e` numeric 5컬럼 존재 확인.

#### `7e7ad19` — 수동주문입력 합계 공급가 기준
- `OrderEntryPage.applyProduct`: `amount: r.quantity * product.sell_price` → `amount: r.quantity * supplyPrice`.
- 수량 onChange: `amount: safe * r.unit_price` → `amount: safe * r.supply_price`.
- 우측 "합계" 컬럼 + 하단 바 합계 모두 공급가 × 수량 기준 표시. RPC 저장값과 화면 합계 정합.

#### `7bb68d1` — 주문 정렬 보강
- `useOrders`: `.order('created_at', { ascending: false })` 보조 정렬 추가 → 같은 `order_date` 내에서 나중에 입력된 주문이 위로.
- `useOrderItems`: `ORDER_ITEM_SELECT` 및 `OrderItemJoinRow.products` / `OrderItemRow` 에 `category` 추가. map 매핑도 갱신.
- `OrderDetailPane`: `displayRows` 를 `useMemo` 로 래핑, 기존 행(`!_isNew`)은 `category` 오름차순 → `product_code` 오름차순 (`localeCompare('ko')`). 신규 draft 행(`_isNew`)은 정렬 제외 후 맨 뒤 유지.

### 다음 세션 후속 작업 (사용자 명시)

1. (완료) ~~재고 자동조정 quantity=0 INSERT 정책 통일~~ — `060045e` 로 완료.
2. **거래처 주문서 업로드 페이지(`/customer-order`) 재고부족 동일 표시** — 거래처 포털에서도 자동조정 + 원본수량 취소선.
3. **추가주문 구분 표시** — `orders.is_additional` 컬럼 신설 + `InvoicePrintView` 섹션 라벨 결정 로직 보강 (현재는 customer 그룹 내 날짜순 index 기반).
4. (완료) ~~수동주문입력 공급가 자동계산~~ — `b8b2c5d` + `c12833c` (root cause) + `7e7ad19` (합계) 로 완료.

---

## 오늘 추가된 작업 요약 (2026-06-25, 세금계산서)

### 세금계산서대장 페이지 (Phase 3.21) — `/finance/tax-invoices`

#### DB 재설계 — `tax_invoices` 테이블 (마이그레이션 `redesign_tax_invoices_customer_based`)
- 기존 `business_id` 기반 FK 폐기 → `customer_id` / `customer_group_id` **이중 FK** 구조.
- `CHECK (chk_one_subject)`: 두 FK 컬럼 중 정확히 하나만 NOT NULL.
- 신규 컬럼: `invoice_type VARCHAR(2) DEFAULT '01'` (01:일반/02:영세율) · `payment_type VARCHAR(2) DEFAULT '02'` (01:영수/02:청구) · `status VARCHAR(20) DEFAULT 'draft'` (draft/issued) · `issued_at TIMESTAMPTZ` · `memo TEXT`.
- `UNIQUE NULLS NOT DISTINCT`: `(company_id, customer_id, invoice_year, invoice_month)` + `(company_id, customer_group_id, invoice_year, invoice_month)` — 중복 발행 방지.
- RLS 활성화 + `anon_all` / `auth_all` 정책 (Phase 2 임시).
- `updated_at` 자동 갱신 트리거 (`trg_tax_invoices_updated_at`).

#### 발행 단위 정책
- **독립 거래처** (`customers.group_id IS NULL` AND 자체 `business_registration_number` 보유): `customer_id` 사용.
- **그룹 소속 거래처들** (`customers.group_id IS NOT NULL`): `customer_group_id` 사용, 그룹 멤버 매출 **합산** 1건 발행.
- 빈문자열/`-` brn은 클라이언트에서 추가 필터링 (DB는 NULL만 거름).

#### 금액 계산
- `supply_amount = Math.floor(total_amount / 1.1)` — **`Math.round` 아님** (기존 `calcSupplyAmount` 와 의도적으로 다름).
- `vat_amount = total_amount - supply_amount`.
- 훅 내부 단일 진입점 `splitAmounts(total)` 로 통일.

#### 신규 파일
- `src/types/taxInvoice.ts` — `TaxInvoice` / `TaxInvoiceSubject` (독립/그룹 정규화) / `TaxInvoiceRow` (매출 집계 + 발행 현황 병합).
- `src/hooks/useTaxInvoices.ts` — 5개 훅:
  - `useTaxInvoices(companyId, year, month)` — 해당 월 발행 목록.
  - `useTaxInvoiceRows(companyId, year, month)` — 발행 가능 행 (5개 쿼리 병렬 + JS 병합: 독립거래처 / 그룹 / 그룹멤버매핑 / 주문 / 기존발행).
  - `useCreateTaxInvoice` / `useCreateTaxInvoicesBulk` / `useDeleteTaxInvoice` mutation.
  - `monthRangeKst(year, month)` — KST(+9) 월 경계 (UTC-9h 보정).
- `src/pages/finance/TaxInvoicesPage.tsx` — 페이지 + 엑셀 다운로드 (62컬럼).

#### 페이지 UX
- 헤더: 월 네비 (← / `YYYY년 N월` / →) + [이달 전체 생성 (N)] + [엑셀 다운로드].
- 다음달 버튼: 현재 월 이상이면 disabled.
- KPI 3개: 발행 건수 / 공급가액 합계 / 세액 합계 (발행된 행만).
- 테이블: 거래처(상호) + "그룹" 인디케이터 / 사업자번호 / 주문수 / 공급가액 / 세액 / 합계(VAT포함) / 상태 / 작업.
  - 발행: 정상 텍스트 + 초록 "발행" 뱃지 + [삭제] 버튼 (`ConfirmDialog` danger).
  - 미발행: 회색 텍스트 + 회색 "미발행" 뱃지 + [생성] 브랜드 버튼.
- 일괄 생성: `ConfirmDialog` 로 "미발행 N건 생성" 안내, 이미 발행된 건은 스킵 (`invoice === null` 필터).
- 단건 삭제: 하드 DELETE (soft delete 아님), 토스트 알림.

#### 엑셀 다운로드 — 국세청 전자세금계산서 일괄발급 양식
- **62 컬럼 (A~BJ)** — 발행 완료된 행만 포함.
- A: invoice_type / B: 작성일자 YYYYMMDD **숫자형** (해당 연월 말일) / C: 공급자 사업자번호 (`-` 제거).
- E: 공급자 상호 (`companies.name`), F~J: 빈칸.
- K: 공급받는자 사업자번호 (`-` 제거) / M-R: 거래처 정보 / S: 빈칸(이메일2).
- T: supply_amount 숫자 / U: vat_amount 숫자 / V: 빈칸.
- W: 일자1 2자리 문자열 (예: `"30"`) / X: "가죽공예 용품" / Y-AA 빈칸 / AB: supply_amount / AC: vat_amount / AD 빈칸.
- AE-AM (9칸), AN-AV (9칸), AW-BE (9칸): 품목 2/3/4 빈칸.
- BF-BI: 현금/수표/어음/외상미수금 빈칸.
- BJ: payment_type ('02' 청구 기본).
- 파일명: `세금계산서_YYYY년MM월.xlsx`.
- 공급자 정보 가드: `companies.business_number` NULL이면 에러 토스트.

#### TS 타입 보강 / 마이그레이션
- `src/types/database.ts` — `tax_invoices` Row/Insert/Update 3종 + Relationships 수동 갱신 (Supabase MCP `generate_typescript_types` 가 `public` 만 지원하는 한계 회피).
- `src/hooks/queries/useHomeDashboard.ts` — 홈 타임라인 세금계산서 항목을 새 스키마(`issued_at` + `customer` / `customer_group` join)로 마이그레이션. `business:businesses(name)` 조인 제거.

#### 검증
- `npx tsc -b --noEmit` → 0 errors.
- `npm run build` → 성공 (5.37s). xlsx 동적/정적 import 경고는 기존 코드의 이슈로 무관.

#### 세금계산서 후속 버그픽스 (Phase 3.21 ~ 후속)

**일괄 생성 실패 — UNIQUE NULLS NOT DISTINCT 제약 (`7e4963a`)**
- 원인: 두 UNIQUE 제약이 `NULLS NOT DISTINCT` 라 그룹 인보이스 다건 INSERT 시 `customer_id=NULL` 끼리 충돌. 단건은 통과하지만 일괄은 무조건 실패.
- DB 마이그레이션 `fix_tax_invoices_unique_to_partial_indexes`: 두 UNIQUE 제약 DROP 후 부분 unique 인덱스 2종으로 교체 (`WHERE customer_id IS NOT NULL AND deleted_at IS NULL` / 그룹 동일).
- 훅: 단일 bulk INSERT → 순차 INSERT, per-row 결과 추적 (`BulkInsertResult { inserted, skipped, failed, errors }`). 23505 는 skip 처리.
- 페이지: skip 건수 안내 + 실패 시 첫 에러 메시지 + "외 N건" 토스트.

**엑셀 다운로드 원서식 구조 (`8344faf`)**
- 데이터만 1행부터 출력 → 1~6행 국세청 원서식 (안내문 5행 + 컬럼 헤더 59칸) + 7행부터 데이터.
- 데이터 행 컬럼 수 62 → 59 정정 (품목당 9칸 → 표준 8칸).
- 시트명: `'세금계산서'` → `'엑셀업로드양식'`.

**anon GRANT 누락 보강 (사용자 직접 적용)**
- 원래 마이그레이션에 RLS 정책만 있고 `GRANT SELECT, INSERT, UPDATE, DELETE TO anon/authenticated` 누락 → permission denied.
- 사용자가 Supabase 대시보드/CLI 로 직접 GRANT 적용 완료. `information_schema.role_table_grants` 검증 통과.

---

## 오늘 추가된 작업 요약 (2026-06-25, 미수금 페이지)

### 미수금 페이지 (Phase 3.22) — `/finance/receivables`

이번 세션 3건 커밋 (`271bae7`, `8cd8cb4`, `ae56396`).

#### 핵심 개념 정립
`receivables_summary.outstanding` (DB 원본) = 전체 누적 미정산 — 그대로 "미수금" 으로 쓰면 안 됨.
- **미수금(연체)** = 정산마감일 경과 + 잔액 > tolerance → `calcMonthlyReconciliation` 의 `status='연체'`
- **정산대기** = 정산마감일 미도래 + 잔액 > tolerance → `status='정산대기'`
- 슈즈케어 outstanding=6,400,800 예시: 익월 정산 사이클에서 5월 매출(마감 6/30)·6월 매출(마감 7/31) 모두 미도래 → 미수금 ₩0, 정산대기 ₩13,233,560 (오늘 2026-06-25 기준).

#### 페이지 레벨 계산 추가
- `useOrdersForReconciliation` + `useBankTransactions(year, null)` + `useBankTransactionSplits` + customers(id, group_id) 4개 쿼리.
- `calcMonthlyReconciliation` 한 번 실행 → 결과를 `customer_id → entity_key` 매핑으로 변환해 `pendingByEntity` / `overdueByEntity` Map 생성.
- 현재 연도 주문만 필터링 (`useBankTransactions(year, null)` 와 일관성).

#### outstanding 사용 금지 — 4곳 모두 overdue/pending 으로 교체
1. **상단 KPI**: 총 미수금 = `overdueByEntity` 합계. 정산대기는 sub-text.
2. **카드**: `hasReceivable = overdueAmount > 0`, `hasPending = pendingAmount > 0`. 두 행 동시 노출 가능.
3. **테이블 뷰**: "미수금" / "정산대기" 컬럼 분리.
4. **드릴다운 모달 SummaryInline**: 미수금 + 정산대기 라인.
5. **PaymentModal**: "현재 미수금" → "현재 잔여 (연체+정산대기)". `totalApplied >= totalDue` 비교.

#### 카드 색상 표현 — 테두리 → 배경색
- 미수금: `var(--danger-wash, #fef2f2)`
- 정산대기만: `var(--warning-wash, #fffbeb)`
- 정산완료: `var(--surface)` 기본
- 테두리는 모두 `var(--line)` 통일.

#### 필터 4종
미수금 있음 / **정산대기** (신규) / 그룹만 / 전체.
- 'positive' 기준도 `outstanding > 0` → `overdueAmount > 0` 으로 보정 (이전 잔존 버그).
- 'pending': `pendingAmount > 0 && overdueAmount === 0`.

#### 기본값 변경
- 뷰: `'table'` → `'card'` (localStorage 미설정 시 카드)
- 필터: `'positive'` → `'all'` (전체)
- 드릴다운 모달 기본 탭: `'orders'` → `'reconciliation'` (월별 정산)

#### DB 데이터 기반 검증 예상
- **누보아트** outstanding=-1,332,360 → ✓ 정산 완료 카드 (기본 배경)
- **슈즈케어** outstanding=6,400,800 → 5/6월 매출 정산대기 카드 (amber 배경)
- **안앤리** outstanding=290,890 → 정산마감 기준 분기 표시

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
- **세금계산서 (Phase 3.21 — 마이그레이션 `redesign_tax_invoices_customer_based` + 후속 `fix_tax_invoices_unique_to_partial_indexes`):**
  - 기존 `tax_invoices` (business_id 기반) DROP 후 재생성. 데이터 없음 → 안전 (로컬 마이그레이션 파일 없음, MCP `apply_migration` 직접).
  - 신규 컬럼: `customer_id` / `customer_group_id` 이중 FK + `CHECK chk_one_subject` (둘 중 하나만 NOT NULL).
  - 신규 컬럼: `invoice_type` / `payment_type` / `status` / `issued_at` / `memo`.
  - 🟠 후속 `fix_tax_invoices_unique_to_partial_indexes`: 두 UNIQUE NULLS NOT DISTINCT 제약 DROP 후 부분 unique 인덱스 2종으로 교체 (`WHERE customer_id IS NOT NULL AND deleted_at IS NULL` / 그룹 동일). 그룹 인보이스 다건 INSERT 시 NULL 끼리 충돌하던 버그 해결.
  - `anon_all` / `auth_all` 정책 (anon/authenticated ALL USING true) — Phase 2 Auth 도입 시 회수.
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON mochicraft_demo.tax_invoices TO anon, authenticated` (사용자 직접 보강 — 원 마이그레이션 누락분, permission denied 해결).
  - `trg_tax_invoices_updated_at` 트리거 + `mochicraft_demo.update_tax_invoices_updated_at()` 함수.
  - 롤백 SQL: `DROP TABLE mochicraft_demo.tax_invoices CASCADE; DROP FUNCTION mochicraft_demo.update_tax_invoices_updated_at();` (인덱스/GRANT는 테이블 DROP 시 함께 제거).

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
### ~~(완료) 세금계산서~~ ✅ Phase 3.21 (2026-06-25)
### ~~(대안) 수동주문입력 페이지~~ ✅ 완료 (Phase 3.11)
- 구현됨: `/sales/order-entry`
- 단, 도메인 규칙 D(`requested_quantity` 이중 수량 모델)과 B/C(주문 상태별 재고 차감, `inventory_transactions` out)는 **미적용**. 현재는 단순 INSERT (재고 검증/차감 없이) → 본격 운영 전 RPC를 `create_order_with_stock_check` 로 보강 필요.

### 후속 페이지 (우선순위 무관)
- `/sales/invoices` — 송장대장
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

### 최근 커밋 (2026-06-25 세션 마지막 — 수입 입고 예정일 4탭 + 제품 일괄작업)

**버그 수정** (Phase 3.23 후속, `cb3ba1b` 까지 반영됨)
- 재고부족 자동조정: quantity=0 품목 INSERT 누락 수정 (OrderEntryPage/OrderDetailPane 정책 통일)
- 수량 표시 순서: ~~원래수량~~ 실제수량 순서로 변경 + 글자 크기 통일
- 수동주문입력 공급가: grade 기반 `calcSupplyPriceByCustomerGrade` 즉시 적용
- 수동주문입력 합계: sell_price → supply_price 기준으로 수정
- 주문 목록 정렬: created_at 보조 정렬 추가 (같은 날짜 내 최신순)
- 주문 상세 패널: category→code 오름차순 정렬 (useMemo hooks 순서 버그 포함 수정)
- companies anon GRANT 추가 (`import_notice` 저장 401 오류 해결)

**신규 기능 — 거래처 포털 수입 입고 예정일 카드 (4탭)**
- DB: `import_notice_*` 컬럼 10개 추가 (페덱스 6 + 해상운송 6)
- OPS 수입/매입 페이지: 페덱스/해상운송 탭 분리 설정 + 인보이스 PDF 파싱으로 제품 자동 추가 (`parseInvoicePDF` 재사용)
- 거래처 포털: 탭 최상단 pill 뱃지 (페덱스/해상=버건디, 품절=빨강, 재고부족=주황), 제품 카테고리→코드 정렬, 400px 고정 스크롤
- 품절(재고=0) / 재고부족(1~5개) 자동 산출 — `calcCurrentStockByProduct` 재사용
- `is_active=false` 제품은 품절/재고부족 목록에서 제외

**신규 기능 — 제품 리스트 일괄 작업**
- 체크 시 헤더에 일괄수정/노출금지/노출/삭제 4버튼 노출 + N개 선택 카운트
- 일괄수정 모달 (분류/단위/USD/판매가): 입력한 필드만 UPDATE (빈 필드는 변경 안 함)
- `is_active=false`로 노출금지 / `is_active=true`로 복원 (양방향 토글)
- 노출금지 제품: 테이블 행 `opacity:0.6` + 주황 wash "노출금지" 뱃지 (제품명 옆)
- 일괄삭제: soft delete (`deleted_at = NOW()`) + `['products', companyId]` 무효화

**커밋 (cb3ba1b 이후)**
- `cc8460d` feat(products): 일괄수정 모달 + 노출금지 기능 추가
- `f38e9b6` feat(products): 제품 일괄삭제 기능 추가
- `139b16a` fix(customer-portal): 탭 버튼 pill 뱃지 스타일 적용
- `a5d00b7` fix(customer-portal): 수입 입고 예정일 카드 탭/헤더 구조 수정
- `c421c19` fix(customer-portal): 수입 입고 예정일 카드 높이 고정 (제품 14개 기준 400px 스크롤)
- `72c7c3c` feat(customer-portal): 수입 입고 예정일 카드 4탭 구조로 개편
- `73179a1` fix(customer-portal): 수입 입고 예정일 카드 높이를 좌측 컬럼에 맞춤
- `342b378` fix(customer-portal): 수입 입고 예정일 카드 높이/스텝퍼 오버플로우 수정
- `5b2c25b` fix(customer-portal): 수입 입고 예정일 카드 UI 수정 (타이틀/스텝퍼/flex 정렬)
- `adea76b` feat(import-notice): 도착예정일을 텍스트 입력으로 변경 (date picker 제거)
- `2537c78` feat(import-notice): OPS 에 도착예정일(date) 입력 노출
- `584a177` feat(import-notice): 수입 예정 안내 카드 UI 개선 (4 status 자유 텍스트 + arrivalText)
- `323a52a` feat(import-notice): 인보이스 PDF 업로드로 수입 예정 제품 자동 추가
- `c1164b7` fix(orders): OrderDetailPane useMemo hook 순서 수정 (hooks 규칙 위반 해결)
- `654435e` feat(import): 거래처 포털 수입 예정 안내 기능 추가

---

### 최근 커밋 (2026-06-25 세션 후반 — 미수금 페이지 개편)
- `ae56396` fix(receivables): 정산대기 필터 추가 및 카드 배경색으로 상태 표시
- `8cd8cb4` fix(receivables): 미수금/정산대기 계산 로직 및 카드 UI 수정 (outstanding → 월별 정산마감 기준)
- `271bae7` fix(receivables): 미수금 관리 카드 뷰 및 계산 오류 수정 (기본값 변경 + 음수 처리 + 색상 3단계)

### 최근 커밋 (2026-06-25 세션 중반 — 세금계산서 후속)
- `8344faf` fix(tax-invoice): 엑셀 다운로드 국세청 원서식 구조로 수정 (1~6행 헤더 + 59컬럼)
- `7e4963a` fix(tax-invoice): 일괄 생성 에러 핸들링 및 null 필드 처리 수정 (UNIQUE 제약 부분 인덱스 + 순차 INSERT)

### 최근 커밋 (2026-06-25 세션 전반 — 세금계산서대장)
- `81bb2d3` feat(tax-invoice): 세금계산서대장 페이지 구현
- `59e259d` feat(tax-invoice): 세금계산서 타입 정의 및 훅 구현
- `8611986` feat(db): tax_invoices 테이블 customer_id 기반으로 재설계

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

---

## 알려진 데이터 이슈 (수동 확인 대기)

- **엔젤러스 인보이스 76474 — total_usd 불일치 (2026-07-24 발견)**
  - 항목 7 line_items 백필 dry-run 중, 파싱된 라인 합계 **$3,807.69** (89개 라인, 모두 정상 제품코드)
    vs `document_files.extracted_metadata.total_usd` 저장값 **$807.69** — 정확히 **$3,000** 차이.
  - 나머지 59건 제품 인보이스는 Σamount = 저장 total_usd 정확 일치 → 파서 신뢰. 76474의 저장
    total_usd 가 historical 추출 이상치로 추정됨.
  - line_items 백필은 정상 완료(라인 자체는 유효). **total_usd 는 이번에 손대지 않음.**
  - TODO: 원본 PDF(`historical-import/.../Inv_76474...pdf`) 수동 확인 후 total_usd 정정 여부 결정.
