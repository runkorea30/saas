# Phase 3: Shell Layout & Global Navigation

전역 2단 네비게이션 Shell을 구현하고, 기존 `/orders` 페이지를 `/sales/orders`로 이전하며, 아직 구현되지 않은 메뉴에 "준비 중" placeholder 페이지를 연결한다.

---

## 1. 라우트 구조

React Router의 중첩 라우트로 구성. 섹션 루트 진입 시 첫 서브페이지로 리다이렉트.

```
/ (Shell layout)
├─ index            → HomePage
├─ /sales           → Navigate to /sales/orders
│   ├─ /orders          → OrdersPage (기존 이전)
│   ├─ /order-entry     → PlaceholderPage
│   └─ /invoices        → PlaceholderPage
├─ /inventory       → Navigate to /inventory/stock
│   ├─ /stock           → PlaceholderPage
│   ├─ /purchase        → PlaceholderPage
│   ├─ /purchase-orders → PlaceholderPage
│   └─ /products        → PlaceholderPage
├─ /finance         → Navigate to /finance/receivables
│   ├─ /receivables     → PlaceholderPage
│   ├─ /banking         → PlaceholderPage
│   ├─ /tax-invoices    → PlaceholderPage
│   └─ /pnl             → PlaceholderPage
└─ /settings        → Navigate to /settings/customers
    └─ /customers       → PlaceholderPage
```

기존 `/orders`는 완전히 없애고 `/sales/orders`로만 접근 가능.

---

## 2. 생성/수정 파일 구조

**새로 생성:**
- `src/components/Shell.tsx` — 레이아웃 (TopNav + SectionNav + Outlet)
- `src/components/nav/TopNav.tsx` — 1단 메인 네비
- `src/components/nav/SectionNav.tsx` — 2단 서브 네비 (동적)
- `src/components/nav/navConfig.ts` — 네비 구조 단일 소스
- `src/components/common/PlaceholderPage.tsx` — 공통 "준비 중" 페이지
- `src/pages/HomePage.tsx` — 홈 스텁 (실제 대시보드는 다음 Phase)

**이동/수정:**
- 기존 `OrdersPage.tsx` → `src/pages/sales/OrdersPage.tsx` (import 경로 업데이트)
- `src/App.tsx` 또는 라우터 파일 — 아래 라우트 구조로 재작성
- 기존 `/orders` 직접 링크가 있다면 `/sales/orders`로 전부 교체

---

## 3. navConfig.ts (단일 소스)

```ts
// src/components/nav/navConfig.ts
export interface NavItem {
  path: string;
  label: string;
}

export interface NavSection {
  path: string;          // 섹션 루트 경로 (1단 네비 클릭 대상)
  label: string;         // 1단에 표시되는 한글 라벨
  indexRedirect: string; // 섹션 진입 시 기본 서브페이지
  items: NavItem[];      // 2단 서브 메뉴 (홈은 빈 배열)
}

export const navSections: NavSection[] = [
  {
    path: '/',
    label: '홈',
    indexRedirect: '/',
    items: [],
  },
  {
    path: '/sales',
    label: '판매',
    indexRedirect: '/sales/orders',
    items: [
      { path: '/sales/orders', label: '주문내역' },
      { path: '/sales/order-entry', label: '수동주문입력' },
      { path: '/sales/invoices', label: '송장대장' },
    ],
  },
  {
    path: '/inventory',
    label: '재고매입',
    indexRedirect: '/inventory/stock',
    items: [
      { path: '/inventory/stock', label: '재고현황' },
      { path: '/inventory/purchase', label: '수입/매입' },
      { path: '/inventory/purchase-orders', label: '발주서' },
      { path: '/inventory/products', label: '제품리스트' },
    ],
  },
  {
    path: '/finance',
    label: '재무',
    indexRedirect: '/finance/receivables',
    items: [
      { path: '/finance/receivables', label: '미수금' },
      { path: '/finance/banking', label: '은행거래' },
      { path: '/finance/tax-invoices', label: '세금계산서' },
      { path: '/finance/pnl', label: '손익계산서' },
    ],
  },
  {
    path: '/settings',
    label: '설정',
    indexRedirect: '/settings/customers',
    items: [
      { path: '/settings/customers', label: '거래처' },
    ],
  },
];

export function isSectionActive(sectionPath: string, pathname: string): boolean {
  if (sectionPath === '/') return pathname === '/';
  return pathname === sectionPath || pathname.startsWith(sectionPath + '/');
}
```

---

## 4. Shell.tsx

```tsx
// src/components/Shell.tsx
import { Outlet } from 'react-router-dom';
import { TopNav } from './nav/TopNav';
import { SectionNav } from './nav/SectionNav';

export function Shell() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <TopNav />
      <SectionNav />
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

---

## 5. TopNav.tsx (1단)

- 높이 56px, sticky top-0, z-20, border-bottom
- 좌측: `MochiCraft OPS` 로고 텍스트 (버건디 색)
- 우측: 5개 섹션 버튼 (홈/판매/재고매입/재무/설정)
- 클릭 시 `indexRedirect` 경로로 `useNavigate()` 이동
- 활성 섹션은 하단에 **3px 버건디 border-bottom**
- hover 시 연한 배경

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
import { navSections, isSectionActive } from './navConfig';

export function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 bg-[var(--color-bg)] border-b border-[var(--color-border)] h-14 flex items-center">
      <div className="max-w-[1400px] mx-auto w-full px-6 flex items-center gap-8">
        <div className="font-semibold text-[var(--color-brand-primary)] tracking-tight">
          MochiCraft OPS
        </div>
        <nav className="flex items-center gap-1 h-full">
          {navSections.map((section) => {
            const active = isSectionActive(section.path, pathname);
            return (
              <button
                key={section.path}
                onClick={() => navigate(section.indexRedirect)}
                className={`
                  h-14 px-4 text-sm font-medium transition-colors relative
                  ${active
                    ? 'text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'}
                `}
              >
                {section.label}
                {active && (
                  <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-[var(--color-brand-primary)]" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
```

---

## 6. SectionNav.tsx (2단)

- 현재 활성 섹션의 `items` 표시. items 비어있으면 **렌더하지 않음** (= 홈에서는 2단 네비바 안 보임)
- 높이 44px, sticky top-14 (TopNav 바로 아래), border-bottom
- 각 아이템은 `NavLink`
- 활성 아이템: **연한 버건디 배경 + 버건디 텍스트** (또는 브랜드 wash 색상)

```tsx
import { NavLink, useLocation } from 'react-router-dom';
import { navSections, isSectionActive } from './navConfig';

export function SectionNav() {
  const { pathname } = useLocation();
  const activeSection = navSections.find((s) => isSectionActive(s.path, pathname));
  if (!activeSection || activeSection.items.length === 0) return null;

  return (
    <div className="sticky top-14 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      <nav className="max-w-[1400px] mx-auto px-6 h-11 flex items-center gap-1">
        {activeSection.items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `px-3 h-8 flex items-center rounded-md text-sm transition-colors
               ${isActive
                 ? 'bg-[var(--color-brand-wash)] text-[var(--color-brand-primary)] font-medium'
                 : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-fg)]'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
```

---

## 7. PlaceholderPage.tsx

현재 URL에 해당하는 label을 navConfig에서 자동 조회해서 표시.

```tsx
import { useLocation, Link } from 'react-router-dom';
import { navSections } from '../nav/navConfig';

export function PlaceholderPage() {
  const { pathname } = useLocation();

  let pageLabel = '페이지';
  let sectionLabel = '';
  for (const section of navSections) {
    const item = section.items.find((i) => i.path === pathname);
    if (item) {
      pageLabel = item.label;
      sectionLabel = section.label;
      break;
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">🚧</div>
      {sectionLabel && (
        <div className="text-sm text-[var(--color-fg-muted)] mb-1">{sectionLabel}</div>
      )}
      <h1 className="text-2xl font-semibold mb-3">{pageLabel}</h1>
      <p className="text-[var(--color-fg-muted)] mb-8 max-w-md">
        이 페이지는 아직 준비 중입니다. 곧 만나요.
      </p>
      <Link
        to="/sales/orders"
        className="px-5 py-2 bg-[var(--color-brand-primary)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        주문내역으로 돌아가기
      </Link>
    </div>
  );
}
```

---

## 8. HomePage.tsx (임시 스텁)

다음 Phase에서 실제 대시보드로 교체 예정. 지금은 간단히:

```tsx
export function HomePage() {
  return (
    <div className="py-12">
      <h1 className="text-2xl font-semibold mb-2">홈 대시보드</h1>
      <p className="text-[var(--color-fg-muted)]">
        매출 요약, 미수금 현황, 최근 주문 등이 이곳에 표시될 예정입니다.
      </p>
    </div>
  );
}
```

---

## 9. App.tsx 라우트

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { HomePage } from './pages/HomePage';
import { OrdersPage } from './pages/sales/OrdersPage';
import { PlaceholderPage } from './components/common/PlaceholderPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />

          <Route path="sales">
            <Route index element={<Navigate to="/sales/orders" replace />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="order-entry" element={<PlaceholderPage />} />
            <Route path="invoices" element={<PlaceholderPage />} />
          </Route>

          <Route path="inventory">
            <Route index element={<Navigate to="/inventory/stock" replace />} />
            <Route path="stock" element={<PlaceholderPage />} />
            <Route path="purchase" element={<PlaceholderPage />} />
            <Route path="purchase-orders" element={<PlaceholderPage />} />
            <Route path="products" element={<PlaceholderPage />} />
          </Route>

          <Route path="finance">
            <Route index element={<Navigate to="/finance/receivables" replace />} />
            <Route path="receivables" element={<PlaceholderPage />} />
            <Route path="banking" element={<PlaceholderPage />} />
            <Route path="tax-invoices" element={<PlaceholderPage />} />
            <Route path="pnl" element={<PlaceholderPage />} />
          </Route>

          <Route path="settings">
            <Route index element={<Navigate to="/settings/customers" replace />} />
            <Route path="customers" element={<PlaceholderPage />} />
          </Route>

          {/* 기존 /orders 들어오면 신규 경로로 */}
          <Route path="orders" element={<Navigate to="/sales/orders" replace />} />

          {/* 404 */}
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 10. 디자인 토큰

`src/styles/tokens.css` (또는 해당 위치) 먼저 읽고 실제 정의된 CSS 변수명 확인 후 사용. 
필요 변수:
- brand primary (버건디)
- brand wash (연한 버건디 배경)
- bg / surface / surface-hover
- fg / fg-muted
- border

변수명이 다르면 **실제 존재하는 변수로 맞춰서 사용**. 존재하지 않는 변수 쓰지 말 것.

Tailwind config에 색상이 매핑되어 있다면 `bg-brand-primary` 같은 유틸리티 클래스를 우선 사용해도 좋음 (CSS 변수 직접 참조는 fallback).

---

## 11. 기존 Orders 페이지 이전

1. `src/pages/OrdersPage.tsx`를 `src/pages/sales/OrdersPage.tsx`로 이동
2. 내부에서 참조하는 상대경로 import 업데이트 (예: `../components/...` → `../../components/...`)
3. 기능/디자인은 **1픽셀도 건드리지 말 것**. 위치만 이동.
4. 어제 완성된 모습 그대로 유지되어야 함 (KPI 4개, 필터 바, 15건 목록, 상세 패널 전부).

---

## Acceptance Criteria

- [ ] `npm run dev` 후 `http://localhost:5173/` 접속 시 홈 대시보드 스텁 표시 + 2단 네비바 **숨김**
- [ ] 1단에서 "판매" 클릭 → `/sales/orders`로 이동 + 2단 네비바 표시 + 주문내역 렌더
- [ ] 2단에서 "수동주문입력" 클릭 → `/sales/order-entry`로 이동 + "준비 중" 페이지 표시
- [ ] 1단에서 현재 섹션 하단에 **3px 버건디 라인**
- [ ] 2단에서 현재 페이지가 **연한 버건디 배경 + 버건디 텍스트**로 강조
- [ ] 직접 URL 입력 (`/finance/banking`) 시 네비가 "재무 / 은행거래"로 올바르게 활성화
- [ ] `/sales` 접속 시 `/sales/orders`로 자동 리다이렉트 (다른 섹션도 동일)
- [ ] 기존 `/orders` 접속 시 `/sales/orders`로 리다이렉트
- [ ] 홈 페이지에서는 2단 네비바가 렌더되지 않음
- [ ] 없는 경로 (`/foo/bar`) 접속 시 PlaceholderPage 표시
- [ ] Orders 페이지 기능/디자인 어제 모습 그대로 (KPI, 필터, 목록, 상세)
- [ ] `npm run build` 성공, TypeScript 에러 0개, ESLint 에러 0개

---

## 작업 순서 제안

1. `navConfig.ts` 먼저 (모든 컴포넌트가 이걸 참조)
2. `PlaceholderPage.tsx` → `HomePage.tsx` (간단한 것부터)
3. `TopNav.tsx` → `SectionNav.tsx` → `Shell.tsx`
4. `OrdersPage.tsx` 파일 이동
5. `App.tsx` 라우트 전면 재작성
6. dev 서버 띄워서 직접 클릭 테스트 (Acceptance Criteria 전 항목)
7. `npm run build` 통과 확인

---

## 커밋

완료 후:

```
@bkit "Phase 3: Shell layout with 2-tier top nav + route stubs for 12 pages"
```
