# API 엔드포인트 — 26개

> 모든 엔드포인트는 `company_id` RLS 필터 자동 적용. Edge Function이 필요한 엔드포인트는 `*` 표시.

## 🔐 Auth (3)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| POST | `/api/auth/signup` | 회원가입 (이메일/비밀번호 또는 OAuth) | user_profiles |
| POST | `/api/auth/signin` | 로그인, 세션 발급 | user_profiles, memberships |
| POST | `/api/auth/accept-invite` | 초대 수락 (토큰 검증 후 멤버십 생성) | invitations, memberships |

## 🏢 Company (1)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| POST | `/api/companies` | 온보딩: 회사 생성 + owner 멤버십 + 14일 체험 시작 | companies, memberships, subscriptions |

## 📦 Orders (4)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| GET | `/api/orders` | 주문 목록 (필터: 날짜/거래처) | orders, order_items, customers |
| POST | `/api/orders` | 주문 생성 (재고 체크 후) | orders, order_items, inventory_lots |
| PUT | `/api/orders/:id` | 주문 및 상세 수정 | orders, order_items |
| DELETE | `/api/orders/:id` | 주문 삭제 (owner/admin만, 감사 로그 기록) | orders, audit_logs |

## 🏷 Products (1)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| GET | `/api/products` | 제품 CRUD (목록/생성/수정/삭제, PATH로 구분) | products |

## 🤝 Customers (2)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| GET | `/api/customers` | 거래처 CRUD (사업자 조인 포함) | customers, businesses |
| POST | `/api/customers/:id/portal-account` | 거래처 포털 로그인 ID/PW 생성 | customer_users |

## 📋 Inventory (2)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| GET | `/api/inventory/stock` | 현재재고 조회 (`calcCurrentStock()` 결과) | inventory_lots, inventory_transactions, order_items |
| POST | `/api/inventory/damage` | 파손 처리 (창고 파손 트랜잭션 저장) | inventory_transactions |

## 📝 Purchase (2)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| GET | `/api/purchase-orders/suggest` | 발주서 추천 (6개월 평균 기반, `calcOrderSuggestion`) | order_items, inventory_lots, products |
| POST | `/api/purchase-orders` | 확정 발주서 저장 | purchase_orders |

## 💰 Finance (5)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| POST | `/api/finance/bank-upload` | 은행 엑셀 업로드 → bank_transactions 저장 | bank_transactions |
| POST | `/api/finance/match` | 자동 매칭 실행 (3단계 매칭 로직) | bank_transactions, customers |
| GET | `/api/finance/receivables` | 미수금 조회 (`calcReceivables()` 결과) | orders, bank_transactions |
| GET | `/api/finance/tax-invoice/export` | 세금계산서 엑셀 (국세청 양식 xlsx) | orders, businesses, tax_invoices |
| GET | `/api/finance/pnl` | 손익계산서 (`calcCostOfSales` + 매출 + 부가세 토글) | orders, inventory_lots, purchases |

## 👥 Team (1)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| POST | `/api/team/invite` | 팀원 초대 (토큰 생성 + 이메일 발송) | invitations |

## 💳 Billing (2) *Edge Function

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| POST | `/api/billing/webhook` *️⃣ | Toss 웹훅 (결제 이벤트 처리, 서명 검증) | subscriptions, invoices, audit_logs |
| POST | `/api/billing/change-plan` | 플랜 변경 (업/다운그레이드, owner만) | subscriptions |

## 🛍️ Portal (1)

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| POST | `/api/portal/orders` | 거래처 주문 생성 (거래처 로그인 기반) | orders, order_items |

## 👑 Admin (2) *service_role

| Method | Path | 기능 | 사용 테이블 |
|---|---|---|---|
| GET | `/api/admin/companies` *️⃣ | 회사 목록 (Super Admin 전용) | companies, subscriptions |
| GET | `/api/admin/mrr` *️⃣ | MRR 계산 (`calcMRR()` 결과) | subscriptions, plans |

---

## 보안 규칙

| 규칙 | 적용 대상 |
|---|---|
| RLS `company_id` 필터 자동 | 모든 `/api/*` (auth, billing/webhook, admin 제외) |
| 프론트에서 `company_id` 수동 필터 병행 | 모든 TanStack Query 훅 |
| `service_role` 키 사용 가능 | `/api/admin/*`, `/api/billing/webhook` (Edge Function만) |
| 쓰기 권한 체크 | owner/admin만: 삭제, 플랜 변경, 포털 계정 발급 |
| 감사 로그 자동 기록 | DELETE 계열, 결제 이벤트, 권한 변경 |
