/**
 * 전역 Shell 레이아웃.
 * - 1단 TopNav (sticky)
 * - 2단 SectionNav (sticky, 홈에서는 숨김)
 * - 본문 <Outlet />
 * - 거래처 포털 신규 주문 Realtime 구독 — 토스트 + 주문 목록 자동 갱신.
 */
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SectionNav } from './nav/SectionNav';
import { TopNav } from './nav/TopNav';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from './ui/Toast';
import { supabase } from '@/lib/supabase';

export function Shell() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // ── 거래처 포털 신규 주문 Realtime 구독 ──
  // channel name 'portal-orders' 로 고정 → Hot Module Reload 시 중복 구독 방지.
  // INSERT 이벤트 중 source='portal' 만 필터링해 알림. RLS 미적용 가정 — anon 키
  // 로 보낸 클라이언트가 다른 회사 데이터를 보지 못하도록 company_id 필터를 함께 사용.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel('portal-orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'mochicraft_demo',
          table: 'orders',
          filter: `company_id=eq.${companyId}`,
        },
        async (payload) => {
          const newOrder = payload.new as {
            id: string;
            company_id: string;
            customer_id: string;
            source: string | null;
          };
          // 거래처 포털에서 들어온 주문만 토스트 — OPS 내부 수동 주문은 제외.
          if (newOrder.source !== 'portal') return;

          let customerName = '거래처';
          const { data: customer } = await supabase
            .from('customers')
            .select('name')
            .eq('id', newOrder.customer_id)
            .eq('company_id', newOrder.company_id)
            .single();
          if (customer?.name) customerName = customer.name;

          showToast({
            kind: 'success',
            text: `📦 ${customerName}에서 새 주문서가 도착했습니다`,
            duration: 8000,
          });

          // 주문 목록 자동 갱신 — useOrders 의 cache key prefix ['orders', companyId].
          queryClient.invalidateQueries({
            queryKey: ['orders', companyId],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient, showToast]);

  return (
    <div
      className="min-h-screen text-ink"
      style={{ background: 'var(--bg)' }}
    >
      <TopNav />
      <SectionNav />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
