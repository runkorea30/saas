# MochiCraft OPS Mobile PWA 구현

## 개요
기존 OPS(`saas-beta-pied.vercel.app`)에 모바일 PWA를 추가한다.
별도 앱이 아닌 **동일 레포(`src/mobile/`)에 새 라우트**로 구현.
기존 Supabase DB, 훅, 유틸을 그대로 재사용.

---

## 작업 전 분석 (필수, 보고 후 진행)

```
src/App.tsx                  (라우팅 구조 확인)
src/hooks/queries/           (재사용할 훅 목록 파악)
src/utils/calculations.ts    (재사용할 계산 함수 파악)
public/                      (manifest.json, icons 여부 확인)
vite.config.ts               (PWA 플러그인 여부 확인)
```

파악 후 보고하고 진행하라.

---

## 디렉토리 구조

```
src/
  mobile/
    MobileApp.tsx              ← 모바일 앱 루트 (라우터)
    MobileLayout.tsx           ← 하단탭바 + 사이드레일 레이아웃
    styles/
      mobile.css               ← 모바일 전용 CSS 변수/공통 스타일
    pages/
      OrderListPage.tsx        ← 주문내역
      OrderInputPage.tsx       ← 수동주문입력
      SalesAnalysisPage.tsx    ← 매출분석
      InventoryPage.tsx        ← 재고현황
      ImportPage.tsx           ← 수입/매입
      PurchaseOrderPage.tsx    ← 발주서
      ProductListPage.tsx      ← 제품리스트
    components/
      BottomNav.tsx            ← 하단 탭바 (접힌 상태)
      SideRail.tsx             ← 사이드 네비 (펼친 상태)
      OrderCard.tsx            ← 주문 카드
      StockBadge.tsx           ← 재고 상태 도트/뱃지
```

---

## 라우팅 추가

`src/App.tsx`에 모바일 라우트 추가:
```tsx
<Route path="/mobile/*" element={<MobileApp />} />
```

---

## 디자인 토큰 (mobile.css)

```css
:root {
  --m-primary: #6B1F2A;
  --m-primary-light: #8B3A4A;
  --m-bg: #FAFAF8;
  --m-surface: #FFFFFF;
  --m-text: #1A1A1A;
  --m-text-secondary: #6B7280;
  --m-border: #E5E7EB;
  --m-success: #10B981;
  --m-warning: #F59E0B;
  --m-danger: #EF4444;
  --m-stock-ok: #10B981;
  --m-stock-low: #F59E0B;
  --m-stock-out: #EF4444;
  --m-nav-height: 64px;
  --m-rail-width: 80px;
}

/* 다크모드 */
.dark {
  --m-bg: #111111;
  --m-surface: #1C1C1E;
  --m-text: #F5F5F5;
  --m-text-secondary: #9CA3AF;
  --m-border: #2C2C2E;
}
```

---

## MobileLayout.tsx

```tsx
// 접힘(≤600px): 하단 탭바
// 펼침(>600px): 좌측 사이드레일 (80px) + 우측 콘텐츠
const isFolded = useMediaQuery('(max-width: 600px)');

return (
  <div className={`mobile-app ${isDark ? 'dark' : ''}`}>
    {!isFolded && <SideRail />}
    <main className="mobile-content">
      <Outlet />
    </main>
    {isFolded && <BottomNav />}
  </div>
);
```

---

## 페이지별 구현 명세

### 1. 주문내역 (OrderListPage)

**접힌 상태**: 주문 카드 리스트 (세로 스크롤)
**펼친 상태**: 좌측 카드 리스트 + 우측 선택된 주문 상세

```tsx
// 상단: 기간 탭 (오늘/이번주/이번달/전체)
// 카드: 거래처명 + 등급뱃지(A/B/C/D) + 상태뱃지(확정/대기) + 날짜 + 수량 + 금액
// 펼친 상태: 카드 클릭 시 우측에 제품 목록 표시

// 재사용 훅: useOrders (기존)
// 등급 뱃지: A=burgundy, B=orange, C=blue, D=gray
// 상태 뱃지: 확정=green, 대기=orange
```

### 2. 수동주문입력 (OrderInputPage)

```tsx
// 거래처 select + 날짜 input
// 제품 행: # | 제품명 | 수량(탭 편집) | 금액
// + 제품 추가 버튼
// 하단: 합계 + 저장 버튼(full-width, burgundy)
// 재사용: useSalesInput 훅 또는 기존 주문 저장 로직
```

### 3. 매출분석 (SalesAnalysisPage)

```tsx
// KPI 카드: 이번달 매출 + 전월대비 % (burgundy 배경)
// 탭: 월별/일별/제품별
// 월별: 바 차트 (6개월, 현재월 진한 burgundy, 나머지 연한 핑크)
// TOP 제품: 순위 + 제품명 + 가로 진행바 + 수량
// 재사용: useSalesAnalysis 또는 기존 매출 훅
```

### 4. 재고현황 (InventoryPage)

```tsx
// 상단 요약: 품절 N개(빨간) + 부족 N개(주황) 카드 2개
// 분류별 그룹핑 (1-1.레더페인트, 1-2.콜렉터에디션 ...)
// 각 제품 행: 색상도트 + 제품명 + 재고수량
//   - 충분(>20): 초록 도트, 숫자만
//   - 주의(5~20): 주황 도트, 주황 박스 숫자
//   - 부족(<5): 주황 도트, 주황 박스 숫자 (진하게)
//   - 품절(0이하): 빨간 도트, 빨간 "품절" 뱃지
// 펼친 상태: 2컬럼 그리드로 분류 표시
// 재사용: useInventory 기존 훅 + 재고 계산 로직
```

### 5. 수입/매입 (ImportPage)

```tsx
// 카드 리스트
// 카드: 공급사명(영문) + 상태뱃지 + 날짜 + 품목설명 + DZ수량 + $금액
// 상태: 통관완료(burgundy), 운송중(orange), 입고완료(green)
// 재사용: useImportInvoices 기존 훅
```

### 6. 발주서 (PurchaseOrderPage)

```tsx
// 탭: 페덱스(항공) / 해상운송
// 테이블: PRODUCT(영문명+색상도트) | DZ | AMOUNT($)
// 하단: TOTAL + 엑셀 다운로드 버튼
// 재사용: usePurchaseOrders 기존 훅
// name_en 우선, 없으면 name fallback
// unit_order='DZ'면 수량 ÷12 환산
```

### 7. 제품리스트 (ProductListPage)

```tsx
// 분류별 그룹핑
// 각 행: 코드(짧게) + 제품명 + 판매가
// 재사용: useProducts 기존 훅
```

---

## BottomNav.tsx (접힌 상태 하단 탭)

```tsx
const tabs = [
  { path: '/mobile/orders', icon: <ListIcon />, label: '주문내역' },
  { path: '/mobile/input', icon: <EditIcon />, label: '주문입력' },
  { path: '/mobile/sales', icon: <ChartIcon />, label: '매출분석' },
  { path: '/mobile/inventory', icon: <BoxIcon />, label: '재고현황' },
  { path: '/mobile/more', icon: <MoreIcon />, label: '더보기' },
];
// '더보기' 탭: 수입/매입, 발주서, 제품리스트 서브메뉴 슬라이드업
// 활성 탭: burgundy 색상 + 하단 도트
```

---

## SideRail.tsx (펼친 상태 좌측 레일)

```tsx
// 너비 80px
// 상단: OPS 로고
// 아이콘 + 짧은 텍스트 (수직 배열)
// 7개 메뉴 모두 표시 (더보기 없음)
// 활성: burgundy 테두리 + 배경
```

---

## PWA 설정

`public/manifest.json` 생성 또는 수정:
```json
{
  "name": "MochiCraft OPS",
  "short_name": "OPS",
  "start_url": "/mobile/orders",
  "display": "standalone",
  "background_color": "#FAFAF8",
  "theme_color": "#6B1F2A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`index.html`에 추가:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6B1F2A">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
```

아이콘 파일은 burgundy 배경에 흰색 박스 아이콘으로 SVG→PNG 변환해서 생성.

---

## 체크포인트

- [ ] `/mobile/orders` 라우트 접근 가능
- [ ] 접힌(360px) 상태: 하단 탭바 표시
- [ ] 펼친(884px) 상태: 사이드레일 + 2컬럼 레이아웃
- [ ] 주문내역: 카드 목록 + 클릭 시 상세
- [ ] 재고현황: 품절/부족/충분 색상 도트
- [ ] 발주서: 영문명 + DZ 단위 표시
- [ ] 다크모드 토글 동작
- [ ] PWA manifest 적용 (홈화면 추가 가능)
- [ ] TypeScript 타입 에러 없음
- [ ] `npm run build` 통과

---

## 커밋

```bash
git add src/mobile/ public/manifest.json index.html src/App.tsx
git commit -m "feat: MochiCraft OPS 모바일 PWA 추가 (/mobile 라우트)"
git push
```

---

## 주의사항

- 기존 OPS 페이지(`/sales`, `/inventory` 등) 절대 건드리지 말 것
- `supabase.from('table')` 직접 사용 (`.schema()` 호출 금지)
- `useCompany()`로 companyId 접근
- `fetchAllRows()` 패턴 유지
- `src/utils/calculations.ts` 수정 금지 — 호출만
- 모바일 전용 새 훅이 필요하면 `src/mobile/hooks/`에 생성
- 기존 훅을 그대로 import해서 재사용하는 것이 우선
- 페이지 구현 순서: MobileLayout → OrderListPage → InventoryPage → 나머지
