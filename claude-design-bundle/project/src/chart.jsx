// 매출 추이 차트
const { useState: useState2, useRef: useRef2 } = React;

function RevenueChart() {
  const data = CHART_DATA;
  const [hover, setHover] = useState2(null);
  const svgRef = useRef2(null);

  const W = 560, H = 240, PAD = { l: 50, r: 16, t: 12, b: 28 };
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;

  const allVals = [...data.map(d => d.cur), ...data.map(d => d.prev)];
  const yMax = Math.ceil(Math.max(...allVals) / 1_000_000) * 1_000_000;
  const yMin = 0;
  const xStep = innerW / (data.length - 1);

  const X = (i) => PAD.l + i * xStep;
  const Y = (v) => PAD.t + innerH * (1 - (v - yMin) / (yMax - yMin));

  const makePath = (key) => data.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(d[key]).toFixed(1)}`).join(" ");
  const curPath = makePath("cur");
  const prevPath = makePath("prev");
  const curArea = `${curPath} L${X(data.length-1)} ${H - PAD.b} L${X(0)} ${H - PAD.b} Z`;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yMax - yMin) * i / yTicks);

  const fmtY = (v) => {
    if (v >= 1_000_000) return `${(v/1_000_000).toFixed(0)}M`;
    if (v >= 1_000) return `${(v/1_000).toFixed(0)}K`;
    return v;
  };

  const handleMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const scale = W / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const i = Math.round((x - PAD.l) / xStep);
    if (i >= 0 && i < data.length) setHover(i);
  };

  const totalCur = data.reduce((s, d) => s + d.cur, 0);
  const totalPrev = data.reduce((s, d) => s + d.prev, 0);
  const deltaPct = ((totalCur - totalPrev) / totalPrev) * 100;

  return (
    <div className="card" style={{ padding: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px 10px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div className="disp" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>최근 30일 매출</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>일자별 매출 합계 (부가세 포함)</div>
          </div>
          <button className="btn ghost" style={{ fontSize: 11.5, height: 26, padding: "0 8px" }}><I.dots size={14}/></button>
        </div>

        {/* Totals row */}
        <div style={{ display: "flex", gap: 20, marginTop: 14, alignItems: "flex-end" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
              <span style={{ width: 10, height: 2, background: "var(--brand)", borderRadius: 2 }}/>
              이번 기간
            </div>
            <div className="num" style={{ fontSize: 22, fontWeight: 500, marginTop: 2, letterSpacing: "-0.02em" }}>
              ₩{(totalCur/1_000_000).toFixed(1)}M
            </div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
              <span style={{ width: 10, height: 2, background: "var(--ink-4)", borderRadius: 2, opacity: 0.7 }}/>
              전년 동기간
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 400, marginTop: 2, color: "var(--ink-3)", letterSpacing: "-0.02em" }}>
              ₩{(totalPrev/1_000_000).toFixed(1)}M
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span className="chip" style={{
              color: deltaPct > 0 ? "var(--success)" : "var(--danger)",
              background: deltaPct > 0 ? "var(--success-wash)" : "var(--danger-wash)",
            }}>
              {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% YoY
            </span>
          </div>
        </div>
      </div>

      {/* Chart SVG */}
      <div style={{ flex: 1, padding: "0 8px 8px", position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          style={{ display: "block" }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="cur-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-wash)" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="var(--brand-wash)" stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* Grid */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.l} x2={W - PAD.r}
                y1={Y(t)} y2={Y(t)}
                stroke="var(--line)"
                strokeDasharray={i === 0 ? "0" : "2 3"}
              />
              <text
                x={PAD.l - 8} y={Y(t) + 3}
                fontSize="10"
                fill="var(--ink-3)"
                textAnchor="end"
                fontFamily="var(--font-num)"
              >{fmtY(t)}</text>
            </g>
          ))}

          {/* X-axis labels — every 5 days */}
          {data.map((d, i) => i % 6 === 0 && (
            <text key={i}
              x={X(i)} y={H - 8}
              fontSize="10"
              fill="var(--ink-3)"
              textAnchor="middle"
              fontFamily="var(--font-num)"
            >{d.label}</text>
          ))}

          {/* Previous year line */}
          <path d={prevPath} fill="none" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 3" opacity="0.55"/>

          {/* Current area + line */}
          <path d={curArea} fill="url(#cur-area)"/>
          <path d={curPath} fill="none" stroke="var(--brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>

          {/* Hover */}
          {hover != null && (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeDasharray="2 3"/>
              <circle cx={X(hover)} cy={Y(data[hover].cur)} r="4" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2"/>
              <circle cx={X(hover)} cy={Y(data[hover].prev)} r="3" fill="var(--surface)" stroke="var(--ink-4)" strokeWidth="1.5"/>
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hover != null && (() => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const leftPct = (X(hover) / W) * 100;
          const d = data[hover];
          return (
            <div style={{
              position: "absolute",
              left: `${leftPct}%`,
              top: 0,
              transform: `translateX(${leftPct > 70 ? "-105%" : "5%"})`,
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 11.5,
              boxShadow: "var(--shadow-lg)",
              pointerEvents: "none",
              minWidth: 140,
              zIndex: 5,
            }}>
              <div style={{ fontFamily: "var(--font-num)", color: "var(--ink-3)", fontSize: 10.5, marginBottom: 6 }}>
                2026.{d.label}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  <span style={{ width: 8, height: 2, background: "var(--brand)" }}/>이번
                </span>
                <span className="num" style={{ fontWeight: 500 }}>{d.cur.toLocaleString()}원</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, color: "var(--ink-3)", marginTop: 3 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                  <span style={{ width: 8, height: 2, background: "var(--ink-4)" }}/>전년
                </span>
                <span className="num">{d.prev.toLocaleString()}원</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

window.RevenueChart = RevenueChart;
