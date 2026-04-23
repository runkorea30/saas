/**
 * 전역 네비게이션 단일 소스.
 *
 * - TopNav(1단): `navSections` 5개 섹션 렌더
 * - SectionNav(2단): 활성 섹션의 `items`만 렌더 (items 비면 숨김)
 * - PlaceholderPage: pathname으로 라벨 역조회
 *
 * 🟠 CLAUDE.md §8: 같은 로직 여러 파일에 복사 금지 → 경로/라벨은 여기에만.
 */

export interface NavItem {
  path: string;
  label: string;
}

export interface NavSection {
  /** 섹션 루트 경로 (1단 네비 클릭 대상) */
  path: string;
  /** 1단에 표시되는 한글 라벨 */
  label: string;
  /** 섹션 진입 시 기본 서브페이지 */
  indexRedirect: string;
  /** 2단 서브 메뉴 (홈은 빈 배열) */
  items: NavItem[];
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
    items: [{ path: '/settings/customers', label: '거래처' }],
  },
];

/**
 * 주어진 섹션 경로가 현재 pathname 기준으로 활성인지 판정.
 * 홈(`/`)만 정확 일치, 나머지는 `/sales` 또는 `/sales/...` 접두 일치.
 */
export function isSectionActive(sectionPath: string, pathname: string): boolean {
  if (sectionPath === '/') return pathname === '/';
  return pathname === sectionPath || pathname.startsWith(sectionPath + '/');
}
