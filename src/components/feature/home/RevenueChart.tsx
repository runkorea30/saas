/**
 * 최근 30일 매출 추이 차트.
 * 이번기간(실선) + 전년동기간(점선) 대비 + hover 툴팁.
 * 🟡 전년 데이터가 0으로만 내려오면 점선이 바닥에 붙음 (의도한 동작).
 */
import { useId, useMemo, useRef, useState } from 'react';
import type { DailySalesPoint } from '@/hooks/queries/useHomeDashboard';

interface Props {
  current: DailySalesPoint[] | undefined;
  previous: DailySalesPoint[] | undefined;
  isLoading: boolean;
  error?: Error | null;
}

interface ChartPoint {
  label: string; // MM/DD
  dateIso: string; // original current date
  cur: number;
  prev: number;
}

export function RevenueChart({ current, previous, isLoading, error }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const data: ChartPoint[] = useMemo(() => {
    if (!current) return [];
    return current.map((pt, i): ChartPoint => {
      const [, mm, dd] = pt.date.split('-');
      return {
        label: `${mm}/${dd}`,
        dateIso: pt.date,
        cur: pt.amount,
        prev: previous?.[i]?.amount ?? 0,
      };
    });
  }, [current, previous]);

  if (error) {
    return (
      <div
        className="card-surface"
        style={{ padding: 20, fontSize: 13, color: 'var(--danger)', height: '100%' }}
      >
        차트 로딩 실패: {error.message}
      </div>
    );
  }

  if (isLoading || data.length === 0) {
    return (
      <div
        className="card-surface"
        style={{
          padding: 20,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-3)',
          fontSize: 13,
          minHeight: 320,
        }}
      >
        {isLoading ? '차트 데이터 불러오는 중…' : '표시할 매출 데이터가 없습니다'}
      </div>
    );
  }

  const W = 560;
  const H = 240;
  const PAD = { l: 50, r: 16, t: 12, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const allVals = [...data.map((d) => d.cur), ...data.map((d) => d.prev)];
  const yMax = Math.max(Math.ceil(Math.max(...allVals, 1) / 1_000_000) * 1_000_000, 1);
  const yMin = 0;
  const xStep = innerW / (data.length - 1);

  const X = (i: number) => PAD.l + i * xStep;
  const Y = (v: number) => PAD.t + innerH * (1 - (v - yMin) / (yMax - yMin));

  const makePath = (key: 'cur' | 'prev') =>
    data
      .map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d[key]).toFixed(1)}`)
      .join(' ');
  const curPath = makePath('cur');
  const prevPath = makePath('prev');
  const curArea = `${curPath} L${X(data.length - 1)} ${H - PAD.b} L${X(0)} ${H - PAD.b} Z`;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const fmtY = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  const totalCur = data.reduce((s, d) => s + d.cur, 0);
  const totalPrev = data.reduce((s, d) => s + d.prev, 0);
  const deltaPct = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev) * 100 : 0;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = W / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const i = Math.round((x - PAD.l) / xStep);
    if (i >= 0 && i < data.length) setHover(i);
  };

  return (
    <div
      className="card-surface"
      style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ padding: '16px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div
              className="disp"
              style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}
            >
              최근 30일 매출
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              일자별 매출 합계 (부가세 포함)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 14, alignItems: 'flex-end' }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-3)',
              }}
            >
              <span style={{ width: 10, height: 2, background: 'var(--brand)', borderRadius: 2 }} />
              이번 기간
            </div>
            <div
              className="num"
              style={{
                fontSize: 22,
                fontWeight: 500,
                marginTop: 2,
                letterSpacing: '-0.02em',
              }}
            >
              ₩{(totalCur / 1_000_000).toFixed(1)}M
            </div>
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-3)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 2,
                  background: 'var(--ink-4)',
                  borderRadius: 2,
                  opacity: 0.7,
                }}
              />
              전년 동기간
            </div>
            <div
              className="num"
              style={{
                fontSize: 16,
                fontWeight: 400,
                marginTop: 2,
                color: 'var(--ink-3)',
                letterSpacing: '-0.02em',
              }}
            >
              ₩{(totalPrev / 1_000_000).toFixed(1)}M
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {totalPrev > 0 ? (
              <span
                className="chip"
                style={{
                  color: deltaPct > 0 ? 'var(--success)' : 'var(--danger)',
                  background: deltaPct > 0 ? 'var(--success-wash)' : 'var(--danger-wash)',
                }}
              >
                {deltaPct > 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}% YoY
              </span>
            ) : (
              <span
                className="chip"
                style={{ color: 'var(--ink-3)', background: 'var(--surface-2)' }}
              >
                전년 데이터 없음
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 8px 8px', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          style={{ display: 'block' }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-wash)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--brand-wash)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={Y(t)}
                y2={Y(t)}
                stroke="var(--line)"
                strokeDasharray={i === 0 ? '0' : '2 3'}
              />
              <text
                x={PAD.l - 8}
                y={Y(t) + 3}
                fontSize="10"
                fill="var(--ink-3)"
                textAnchor="end"
                fontFamily="var(--font-num)"
              >
                {fmtY(t)}
              </text>
            </g>
          ))}

          {data.map(
            (d, i) =>
              i % 6 === 0 && (
                <text
                  key={i}
                  x={X(i)}
                  y={H - 8}
                  fontSize="10"
                  fill="var(--ink-3)"
                  textAnchor="middle"
                  fontFamily="var(--font-num)"
                >
                  {d.label}
                </text>
              ),
          )}

          <path
            d={prevPath}
            fill="none"
            stroke="var(--ink-4)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.55"
          />
          <path d={curArea} fill={`url(#${gradientId})`} />
          <path
            d={curPath}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {hover != null && (
            <g>
              <line
                x1={X(hover)}
                x2={X(hover)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="var(--ink-3)"
                strokeDasharray="2 3"
              />
              <circle
                cx={X(hover)}
                cy={Y(data[hover].cur)}
                r="4"
                fill="var(--surface)"
                stroke="var(--brand)"
                strokeWidth="2"
              />
              <circle
                cx={X(hover)}
                cy={Y(data[hover].prev)}
                r="3"
                fill="var(--surface)"
                stroke="var(--ink-4)"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {hover != null && <ChartTooltip point={data[hover]} index={hover} total={data.length} />}
      </div>
    </div>
  );
}

function ChartTooltip({
  point,
  index,
  total,
}: {
  point: ChartPoint;
  index: number;
  total: number;
}) {
  const leftPct = total > 1 ? (index / (total - 1)) * 100 : 50;
  const flipped = leftPct > 70;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: 16,
        transform: `translateX(${flipped ? '-105%' : '5%'})`,
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 11.5,
        boxShadow: 'var(--shadow-lg)',
        pointerEvents: 'none',
        minWidth: 160,
        zIndex: 5,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-num)',
          color: 'var(--ink-3)',
          fontSize: 10.5,
          marginBottom: 6,
        }}
      >
        {point.dateIso}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
          <span style={{ width: 8, height: 2, background: 'var(--brand)' }} />
          이번
        </span>
        <span className="num" style={{ fontWeight: 500 }}>
          {point.cur.toLocaleString('ko-KR')}원
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          color: 'var(--ink-3)',
          marginTop: 3,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
          <span style={{ width: 8, height: 2, background: 'var(--ink-4)' }} />
          전년
        </span>
        <span className="num">{point.prev.toLocaleString('ko-KR')}원</span>
      </div>
    </div>
  );
}
