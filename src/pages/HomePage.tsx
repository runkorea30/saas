/**
 * 홈 대시보드 — 헤더 / KPI / 오늘 할 일 + 매출 차트 / 타임라인.
 *
 * 🔴 company_id는 useCompany() 경유만.
 * 🔴 데이터 집계는 utils/calculations + hooks/queries/useHomeDashboard 에서만.
 * 🟡 각 섹션은 개별 isLoading/error 로 부분 로딩 허용 — 한 쿼리 실패가 전체를 막지 않음.
 */
import { useCompany } from '@/hooks/useCompany';
import {
  useDailySales,
  useHomeKpi,
  useTimelineEvents,
  useTodayData,
} from '@/hooks/queries/useHomeDashboard';
import { HomeHeader } from '@/components/feature/home/HomeHeader';
import { KpiGrid } from '@/components/feature/home/KpiGrid';
import { TodaySection } from '@/components/feature/home/TodaySection';
import { RevenueChart } from '@/components/feature/home/RevenueChart';
import { Timeline } from '@/components/feature/home/Timeline';

export function HomePage() {
  const { company, companyId, isLoading: companyLoading } = useCompany();

  const kpiQuery = useHomeKpi(companyId);
  const dailyQuery = useDailySales(companyId, 30);
  const todayQuery = useTodayData(companyId);
  const timelineQuery = useTimelineEvents(companyId);

  const tasksCount =
    (todayQuery.data?.unreceivedPOs.length ?? 0) +
    (todayQuery.data?.overdueReceivables.length ?? 0) +
    (todayQuery.data?.lowStock.length ?? 0) +
    (todayQuery.data?.unmatchedDeposits.length ?? 0);

  const targetPct =
    kpiQuery.data && kpiQuery.data.prevMonthSales > 0
      ? (kpiQuery.data.thisMonthSales / kpiQuery.data.prevMonthSales) * 100
      : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '24px 32px 40px',
          maxWidth: 1720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <HomeHeader
          companyName={company?.name ?? null}
          tasksCount={tasksCount}
          targetPct={targetPct}
          loading={companyLoading || kpiQuery.isLoading || todayQuery.isLoading}
        />

        <div style={{ marginBottom: 20 }}>
          <KpiGrid
            kpi={kpiQuery.data}
            dailySales={dailyQuery.data?.current}
            isLoading={kpiQuery.isLoading}
            error={kpiQuery.error as Error | null}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 20,
            marginBottom: 20,
            alignItems: 'stretch',
          }}
        >
          <TodaySection
            data={todayQuery.data}
            isLoading={todayQuery.isLoading}
            error={todayQuery.error as Error | null}
          />
          <RevenueChart
            current={dailyQuery.data?.current}
            previous={dailyQuery.data?.previous}
            isLoading={dailyQuery.isLoading}
            error={dailyQuery.error as Error | null}
          />
        </div>

        <Timeline
          events={timelineQuery.data}
          isLoading={timelineQuery.isLoading}
          error={timelineQuery.error as Error | null}
        />

        <div
          style={{
            marginTop: 40,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'var(--ink-3)',
            fontSize: 11.5,
            fontFamily: 'var(--font-num)',
          }}
        >
          <span>© 2026 MochiCraft OPS · 실시간 Supabase 연동</span>
          <span>KST (UTC+9) · KRW</span>
        </div>
      </main>
    </div>
  );
}
