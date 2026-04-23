// Sidebar + Topbar shell components
const { useState, useEffect, useRef } = React;

function Sidebar({ active = "home", collapsed, onToggle }) {
  const NAV = [
    { id: "home", label: "홈", icon: "home" },
    { id: "orders", label: "주문", icon: "cart", count: 12 },
    { id: "customers", label: "거래처", icon: "users" },
    { id: "products", label: "상품", icon: "grid" },
    { id: "inventory", label: "재고", icon: "box", count: 5, tone: "warn" },
    { id: "purchases", label: "수입·매입", icon: "truck" },
    { id: "po", label: "발주서", icon: "doc" },
    { id: "ar", label: "미수금", icon: "coin" },
    { id: "bank", label: "은행거래", icon: "bank", count: 3 },
    { id: "tax", label: "세금계산서", icon: "receipt" },
    { id: "reports", label: "리포트", icon: "chart" },
  ];
  return (
    <aside style={{
      width: collapsed ? 64 : 232,
      background: "var(--side-bg)",
      color: "var(--side-ink)",
      borderRight: "1px solid var(--side-line)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      transition: "width .18s ease",
      position: "sticky", top: 0, height: "100vh",
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? "18px 14px" : "20px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--side-line)" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%)",
          display: "grid", placeItems: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.15)",
          flexShrink: 0,
        }}>
          <span className="disp" style={{ color: "#F3E4DE", fontSize: 18, fontWeight: 500, fontStyle: "italic" }}>M</span>
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div className="disp" style={{ fontSize: 16, color: "var(--side-ink)", fontWeight: 500, letterSpacing: "-0.01em" }}>MochiCraft</div>
            <div style={{ fontSize: 10.5, color: "var(--side-ink-dim)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-num)" }}>ops · v0.9</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1, overflowY: "auto" }}>
        {!collapsed && <div style={{ padding: "8px 10px 4px", fontSize: 10.5, color: "var(--side-ink-dim)", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-num)" }}>운영</div>}
        {NAV.map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} collapsed={collapsed} />
        ))}
        {!collapsed && <div style={{ padding: "16px 10px 4px", fontSize: 10.5, color: "var(--side-ink-dim)", textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "var(--font-num)" }}>설정</div>}
        <NavItem item={{ id: "settings", label: "설정", icon: "cog" }} collapsed={collapsed} />
      </nav>

      {/* Collapse button */}
      <div style={{ padding: 10, borderTop: "1px solid var(--side-line)" }}>
        <button onClick={onToggle} className="focus-ring" style={{
          width: "100%", height: 34,
          background: "transparent", border: "1px solid var(--side-line)",
          borderRadius: 8, color: "var(--side-ink-2)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          fontSize: 12, fontFamily: "var(--font-kr)",
        }}>
          {collapsed ? <I.chevR size={14}/> : (<><I.menu size={14}/> 접기</>)}
        </button>
      </div>
    </aside>
  );
}

function NavItem({ item, active, collapsed }) {
  return (
    <a href="#" style={{
      display: "flex", alignItems: "center",
      gap: 10,
      padding: collapsed ? "9px 10px" : "9px 10px",
      borderRadius: 8,
      color: active ? "#F3E4DE" : "var(--side-ink)",
      background: active ? "linear-gradient(90deg, rgba(107,31,42,0.65), rgba(107,31,42,0.35))" : "transparent",
      fontSize: 13,
      fontWeight: active ? 500 : 400,
      position: "relative",
      marginBottom: 1,
      justifyContent: collapsed ? "center" : "flex-start",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--side-bg-2)"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {active && <div style={{ position: "absolute", left: -8, top: 6, bottom: 6, width: 2, background: "var(--brand)", borderRadius: 2 }}/>}
      {I[item.icon] && <span style={{ flexShrink: 0, display: "inline-flex" }}>{I[item.icon]({ size: 16 })}</span>}
      {!collapsed && <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
      {!collapsed && item.count != null && (
        <span style={{
          fontFamily: "var(--font-num)",
          fontSize: 11,
          padding: "1px 6px",
          borderRadius: 999,
          background: item.tone === "warn" ? "rgba(217,177,106,0.18)" : "rgba(255,255,255,0.06)",
          color: item.tone === "warn" ? "#E3B668" : "var(--side-ink-2)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}>{item.count}</span>
      )}
    </a>
  );
}

function Topbar({ onToggleTheme, theme }) {
  const [tenant, setTenant] = useState(0);
  const [tenantOpen, setTenantOpen] = useState(false);
  return (
    <div style={{
      height: 60,
      background: "var(--surface)",
      borderBottom: "1px solid var(--line)",
      display: "flex", alignItems: "center",
      padding: "0 20px",
      gap: 14,
      position: "sticky", top: 0, zIndex: 10,
    }}>
      {/* Tenant picker */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setTenantOpen(v => !v)} className="focus-ring" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 10px 6px 6px",
          height: 40,
          borderRadius: 10,
          border: "1px solid var(--line)",
          background: "var(--surface-2)",
          cursor: "pointer",
          minWidth: 220,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "linear-gradient(135deg, var(--tan) 0%, #7A4620 100%)",
            display: "grid", placeItems: "center",
            flexShrink: 0,
          }}>
            <span className="disp" style={{ color: "#F1E3D1", fontSize: 13, fontWeight: 500, fontStyle: "italic" }}>A</span>
          </div>
          <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {TENANTS[tenant].name}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-num)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {TENANTS[tenant].sub}
            </div>
          </div>
          <I.chev size={14} stroke="var(--ink-3)"/>
        </button>
        {tenantOpen && (
          <div style={{
            position: "absolute", top: 48, left: 0, zIndex: 30,
            width: 280,
            background: "var(--surface)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            boxShadow: "var(--shadow-lg)",
            padding: 6,
          }}>
            {TENANTS.map((t, i) => (
              <button key={t.id} onClick={() => { setTenant(i); setTenantOpen(false); }} style={{
                display: "flex", width: "100%", alignItems: "center", gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                background: i === tenant ? "var(--brand-wash)" : "transparent",
                cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ width: 24, height: 24, borderRadius: 5, background: i === 0 ? "linear-gradient(135deg,var(--tan),#7A4620)" : "linear-gradient(135deg,#4D6B5A,#2F4A3B)", display:"grid", placeItems:"center" }}>
                  <span className="disp" style={{ color: "#F3E4DE", fontSize: 11, fontStyle: "italic" }}>{t.name[0]}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{t.sub}</div>
                </div>
                {i === tenant && <I.check size={14} stroke="var(--brand)"/>}
              </button>
            ))}
            <div className="hair" style={{ margin: "6px 0" }}/>
            <button style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", fontSize: 12.5 }}>
              <I.plus size={14}/> 회사 추가
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 520, position: "relative" }}>
        <I.search size={15} stroke="var(--ink-3)" />
        <input placeholder="주문, 거래처, 상품, 발주서 검색…" style={{
          width: "100%",
          height: 36,
          background: "var(--bg)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "0 60px 0 36px",
          fontSize: 13,
          color: "var(--ink)",
          fontFamily: "var(--font-kr)",
          outline: "none",
        }} onFocus={e => e.target.style.borderColor = "var(--ink-4)"}
           onBlur={e => e.target.style.borderColor = "var(--line)"}/>
        <div style={{ position: "absolute", left: 12, top: 10.5, pointerEvents: "none" }}>
          <I.search size={15} stroke="var(--ink-3)"/>
        </div>
        <div style={{ position: "absolute", right: 10, top: 8, display: "flex", gap: 3 }}>
          <span className="kbd">⌘</span><span className="kbd">K</span>
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      {/* Date display */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12, fontFamily: "var(--font-num)" }}>
        <I.clock size={14}/>
        <span>2026.04.19 14:32</span>
      </div>

      {/* Theme toggle */}
      <button onClick={onToggleTheme} className="focus-ring" title="테마 전환" style={{
        width: 36, height: 36, borderRadius: 10,
        border: "1px solid var(--line)",
        background: "var(--surface)",
        cursor: "pointer",
        display: "grid", placeItems: "center",
        color: "var(--ink-2)",
      }}>
        {theme === "dark" ? <I.sun size={15}/> : <I.moon size={15}/>}
      </button>

      {/* Notification */}
      <button className="focus-ring" style={{
        width: 36, height: 36, borderRadius: 10,
        border: "1px solid var(--line)",
        background: "var(--surface)",
        cursor: "pointer",
        position: "relative",
        display: "grid", placeItems: "center",
        color: "var(--ink-2)",
      }}>
        <I.bell size={15}/>
        <span style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: 999, background: "var(--brand)", border: "1.5px solid var(--surface)" }}/>
      </button>

      {/* Profile */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 10, borderLeft: "1px solid var(--line)", height: 36 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 999,
          background: "linear-gradient(135deg, #4A6F5A, #2F4A3B)",
          color: "#EFE2C8",
          display: "grid", placeItems: "center",
          fontSize: 12, fontWeight: 600,
          fontFamily: "var(--font-num)",
        }}>JM</div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>정민호</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-num)" }}>OWNER</div>
        </div>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.Topbar = Topbar;
