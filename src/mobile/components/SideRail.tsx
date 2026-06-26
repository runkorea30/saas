/**
 * 사이드레일 — 펼침 상태에서 표시 (80px 너비).
 * 7개 메뉴 모두 표시, 더보기 없음.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconBox,
  IconChart,
  IconDoc,
  IconEdit,
  IconList,
  IconTag,
  IconTruck,
} from './MobileIcons';

interface RailItem {
  path: string;
  icon: React.ReactNode;
  label: string;
}

const ITEMS: RailItem[] = [
  { path: '/mobile/orders', icon: <IconList />, label: '주문내역' },
  { path: '/mobile/input', icon: <IconEdit />, label: '주문입력' },
  { path: '/mobile/sales', icon: <IconChart />, label: '매출분석' },
  { path: '/mobile/inventory', icon: <IconBox />, label: '재고현황' },
  { path: '/mobile/import', icon: <IconTruck />, label: '수입/매입' },
  { path: '/mobile/purchase', icon: <IconDoc />, label: '발주서' },
  { path: '/mobile/products', icon: <IconTag />, label: '제품' },
];

export function SideRail() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <aside className="m-rail" aria-label="모바일 사이드 네비게이션">
      <div className="m-rail-logo">OPS</div>
      {ITEMS.map((it) => {
        const active = location.pathname.startsWith(it.path);
        return (
          <button
            type="button"
            key={it.path}
            className={`m-rail-item ${active ? 'is-active' : ''}`}
            onClick={() => navigate(it.path)}
            aria-current={active ? 'page' : undefined}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        );
      })}
    </aside>
  );
}
