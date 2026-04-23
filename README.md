# MochiCraft Demo — 엔젤러스 수입유통 SaaS 관리 대시보드

> **MochiCraft 로드맵 데모 프로젝트 "만집"**
> 엔젤러스(Angelus) 가죽용품 수입·유통업을 dogfooding 기반으로 삼은 B2B SaaS.
> 한국 중소 도매 유통업자 (1~10인) 대상으로 확장 예정.

## 현재 상태

**Phase 0 완료** — 설계·스키마·디자인 자료 투입 완료. 아직 코드는 없음.
Phase 1 (Vite 초기 세팅)부터 Claude Code로 구현 시작.

## 레포 구조

```
saas/
├── CLAUDE.md                       # 🔴 Claude Code 불변 규칙 (최우선 읽기)
├── docs/
│   ├── ERD.md                      # 20 테이블, 23 관계, 8 계산식
│   ├── api.md                      # 26 API 엔드포인트
│   ├── workflows.md                # 8 비즈니스 워크플로우
│   ├── pages.md                    # 30 페이지 라우팅 및 권한
│   └── claude-code-execution-prompts.md  # 단계별 실행 프롬프트
├── supabase/migrations/
│   ├── 001_init_schema.sql         # ✅ 이미 실행됨
│   ├── 002_indexes.sql             # ✅ 이미 실행됨
│   ├── 003_triggers.sql            # ✅ 이미 실행됨
│   ├── 004_rls_policies.sql        # ✅ 이미 실행됨
│   ├── 005_seed_plans.sql          # ✅ 이미 실행됨
│   └── README.md
└── claude-design-bundle/
    ├── Home Dashboard.html         # 가로 메뉴 레이아웃
    ├── Customers.html              # 거래처 관리
    ├── Orders.html, Orders v2.html # 주문내역
    └── src/                        # React JSX 컴포넌트 14개 + tokens.css
```

## 기술 스택 (예정)

- **Frontend**: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- **Backend**: Supabase (스키마 `mochicraft_demo` 격리)
- **상태**: TanStack Query + Zustand
- **차트**: Recharts
- **결제**: Toss Payments (구독 빌링)
- **배포**: Vercel (GitHub push 자동)
- **폰트**: Pretendard (한글) + Inter Tight (영문/숫자) + Fraunces (display)

## Supabase 스키마 정보

- 프로젝트 ID: `adfobvwuzkufsmukdfrt` (dashboard-v2 공유, 무료 플랜)
- 스키마: `mochicraft_demo` (격리)
- 테이블: 20개 / 인덱스: 75 / RLS 정책: 31 / 트리거: 19

### ⚠️ 초기 세팅 시 필요한 수동 설정

Supabase Dashboard → Project Settings → API → **Exposed schemas**에 `mochicraft_demo` 추가 후 Save.
이걸 안 하면 프론트에서 스키마 접근이 차단됩니다.

## 다음 단계

`docs/claude-code-execution-prompts.md`의 **Phase 1** 프롬프트를 Claude Code에 투입.

## 설계 원칙 (요약)

- 🔴 **멀티테넌시**: 모든 업무 테이블 `company_id` + RLS
- 🔴 **계산식 단일 파일**: `src/utils/calculations.ts`에만
- 🔴 **매출 부가세 포함**: 공급가액은 `÷ 1.1`로 역산, `× 1.1` 금지
- 🔴 **Supabase 조회**: 항상 `fetchAllRows()` (1000건 한계 해결)
- 🔴 **`npx vercel --prod` 금지**: GitHub push만 사용

상세는 `CLAUDE.md` 참고.

## 요금제 설계 (MVP)

| 플랜 | 월 요금 | 사용자 한도 | 월 주문 한도 |
|---|---|---|---|
| Free | ₩0 | 1 | 100 |
| Starter | ₩29,000 | 3 | 1,000 |
| Pro | ₩79,000 | 10 | 무제한 |
| Business | ₩199,000 | 무제한 | 무제한 |

체험: 14일.
