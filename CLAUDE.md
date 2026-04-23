# CLAUDE.md — 프로젝트 규칙서

> 이 파일은 Claude Code가 매 세션 시작 시 반드시 먼저 읽어야 하는 **불변 규칙**입니다.
> 모든 규칙은 우선순위 표기(🔴 critical / 🟠 high / 🟡 medium)가 있으며, critical은 어떤 경우에도 위반 금지.

---

## 프로젝트 개요

- **제품**: 엔젤러스(Angelus) 수입 도매 유통을 dogfooding으로 삼는 B2B SaaS 관리 대시보드
- **확장**: 다중 테넌트 구조로 한국 중소 도매 유통업자(1~10인) 대상 SaaS로 판매 예정
- **요금제**: Starter 29,000원 / Pro 79,000원 / Business 199,000원 / 체험 14일
- **핵심 기능 영역**: 주문·매출·매입·재고·재무·거래처·설정 + 거래처 포털 + Super Admin

## 기술 스택

- **Frontend**: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (Auth + DB + Edge Functions + Storage)
- **상태관리**: TanStack Query + Zustand
- **차트**: Recharts
- **결제**: Toss Payments (구독 빌링)
- **배포**: GitHub push → Vercel 자동 배포
- **폰트**: Pretendard (한글) + Inter Tight (영문/숫자)

---

## 🔴 1. 멀티 테넌시 (최우선)

- 🔴 **모든 업무 테이블에 `company_id` 컬럼 필수 + RLS 정책 필수**
- 🔴 **모든 Supabase 쿼리에 `company_id` 필터 필수** (RLS + 프론트 이중 방어)
- 🔴 **현재 `company_id`는 `useCompany()` 훅에서만 획득, 하드코딩 금지**
- 🔴 **`service_role` 키는 Edge Function에서만 사용, 프론트 절대 금지**

## 🔴 2. 계산식 (단일 파일 원칙)

- 🔴 **모든 계산식은 `src/utils/calculations.ts` 단일 파일에만 존재**
- 🔴 **모든 계산식은 첫 인자로 `companyId`를 받음**
- 🟠 페이지 파일 안에 계산 로직 직접 작성 금지
- 🟠 `products.stock` 같은 컬럼 직접 수정 금지, 계산으로만 구함

### 구현해야 할 계산식 8종

| 이름 | 정의 |
|---|---|
| `calcCurrentStock(companyId, productId)` | 기초재고 + 수입/매입 + 반품 - 파손 - 판매수량(올해) |
| `calcMonthlySales(companyId, year, month)` | SUM(quantity × unit_price) WHERE 해당기간 |
| `calcReceivables(companyId, customerId)` | 거래처별 총매출 - 거래처별 총입금 |
| `calcCostOfSales(companyId, period)` | (기초 + 반품 - 파손 + 수입/매입 - 기말) × 1.1 |
| `calcInventoryValue(companyId)` | 현재재고수량 × 가중평균단가 × 1.1 |
| `calcSupplyAmount(totalAmount)` | 매출금액 ÷ 1.1 (역산) |
| `calcOrderSuggestion(companyId, productId)` | (과거6개월판매/6 × 3개월) / 12 [DZ 단위] |
| `calcMRR(companyId)` | SUM(plans.price_krw) WHERE subscriptions.status='active' |

## 🟠 3. 권한 체계

- 🟠 **권한 체크는 `src/utils/permissions.ts` 단일 파일에만 존재**
- 🟠 쓰기 버튼은 `RequireRole` 가드로 감싸기
- 🔴 **RLS에도 role 체크 포함** (프론트만 믿지 말 것)

### 역할
- `owner`: 회사 소유자, 모든 권한 + 결제/해지 가능
- `admin`: 관리자, 결제 외 모든 권한
- `member`: 일반 사용자, 읽기/쓰기 기본 + 일부 삭제 제한

## 🔴 4. 금액/부가세 규칙

- 🟠 **주문/매출 금액은 부가세 포함** (추가 계산 없음)
- 🔴 **세금계산서 공급가액 = 매출 ÷ 1.1** (역산)
- 🔴 **매출금액에 × 1.1 금지** (이미 부가세 포함)
- 🔴 **매출원가 = (기초 + 반품 - 파손 + 수입/매입 - 기말) × 1.1** — 반품(+), 파손(-) 방향 주의
- 🟡 구독료는 부가세 별도, 세금계산서는 운영사(런코리아)가 발행

## 🔴 5. Supabase 조회

- 🔴 **모든 조회에 `fetchAllRows()` 사용** (1000건 제한 자동 해결)
- 🟠 날짜 조회는 `.gte(시작일).lt(종료일)` 형식
- 🟠 판매수량은 **올해 1/1 ~ 현재**만, 5년치 누적 금지

## 🟠 6. 요금제 한도

- 🟠 **모든 한도 체크는 `src/utils/planLimits.ts` 단일 파일에만 존재**
- 🔴 **subscriptions 상태는 웹훅(Edge Function)에서만 갱신**, 프론트 직접 수정 금지
- 🔴 **체험 기간 만료는 서버 시간으로만 검증**, 프론트 값 신뢰 금지

## 🟠 7. UX 공통

- 🟡 모든 테이블 컬럼 너비 드래그 조절 + `columnWidths_{userId}_{페이지명}` localStorage 저장
- 🟡 페이지 상태(필터/탭/스크롤) `pageState_{userId}_{페이지명}` 저장
- 🟠 로그아웃 시 해당 userId localStorage 키 전체 삭제
- 🟡 shadcn/ui 컴포넌트 우선

## 🔴 8. 금지 사항

- 🔴 `npx vercel --prod` 사용 금지 (GitHub push → Vercel 자동 배포)
- 🔴 `company_id` 필터 없이 Supabase 조회 금지
- 🔴 하드코딩된 `company_id` 금지 (반드시 `useCompany()`)
- 🟠 같은 로직 여러 파일에 복사 금지
- 🟠 페이지 파일에 계산/권한/한도 로직 직접 작성 금지

## 🟠 9. 작업 원칙

- 🟡 사용자에게 선택지 주지 말 것, 최선으로 바로 실행
- 🟠 **한 번에 1기능씩, 완료 후 다음 기능**
- 🟡 에러 3회 반복 시 "다른 방법 있다"고 먼저 제안
- 🟠 수정 후 반드시 테스트 실행
- 🟠 완료 시 `git add . && git commit -m '설명' && git push`

---

## 공통 스키마 규칙

- 🔴 **PK는 UUID** (`gen_random_uuid()` 기본값)
- 🔴 **모든 테이블에 `company_id UUID NOT NULL` 필수** (companies, plans, user_profiles 제외)
- 🟠 **모든 테이블에 공통 타임스탬프 3종 추가**: `created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL`, `updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL`, `deleted_at TIMESTAMPTZ NULL` (soft delete)
- 🟠 **컬럼명은 영문 snake_case 전용** (한글 컬럼 금지)
- 🟠 **시간은 TIMESTAMPTZ**, Asia/Seoul 보존

## RLS 정책 템플릿

모든 업무 테이블에 다음 정책을 적용:

```sql
-- SELECT: 자기 회사 데이터만
CREATE POLICY "tenant_select" ON {table}
  FOR SELECT USING (
    company_id = ANY(mochicraft_demo.current_company_ids())
  );

-- INSERT/UPDATE/DELETE: 권한 체크 추가
CREATE POLICY "tenant_write" ON {table}
  FOR ALL USING (
    company_id = ANY(mochicraft_demo.current_company_ids())
    AND mochicraft_demo.my_role(company_id) IN ('owner', 'admin')
  );
```

## 프로젝트 구조

```
src/
├── components/
│   ├── ui/             # shadcn/ui 래핑 (Button, Card, Dialog, ...)
│   ├── layout/         # Header, Nav, Container
│   └── feature/        # 도메인별 (OrdersTable, InventoryLotList, ...)
├── pages/              # 라우트 페이지들
├── hooks/
│   ├── useCompany.ts   # 현재 회사 컨텍스트
│   ├── useAuth.ts
│   └── queries/        # TanStack Query 훅 (테이블별)
├── lib/
│   ├── supabase.ts     # 클라이언트 초기화
│   └── fetchAllRows.ts # 1000건 제한 해결
├── utils/
│   ├── calculations.ts # 🔴 모든 계산식 여기에만
│   ├── permissions.ts  # 🔴 모든 권한 체크 여기에만
│   └── planLimits.ts   # 🔴 모든 요금제 한도 여기에만
├── types/              # 자동 생성된 Supabase 타입
└── app/                # 라우터, 전역 상태
```

---

## 자동 검증 (Playwright MCP)

배포 전 반드시 실행:

1. 다른 회사 계정으로 데이터 격리 확인 (A 회사 데이터가 B 회사에서 안 보이는지)
2. 권한별 접근 제어 (member가 삭제 불가, admin이 결제 불가 등)
3. 로그아웃 후 리다이렉트 & localStorage 삭제 확인
4. 콘솔 에러 0건 체크

---

## 함께 참고할 문서

- `docs/ERD.md` — 20개 테이블 + 23개 관계 전체 명세
- `docs/api.md` — 26개 API 엔드포인트 그룹별 정리
- `docs/workflows.md` — 8개 핵심 비즈니스 워크플로우
- `docs/pages.md` — 30개 페이지 라우팅 및 그룹 구조
- `docs/claude-code-execution-prompts.md` — Phase별 실행 프롬프트
- `claude-design-bundle/` — Claude Design 핸드오프 결과물 (홈 대시보드 + 주문내역 + 거래처)
