# DESIGN_SPEC — 컴포넌트 디자인 명세

> Claude Code가 React 컴포넌트 만들 때 참조할 디자인 규칙집.
> `tokens.css`를 CSS 변수로 사용 + Tailwind는 레이아웃/spacing 용도로만.

## 1. 레이아웃 — 상단 가로 메뉴

```tsx
// AppShell.tsx 구조
<div className="min-h-screen flex flex-col">
  {/* 1단 — 시스템 (높이 56px) */}
  <div className="border-b px-8 flex items-center justify-between h-14">
    <div className="flex items-center gap-6">
      <Logo /> {/* "MochiCraft OPS" */}
      <CompanyDropdown />  {/* 앤젤러스 코리아 */}
    </div>
    <GlobalSearch />  {/* ⌘K 단축키 표시 */}
    <div className="flex items-center gap-4">
      <CurrentTime />
      <DarkModeToggle />
      <NotificationBell />
      <ProfileDropdown />
    </div>
  </div>

  {/* 2단 — 메뉴 (높이 48px) */}
  <div className="border-b px-8 flex items-center justify-between h-12">
    <nav className="flex items-center gap-1">
      <NavItem href="/dashboard" active>홈</NavItem>
      <NavDropdown label="판매" items={salesMenu} />
      <NavDropdown label="재고·매입" items={inventoryMenu} />
      <NavDropdown label="재무" items={financeMenu} />
      <NavItem href="/reports">리포트</NavItem>
      <NavDropdown label="설정" items={settingsMenu} />
    </nav>
    <div className="flex items-center gap-2">
      <Button variant="ghost">리포트 받기</Button>
      <Button variant="primary">+ 주문 추가</Button>
    </div>
  </div>

  {/* 본문 */}
  <main className="flex-1 max-w-[1720px] mx-auto w-full p-8">
    <Outlet />
  </main>
</div>
```

### NavItem 활성 표시
```tsx
// 활성: 하단에 버건디 underline 2px
<a className={cn(
  "h-12 px-3 flex items-center text-sm font-medium relative",
  active && "before:content-[''] before:absolute before:bottom-0 before:left-0 before:right-0 before:h-[2px] before:bg-[var(--brand)]"
)}>
```

### 드롭다운 그룹 (클릭 열림, hover 아님)
- **판매**: 주문내역(뱃지) · 수동 주문 입력 · 송장 대장 · ─── · 거래처 · 상품
- **재고·매입**: 재고현황(뱃지) · 수입·매입 · 발주서
- **재무**: 미수금 · 은행거래(뱃지) · 세금계산서 · 손익계산서
- **설정**: 회사정보 · 팀원 · 요금제 · 프로필 · ─── · 모듈관리 · 택배연동

## 2. 홈 대시보드 구조

```
┌─ 환영 메시지 (48px)
│  ㅣ 작은 경로 (홈 > 대시보드 · 2026.04.24 · 금요일)
│  ㅣ "안녕하세요, [정민호] 님" (26px, Fraunces, 이름=italic+버건디)
│  ㅣ "오늘 처리할 일이 18건 있습니다. 이번달 매출은 목표의 64%를 달성했어요."
│
├─ KPI 그리드 4장 (높이 150px, gap 20px)
│  ㅣ 이번달 매출 · 미수금 합계 · 재고자산 평가액 · 이익률
│  ㅣ 각 카드: [라벨] [큰 숫자] [증감 뱃지] [스파크라인 차트]
│
├─ 2컬럼 그리드 (좌 2fr, 우 1fr, gap 20px)
│  ├─ TodaySection (오늘 처리할 것) — 4개 sub-card 2x2
│  │  ㅣ 미입고 발주서 · 미수금 경과 · 재고 부족 · 미매칭 입금
│  └─ RevenueChart (최근 30일 매출) — Recharts AreaChart
│
├─ Timeline (최근 거래 타임라인)
│  ㅣ 최근 10건 이벤트, 8분 전 / 42분 전 형태 상대시간
│
└─ 푸터 (© 2026 MochiCraft · v0.9.3 · KST · KRW)
```

## 3. KPI 카드

```tsx
<div className="card p-5">
  <div className="flex items-center justify-between mb-3">
    <span className="text-xs text-[var(--ink-3)]">이번달 매출</span>
    {/* 옵션 뱃지 - 미수금에만 */}
    {badge && <Chip variant="danger-subtle">30일 경과 6건</Chip>}
  </div>
  <div className="flex items-baseline gap-2">
    <div className="num text-3xl font-semibold">₩128.4M</div>
    <Chip variant="success-subtle">↑ 12.4%</Chip>
  </div>
  <div className="h-10 mt-3">
    <Sparkline data={trend} />  {/* Recharts MiniLineChart */}
  </div>
  <div className="text-xs text-[var(--ink-3)] mt-2">
    전월 대비 · 4월 1일 — 4월 19일 기준
  </div>
</div>
```

## 4. Chip (뱃지) 변형

```tsx
const chipVariants = {
  'success-subtle': { bg: 'var(--success-wash)', color: 'var(--success)' },
  'warning-subtle': { bg: 'var(--warning-wash)', color: 'var(--warning)' },
  'danger-subtle':  { bg: 'var(--danger-wash)',  color: 'var(--danger)' },
  'info-subtle':    { bg: 'var(--info-wash)',    color: 'var(--info)' },
  'brand-subtle':   { bg: 'var(--brand-wash)',   color: 'var(--brand)' },
  'neutral':        { bg: 'var(--surface-2)',    color: 'var(--ink-2)' },
};
```

## 5. 거래처 등급 뱃지 (A~E)

A = 골드 (tan 계열), B = 구리 (brown), C/D/E = 뉴트럴 회색

```tsx
const gradeColors = {
  A: { bg: '#E8C87A', color: '#6D5318' },  // Gold
  B: { bg: '#C89368', color: '#5A3A1E' },  // Bronze
  C: 'neutral',
  D: 'neutral',
  E: 'neutral',
};
```

## 6. 주문내역 DataTable

- **행 높이**: 48px (기본), 40px (조밀), 56px (여유)
- **체크박스**: 왼쪽 첫 열, 전체 선택 가능
- **행 확장**: 좌측 `>` 아이콘 클릭 시 아래 order_items 펼침
- **상태 뱃지 5종**: 임시(회색) · 확정(파랑) · 출고(주황) · 완료(녹색) · 취소(빨강)
- **경로 아이콘**: 손(manual) · 🌐(portal) · ✨(ai)
- **작성자 아바타**: 이니셜 원 (JH, SJ 등), 색상 해싱
- **반품 행**: 빨강 취소선 + 순액 병기 (`507,900원` + `반품 -19,600원` 작게)

## 7. 다크모드

- toggle로 `html[data-theme="dark"]` attribute 토글
- localStorage에 저장 (`theme` 키)
- 모든 CSS 변수 자동 전환 (tokens.css에 이미 구현)
- 다크 모드에서 버건디는 `#C47A80` (밝게) — 가독성 유지

## 8. 간격 시스템

| 용도 | 값 | Tailwind |
|---|---|---|
| 카드 내부 패딩 | 20px | `p-5` |
| 카드 간격 | 20px | `gap-5` |
| 페이지 수평 패딩 | 32px | `px-8` |
| 페이지 수직 패딩 | 24px 상 / 40px 하 | `pt-6 pb-10` |
| 최대 너비 | 1720px | `max-w-[1720px]` |

## 9. 폰트 사이즈 스케일

| 용도 | 크기 | Tailwind |
|---|---|---|
| 히어로 숫자 (KPI) | 30px | `text-3xl` |
| 페이지 제목 | 26px | `text-[26px]` (Fraunces) |
| 섹션 제목 | 18px | `text-lg` |
| 본문 | 14px | `text-sm` |
| 보조 텍스트 | 13px | `text-[13px]` |
| 라벨/캡션 | 12px | `text-xs` |
| 작은 라벨 | 11px | `text-[11px]` |

## 10. 인터랙션 규칙

- **Hover transition**: `.15s ease`
- **Focus ring**: 2px `var(--brand)` + 2px offset (`.focus-ring:focus-visible`)
- **행 hover**: 오른쪽에 `→` 화살표 표시 (`.row-link:hover .hover-arrow`)
- **버튼 primary hover**: `--brand` → `--brand-deep`로 어두워짐

## 참고 — 더미 데이터 스타일

한국 도매업 맥락에 맞는 사실적 더미 데이터 원칙:
- **거래처**: 한길가죽공방, 서울레더스튜디오, 부산크래프트마트 (지역명 + 업종)
- **상품**: `Angelus Acrylic Leather Paint — Black 4oz`, SKU `AGL-ACR-BLK-4oz`
- **발주번호**: `PO-2604-018` (연월-순번)
- **주문번호**: `ORD-26041935` (YYMMDD순번)
- **공급사**: Angelus USA, Fiebing's, Tandy Leather (실재 가죽용품 브랜드)
- **금액 표시**: 큰 숫자는 `₩128.4M` / 본문은 `1,428,000원` / 비교는 `↑12.4%` `↓3.1%`
