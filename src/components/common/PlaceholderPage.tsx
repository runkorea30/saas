/**
 * 아직 구현되지 않은 메뉴의 공통 "준비 중" 페이지.
 * navConfig에서 현재 pathname에 해당하는 label을 자동 조회해 표시한다.
 */
import { Link, useLocation } from 'react-router-dom';
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
        <div className="text-sm mb-1 text-ink-3">{sectionLabel}</div>
      )}
      <h1 className="text-2xl font-semibold mb-3 text-ink">{pageLabel}</h1>
      <p className="mb-8 max-w-md text-ink-3">
        이 페이지는 아직 준비 중입니다. 곧 만나요.
      </p>
      <Link
        to="/sales/orders"
        className="px-5 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90 bg-brand text-[#FDFAF4]"
      >
        주문내역으로 돌아가기
      </Link>
    </div>
  );
}
