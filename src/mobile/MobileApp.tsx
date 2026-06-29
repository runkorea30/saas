/**
 * 모바일 PWA 루트 — `/mobile/*` 하위 라우터.
 * BrowserRouter 는 main.tsx 에서 이미 래핑됨 → 여기서는 Routes/Route 만 정의.
 *
 * OPS 와 동일한 Supabase Auth 세션을 사용 — useOpsAuth 공유.
 * 로그인 안 되어 있으면 MobileLoginPage 로 막음.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import './styles/mobile.css';
import { MobileLayout } from './MobileLayout';
import { OrderListPage } from './pages/OrderListPage';
import { OrderInputPage } from './pages/OrderInputPage';
import { SalesAnalysisPage } from './pages/SalesAnalysisPage';
import { InventoryPage } from './pages/InventoryPage';
import { ImportPage } from './pages/ImportPage';
import { PurchaseOrderPage } from './pages/PurchaseOrderPage';
import { ProductListPage } from './pages/ProductListPage';
import { AuditPage } from './pages/AuditPage';
import { FinancePage } from './pages/FinancePage';
import { MobileLoginPage } from './pages/MobileLoginPage';
import { useOpsAuth } from '@/hooks/useOpsAuth';

export function MobileApp() {
  const { session, isLoading, login } = useOpsAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafaf8',
        }}
      >
        <Loader2
          size={28}
          style={{ animation: 'spin 1s linear infinite', color: '#6b1f2a' }}
        />
      </div>
    );
  }

  if (!session) {
    return <MobileLoginPage onLogin={login} />;
  }

  return (
    <Routes>
      <Route element={<MobileLayout />}>
        <Route index element={<Navigate to="orders" replace />} />
        <Route path="orders" element={<OrderListPage />} />
        <Route path="input" element={<OrderInputPage />} />
        <Route path="sales" element={<SalesAnalysisPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="purchase" element={<PurchaseOrderPage />} />
        <Route path="products" element={<ProductListPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="orders" replace />} />
      </Route>
    </Routes>
  );
}
