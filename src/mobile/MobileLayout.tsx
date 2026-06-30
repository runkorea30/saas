/**
 * 모바일 PWA 레이아웃 — 모든 화면 너비에서 하단 BottomNav 만 사용.
 * 콘텐츠 영역이 화면 너비 100% 점유.
 *
 * 🟠 OPS 글로벌 스타일 격리:
 *   index.css 가 body 에 burgundy paper-grain 배경 + Pretendard 폰트를 강제하므로
 *   마운트 시 body.mobile-active 클래스를 부여해 mobile.css 에서 명시적으로 리셋.
 *   언마운트 시 다시 OPS 페이지로 돌아갈 때 원상복구.
 *
 * 🟠 거래처 포털 신규 주문 Realtime 구독 — OPS 의 Shell.tsx 와 동일한 패턴:
 *   - 채널명을 crypto.randomUUID 로 유니크화(좀비 채널 충돌 회피)
 *   - .subscribe 상태 콜백으로 SUBSCRIBED/CHANNEL_ERROR 콘솔 출력
 *   - payload 콜백을 useRef 로 분리해 useEffect 의존성을 companyId 하나로 최소화
 *   - 알림 모달 닫기 시 ['orders', companyId] invalidate 로 모바일 주문내역 자동 갱신
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileTheme } from './hooks/useMobileTheme';
import { BottomNav } from './components/BottomNav';
import { IconMoon, IconSun } from './components/MobileIcons';
import { MobilePortalOrderArrivalModal } from './components/MobilePortalOrderArrivalModal';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';

interface ArrivalState {
  firstName: string;
  additional: number;
}

export function MobileLayout() {
  const { isDark, toggle } = useMobileTheme();
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

  // 🔴 body 에 식별 클래스 부여 → mobile.css 의 body.mobile-active 규칙으로
  //    OPS 글로벌 배경/폰트/스크롤바를 모바일 토큰으로 강제 교체.
  //    useLayoutEffect: 첫 페인트 이전에 적용 → OPS 배경 깜빡임 0 프레임.
  useLayoutEffect(() => {
    document.body.classList.add('mobile-active');
    document.documentElement.classList.add('mobile-active');
    return () => {
      document.body.classList.remove('mobile-active');
      document.documentElement.classList.remove('mobile-active');
    };
  }, []);

  // ── 거래처 포털 신규 주문 Realtime 구독 ──
  useEffect(() => {
    if (!companyId) {
      console.log('[mobile portal-orders] companyId 미확보 — 구독 건너뜀');
      return;
    }
    const channelName = `mobile-portal-orders-${companyId}-${crypto.randomUUID()}`;
    console.log('[mobile portal-orders] subscribing channel:', channelName);

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
          console.log('[mobile portal-orders] payload received:', payload);
          try {
            const newOrder = payload.new as {
              id: string;
              customer_id: string;
              source: string | null;
            };
            if (newOrder.source !== 'portal') return;
            handleArrivalRef.current?.(newOrder.customer_id);
          } catch (e) {
            console.error('[mobile portal-orders] handler error:', e);
          }
        },
      )
      .subscribe((status, err) => {
        console.log(
          '[mobile portal-orders] subscription status:',
          status,
          err ?? '',
        );
      });

    return () => {
      console.log('[mobile portal-orders] cleanup — removing channel:', channelName);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return (
    <div className={`mobile-app ${isDark ? 'dark' : ''}`}>
      <main className="mobile-content" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={toggle}
          className="m-theme-toggle"
          aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? <IconSun /> : <IconMoon />}
        </button>
        <Outlet />
      </main>
      <BottomNav />
      <MobilePortalOrderArrivalModal
        open={arrival !== null}
        firstCustomerName={arrival?.firstName ?? ''}
        additionalCount={arrival?.additional ?? 0}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
