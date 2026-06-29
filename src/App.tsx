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
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { cleanupExpiredPhotos } from '@/hooks/queries/useOrderPhotos';
import { useOpsAuth } from '@/hooks/useOpsAuth';
import { OpsLoginPage } from '@/pages/OpsLoginPage';
import { HomePage } from '@/pages/HomePage';
import { OrdersPage } from '@/pages/sales/OrdersPage';
import { OrderEntryPage } from '@/pages/sales/OrderEntryPage';
import { SalesAnalysisPage } from '@/pages/sales/SalesAnalysisPage';
import { CustomersPage } from '@/pages/settings/CustomersPage';
import { CustomerGroupsPage } from '@/pages/settings/CustomerGroupsPage';
import { PortalNoticePage } from '@/pages/settings/PortalNoticePage';
import { ProductsPage } from '@/pages/inventory/ProductsPage';
import { StockPage } from '@/pages/inventory/StockPage';
import { ImportReceivingPage } from '@/pages/inventory/ImportReceivingPage';
import { PurchaseOrderPage } from '@/pages/inventory/PurchaseOrderPage';
import { InventoryAuditPage } from '@/pages/inventory/InventoryAuditPage';
import { CustomerOrderPage } from '@/pages/customer/CustomerOrderPage';
import { BankingPage } from '@/pages/finance/BankingPage';
import { ReceivablesPage } from '@/pages/finance/ReceivablesPage';
import { TaxInvoicesPage } from '@/pages/finance/TaxInvoicesPage';
import { IncomeStatementPage } from '@/pages/finance/IncomeStatementPage';
import { BillingPage } from '@/pages/sales/BillingPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { MobileApp } from '@/mobile/MobileApp';

function App() {
  const { session, isLoading, login, logout } = useOpsAuth();

  // 🟠 앱 시작 시 만료된 출고사진 일괄 정리 (DB + RPC 폴백).
  useEffect(() => {
    cleanupExpiredPhotos().catch((err) => {
      console.error('만료 사진 정리 실패:', err);
    });
  }, []);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5F5F4',
        }}
      >
        <Loader2
          size={28}
          style={{ animation: 'spin 1s linear infinite', color: '#78716C' }}
        />
      </div>
    );
  }

  return (
    <Routes>
      {/* 거래처 전용 주문서 페이지 — OPS 로그인 불필요 (별도 거래처 인증) */}
      <Route path="/customer-order" element={<CustomerOrderPage />} />

      {/* 모바일 PWA — OPS 로그인 불필요 */}
      <Route path="/mobile/*" element={<MobileApp />} />

      {/* OPS 전체 — 로그인 필요 */}
      {!session ? (
        <Route path="*" element={<OpsLoginPage onLogin={login} />} />
      ) : (
        <Route element={<Shell onLogout={logout} />}>
          <Route index element={<HomePage />} />

          <Route path="sales">
            <Route index element={<Navigate to="/sales/orders" replace />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="order-entry" element={<OrderEntryPage />} />
            <Route path="analysis" element={<SalesAnalysisPage />} />
            <Route path="invoices" element={<PlaceholderPage />} />
            <Route path="billing" element={<BillingPage />} />
          </Route>

          <Route path="inventory">
            <Route index element={<Navigate to="/inventory/stock" replace />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="purchase" element={<ImportReceivingPage />} />
            <Route path="purchase-orders" element={<PurchaseOrderPage />} />
            <Route path="audit" element={<InventoryAuditPage />} />
            <Route path="products" element={<ProductsPage />} />
          </Route>

          <Route path="finance">
            <Route index element={<Navigate to="/finance/receivables" replace />} />
            <Route path="receivables" element={<ReceivablesPage />} />
            <Route path="banking" element={<BankingPage />} />
            <Route path="tax-invoices" element={<TaxInvoicesPage />} />
            <Route path="pnl" element={<IncomeStatementPage />} />
          </Route>

          <Route path="documents" element={<DocumentsPage />} />

          <Route path="settings">
            <Route index element={<Navigate to="/settings/customers" replace />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customer-groups" element={<CustomerGroupsPage />} />
            <Route path="portal-notice" element={<PortalNoticePage />} />
          </Route>

          {/* 레거시 /orders → /sales/orders */}
          <Route path="orders" element={<Navigate to="/sales/orders" replace />} />

          {/* 404 */}
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      )}
    </Routes>
  );
}

export default App;
