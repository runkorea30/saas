/**
 * 전역 라우트 테이블.
 *
 * - `Shell`을 루트 레이아웃으로 둔 중첩 라우트.
 * - 각 섹션(`/sales`, `/inventory`, `/finance`, `/settings`) 인덱스 진입 시 첫 서브페이지로 리다이렉트.
 * - 구현되지 않은 메뉴는 공통 `PlaceholderPage`.
 * - 레거시 `/orders` → `/sales/orders`로 301-like 리다이렉트.
 * - 존재하지 않는 경로는 PlaceholderPage (404 대체).
 *
 * 🟠 BrowserRouter는 `main.tsx`에서 이미 래핑 — 여기서는 Routes/Route만.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { HomePage } from '@/pages/HomePage';
import { OrdersPage } from '@/pages/sales/OrdersPage';
import { CustomersPage } from '@/pages/settings/CustomersPage';
import { ProductsPage } from '@/pages/inventory/ProductsPage';

function App() {
  return (
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
          <Route path="products" element={<ProductsPage />} />
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
          <Route path="customers" element={<CustomersPage />} />
        </Route>

        {/* 레거시 /orders → /sales/orders */}
        <Route path="orders" element={<Navigate to="/sales/orders" replace />} />

        {/* 404 */}
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
    </Routes>
  );
}

export default App;
