/**
 * KPI 4카드 그리드.
 * 1) 이번달 매출 — 매출 스파크라인 실데이터
 * 2) 미수금 합계 — 경과 배지
 * 3) 재고자산 평가액 — 부가세 포함
 * 4) 이익률 — FIFO 정산 전 근사치 (hint 표기)
 *
 * 🟡 MVP: 매출 외 3개 카드의 sparkline은 실시계열이 없어 비활성(공간만 유지)
 * 🔴 계산식/집계는 훅에서 전달받는 HomeKpi + DailySales만 참조.
 */
import { useId, useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DailySalesPoint, HomeKpi } from '@/hooks/queries/useHomeDashboard';

interface Props {
  kpi: HomeKpi | undefined;
  dailySales: DailySalesPoint[] | undefined;
  isLoading: boolean;
  error?: Error | null;
}

export function KpiGrid({ kpi, dailySales, isLoading, error }: Props) {
  if (error) return <KpiErrorState message={error.message} />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      <KpiCard
        label="이번달 매출"
        display={kpi ? fmtWonAbbr(kpi.thisMonthSales) : '—'}
        deltaPct={kpi?.salesDeltaPct ?? 0}
        sub="전월 대비"
        hint={kpi ? `${kpi.year}.${String(kpi.month).padStart(2, '0')} 기준` : undefined}
        spark={(dailySales ?? []).map((p) => p.amount)}
        loading={isLoading}
      />
      <KpiCard
        label="미수금 합계"
        display={kpi ? fmtWonAbbr(kpi.receivables.total) : '—'}
        deltaPct={0}
        sub="미수금 잔액"
        badge={
          kpi && kpi.receivables.overdueCount > 0
            ? { tone: 'danger', text: `30일 경과 ${kpi.receivables.overdueCount}건` }
            : undefined
        }
        loading={isLoading}
        invertDelta
      />
      <KpiCard
        label="재고자산 평가액"
        display={kpi ? fmtWonAbbr(kpi.inventoryValue) : '—'}
        deltaPct={0}
        sub="현재 기준"
        hint={kpi && kpi.inventoryValue > 0 ? '가중평균 × 1.1' : '재고 데이터 준비 전'}
        loading={isLoading}
      />
      <KpiCard
        label="이익률"
        display={kpi ? `${kpi.profit.marginPct.toFixed(1)}%` : '—'}
        deltaPct={0}
        sub="이번달"
        hint="FIFO 정산 전 근사치"
        loading={isLoading}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  display: string;
  deltaPct: number;
  sub: string;
  hint?: string;
  badge?: { text: string; tone: 'danger' | 'warning' };
  spark?: number[];
  invertDelta?: boolean;
  loading: boolean;
}

function KpiCard({
  label,
  display,
  deltaPct,
  sub,
  hint,
  badge,
  spark,
  invertDelta,
  loading,
}: KpiCardProps) {
  const hasSpark = Boolean(spark && spark.length > 1 && spark.some((v) => v !== 0));
  const deltaPositive = invertDelta ? deltaPct < 0 : deltaPct > 0;
  const deltaColor = deltaPositive ? 'var(--success)' : 'var(--danger)';
  const deltaWash = deltaPositive ? 'var(--success-wash)' : 'var(--danger-wash)';
  const DeltaIcon = deltaPct >= 0 ? ArrowUp : ArrowDown;
  const showDelta = deltaPct !== 0;

  return (
    <div
      className="card-surface"
      style={{ padding: '18px 20px 14px', position: 'relative', overflow: 'hidden' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {label}
        </div>
        {badge && (
          <span
            className="chip"
            style={{
              color: badge.tone === 'danger' ? 'var(--danger)' : 'var(--warning)',
              background:
                badge.tone === 'danger' ? 'var(--danger-wash)' : 'var(--warning-wash)',
            }}
          >
            <span className="dot" />
            {badge.text}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <div
          className="num"
          style={{ fontSize: 32, fontWeight: 500, lineHeight: 1, color: 'var(--ink)' }}
        >
          {loading ? <span style={{ opacity: 0.3 }}>···</span> : display}
        </div>
        {showDelta && !loading && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontFamily: 'var(--font-num)',
              fontSize: 12,
              fontWeight: 500,
              color: deltaColor,
              padding: '2px 6px 2px 4px',
              borderRadius: 6,
              background: deltaWash,
            }}
          >
            <DeltaIcon size={12} strokeWidth={2} />
            {`${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
          </div>
        )}
      </div>

      <div style={{ height: 40, marginLeft: -4, marginRight: -4 }}>
        {hasSpark ? (
          <Sparkline data={spark!} tone={deltaPositive ? 'success' : 'danger'} />
        ) : (
          <SparkPlaceholder />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          fontSize: 11.5,
          color: 'var(--ink-3)',
        }}
      >
        <span>{sub}</span>
        {hint && <span style={{ fontFamily: 'var(--font-num)' }}>{hint}</span>}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
function Sparkline({ data, tone }: { data: number[]; tone: 'success' | 'danger' }) {
  const w = 240;
  const h = 40;
  const pad = 2;
  const gradientId = useId();

  const { path, area, last } = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = (w - pad * 2) / (data.length - 1);
    const pts = data.map((v, i): [number, number] => [
      pad + i * step,
      pad + (h - pad * 2) * (1 - (v - min) / range),
    ]);
    const p = pts
      .map((pt, i) => (i ? `L${pt[0].toFixed(1)} ${pt[1].toFixed(1)}` : `M${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`))
      .join(' ');
    const a = `${p} L${(pad + (data.length - 1) * step).toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
    return { path: p, area: a, last: pts[pts.length - 1] };
  }, [data]);

  const color = tone === 'success' ? 'var(--brand)' : 'var(--danger)';
  const wash = tone === 'success' ? 'var(--brand-wash)' : 'var(--danger-wash)';

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={wash} stopOpacity="0.85" />
          <stop offset="100%" stopColor={wash} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.15" />
    </svg>
  );
}

function SparkPlaceholder() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        fontSize: 10.5,
        color: 'var(--ink-4)',
        fontFamily: 'var(--font-num)',
        paddingLeft: 4,
      }}
    >
      추세 데이터 준비 전
    </div>
  );
}

function KpiErrorState({ message }: { message: string }) {
  return (
    <div
      className="card-surface"
      style={{
        padding: 20,
        fontSize: 12.5,
        color: 'var(--danger)',
      }}
    >
      KPI 로딩 실패: {message}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
function fmtWonAbbr(n: number): string {
  const v = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (v >= 100_000_000)
    return `${sign}₩${(v / 100_000_000).toFixed(1).replace(/\.0$/, '')}억`;
  if (v >= 10_000_000) return `${sign}₩${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 10_000) return `${sign}₩${(v / 10_000).toFixed(0)}만`;
  return `${sign}₩${v.toLocaleString('ko-KR')}`;
}
