# Claude Design 번들

## 안내

Claude Design으로 만든 UI 디자인 결과물 중 **핵심 자산**만 이 번들에 포함했습니다.

| 파일 | 역할 |
|---|---|
| `src/tokens.css` | ⭐ **가장 중요** — 디자인 시스템 전체 (색상/폰트/그림자/라이트&다크모드) |
| `Home Dashboard.html` | 홈 대시보드 HTML 미리보기 (참고용) |
| `DESIGN_SPEC.md` | 디자인 시스템 명세서 — Claude Code가 React 컴포넌트 만들 때 참조 |

## 디자인 시스템 핵심

### 브랜드 정체성
- **컨셉**: 크래프트 레더 + 모던 SaaS + 재무 신뢰감
- **포인트 컬러**: Deep Burgundy (`#6B1F2A`)
- **배경**: Warm Off-white (`#F6F1E9`) — 종이 그레인 패턴 포함
- **폰트**:
  - 한글: Pretendard Variable
  - 숫자/영문: Inter Tight (tabular-nums)
  - 디스플레이: Fraunces (이탤릭체로 이름 강조 등)

### 주요 레이아웃 (홈 대시보드 기준)
- **상단 가로 네비게이션** 2단:
  - 1단 (시스템): 로고 · 회사 드롭다운 · 전역 검색 · 시간 · 다크모드 · 알림 · 프로필
  - 2단 (메뉴): 홈 | 판매 ▾ | 재고·매입 ▾ | 재무 ▾ | 리포트 | 설정 ▾
- **우상단 고정 CTA**: `[+ 주문 추가]` (버건디 primary)
- **홈 본문**:
  - 환영 메시지 ("안녕하세요, [이름]님" — 이름에 이탤릭+버건디)
  - KPI 4장 (이번달 매출 · 미수금 · 재고자산 · 이익률)
  - "오늘 처리할 것" 섹션 (4종 리스트: 미입고 발주 · 미수금 경과 · 재고 부족 · 미매칭 입금)
  - 최근 30일 매출 차트 (Recharts)
  - 최근 거래 타임라인

### 색상 변수 (라이트 모드)
- 배경: `var(--bg)` / `var(--surface)` / `var(--surface-2)`
- 텍스트: `var(--ink)` (가장 진함) → `--ink-2` → `--ink-3` → `--ink-4` (가장 옅음)
- 라인: `var(--line)` / `var(--line-strong)`
- 상태: `--success` (녹색) · `--warning` (앰버) · `--danger` (빨강) · `--info` (청색)
  - 각각 `-wash` 접미사로 배경용 연한 톤 있음

### 재사용 CSS 클래스
- `.card` — 표준 카드 (배경+보더+라운드+그림자)
- `.chip` — 태그/뱃지 (22px 높이, pill 형태)
- `.btn` / `.btn.primary` / `.btn.ghost` — 버튼 3종
- `.num` — 숫자 강조 (tabular-nums + Inter Tight)
- `.disp` — 디스플레이 (Fraunces 세리프)
- `.kbd` — 키보드 단축키 표시

## Claude Code에게 전달하는 방법

Phase 1에서 자동으로 `src/index.css`에 `tokens.css` 내용이 이식됩니다.
이후 Phase 2에서 컴포넌트 만들 때 `DESIGN_SPEC.md` 참고.
