// Top 2-tier navigation — replaces sidebar. Use with active={"home"|"sales"|"inv"|"fin"|"reports"|"settings"}
const { useState: useStateN, useEffect: useEffectN, useRef: useRefN } = React;

function TopNav({ theme, onToggleTheme, active = "home" }) {
  const [tenant, setTenant] = useStateN(0);
  const [tenantOpen, setTenantOpen] = useStateN(false);
  const [openMenu, setOpenMenu] = useStateN(null);
  const [textSize, setTextSize] = useStateN(() => {
    try { return localStorage.getItem("mc.textSize") || "lg"; } catch { return "lg"; }
  });
  const rootRef = useRefN(null);

  useEffectN(() => {
    document.documentElement.setAttribute("data-text-size", textSize);
    try { localStorage.setItem("mc.textSize", textSize); } catch {}
  }, [textSize]);

  useEffectN(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpenMenu(null);
        setTenantOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const MENU = [
    { id: "home", label: "홈", href: "Home Dashboard.html" },
    { id: "sales", label: "판매", items: [
      { id: "orders", label: "주문내역", count: 12, countTone: "warn", href: "Orders.html" },
      { id: "manual-order", label: "수동 주문 입력" },
      { id: "shipments", label: "송장 대장" },
      { divider: true },
      { id: "customers", label: "거래처" },
      { id: "products", label: "상품" },
    ]},
    { id: "inv", label: "재고·매입", items: [
      { id: "inventory", label: "재고현황", count: 5, countTone: "warn" },
      { id: "purchases", label: "수입·매입" },
      { id: "po", label: "발주서" },
    ]},
    { id: "fin", label: "재무", items: [
      { id: "ar", label: "미수금" },
      { id: "bank", label: "은행거래", count: 3 },
      { id: "tax", label: "세금계산서" },
      { id: "pl", label: "손익계산서" },
    ]},
    { id: "reports", label: "리포트", href: "#" },
    { id: "settings", label: "설정", items: [
      { id: "company", label: "회사정보" },
      { id: "team", label: "팀원" },
      { id: "plan", label: "요금제" },
      { id: "profile", label: "프로필" },
      { divider: true },
      { id: "modules", label: "모듈관리" },
      { id: "shipping-int", label: "택배연동" },
    ]},
  ];

  return (
    <header ref={rootRef} style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "var(--surface)",
      borderBottom: "1px solid var(--line)",
    }}>
      {/* Tier 1 — system strip */}
      <div style={{ height: 60, display: "flex", alignItems: "center", padding: "0 24px", gap: 16, borderBottom: "1px solid var(--line)" }}>
        <a href="Home Dashboard.html" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%)",
            display: "grid", placeItems: "center",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.15)",
          }}>
            <span className="disp" style={{ color: "#F3E4DE", fontSize: 16, fontWeight: 500, fontStyle: "italic" }}>M</span>
          </div>
          <div className="disp" style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            MochiCraft <span style={{ fontFamily: "var(--font-num)", fontSize: 10.5, color: "var(--ink-3)", fontWeight: 500, letterSpacing: "0.14em", marginLeft: 3 }}>OPS</span>
          </div>
        </a>

        <div style={{ width: 1, height: 24, background: "var(--line)", flexShrink: 0 }}/>

        {/* Tenant picker */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setTenantOpen(v => !v)} className="focus-ring" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "5px 10px 5px 5px", height: 36,
            borderRadius: 9, border: "1px solid var(--line)",
            background: "var(--surface-2)", cursor: "pointer", minWidth: 230,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: "linear-gradient(135deg, var(--tan) 0%, #7A4620 100%)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <span className="disp" style={{ color: "#F1E3D1", fontSize: 12, fontWeight: 500, fontStyle: "italic" }}>A</span>
            </div>
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {TENANTS[tenant].name}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-num)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {TENANTS[tenant].sub}
              </div>
            </div>
            <I.chev size={13} stroke="var(--ink-3)"/>
          </button>
          {tenantOpen && (
            <div style={{
              position: "absolute", top: 42, left: 0, zIndex: 30,
              width: 280, background: "var(--surface)",
              border: "1px solid var(--line-strong)", borderRadius: 10,
              boxShadow: "var(--shadow-lg)", padding: 6,
            }}>
              {TENANTS.map((t, i) => (
                <button key={t.id} onClick={() => { setTenant(i); setTenantOpen(false); }} style={{
                  display: "flex", width: "100%", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 6, border: "none",
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

        {/* Search — centered */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 520, position: "relative" }}>
            <input placeholder="주문, 거래처, 상품, 발주서 통합 검색…" style={{
              width: "100%", height: 36,
              background: "var(--bg)", border: "1px solid var(--line)",
              borderRadius: 10, padding: "0 62px 0 36px",
              fontSize: 13, color: "var(--ink)", fontFamily: "var(--font-kr)", outline: "none",
            }} onFocus={e => e.target.style.borderColor = "var(--ink-4)"}
              onBlur={e => e.target.style.borderColor = "var(--line)"}/>
            <div style={{ position: "absolute", left: 12, top: 10.5, pointerEvents: "none", color: "var(--ink-3)" }}>
              <I.search size={15}/>
            </div>
            <div style={{ position: "absolute", right: 10, top: 8, display: "flex", gap: 3 }}>
              <span className="kbd">⌘</span><span className="kbd">K</span>
            </div>
          </div>
        </div>

        {/* Right cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Text size — 3 steps */}
          <div style={{
            display: "inline-flex", alignItems: "center",
            height: 34, padding: 2, borderRadius: 9,
            border: "1px solid var(--line)", background: "var(--surface)",
          }}>
            {[
              { id: "sm", label: "가", fz: 10, title: "작게" },
              { id: "lg", label: "가", fz: 13, title: "크게" },
              { id: "xl", label: "가", fz: 16, title: "더 크게" },
            ].map(opt => {
              const on = textSize === opt.id;
              return (
                <button key={opt.id} onClick={() => setTextSize(opt.id)} title={opt.title}
                  className="focus-ring"
                  style={{
                    width: 30, height: 28, borderRadius: 7, border: "none",
                    background: on ? "var(--ink)" : "transparent",
                    color: on ? "var(--surface)" : "var(--ink-3)",
                    fontFamily: "var(--font-kr)",
                    fontSize: opt.fz, fontWeight: on ? 600 : 500,
                    cursor: "pointer", display: "grid", placeItems: "center",
                    lineHeight: 1, transition: "background .12s",
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
                >{opt.label}</button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-3)", fontSize: 11.5, fontFamily: "var(--font-num)" }}>
            <I.clock size={13}/> 2026.04.19 14:32
          </div>
          <button onClick={onToggleTheme} className="focus-ring" title={theme === "light" ? "그레이" : theme === "grey" ? "다크" : "라이트"} style={{
            width: 34, height: 34, borderRadius: 9,
            border: "1px solid var(--line)", background: "var(--surface)",
            cursor: "pointer", display: "grid", placeItems: "center", color: "var(--ink-2)",
          }}>
            {theme === "light" ? <I.sun size={14}/> : theme === "grey" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" fill="currentColor" opacity="0.35"/><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>
            ) : <I.moon size={14}/>}
          </button>
          <button className="focus-ring" style={{
            width: 34, height: 34, borderRadius: 9,
            border: "1px solid var(--line)", background: "var(--surface)",
            cursor: "pointer", position: "relative",
            display: "grid", placeItems: "center", color: "var(--ink-2)",
          }}>
            <I.bell size={14}/>
            <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 999, background: "var(--brand)", border: "1.5px solid var(--surface)" }}/>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 10, borderLeft: "1px solid var(--line)", height: 34 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 999,
              background: "linear-gradient(135deg, #4A6F5A, #2F4A3B)",
              color: "#EFE2C8", display: "grid", placeItems: "center",
              fontSize: 11, fontWeight: 600, fontFamily: "var(--font-num)",
            }}>JM</div>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}>정민호</div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-num)", letterSpacing: "0.08em" }}>OWNER</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tier 2 — menu bar */}
      <div style={{
        height: 48, display: "flex", alignItems: "stretch",
        padding: "0 16px", background: "var(--surface)",
      }}>
        <nav style={{ display: "flex", alignItems: "stretch", gap: 2 }}>
          {MENU.map(m => (
            <MenuTrigger
              key={m.id}
              menu={m}
              active={active === m.id}
              open={openMenu === m.id}
              onToggle={() => setOpenMenu(openMenu === m.id ? null : m.id)}
              onClose={() => setOpenMenu(null)}
            />
          ))}
        </nav>
        <div style={{ flex: 1 }}/>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn ghost" style={{ height: 32, fontSize: 12.5 }}><I.download size={13}/> 리포트 받기</button>
          <button className="btn primary" style={{ height: 32, fontSize: 12.5 }}><I.plus size={13}/> 주문 추가</button>
        </div>
      </div>
    </header>
  );
}

function MenuTrigger({ menu, active, open, onToggle, onClose }) {
  const hasDropdown = !!menu.items;
  const As = hasDropdown ? "button" : "a";
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <As
        onClick={hasDropdown ? onToggle : undefined}
        href={hasDropdown ? undefined : menu.href}
        className="focus-ring"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "0 14px", height: "100%",
          border: "none", background: open ? "var(--surface-2)" : "transparent",
          color: active ? "var(--ink)" : "var(--ink-2)",
          fontFamily: "var(--font-kr)", fontSize: 13.5,
          fontWeight: active ? 600 : 500,
          cursor: "pointer", position: "relative",
          letterSpacing: "-0.005em", textDecoration: "none",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--surface-2)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        {menu.label}
        {hasDropdown && <I.chev size={12} stroke="currentColor" sw={2}/>}
        {active && (
          <div style={{
            position: "absolute", left: 10, right: 10, bottom: -1,
            height: 2, background: "var(--brand)", borderRadius: "2px 2px 0 0",
          }}/>
        )}
      </As>

      {open && hasDropdown && (
        <div style={{
          position: "absolute", top: "100%", left: 0,
          minWidth: 220,
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          borderRadius: "0 10px 10px 10px",
          boxShadow: "var(--shadow-lg)",
          padding: 6, zIndex: 30,
        }}>
          {menu.items.map((it, i) => it.divider ? (
            <div key={i} style={{ height: 1, background: "var(--line)", margin: "6px 8px" }}/>
          ) : (
            <a key={it.id} href={it.href || "#"} onClick={onClose} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, padding: "8px 10px", borderRadius: 6,
              color: "var(--ink)", fontSize: 12.5, textDecoration: "none",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ whiteSpace: "nowrap" }}>{it.label}</span>
              {it.count != null && (
                <span style={{
                  fontFamily: "var(--font-num)", fontSize: 10.5,
                  padding: "1px 6px", borderRadius: 999,
                  background: it.countTone === "warn" ? "var(--warning-wash)" : "var(--info-wash)",
                  color: it.countTone === "warn" ? "var(--warning)" : "var(--info)",
                  fontVariantNumeric: "tabular-nums", fontWeight: 500,
                }}>{it.count}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

window.TopNav = TopNav;
