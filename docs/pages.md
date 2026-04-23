# 페이지 명세 — 30개

> 라우팅 구조 및 각 페이지의 주 데이터/계산/워크플로우 연관.

## 레이아웃 구성

**상단 가로 네비게이션** (MVP 기준):
- 1단 (시스템): 로고 · 회사 선택 드롭다운 · 전역 검색 (⌘K) · 시간 · 다크모드 · 알림 · 프로필
- 2단 (메뉴): 홈 | 판매 ▾ | 재고·매입 ▾ | 재무 ▾ | 리포트 | 설정 ▾
- 우상단 고정 CTA: `[+ 주문 추가]`, `[↓ 리포트 받기]`

---

## 🌐 공개 페이지 (로그인 불필요)

| ID | 경로 | 이름 | 주 기능 |
|---|---|---|---|
| p1 | `/` | 🏠 랜딩 | 제품 소개, 기능 하이라이트, CTA → 회원가입 |
| p2 | `/pricing` | 💰 요금제 | 4개 플랜 비교 (Free/Starter/Pro/Business), 14일 체험 CTA |
| p3 | `/signup` | ✍️ 회원가입 | 이메일/비밀번호 또는 OAuth |
| p4 | `/login` | 🔑 로그인 | 세션 발급 |
| p5 | `/invite?token=...` | 📨 초대 수락 | 토큰 검증 후 멤버십 생성 |

---

## 🎯 온보딩 (첫 로그인 후)

| ID | 경로 | 이름 | 주 기능 |
|---|---|---|---|
| p6 | `/onboarding/company` | 🏢 회사 생성 | 회사명·사업자번호·업종 입력, 14일 체험 시작 |
| p7 | `/onboarding/plan` | 🎯 요금제 선택 | 체험 중 플랜 미리 선택 가능 |

---

## 📱 앱 본체 (로그인 + 회사 컨텍스트 필수)

### 홈

| ID | 경로 | 이름 | 주 기능 | 계산식 |
|---|---|---|---|---|
| p8 | `/dashboard` | 📊 메인 대시보드 | KPI 4장, 오늘 처리할 것, 30일 매출, 거래 타임라인 | calcMonthlySales, calcReceivables, calcInventoryValue |

### 판매 (메뉴 "판매 ▾")

| ID | 경로 | 이름 | 주 기능 | 관련 |
|---|---|---|---|---|
| p9 | `/orders` | 📦 주문내역 | 기간 필터, DataTable, 상태 관리, 일괄 처리 | orders, order_items |
| p10 | `/orders/new` | ✏️ 수동 입력 | 파일 업로드 + 직접 입력 | w2 |
| p11 | `/orders/shipping` | 🚚 송장 대장 | 출고 주문 목록, 송장번호 입력, 택배사 연동 | orders.status='shipped' |
| p12 | `/sales` | 💵 매출매입-매출 | 매출 집계, 거래처별/기간별 분석 | calcMonthlySales |
| p13 | `/purchases` | 🛒 매출매입-매입 | 수입/국내 매입 내역, USD/KRW | purchases |
| p19 | `/customers` | 🤝 거래처 | 거래처 CRUD, 포털 계정 발급, 사업자 연결 | customers, businesses |

### 재고·매입 (메뉴 "재고·매입 ▾")

| ID | 경로 | 이름 | 주 기능 | 계산식 |
|---|---|---|---|---|
| p14 | `/purchase-orders` | 📝 발주서 | AI 추천 기반 발주서 작성, 6개월 평균 기반 | calcOrderSuggestion, w3 |
| p15 | `/inventory` | 📋 재고현황 | 제품별 현재재고, 로트 추적, 재고 부족 경보 | calcCurrentStock, calcInventoryValue |

### 재무 (메뉴 "재무 ▾")

| ID | 경로 | 이름 | 주 기능 | 계산식/워크플로우 |
|---|---|---|---|---|
| p16 | `/finance/receivables` | 💸 미수금 | 거래처별 미수금, 은행 엑셀 업로드, 3단계 매칭 | calcReceivables, w4 |
| p17 | `/finance/tax-invoice` | 🧾 세금계산서 | 월별 세금계산서 엑셀 생성 (홈택스 양식) | calcSupplyAmount, w5 |
| p18 | `/finance/pnl` | 📈 손익계산서 | 매출/매출원가/이익 분석 | calcCostOfSales |

---

## ⚙️ 설정 (메뉴 "설정 ▾")

| ID | 경로 | 이름 | 주 기능 |
|---|---|---|---|
| p20 | `/settings/company` | ⚙️ 회사정보 | 회사명, 사업자번호, 주소 수정 |
| p21 | `/settings/team` | 👥 팀원 | 멤버십 목록, 초대, 역할 변경, 비활성화 |
| p22 | `/settings/plan` | 💳 요금제 | 현재 구독 상태, 플랜 변경, 해지 |
| p23 | `/settings/profile` | 👤 프로필 | 본인 이름/연락처 수정, 비밀번호 변경 |
| p24 | `/settings/modules` | 🧩 모듈관리 | 발주서 템플릿 선택 (MVP: 1개) |
| p25 | `/settings/shipping` | 📮 택배연동 | 택배사 API 키 설정 (v1.1) |

---

## 🛍️ 거래처 포털 (별도 인증)

`customer_users` 테이블로 독립 인증 (Supabase Auth 안 씀).

| ID | 경로 | 이름 | 주 기능 |
|---|---|---|---|
| p26 | `/portal/login` | 🔐 포털 로그인 | login_id + password |
| p27 | `/portal/order` | 🛍️ 포털 주문 입력 | 상품 선택 → 장바구니 → 주문 (source='portal') |

---

## 👑 Super Admin (service_role)

`user_profiles.is_super_admin = true`인 경우만 접근.

| ID | 경로 | 이름 | 주 기능 |
|---|---|---|---|
| p28 | `/admin/dashboard` | 👑 운영 대시보드 | 전체 회사 수, MRR, 활성 구독, 신규 가입 |
| p29 | `/admin/companies` | 🏛️ 회사 목록 | 모든 회사 조회 (service_role 사용) |
| p30 | `/admin/subscriptions` | 💼 구독 관리 | 구독 상태 강제 변경, 환불 처리 |

---

## 라우팅 보호 계층

```
PublicRoute    — p1, p2, p3, p4, p5 (로그인 불필요)
OnboardingRoute — p6, p7 (로그인 필요, 회사 없을 때만)
AppRoute       — p8 ~ p25 (로그인 + 회사 컨텍스트 필수)
PortalRoute    — p26, p27 (customer_users 인증)
AdminRoute     — p28, p29, p30 (is_super_admin 필수)
```

## 권한별 접근

| 페이지 | owner | admin | member | 비고 |
|---|---|---|---|---|
| 대시보드·주문·재고·재무 조회 | ✅ | ✅ | ✅ | 읽기 공통 |
| 주문·제품·거래처 생성/수정 | ✅ | ✅ | ✅ | 기본 쓰기 권한 |
| 주문 삭제 | ✅ | ✅ | ❌ | 감사 로그 필수 |
| 팀원 초대 | ✅ | ✅ | ❌ |  |
| 요금제 변경·해지 | ✅ | ❌ | ❌ | owner만 |
| 회사 정보 수정 | ✅ | ✅ | ❌ |  |
| 세금계산서 발행 | ✅ | ✅ | ❌ |  |

---

## 구현 우선순위 (MVP 4주 계획)

| 주차 | 페이지 | 이유 |
|---|---|---|
| **W1** | p1~p8, p20, p23 | 인프라 + 온보딩 + 홈 + 기본 설정 |
| **W2** | p9, p10, p15, p19 | 핵심 업무: 주문·재고·거래처 |
| **W3** | p12, p13, p14, p16, p17, p18, p21 | 매출·매입·재무·팀 |
| **W4** | p22, p11, p26, p27, p28~p30 | 과금·포털·Super Admin + 최종 테스트 |

**v1.1 이후**: p24 (모듈 확장), p25 (택배연동), OCR 인식 주문 (w2의 AUTO 단계)
