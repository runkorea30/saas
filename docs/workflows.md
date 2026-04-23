# 비즈니스 워크플로우 — 8종

> 각 워크플로우는 여러 API와 테이블을 걸쳐 실행되는 다단계 프로세스.
> Claude Code는 이 순서를 정확히 지켜서 구현해야 하며, **중간 단계를 생략하면 데이터 일관성이 깨집니다.**

---

## w1. 🛍️ 거래처 포털 주문 접수

**Trigger**: 거래처 포털에서 주문 저장 버튼 클릭

**Steps**:
1. `CHECK customer_users` — 거래처 로그인 인증 및 `company_id` 확인
2. `CHECK products.is_active` — 활성 제품만 주문 가능 확인
3. `CALC calcCurrentStock` — 주문 제품별 현재 재고 확인
4. `CHECK 재고` — 재고 0이면 품절 표시, 주문 차단 또는 경고
5. `INSERT orders` — `source='portal'`로 주문 저장
6. `INSERT order_items` — 제품별 주문 상세 저장
7. `NOTIFY SaaS 사용자` — 신규 주문 알림 (이메일/대시보드 배지)

**관련 API**: `POST /api/portal/orders`, `GET /api/inventory/stock`

---

## w2. ✏️ 수동 주문 입력 (수집 탭)

**Trigger**: 사용자가 PDF/사진 업로드 또는 수동 입력

**Steps**:
1. `SELECT 업로드 파일` — 이미지/PDF/엑셀 파일을 Supabase Storage에 저장
2. `AUTO Claude API (v1.1)` — OCR/AI로 제품명·수량 추출 (v1.1 feature)
3. `CHECK 사용자 확인` — AI 결과를 표에 표시, 사용자가 수정 가능
4. `INSERT orders` — `source='manual'`로 주문 저장
5. `INSERT order_items` — 확정된 주문 상세 저장

**관련 API**: `POST /api/orders`

**MVP 범위 주의**: v1.0은 수동 입력만, OCR/AI는 v1.1에서 추가.

---

## w3. 📝 발주서 자동 추천 생성

**Trigger**: 발주서 페이지 `[발주서 생성]` 버튼 클릭

**Steps**:
1. `CALC calcMonthlySales` — 과거 6개월 제품별 판매수량 집계 (당월 제외)
2. `CALC 평균` — 월 평균 판매수량 = 6개월 합 ÷ 6
3. `CALC 추천수량` — 3개월 소요 수량 = 월평균 × 3
4. `CALC calcCurrentStock` — 제품별 현재 재고 조회
5. `CALC DZ 환산` — 수량(DZ) = 3개월수량 ÷ 12
6. `SELECT 사용자 조정` — 사용자가 수량(DZ) 수정 가능
7. `INSERT purchase_orders` — 최종 확정 시 발주서 저장 + PDF/엑셀/메일 발송

**관련 API**: `GET /api/purchase-orders/suggest`, `POST /api/purchase-orders`

**계산 공식**: `calcOrderSuggestion = (과거6개월판매/6 × 3개월) / 12`

---

## w4. 💸 은행 입금 자동 매칭 (3단계)

**Trigger**: 재무-미수금 페이지 은행 엑셀 업로드

**Steps**:
1. **1단계** — `INSERT bank_transactions`: 은행 엑셀에서 입금 행만 필터링 후 저장
2. **2단계** — `AUTO customers.bank_aliases`: 입금자명 ↔ 거래처 `bank_aliases` 자동 매칭
3. `CALC 월별 매출` — 거래처별 당월 매출 합계 계산
4. **3단계** — `CHECK 대사`:
   - 입금 = 매출 → **정상** (초록)
   - 입금 < 매출 → **미수** (노랑)
   - 입금 > 매출 → **확인필요** (주황)
5. `UPDATE bank_transactions.match_status` — 매칭 결과 저장
6. `SELECT 사용자 확인` — 미매칭 건은 수동 매칭 UI 제공, 확정 시 `bank_aliases`에 추가

**관련 API**: `POST /api/finance/bank-upload`, `POST /api/finance/match`

**학습 누적 규칙**: 사용자가 수동 매칭을 확정하면 해당 `depositor_name`이 해당 거래처의 `bank_aliases`에 쉼표로 추가됨 → 다음 매칭부터 자동 인식.

---

## w5. 🧾 세금계산서 엑셀 생성

**Trigger**: 재무-세금계산서 페이지 `[다운로드]` 버튼

**Steps**:
1. `SELECT 조건` — 연도/월 선택 후 실행
2. `CALC calcMonthlySales` — businesses별(사업자번호 단위) 당월 매출 합산
3. `CALC calcSupplyAmount` — 공급가액 = 매출 ÷ 1.1, 부가세 = 매출 - 공급가액
4. `SELECT businesses` — 사업자 정보(업체명/사업자번호/대표/업태/종목/주소) 조인
5. `AUTO 국세청 양식 엑셀` — 홈택스 일괄 업로드 양식으로 xlsx 생성
6. `INSERT tax_invoices` — 발행 이력 저장, `exported_at` 기록

**관련 API**: `GET /api/finance/tax-invoice/export`

**주의**: 매출금액은 이미 부가세 포함. `× 1.1` 절대 금지, `÷ 1.1` (역산)만 사용.

---

## w6. 🔄 연말 재고 자동 이월

**Trigger**: 매년 1월 1일 자동 실행 (Cron / Supabase Scheduled Function)

**Steps**:
1. `CALC calcCurrentStock` — 전년 12/31 기준 제품별 현재재고 계산
2. `INSERT inventory_lots` — `lot_type='opening'`으로 신년 기초재고 생성, `lot_date` = 신년 1월 1일
3. `NOTIFY owner` — 이월 완료 알림

**주의**: 수동 실행 UI도 Super Admin 페이지에 제공 (장애 복구용).

---

## w7. 💳 구독 결제 처리 (Toss 웹훅)

**Trigger**: Toss Payments 결제 이벤트 (자동)

**Steps** *Edge Function 내부*:
1. `CHECK 서명 검증` — Toss 웹훅 서명 검증
2. `UPDATE subscriptions.status` — 결제 성공 → `active`, 실패 → `past_due`
3. `INSERT invoices` — 결제 내역 저장
4. `CHECK 연체 일수` — `past_due` 7일 → 읽기전용 모드, 30일 → `suspended`
5. `NOTIFY owner` — 결제 성공/실패 이메일 발송
6. `INSERT audit_logs` — 결제 이벤트 감사 로그

**관련 API**: `POST /api/billing/webhook` (Edge Function 전용)

**보안**: 이 워크플로우의 모든 DB 쓰기는 **Edge Function에서만** 실행. 프론트에서 subscriptions 상태를 직접 변경하는 것 금지.

---

## w8. 📨 팀원 초대 및 수락

**Trigger**: 설정-팀원에서 초대 이메일 입력

**Steps**:
1. `CHECK canAddUser` — 요금제 사용자 한도 확인 (`planLimits.ts`)
2. `INSERT invitations` — UUID 토큰 생성, `expires_at = now + 24시간`
3. `NOTIFY 초대 이메일` — `/invite?token=...` 링크 포함 메일 발송
4. `CHECK 토큰 검증` — 수락 시 `expires_at` 미만료 / `accepted_at IS NULL` 확인
5. `INSERT memberships` — 초대된 역할로 멤버십 추가
6. `UPDATE invitations.accepted_at` — 토큰 1회용 무효화

**관련 API**: `POST /api/team/invite`, `POST /api/auth/accept-invite`

---

## 구현 우선순위 (권장)

| 단계 | 워크플로우 | 이유 |
|---|---|---|
| **Phase 1** | w8 (팀원 초대), w7 (구독 결제) | 기반 인프라. 멀티테넌시·과금 먼저 |
| **Phase 2** | w2 (수동 주문) | 가장 기본적인 주문 입력 경로 |
| **Phase 3** | w1 (포털 주문) | 거래처 포털 추가 |
| **Phase 4** | w3 (발주 추천), w4 (입금 매칭) | 자동화 가치 높은 기능 |
| **Phase 5** | w5 (세금계산서), w6 (재고 이월) | 주기성 업무 |
