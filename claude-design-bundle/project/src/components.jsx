// Shared primitives used across pages (badges, table atoms, chips, buttons).
// Depends on: I (icons.jsx)

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

/* ─── Grade Badge ─────────────────────────────────── */
// 거래처 등급 A/B/C/D/E — burgundy→fade gradient of weight
const GRADE_STYLES = {
  A: { bg: "var(--brand)",       fg: "#F3E4DE", b: "var(--brand-deep)" },
  B: { bg: "var(--brand-wash-2)", fg: "var(--brand-ink)", b: "var(--brand-wash-2)" },
  C: { bg: "var(--brand-wash)",   fg: "var(--brand-ink)", b: "var(--brand-wash)" },
  D: { bg: "var(--surface-2)",    fg: "var(--ink-2)",   b: "var(--line-strong)" },
  E: { bg: "var(--surface-2)",    fg: "var(--ink-3)",   b: "var(--line)" },
};
function GradeBadge({ grade = "C", size = "md" }) {
  const s = GRADE_STYLES[grade] || GRADE_STYLES.C;
  const dim = size === "sm" ? 18 : 22;
  return (
    <span style={{
      display: "inline-grid", placeItems: "center",
      width: dim, height: dim,
      borderRadius: 5,
      background: s.bg, color: s.fg,
      border: `1px solid ${s.b}`,
      fontFamily: "var(--font-num)",
      fontSize: size === "sm" ? 10.5 : 11.5,
      fontWeight: 600,
      letterSpacing: "0.02em",
      flexShrink: 0,
    }}>{grade}</span>
  );
}

/* ─── Status Badge (order status, po status etc.) ──── */
const STATUS_STYLES = {
  draft:     { bg: "var(--surface-2)",   fg: "var(--ink-3)",     dot: "var(--ink-4)",    label: "임시" },
  confirmed: { bg: "var(--info-wash)",   fg: "var(--info)",      dot: "var(--info)",     label: "확정" },
  shipped:   { bg: "var(--warning-wash)",fg: "var(--warning)",   dot: "var(--warning)",  label: "출고" },
  done:      { bg: "var(--success-wash)",fg: "var(--success)",   dot: "var(--success)",  label: "완료" },
  cancel:    { bg: "var(--danger-wash)", fg: "var(--danger)",    dot: "var(--danger)",   label: "취소" },
  hold:      { bg: "var(--warning-wash)",fg: "var(--warning)",   dot: "var(--warning)",  label: "보류" },
};
function StatusBadge({ status, label }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      height: 22, padding: "0 8px 0 7px",
      borderRadius: 999,
      background: s.bg, color: s.fg,
      fontFamily: "var(--font-kr)",
      fontSize: 11.5, fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot, flexShrink: 0 }}/>
      {label || s.label}
    </span>
  );
}

/* ─── Source Icon (주문 접수 경로) ──────────────── */
// manual: 손, portal: 포털, ai: AI
function SourceIcon({ source, size = 16 }) {
  const map = {
    manual: { icon: "hand",   label: "직접 입력", color: "var(--ink-3)" },
    portal: { icon: "globe",  label: "포털",     color: "var(--info)" },
    ai:     { icon: "spark",  label: "AI 접수",  color: "var(--brand)" },
  };
  const s = map[source] || map.manual;
  return (
    <span title={s.label} style={{
      display: "inline-grid", placeItems: "center",
      width: size + 8, height: size + 8,
      borderRadius: 6,
      color: s.color,
      background: "transparent",
    }}>
      {s.icon === "hand"  && <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V6a2 2 0 0 1 4 0v5"/><path d="M11 11V4a2 2 0 0 1 4 0v7"/><path d="M15 11V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6H11a5 5 0 0 1-5-5l-.5-1.5a2 2 0 0 1 3-2.5L10 12"/></svg>}
      {s.icon === "globe" && <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>}
      {s.icon === "spark" && <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.8 2.8M15 15l2.7 2.7M6.3 17.7 9 15M15 9l2.8-2.8"/></svg>}
    </span>
  );
}

/* ─── Avatar ─────────────────────────────────────── */
const AVATAR_COLORS = [
  { bg: "linear-gradient(135deg,#4A6F5A,#2F4A3B)", fg: "#EFE2C8" },
  { bg: "linear-gradient(135deg,#7C4A28,#5A3418)", fg: "#F1E3D1" },
  { bg: "linear-gradient(135deg,#3A4A6B,#24324A)", fg: "#D7DFEC" },
  { bg: "linear-gradient(135deg,#6B3A4A,#4A2232)", fg: "#F3E4DE" },
  { bg: "linear-gradient(135deg,#5A6B3A,#3D4A24)", fg: "#E3E7D1" },
  { bg: "linear-gradient(135deg,#6B4A3A,#4A2E22)", fg: "#F1E3D1" },
];
function Avatar({ initials, seed = 0, size = 26 }) {
  const c = AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length];
  return (
    <div title={initials} style={{
      width: size, height: size, borderRadius: 999,
      background: c.bg, color: c.fg,
      display: "grid", placeItems: "center",
      fontFamily: "var(--font-num)",
      fontSize: size * 0.42,
      fontWeight: 600,
      flexShrink: 0,
    }}>{initials}</div>
  );
}

/* ─── Segmented ──────────────────────────────────── */
function Segmented({ options, value, onChange, compact }) {
  return (
    <div style={{
      display: "inline-flex",
      background: "var(--surface-2)",
      border: "1px solid var(--line)",
      borderRadius: 8,
      padding: 2,
      gap: 2,
    }}>
      {options.map(o => {
        const active = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            padding: compact ? "3px 10px" : "5px 12px",
            height: compact ? 24 : 28,
            fontSize: compact ? 11.5 : 12.5,
            border: "none",
            borderRadius: 6,
            background: active ? "var(--surface)" : "transparent",
            color: active ? "var(--ink)" : "var(--ink-3)",
            cursor: "pointer",
            fontFamily: "var(--font-kr)",
            fontWeight: active ? 500 : 400,
            boxShadow: active ? "var(--shadow-sm)" : "none",
            display: "inline-flex", alignItems: "center", gap: 5,
            whiteSpace: "nowrap",
          }}>{o.icon}{o.label}</button>
        );
      })}
    </div>
  );
}

/* ─── Multi-select chip picker (popover) ─────────── */
function MultiChip({ label, selected, options, onChange, icon }) {
  const [open, setOpen] = useStateC(false);
  const ref = useRefC(null);
  useEffectC(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const activeCount = selected.length;
  const summary = activeCount === 0 ? "전체" : activeCount === 1 ? (options.find(o => o.id === selected[0])?.label) : `${activeCount}개 선택`;
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 30,
        padding: "0 10px",
        borderRadius: 8,
        border: "1px solid " + (activeCount ? "var(--brand-wash-2)" : "var(--line)"),
        background: activeCount ? "var(--brand-wash)" : "var(--surface)",
        color: activeCount ? "var(--brand-ink)" : "var(--ink-2)",
        cursor: "pointer",
        fontFamily: "var(--font-kr)",
        fontSize: 12.5,
        whiteSpace: "nowrap",
      }}>
        {icon}
        <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{label}</span>
        <span style={{ fontWeight: 500 }}>{summary}</span>
        <I.chev size={12} stroke="currentColor"/>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: 36, left: 0, zIndex: 40,
          minWidth: 220, maxHeight: 320, overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          borderRadius: 10,
          boxShadow: "var(--shadow-lg)",
          padding: 4,
        }}>
          {activeCount > 0 && (
            <div style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{activeCount}개 선택됨</span>
              <button onClick={() => onChange([])} style={{ background: "none", border: "none", fontSize: 11, color: "var(--brand)", cursor: "pointer" }}>초기화</button>
            </div>
          )}
          {options.map(o => {
            const on = selected.includes(o.id);
            return (
              <button key={o.id} onClick={() => toggle(o.id)} style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "7px 10px",
                border: "none", borderRadius: 6,
                background: "transparent", cursor: "pointer",
                fontFamily: "var(--font-kr)", fontSize: 12.5,
                color: "var(--ink)",
                textAlign: "left",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: 3,
                  border: "1px solid " + (on ? "var(--brand)" : "var(--line-strong)"),
                  background: on ? "var(--brand)" : "transparent",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>{on && <I.check size={11} stroke="#F3E4DE" sw={2.4}/>}</span>
                {o.prefix}
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.sub && <span style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-num)" }}>{o.sub}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Checkbox ───────────────────────────────────── */
function Check({ on, indet, onChange }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange(!on); }} style={{
      width: 16, height: 16, borderRadius: 3,
      border: "1.5px solid " + (on || indet ? "var(--brand)" : "var(--line-strong)"),
      background: on || indet ? "var(--brand)" : "var(--surface)",
      cursor: "pointer",
      display: "grid", placeItems: "center",
      padding: 0,
      flexShrink: 0,
    }}>
      {on && <I.check size={11} stroke="#F3E4DE" sw={2.4}/>}
      {indet && <div style={{ width: 8, height: 1.5, background: "#F3E4DE" }}/>}
    </button>
  );
}

/* ─── PageHeader ─────────────────────────────────── */
function PageHeader({ crumbs, title, summary, actions, right }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {crumbs && (
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-num)", letterSpacing: "0.04em", marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span>{c}</span>
              {i < crumbs.length - 1 && <span style={{ color: "var(--ink-4)" }}>›</span>}
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
        <h1 className="disp" style={{ fontSize: 32, fontWeight: 400, letterSpacing: "-0.02em", margin: 0, color: "var(--ink)" }}>{title}</h1>
        {summary && (
          <div style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
            {summary.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="num" style={{
                  fontSize: 16, fontWeight: 500,
                  color: s.tone === "danger" ? "var(--danger)" :
                         s.tone === "success" ? "var(--success)" :
                         s.tone === "muted"  ? "var(--ink-3)" : "var(--ink)",
                }}>{s.value}</span>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }}/>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>
    </div>
  );
}

/* ─── Empty State ────────────────────────────────── */
function EmptyState({ title, body, primary, secondary }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: "var(--brand-wash)", color: "var(--brand)",
        display: "grid", placeItems: "center", margin: "0 auto 14px",
      }}><I.search size={20}/></div>
      <div className="disp" style={{ fontSize: 17, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, maxWidth: 360, margin: "0 auto 16px" }}>{body}</div>
      <div style={{ display: "inline-flex", gap: 8 }}>
        {secondary && <button className="btn">{secondary}</button>}
        {primary && <button className="btn primary">{primary}</button>}
      </div>
    </div>
  );
}

/* ─── Icon extras: download, receipt, truck etc. ──── */
const I2 = {
  calendar: (p) => <svg width={p?.size ?? 16} height={p?.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p?.stroke ?? "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  printer:  (p) => <svg width={p?.size ?? 16} height={p?.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p?.stroke ?? "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 15h10v6H7z"/></svg>,
  building: (p) => <svg width={p?.size ?? 16} height={p?.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p?.stroke ?? "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M9 19h6"/></svg>,
  tag:      (p) => <svg width={p?.size ?? 16} height={p?.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p?.stroke ?? "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 11v10h10l9-9z"/><circle cx="8.5" cy="14.5" r="1.5"/></svg>,
  flag:     (p) => <svg width={p?.size ?? 16} height={p?.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p?.stroke ?? "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4h12l-2 4 2 4H5"/></svg>,
  undo:     (p) => <svg width={p?.size ?? 16} height={p?.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p?.stroke ?? "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-2"/></svg>,
};
Object.assign(I, I2);

Object.assign(window, {
  GradeBadge, StatusBadge, SourceIcon, Avatar,
  Segmented, MultiChip, Check, PageHeader, EmptyState,
});
