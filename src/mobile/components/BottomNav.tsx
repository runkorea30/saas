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
  IconTruck,
} from './MobileIcons';

interface TabDef {
  path: string;
  icon: React.ReactNode;
  label: string;
}

const PRIMARY_TABS: TabDef[] = [
  { path: '/mobile/orders', icon: <IconList />, label: '주문내역' },
  { path: '/mobile/input', icon: <IconEdit />, label: '주문입력' },
  { path: '/mobile/sales', icon: <IconChart />, label: '매출분석' },
  { path: '/mobile/inventory', icon: <IconBox />, label: '재고현황' },
];

const MORE_PATHS = ['/mobile/import', '/mobile/purchase', '/mobile/products'];

const MORE_ITEMS: TabDef[] = [
  { path: '/mobile/import', icon: <IconTruck />, label: '수입/매입' },
  { path: '/mobile/purchase', icon: <IconDoc />, label: '발주서' },
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
          <IconMore />
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
