# Claude Design 첫 세션 프롬프트 — 홈 대시보드

첫 세션에서는 **홈 대시보드 하나**로 디자인 시스템 전체를 확정짓는 게 효율적입니다.
이후 다른 29개 페이지는 짧은 추가 프롬프트로 같은 시스템을 상속받아 만들 수 있습니다.

복사할 프롬프트는 `---` 구분선 사이의 내용입니다.

---

한국의 수입 도매 유통업자용 **B2B SaaS 관리 대시보드**를 설계해줘.
첫 출시는 가죽용품(Angelus) 유통 사업자가 dogfooding으로 쓰지만,
처음부터 다중 테넌트 SaaS로 판매할 제품이야.

## 프로젝트 컨텍스트

- 제품명: (아직 미정, 코드네임 MochiCraft demo #1)
- 타깃 고객: 한국 중소 도매 유통업자, 솔로~10인 규모
- 경쟁 제품: 이카운트, 박스히어로 — 같은 기능인데 **훨씬 단순하고 예쁘게**
- 스택: Vite + React + TypeScript + Tailwind + shadcn/ui + Supabase + Recharts
- 언어: 한국어 UI 기본

## 브랜드 방향 (매우 중요)

다음 조합을 의도적으로 섞어서 업계 타사와 차별화해줘:

- **모던 SaaS의 데이터 밀도·명료성** (이카운트 수준의 정보량, 하지만 숨 쉴 공간 확보)
- **크래프트 레더의 따뜻함** (가죽 공방 감성, 워엄 뉴트럴 베이스)
- **프로페셔널 재무 신뢰감** (숫자 우선, 우측 정렬, 통화 명시)

타협하지 말고 한 방향을 명확히 끌고 가줘. 회색 + 파랑 일색인 "B2B 대시보드 AI 생성물" 같은 결과는 거부한다.

## 디자인 시스템 규칙

**Typography**
- 한글: Pretendard Variable
- 숫자/영문: Inter Tight (또는 동등한 특색 있는 것)
- 타이틀용 디스플레이 폰트는 직접 제안 — 보기 좋은 serif 또는 조각적인 sans 중 선택

**Color**
- 배경: 오프화이트 베이스 (순백이 아님), 다크모드 지원 필수
- 포인트: 딥 버건디(#6B1F2A 근처) 또는 탄(tan) 레더 톤 중 택일, 명확한 포인트 한 색만
- 상태 컬러: success/warning/danger 정의
- CSS 변수로 전부 토큰화

**레이아웃**
- 좌측 고정 사이드바 (접이식, 아이콘 + 한글 라벨)
- 상단 topbar: 회사 선택 드롭다운(멀티테넌트) · 전역 검색 · 알림 · 프로필
- 메인 영역: 카드 기반 그리드. 카드는 둥근 모서리(rounded-xl) + 섬세한 보더 + 옅은 섀도

**데이터 표현 규칙**
- 금액: `1,234,567원` (천단위 콤마, 통화 명시, 우측 정렬)
- 환율 금액: `$123.45 (135,679원)` 같이 원화 병기
- 큰 숫자: 대시보드에서는 `1.2M원`, `340K` 축약 허용
- 수량: 단위 뒤에 오는 형태 `45 ea`, `12 box`
- 날짜: `2026.04.19`, 시간 필요시 `2026.04.19 14:30`
- 빈 값: `—` (대시)가 아니라 의미 있는 빈 상태 디자인 필수

**공통 컴포넌트 요구**
- StatCard: 수치 + 전월 대비 증감 뱃지 + 미니 스파크라인
- StatusBadge: draft / confirmed / shipped / done / paid / failed / past_due / active / suspended
- DataTable: 행 높이 compact(48px), 정렬/필터, 페이지네이션
- EmptyState, SkeletonLoader, Toast, Modal, Drawer, DatePicker(한국어)

## DB 컨텍스트 (Claude Design이 필드명을 맞추도록)

모든 테이블은 `company_id UUID NOT NULL`을 첫 비즈니스 컬럼으로 가지고 있고(멀티테넌트),
모든 테이블에 `created_at`, `updated_at`, `deleted_at` (TIMESTAMPTZ) 가 공통으로 존재한다고 가정해줘.
PK는 전부 UUID.

대시보드에서 주로 참조하는 테이블과 주요 컬럼:

- **orders** (주문): id, customer_id, order_date, total_amount, status [draft/confirmed/shipped/done], source [manual/portal/ai], memo, created_by
- **order_items** (주문 상품): order_id, product_id, quantity, unit_price, amount, is_return
- **customers** (거래처): id, business_id, name, grade [A~E], settlement_cycle, bank_aliases
- **products** (상품): id, code, name, category, sell_price, supply_price, unit_price_usd, unit, is_active
- **inventory_lots** (재고 로트): product_id, lot_type [opening/purchase/import], quantity, remaining_quantity, cost_krw, cost_usd, lot_date
- **purchases** (수입/매입): product_id, type [import/domestic], quantity, unit_cost_usd, exchange_rate, total_krw, purchase_date, purchase_order_id
- **purchase_orders** (발주서): po_number, po_date, currency, total_amount, status [draft/sent/confirmed]
- **bank_transactions** (은행 거래내역): customer_id, transaction_date, amount, depositor_name, description, match_status [matched/unmatched/excluded]
- **invoices** (결제 내역 — SaaS 요금 결제): invoice_number, amount, status [paid/failed/pending], paid_at
- **subscriptions** (구독): plan_id, status [active/past_due/canceled], current_period_start, current_period_end

핵심 비즈니스 계산:

- `calcCurrentStock(product)` = 기초재고 + 수입/매입 + 반품 - 파손 - 당해 판매수량
- `calcMonthlySales(period)` = SUM(order_items.amount) WHERE order_date in period
- `calcReceivables(customer)` = 거래처별 총매출 - 거래처별 총입금
- `calcInventoryValue()` = 현재재고수량 × 가중평균단가 × 1.1
- `calcCostOfSales()` = (기초 + 매입 - 기말) × 1.1

## 첫 화면: 홈 대시보드 (`/dashboard`)

로그인 직후 보이는 화면. 사업 현황을 5초 안에 파악하고 "오늘 뭐 해야 하지?"를 알 수 있어야 함.

**① 상단 KPI 카드 4장 (1행, 반응형 2x2)**

1. 이번달 매출 — `calcMonthlySales` / 전월 대비 증감율 / 30일 스파크라인
2. 미수금 합계 — `calcReceivables` 합산 / 30일 이상 경과 건수 뱃지(빨강)
3. 재고자산 평가액 — `calcInventoryValue` / 전월 대비
4. 이익률 — 매출총이익 ÷ 매출 / 전월 대비 pp 표시

**② "오늘 처리할 것" 섹션 (카드 리스트, 좌측 2/3)**

- 미입고 발주서: purchase_orders.status='sent' 이고 아직 purchases 연결 없음 → 건수 + 가장 오래된 건
- 미수금 3건: 30일 이상 경과한 거래처 top 3, 금액 내림차순
- 재고 부족: `remaining_quantity < calcOrderSuggestion(product) × 0.3` 인 제품 top 5
- 미매칭 입금: bank_transactions.match_status='unmatched' 이고 최근 7일

각 카드에서 행 클릭 시 해당 페이지로 이동 (hover 시 "→" 표시).

**③ 최근 30일 매출 추이 (우측 1/3, Recharts LineChart)**

- X축: 날짜 (한국어 MM/DD), Y축: 금액 (원, K 단위 축약)
- 라인 1개(이번 기간) + 희미한 라인(전년 동기간 비교)
- 호버 시 정확한 일자와 금액 툴팁

**④ 최근 거래 타임라인 (하단 전체 너비, 카드)**

- 최근 10개 이벤트를 시간 역순으로 표시
- 이벤트 타입: 신규 주문 / 입금 매칭 / 발주 확정 / 재고 이동 / 세금계산서 발행
- 각 이벤트에 아이콘 + 요약 문장 + 상대시간 ("2시간 전")
- 클릭 시 원본 레코드로 이동

## 작업 지시

1. 먼저 이 스펙을 기반으로 **디자인 시스템(컬러/폰트/간격/컴포넌트)** 을 자리 잡고,
2. 홈 대시보드를 완성본 형태로 한 번에 보여줘.
3. 다크모드도 함께 제안 (토글 가능하게).
4. 실제 숫자는 그럴듯한 더미 데이터로 채워 — 한국 도매업 맥락에 맞는 상품명, 거래처명.
5. 반응형: 데스크톱 우선, 1280px / 1440px에 최적화.

이후 세션에서 같은 디자인 시스템으로 주문관리, 재고현황, 발주서, 미수금, 세금계산서 화면을 이어서 설계할 거야.

---

## 이 프롬프트를 쓸 때의 팁

1. **디자인 시스템이 확정되기까지 2-3번의 iteration**이 필요할 수 있음. 첫 결과에서 폰트/색만 바꿔달라 요청하는 식으로 정교화.
2. **색상이 마음에 안 들면**: "버건디 대신 딥 네이비로", "탄 레더 대신 올리브 그린으로" 식으로 명확히 지시.
3. **컴포넌트 추가 요청**: "지금 만든 StatCard를 기반으로 주문 목록 테이블을 만들어줘" 처럼 구체적으로.
4. **핸드오프 번들 생성 전**에 다크모드까지 확정 → Claude Code 단계에서 수정 비용이 줄어듦.

## 후속 페이지 프롬프트 템플릿

다른 페이지 설계 요청 시 이 축약형을 쓸 수 있음:

```
앞서 확립된 디자인 시스템을 그대로 상속해서 [페이지명] 화면을 설계해줘.

DB 컨텍스트: [해당 테이블과 컬럼]
화면 목적: [한 줄 요약]
핵심 인터랙션: [3-5개 bullet]
관련 공식: [calcXxx]
```

예시 — 재고현황 페이지:

```
앞서 확립된 디자인 시스템을 그대로 상속해서 재고현황 화면을 설계해줘.

DB 컨텍스트: products + inventory_lots (FIFO) + inventory_transactions
화면 목적: 제품별 현재재고·원가·가치를 한눈에, 재고 부족 경보 강조
핵심 인터랙션:
- 상단: 필터(카테고리, 재고상태) + "실사 시작" CTA
- 메인: DataTable (상품코드/상품명/현재재고/평균단가/재고가치/최종입고일)
- 행 클릭 시 우측 Drawer 열기: lot 히스토리 + 이동 내역 타임라인
- 재고 부족 행은 좌측에 빨간 세로 마커
관련 공식: calcCurrentStock, calcInventoryValue
```
