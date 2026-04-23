import { Navigate, Route, Routes } from 'react-router-dom';
import OrdersPage from '@/pages/Orders';

/**
 * Phase 2 현재 시점 — Orders 페이지 1개 라우트만 활성.
 * 🟡 다음 태스크에서 AppShell(TopNav) + 홈 대시보드 + 인증 가드 추가 예정.
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/orders" replace />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}

export default App;
