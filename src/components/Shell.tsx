/**
 * 전역 Shell 레이아웃.
 * - 1단 TopNav (sticky)
 * - 2단 SectionNav (sticky, 홈에서는 숨김)
 * - 본문 <Outlet />
 * - 거래처 포털 신규 주문 Realtime 구독 — 화면 중앙 모달 + 주문 목록 자동 갱신.
 *
 * 🟠 Realtime 구독 견고화 (history: 토스트 → 모달 전환 + 잠복 SUBSCRIBED 실패 수정):
 *   - 채널명을 `portal-orders-{companyId}-{timestamp}` 로 매 마운트마다 유니크화.
 *     동일 이름 채널이 supabase-js 내부 cache 에 좀비로 남으면 새 subscribe 가
 *     phx_join 응답을 영원히 기다리며 SUBSCRIBED 가 안 떨어지는 케이스가 있어 회피.
 *   - .subscribe(status, err) 콜백으로 SUBSCRIBED/CHANNEL_ERROR/TIMED_OUT/CLOSED
 *     를 콘솔에 출력. 침묵 실패 디버깅용. (회귀 발생 시 즉시 원인 추적 가능)
 *   - payload 처리 로직은 useRef 로 분리 — useEffect 의존성을 companyId 하나로
 *     최소화해 cleanup/재구독 루프로 인한 race condition 차단.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SectionNav } from './nav/SectionNav';
import { TopNav } from './nav/TopNav';
import { PortalOrderArrivalModal } from './PortalOrderArrivalModal';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';

interface ArrivalState {
  firstName: string;
  additional: number;
}

export function Shell({ onLogout }: { onLogout: () => Promise<void> }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [arrival, setArrival] = useState<ArrivalState | null>(null);

  // 신규 주문 도착 처리 — 모달 큐 누적 + 거래처명 조회.
  // ref 로 보관해 useEffect 재구독을 유발하지 않음.
  const handleArrivalRef = useRef<(customerId: string) => Promise<void>>();
  handleArrivalRef.current = async (customerId: string) => {
    let name = '거래처';
    if (companyId) {
      const { data } = await supabase
        .from('customers')
        .select('name')
        .eq('id', customerId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (data?.name) name = data.name;
    }
    setArrival((prev) =>
      prev
        ? { firstName: prev.firstName, additional: prev.additional + 1 }
        : { firstName: name, additional: 0 },
    );
  };

  const handleConfirm = useCallback(() => {
    setArrival(null);
    if (companyId) {
      queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
    }
  }, [companyId, queryClient]);

  // ── 거래처 포털 신규 주문 Realtime 구독 ──
  useEffect(() => {
    if (!companyId) {
      console.log('[portal-orders] companyId 미확보 — 구독 건너뜀');
      return;
    }
    // 🟡 디버그: Date.now() 가 같은 ms 안에 4번 충돌하는 케이스가 관찰돼
    //    crypto.randomUUID() 로 강제 유니크. HMR/StrictMode 재마운트 시 좀비 채널 분리.
    const channelName = `portal-orders-${companyId}-${crypto.randomUUID()}`;
    console.log('[portal-orders] subscribing channel:', channelName);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'mochicraft_demo',
          table: 'orders',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          // RAW payload 로그는 회귀 디버깅용으로 유지 — 메시지 도달 여부 즉시 판단.
          console.log('[portal-orders] payload received:', payload);
          try {
            const newOrder = payload.new as {
              id: string;
              customer_id: string;
              source: string | null;
            };
            // 거래처 포털에서 들어온 주문만 알림 — OPS 내부 수동 주문은 제외.
            if (newOrder.source !== 'portal') return;
            handleArrivalRef.current?.(newOrder.customer_id);
          } catch (e) {
            console.error('[portal-orders] handler error:', e);
          }
        },
      )
      .subscribe((status, err) => {
        console.log('[portal-orders] subscription status:', status, err ?? '');
      });

    return () => {
      console.log('[portal-orders] cleanup — removing channel:', channelName);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return (
    <div
      className="min-h-screen text-ink"
      style={{ background: 'var(--bg)' }}
    >
      <TopNav onLogout={onLogout} />
      <SectionNav />
      <main>
        <Outlet />
      </main>
      <PortalOrderArrivalModal
        open={arrival !== null}
        firstCustomerName={arrival?.firstName ?? ''}
        additionalCount={arrival?.additional ?? 0}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
