/**
 * 하단 탭바 — 접힘 상태에서 표시.
 * 4개 핵심 메뉴 + 더보기 시트(수입/매입, 발주서, 제품리스트).
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconBox,
  IconChart,
  IconDoc,
  IconEdit,
  IconList,
  IconMore,
  IconTag,
  IconTrend,
  IconTruck,
} from './MobileIcons';

interface TabDef {
  path: string;
  icon: React.ReactNode;
  label: string;
}

// 아이콘 좁은 화면 대응 — 사이즈를 20 으로 축소하여 6 columns 가 안정적으로 들어가게.
const NAV_ICON_SIZE = 20;

const PRIMARY_TABS: TabDef[] = [
  { path: '/mobile/orders', icon: <IconList size={NAV_ICON_SIZE} />, label: '주문내역' },
  { path: '/mobile/input', icon: <IconEdit size={NAV_ICON_SIZE} />, label: '주문입력' },
  { path: '/mobile/sales', icon: <IconChart size={NAV_ICON_SIZE} />, label: '매출분석' },
  { path: '/mobile/inventory', icon: <IconBox size={NAV_ICON_SIZE} />, label: '재고현황' },
  { path: '/mobile/finance', icon: <IconTrend size={NAV_ICON_SIZE} />, label: '재무' },
];

const MORE_PATHS = ['/mobile/purchase', '/mobile/import', '/mobile/products', '/mobile/audit'];

const MORE_ITEMS: TabDef[] = [
  { path: '/mobile/purchase', icon: <IconDoc />, label: '발주서' },
  { path: '/mobile/import', icon: <IconTruck />, label: '수입/매입' },
  { path: '/mobile/audit', icon: <IconBox />, label: '재고실사' },
  { path: '/mobile/products', icon: <IconTag />, label: '제품리스트' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isMoreActive = MORE_PATHS.some((p) => location.pathname.startsWith(p));

  return (
    <>
      <nav className="m-bottom-nav" aria-label="모바일 하단 탭">
        {PRIMARY_TABS.map((t) => {
          const active = location.pathname.startsWith(t.path);
          return (
            <button
              type="button"
              key={t.path}
              className={`m-bottom-nav-item ${active ? 'is-active' : ''}`}
              onClick={() => navigate(t.path)}
              aria-current={active ? 'page' : undefined}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`m-bottom-nav-item ${isMoreActive ? 'is-active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <IconMore size={NAV_ICON_SIZE} />
          <span>더보기</span>
        </button>
      </nav>

      {sheetOpen && (
        <>
          <div className="m-sheet-backdrop" onClick={() => setSheetOpen(false)} />
          <div className="m-sheet" role="dialog" aria-label="더보기">
            <div className="m-sheet-handle" />
            {MORE_ITEMS.map((t) => (
              <button
                type="button"
                key={t.path}
                className="m-sheet-item"
                onClick={() => {
                  setSheetOpen(false);
                  navigate(t.path);
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    color: 'var(--m-primary)',
                  }}
                >
                  {t.icon}
                  <span style={{ color: 'var(--m-text)' }}>{t.label}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
