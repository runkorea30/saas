// KPI cards — large display number + delta + sparkline
function KPICard({ kpi }) {
  const deltaPositive = kpi.invertDelta ? kpi.deltaPct < 0 : kpi.deltaPct > 0;
  const deltaColor = deltaPositive ? "var(--success)" : "var(--danger)";
  const deltaWash = deltaPositive ? "var(--success-wash)" : "var(--danger-wash)";
  const DeltaIcon = kpi.deltaPct > 0 ? I.arrowUp : I.arrowDown;

  return (
    <div className="card" style={{ padding: "18px 20px 14px", position: "relative", overflow: "hidden" }}>
      {/* Label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", letterSpacing: "-0.005em", whiteSpace: "nowrap", flexShrink: 0 }}>{kpi.label}</div>
        {kpi.badge && (
          <span className="chip" style={{
            color: kpi.badge.tone === "danger" ? "var(--danger)" : "var(--warning)",
            background: kpi.badge.tone === "danger" ? "var(--danger-wash)" : "var(--warning-wash)",
          }}>
            <span className="dot"/>{kpi.badge.text}
          </span>
        )}
      </div>

      {/* Value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <div className="num" style={{ fontSize: 32, fontWeight: 500, lineHeight: 1, color: "var(--ink)" }}>
          {kpi.display}
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 2,
          fontFamily: "var(--font-num)",
          fontSize: 12, fontWeight: 500,
          color: deltaColor,
          padding: "2px 6px 2px 4px",
          borderRadius: 6,
          background: deltaWash,
        }}>
          <DeltaIcon size={12} stroke={deltaColor} sw={2}/>
          {fmtPct(kpi.deltaPct, kpi.deltaUnit === "pp")}
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ height: 40, marginLeft: -4, marginRight: -4 }}>
        <Sparkline data={kpi.spark} tone={deltaPositive ? "success" : "danger"}/>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11.5, color: "var(--ink-3)" }}>
        <span>{kpi.sub}</span>
        {kpi.hint && <span style={{ fontFamily: "var(--font-num)" }}>{kpi.hint}</span>}
      </div>
    </div>
  );
}

function Sparkline({ data, tone = "success" }) {
  const w = 240, h = 40, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = (w - pad*2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i*step, pad + (h - pad*2) * (1 - (v - min) / range)]);
  const path = pts.map((p, i) => (i ? `L${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`)).join(" ");
  const area = `${path} L${(pad + (data.length-1)*step).toFixed(1)} ${h-pad} L${pad} ${h-pad} Z`;
  const color = tone === "success" ? "var(--brand)" : "var(--danger)";
  const wash = tone === "success" ? "var(--brand-wash)" : "var(--danger-wash)";
  const last = pts[pts.length-1];
  const id = React.useMemo(() => "sp-" + Math.random().toString(36).slice(2,8), []);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={wash} stopOpacity="0.85"/>
          <stop offset="100%" stopColor={wash} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color}/>
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.15"/>
    </svg>
  );
}

function KPIGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      {KPI.map(k => <KPICard key={k.id} kpi={k}/>)}
    </div>
  );
}

window.KPIGrid = KPIGrid;
