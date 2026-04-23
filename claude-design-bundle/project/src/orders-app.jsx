// Orders page — 판매 > 주문내역
const { useState: useStateO, useEffect: useEffectO, useMemo: useMemoO } = React;

const BRAND_MAP_O = {
  burgundy: { brand: "#6B1F2A", deep: "#541620", ink: "#3B0E15", wash: "#F3E4DE", wash2: "#EAD1C8",
              dark: { brand: "#C47A80", deep: "#B15F66", ink: "#E8C1C3", wash: "#3A1F23", wash2: "#4A2329" } },
  tan:      { brand: "#A0633A", deep: "#7C4A28", ink: "#3A2416", wash: "#F1E3D1", wash2: "#E4CBA8",
              dark: { brand: "#D19A6E", deep: "#B27D50", ink: "#F1E3D1", wash: "#3A2A1D", wash2: "#4A3828" } },
  oxblood:  { brand: "#8B2C2A", deep: "#6D1E1C", ink: "#3B0E0D", wash: "#F1D8D3", wash2: "#E5B8B0",
              dark: { brand: "#D08A86", deep: "#B86C68", ink: "#F1D8D3", wash: "#3B1F1C", wash2: "#4E2822" } },
  espresso: { brand: "#3E2723", deep: "#261410", ink: "#140907", wash: "#D9CCC2", wash2: "#C1B0A3",
              dark: { brand: "#B89A8A", deep: "#97796A", ink: "#E8DBD0", wash: "#2A201C", wash2: "#3A2E27" } },
  olive:    { brand: "#5A6B3A", deep: "#434F28", ink: "#1F2610", wash: "#E3E7D1", wash2: "#C9D1A8",
              dark: { brand: "#A8B880", deep: "#8C9C66", ink: "#E3E7D1", wash: "#232A19", wash2: "#333C24" } },
  navy:     { brand: "#2A3E5A", deep: "#1C2C45", ink: "#0B1322", wash: "#D7DFEC", wash2: "#B4C1D6",
              dark: { brand: "#8DA4C5", deep: "#6E88B0", ink: "#D7DFEC", wash: "#1A2233", wash2: "#25324A" } },
};
function applyBrandO(id, theme) {
  const b = BRAND_MAP_O[id] || BRAND_MAP_O.burgundy;
  const root = document.documentElement;
  const src = (theme === "dark" || theme === "grey") ? b.dark : b;
  root.style.setProperty("--brand", src.brand);
  root.style.setProperty("--brand-deep", src.deep || src.brand);
  root.style.setProperty("--brand-ink", src.ink);
  root.style.setProperty("--brand-wash", src.wash);
  root.style.setProperty("--brand-wash-2", src.wash2);
}

/* ─── Period Picker + Custom Range ─────────────── */
function PeriodPicker({ value, onChange, custom, setCustom }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Segmented
        options={[
          { id: "today",     label: "오늘" },
          { id: "week",      label: "이번 주" },
          { id: "month",     label: "이번 달" },
          { id: "lastmonth", label: "지난 달" },
          { id: "90d",       label: "90일" },
          { id: "custom",    label: "사용자 지정" },
        ]}
        value={value}
        onChange={onChange}
      />
      {value === "custom" && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4,
          padding: "4px 10px", borderRadius: 8,
          border: "1px solid var(--line)", background: "var(--surface)",
          fontFamily: "var(--font-num)", fontSize: 12, color: "var(--ink-2)" }}>
          <I.calendar size={13} stroke="var(--ink-3)"/>
          <input type="date" value={custom.from} onChange={e => setCustom(s => ({ ...s, from: e.target.value }))}
            style={{ border: "none", background: "transparent", fontFamily: "var(--font-num)", fontSize: 12, color: "var(--ink-2)", outline: "none" }}/>
          <span style={{ color: "var(--ink-4)" }}>—</span>
          <input type="date" value={custom.to} onChange={e => setCustom(s => ({ ...s, to: e.target.value }))}
            style={{ border: "none", background: "transparent", fontFamily: "var(--font-num)", fontSize: 12, color: "var(--ink-2)", outline: "none" }}/>
        </div>
      )}
    </div>
  );
}

/* ─── Order Items (expanded row) ────────────────── */
function ItemsTable({ items }) {
  return (
    <div style={{ background: "var(--surface-2)", padding: "12px 18px 14px 54px", borderTop: "1px solid var(--line)" }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-num)", marginBottom: 8 }}>
        ORDER_ITEMS · {items.length}개 라인
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.2fr) minmax(220px, 2fr) 70px 100px 110px 60px",
        gap: "4px 18px",
        fontSize: 12,
      }}>
        <div style={headLi()}>상품 코드</div>
        <div style={headLi()}>상품명</div>
        <div style={{ ...headLi(), textAlign: "right" }}>수량</div>
        <div style={{ ...headLi(), textAlign: "right" }}>단가</div>
        <div style={{ ...headLi(), textAlign: "right" }}>금액</div>
        <div style={{ ...headLi(), textAlign: "center" }}>구분</div>

        {items.map((it, i) => {
          const strike = it.isReturn;
          const cellColor = strike ? "var(--danger)" : "var(--ink-2)";
          const cellStyle = { padding: "6px 0", color: cellColor, textDecoration: strike ? "line-through" : "none" };
          return (
            <React.Fragment key={i}>
              <div style={{ ...cellStyle, fontFamily: "var(--font-num)", fontSize: 11.5, color: strike ? "var(--danger)" : "var(--ink-3)" }}>{it.code}</div>
              <div style={cellStyle}>{it.name}</div>
              <div style={{ ...cellStyle, textAlign: "right", fontFamily: "var(--font-num)", fontWeight: 500 }}>{it.qty > 0 ? "+" : ""}{it.qty} ea</div>
              <div style={{ ...cellStyle, textAlign: "right", fontFamily: "var(--font-num)" }}>{it.price.toLocaleString("ko-KR")}원</div>
              <div style={{ ...cellStyle, textAlign: "right", fontFamily: "var(--font-num)", fontWeight: 500 }}>{it.amount.toLocaleString("ko-KR")}원</div>
              <div style={{ ...cellStyle, textAlign: "center" }}>
                {it.isReturn
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--danger)", fontWeight: 500, background: "var(--danger-wash)", padding: "1px 6px", borderRadius: 999, textDecoration: "none" }}>반품</span>
                  : <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>판매</span>
                }
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
function headLi() {
  return {
    fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em",
    fontFamily: "var(--font-num)", color: "var(--ink-4)",
    paddingBottom: 6, borderBottom: "1px dashed var(--line)",
  };
}

/* ─── Order Row ─────────────────────────────────── */
function OrderRow({ o, checked, onCheck, expanded, onExpand, density }) {
  const itemsSummary = (() => {
    if (o.items.length === 0) return "";
    const first = o.items[0].name.replace(/ — .*$/, "").replace(/Angelus /,"");
    return o.items.length === 1 ? first : `${first} 외 ${o.items.length - 1}종`;
  })();
  const rowPad = density === "compact" ? "8px 14px" : density === "comfy" ? "14px 14px" : "11px 14px";

  return (
    <>
      <tr
        onClick={onExpand}
        style={{
          cursor: "pointer",
          borderBottom: expanded ? "none" : "1px solid var(--line)",
          background: checked ? "var(--brand-wash)" : expanded ? "var(--surface-2)" : "transparent",
          transition: "background .15s",
        }}
        onMouseEnter={e => { if (!checked && !expanded) e.currentTarget.style.background = "var(--surface-2)"; }}
        onMouseLeave={e => { if (!checked && !expanded) e.currentTarget.style.background = "transparent"; }}
      >
        <td style={{ padding: rowPad, width: 36 }}>
          <Check on={checked} onChange={onCheck}/>
        </td>
        <td style={{ padding: rowPad, width: 26 }}>
          <span style={{
            display: "inline-grid", placeItems: "center",
            width: 18, height: 18, borderRadius: 4,
            color: "var(--ink-3)",
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform .12s",
          }}>
            <I.chevR size={13}/>
          </span>
        </td>
        <td style={{ padding: rowPad, whiteSpace: "nowrap", fontFamily: "var(--font-num)", fontSize: 12, color: "var(--ink-2)" }}>
          {fmtDateTime(o.date)}
        </td>
        <td style={{ padding: rowPad, whiteSpace: "nowrap", fontFamily: "var(--font-num)", fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>
          {o.id}
        </td>
        <td style={{ padding: rowPad }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <GradeBadge grade={o.customer.grade} size="sm"/>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{o.customer.name}</span>
          </div>
        </td>
        <td style={{ padding: rowPad, fontSize: 12.5, color: "var(--ink-2)", maxWidth: 260 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {itemsSummary}
          </div>
          {o.memo && (
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <I.tag size={10}/> {o.memo}
            </div>
          )}
        </td>
        <td style={{ padding: rowPad, textAlign: "right", fontFamily: "var(--font-num)", fontSize: 12.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
          {o.totalQty} ea
        </td>
        <td style={{ padding: rowPad, textAlign: "right", whiteSpace: "nowrap" }}>
          <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {o.gross.toLocaleString("ko-KR")}원
          </div>
          {o.hasReturn && (
            <div className="num" style={{ fontSize: 10.5, color: "var(--danger)", fontWeight: 500, marginTop: 1 }}>
              반품 {o.returnAmt.toLocaleString("ko-KR")}원
            </div>
          )}
        </td>
        <td style={{ padding: rowPad }}>
          <StatusBadge status={o.status}/>
        </td>
        <td style={{ padding: rowPad, textAlign: "center" }}>
          <SourceIcon source={o.source}/>
        </td>
        <td style={{ padding: rowPad }}>
          <Avatar initials={o.user.init} seed={o.user.seed} size={24}/>
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--line)" }}>
          <td colSpan={11} style={{ padding: 0, background: "var(--surface-2)" }}>
            <ItemsTable items={o.items}/>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 18px 14px 54px",
              fontSize: 11.5, color: "var(--ink-3)",
            }}>
              <button className="btn" style={{ height: 28, fontSize: 12 }}><I.doc size={13}/> 거래명세서</button>
              <button className="btn" style={{ height: 28, fontSize: 12 }}><I.printer size={13}/> 송장 인쇄</button>
              <button className="btn" style={{ height: 28, fontSize: 12 }}><I.dots size={13}/> 더보기</button>
              <div style={{ flex: 1 }}/>
              <span style={{ fontFamily: "var(--font-num)" }}>
                작성: {o.user.name} · {fmtDateTime(o.date)}
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Floating Bulk Action Bar ─────────────────── */
function BulkBar({ count, onClear }) {
  if (count === 0) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
      background: "var(--ink)", color: "var(--surface)",
      padding: "10px 12px 10px 16px",
      borderRadius: 14,
      boxShadow: "var(--shadow-lg)",
      display: "flex", alignItems: "center", gap: 12,
      zIndex: 60,
      fontFamily: "var(--font-kr)",
    }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        <span style={{ fontFamily: "var(--font-num)", fontSize: 14, fontWeight: 600 }}>{count}</span>개 선택됨
      </span>
      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }}/>
      <button style={bulkBtn()}><I.truck size={13}/> 일괄 출고</button>
      <button style={bulkBtn()}><I.printer size={13}/> 송장 인쇄</button>
      <button style={bulkBtn()}><I.download size={13}/> 엑셀</button>
      <button style={bulkBtn()}><I.doc size={13}/> 세금계산서</button>
      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }}/>
      <button onClick={onClear} style={{ ...bulkBtn(), color: "rgba(255,255,255,0.7)" }}>
        <I.x size={13}/> 해제
      </button>
    </div>
  );
}
function bulkBtn() {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "6px 10px", height: 30,
    border: "none",
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)",
    color: "var(--surface)",
    fontFamily: "var(--font-kr)",
    fontSize: 12.5, fontWeight: 500,
    cursor: "pointer",
  };
}

/* ─── App ───────────────────────────────────────── */
function OrdersApp() {
  const [theme, setTheme] = useStateO(TWEAKS.theme || "light");
  const [tweaks, setTweaks] = useStateO(TWEAKS);
  const [collapsed, setCollapsed] = useStateO(false);

  const [period, setPeriod] = useStateO("month");
  const [custom, setCustom] = useStateO({ from: "2026-03-01", to: "2026-04-19" });
  const [statusSel, setStatusSel] = useStateO([]);
  const [custSel, setCustSel] = useStateO([]);
  const [source, setSource] = useStateO("all");
  const [query, setQuery] = useStateO("");
  const [checked, setChecked] = useStateO({});
  const [expanded, setExpanded] = useStateO(null);
  const [selectedId, setSelectedId] = useStateO(null);
  const [page, setPage] = useStateO(1);
  const perPage = 14;

  useEffectO(() => {
    document.documentElement.setAttribute("data-theme", theme);
    applyBrandO(tweaks.brand, theme);
  }, [theme, tweaks.brand]);
  useEffectO(() => { document.body.style.backgroundImage = tweaks.grain ? "" : "none"; }, [tweaks.grain]);
  useEffectO(() => { if (tweaks.theme !== theme) setTheme(tweaks.theme); }, [tweaks.theme]);

  const toggleTheme = () => {
    const cycle = { light: "grey", grey: "dark", dark: "light" };
    const next = cycle[theme] || "light";
    setTheme(next); setTweaks(s => ({ ...s, theme: next }));
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { theme: next } }, "*");
  };

  const [pStart, pEnd] = useMemoO(() => {
    if (period === "custom") {
      return [new Date(custom.from + "T00:00:00"), new Date(custom.to + "T23:59:59")];
    }
    return periodRange(period);
  }, [period, custom]);

  const filtered = useMemoO(() => {
    return ORDERS.filter(o => {
      if (o.date < pStart || o.date > pEnd) return false;
      if (statusSel.length && !statusSel.includes(o.status)) return false;
      if (custSel.length && !custSel.includes(o.customer.id)) return false;
      if (source !== "all" && o.source !== source) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!(o.id.toLowerCase().includes(q) ||
              o.customer.name.toLowerCase().includes(q) ||
              o.items.some(it => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)))) return false;
      }
      return true;
    });
  }, [pStart, pEnd, statusSel, custSel, source, query]);

  const summary = useMemoO(() => {
    const count = filtered.length;
    const gross = filtered.reduce((s, o) => s + o.gross, 0);
    const returns = filtered.reduce((s, o) => s + o.returnAmt, 0);
    const net = gross; // gross already includes return negs
    const avg = count ? Math.round(gross / count) : 0;
    return { count, gross, net, returns, avg };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * perPage, curPage * perPage);
  useEffectO(() => { setPage(1); setSelectedId(null); }, [period, custom, statusSel, custSel, source, query]);
  useEffectO(() => {
    if (!selectedId || !filtered.find(o => o.id === selectedId)) {
      setSelectedId(filtered[0]?.id || null);
    }
  }, [filtered]);
  const selectedOrder = filtered.find(o => o.id === selectedId) || null;

  const pageIds = pageRows.map(o => o.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every(id => checked[id]);
  const somePageChecked = pageIds.some(id => checked[id]);
  const togglePage = () => {
    if (allPageChecked) {
      const n = { ...checked };
      pageIds.forEach(id => delete n[id]);
      setChecked(n);
    } else {
      const n = { ...checked };
      pageIds.forEach(id => n[id] = true);
      setChecked(n);
    }
  };
  const toggleOne = (id) => setChecked(c => {
    const n = { ...c };
    if (n[id]) delete n[id]; else n[id] = true;
    return n;
  });
  const clearAll = () => setChecked({});

  const custOptions = ORDER_CUSTOMERS.map(c => ({
    id: c.id,
    label: c.name,
    prefix: <GradeBadge grade={c.grade} size="sm"/>,
  }));
  const statusOptions = [
    { id: "draft",     label: "임시",  prefix: <span style={statusDot("var(--ink-4)")}/> },
    { id: "confirmed", label: "확정",  prefix: <span style={statusDot("var(--info)")}/> },
    { id: "shipped",   label: "출고",  prefix: <span style={statusDot("var(--warning)")}/> },
    { id: "done",      label: "완료",  prefix: <span style={statusDot("var(--success)")}/> },
    { id: "cancel",    label: "취소",  prefix: <span style={statusDot("var(--danger)")}/> },
  ];

  const density = tweaks.density || "medium";
  const selectedCount = Object.keys(checked).length;

  // Column widths + split ratio — persisted
  const defaultCols = { date: 130, customer: 0, qty: 60, total: 120 }; // customer = flexible
  const [cols, setCols] = useStateO(() => {
    try { const s = localStorage.getItem("mc.orders.cols"); return s ? { ...defaultCols, ...JSON.parse(s) } : defaultCols; }
    catch { return defaultCols; }
  });
  const [splitPct, setSplitPct] = useStateO(() => {
    try { const s = localStorage.getItem("mc.orders.split"); return s ? parseFloat(s) : 48; }
    catch { return 48; }
  });
  useEffectO(() => { try { localStorage.setItem("mc.orders.cols", JSON.stringify(cols)); } catch {} }, [cols]);
  useEffectO(() => { try { localStorage.setItem("mc.orders.split", String(splitPct)); } catch {} }, [splitPct]);

  const splitRef = React.useRef(null);
  const startColDrag = (key, minW = 50, maxW = 400) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = cols[key];
    const onMove = (ev) => {
      const next = Math.max(minW, Math.min(maxW, startW + (ev.clientX - startX)));
      setCols(c => ({ ...c, [key]: next }));
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };
  const startSplitDrag = (e) => {
    e.preventDefault();
    const rect = splitRef.current.getBoundingClientRect();
    const onMove = (ev) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(28, Math.min(75, pct)));
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };

  const gridCols = `32px ${cols.date}px minmax(0, 1fr) ${cols.qty}px ${cols.total}px`;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }} data-screen-label="02 Orders">
      <TopNav theme={theme} onToggleTheme={toggleTheme} active="sales"/>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <main style={{ flex: 1, padding: "20px 32px 80px", maxWidth: 1720, width: "100%", margin: "0 auto" }}>
          <PageHeader
            crumbs={["판매", "주문내역"]}
            title="주문내역"
            summary={[
              { label: "건수", value: summary.count.toLocaleString("ko-KR") + "건" },
              { label: "총액", value: fmtWon(summary.gross) + "원" },
              { label: "순액", value: fmtWon(summary.net) + "원", tone: summary.returns < 0 ? "danger" : undefined },
              { label: "평균", value: fmtWon(summary.avg) + "원", tone: "muted" },
            ]}
            actions={<>
              <button className="btn" style={{ height: 32, fontSize: 12.5 }}><I.download size={13}/> 엑셀</button>
              <button className="btn primary" style={{ height: 32, fontSize: 12.5 }}><I.plus size={13}/> 주문 추가</button>
            </>}
          />

          {/* Filter bar */}
          <div className="card" style={{ padding: "12px 14px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <PeriodPicker value={period} onChange={setPeriod} custom={custom} setCustom={setCustom}/>
              <div style={{ flex: 1 }}/>
              <div style={{ position: "relative" }}>
                <I.search size={14} stroke="var(--ink-3)" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="주문번호 · 거래처 · 상품…"
                  style={{
                    height: 30,
                    width: 260,
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "0 12px 0 32px",
                    fontSize: 12.5,
                    color: "var(--ink)",
                    fontFamily: "var(--font-kr)",
                    outline: "none",
                  }}
                />
                <div style={{ position: "absolute", left: 10, top: 8, pointerEvents: "none" }}>
                  <I.search size={14} stroke="var(--ink-3)"/>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <MultiChip
                label="거래처"
                icon={<I.users size={13}/>}
                selected={custSel}
                onChange={setCustSel}
                options={custOptions}
              />
              <MultiChip
                label="상태"
                icon={<I.flag size={13}/>}
                selected={statusSel}
                onChange={setStatusSel}
                options={statusOptions}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>접수 경로</span>
                <Segmented
                  compact
                  options={[
                    { id: "all",    label: "전체" },
                    { id: "manual", label: "손",      icon: <SourceIcon source="manual" size={12}/> },
                    { id: "portal", label: "포털",    icon: <SourceIcon source="portal" size={12}/> },
                    { id: "ai",     label: "AI",      icon: <SourceIcon source="ai" size={12}/> },
                  ]}
                  value={source}
                  onChange={setSource}
                />
              </div>

              <div style={{ flex: 1 }}/>
              <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-num)" }}>
                {fmtDate(pStart)} — {fmtDate(pEnd)} · {filtered.length}건
              </span>
            </div>
          </div>

          {/* Master-detail split */}
          <div ref={splitRef} style={{ display: "grid", gridTemplateColumns: `${splitPct}% 6px minmax(0, 1fr)`, alignItems: "start" }}>

            {/* LEFT — list */}
            <div className="card" style={{ padding: 0, overflow: "hidden", minWidth: 0 }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 10,
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--line)",
                fontSize: 10.5, fontWeight: 500, color: "var(--ink-3)",
                textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-num)",
                position: "relative",
              }}>
                <Check on={allPageChecked} indet={!allPageChecked && somePageChecked} onChange={togglePage}/>
                <div style={{ position: "relative" }}>
                  주문일
                  <ColHandle onMouseDown={startColDrag("date", 90, 220)}/>
                </div>
                <div style={{ position: "relative" }}>
                  거래처
                  {/* customer column flexes, no handle needed on its right since qty is next */}
                </div>
                <div style={{ textAlign: "right", position: "relative" }}>
                  <ColHandle onMouseDown={startColDrag("qty", 48, 140)} side="left"/>
                  수량
                  <ColHandle onMouseDown={startColDrag("qty", 48, 140)}/>
                </div>
                <div style={{ textAlign: "right", position: "relative" }}>
                  <ColHandle onMouseDown={startColDrag("total", 80, 220)} side="left"/>
                  총액
                </div>
              </div>

              {pageRows.map(o => {
                const sel = o.id === selectedId;
                const isChecked = !!checked[o.id];
                return (
                  <div key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridCols,
                      gap: 10,
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--line)",
                      borderLeft: sel ? "3px solid var(--brand)" : "3px solid transparent",
                      paddingLeft: sel ? 11 : 14,
                      background: sel ? "var(--brand-wash)" : isChecked ? "var(--surface-2)" : "transparent",
                      cursor: "pointer",
                      alignItems: "center",
                      transition: "background .12s",
                    }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = isChecked ? "var(--surface-2)" : "transparent"; }}
                  >
                    <div onClick={e => e.stopPropagation()}>
                      <Check on={isChecked} onChange={() => toggleOne(o.id)}/>
                    </div>
                    <div style={{ fontFamily: "var(--font-num)", fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.35, minWidth: 0 }}>
                      <div style={{ color: "var(--ink)", fontWeight: 500 }}>{fmtDate(o.date)}</div>
                      <div style={{ color: "var(--ink-3)", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(o.date.getHours()).padStart(2,"0")}:{String(o.date.getMinutes()).padStart(2,"0")} · {o.id.slice(-4)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <GradeBadge grade={o.customer.grade} size="sm"/>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {o.customer.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                          <StatusBadge status={o.status}/>
                          {o.hasReturn && (
                            <span style={{ fontSize: 9.5, color: "var(--danger)", fontWeight: 500, fontFamily: "var(--font-num)", letterSpacing: "0.04em" }}>RET</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "var(--font-num)", fontSize: 12.5, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {o.totalQty}<span style={{ color: "var(--ink-4)", fontSize: 10.5, marginLeft: 2 }}>ea</span>
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "var(--font-num)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {o.gross.toLocaleString("ko-KR")}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.04em" }}>KRW</div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <EmptyState
                  title="조건에 맞는 주문이 없어요"
                  body="기간을 넓히거나 필터를 초기화해 보세요."
                  primary="+ 주문 추가"
                  secondary="필터 초기화"
                />
              )}

              {/* Pagination */}
              {filtered.length > 0 && (
                <div style={{
                  padding: "10px 14px",
                  borderTop: "1px solid var(--line)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-num)",
                }}>
                  <span>
                    {filtered.length}건 중 {(curPage - 1) * perPage + 1}–{Math.min(curPage * perPage, filtered.length)}
                  </span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button onClick={() => setPage(1)} disabled={curPage === 1} style={pageBtn(false, curPage === 1)}>«</button>
                    <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={curPage === 1} style={pageBtn(false, curPage === 1)}>‹</button>
                    {pagesAround(curPage, totalPages).map((p, i) =>
                      p === "…"
                        ? <span key={i} style={{ padding: "0 6px", color: "var(--ink-4)" }}>…</span>
                        : <button key={i} onClick={() => setPage(p)} style={pageBtn(p === curPage)}>{p}</button>
                    )}
                    <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={curPage === totalPages} style={pageBtn(false, curPage === totalPages)}>›</button>
                    <button onClick={() => setPage(totalPages)} disabled={curPage === totalPages} style={pageBtn(false, curPage === totalPages)}>»</button>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div
              onMouseDown={startSplitDrag}
              title="드래그해서 크기 조절"
              style={{
                alignSelf: "stretch",
                cursor: "col-resize",
                position: "relative",
                userSelect: "none",
              }}
            >
              <div style={{
                position: "absolute", left: "50%", top: 0, bottom: 0,
                width: 1, background: "var(--line)", transform: "translateX(-0.5px)",
              }}/>
              <div style={{
                position: "absolute", left: "50%", top: "50%",
                transform: "translate(-50%, -50%)",
                width: 4, height: 32, borderRadius: 3,
                background: "var(--line-strong)",
                transition: "background .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--brand)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--line-strong)"}
              />
            </div>

            {/* RIGHT — detail */}
            <OrderDetail order={selectedOrder}/>
          </div>
        </main>
      </div>

      <BulkBar count={selectedCount} onClear={clearAll}/>
      <TweaksPanel state={tweaks} setState={setTweaks}/>
    </div>
  );
}

/* ─── Order Detail pane ───────────────────────── */
function OrderDetail({ order }) {
  if (!order) {
    return (
      <div className="card" style={{
        padding: "60px 28px", position: "sticky", top: 128,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        color: "var(--ink-3)",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "var(--surface-2)", border: "1px solid var(--line)",
          display: "grid", placeItems: "center",
        }}>
          <I.doc size={20} stroke="var(--ink-3)"/>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>주문을 선택해 주세요</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", textAlign: "center" }}>
          왼쪽 목록에서 주문을 클릭하면 상세 내용이 여기에 표시됩니다.
        </div>
      </div>
    );
  }

  const subtotal = order.items.reduce((s, it) => s + (it.isReturn ? 0 : it.amount), 0);
  const returnTotal = order.items.reduce((s, it) => s + (it.isReturn ? it.amount : 0), 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + returnTotal;

  return (
    <div className="card" style={{ padding: 0, position: "sticky", top: 128, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: "var(--font-num)", fontSize: 10.5,
            color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>ORDER</span>
          <span style={{ fontFamily: "var(--font-num)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {order.id}
          </span>
          <StatusBadge status={order.status}/>
          <SourceIcon source={order.source}/>
          <div style={{ flex: 1 }}/>
          <button className="btn ghost" style={{ height: 28, fontSize: 12, padding: "0 8px" }}>
            <I.dots size={13}/>
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GradeBadge grade={order.customer.grade} size="md"/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="disp" style={{ fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: "-0.015em", color: "var(--ink)" }}>
              {order.customer.name}
            </h2>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-num)", marginTop: 2 }}>
              {fmtDateTime(order.date)} · 작성 {order.user.name}
            </div>
          </div>
        </div>
        {order.memo && (
          <div style={{
            marginTop: 10, padding: "7px 10px",
            background: "var(--surface-2)", border: "1px solid var(--line)",
            borderRadius: 8, display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: "var(--ink-2)",
          }}>
            <I.tag size={11} stroke="var(--ink-3)"/>
            <span>{order.memo}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        borderBottom: "1px solid var(--line)",
      }}>
        {[
          { label: "라인", v: order.items.length + "건", mono: true },
          { label: "수량", v: order.totalQty + " ea", mono: true },
          { label: "총액", v: order.gross.toLocaleString("ko-KR") + "원", mono: true, bold: true },
        ].map((s, i) => (
          <div key={i} style={{
            padding: "12px 16px",
            borderLeft: i === 0 ? "none" : "1px solid var(--line)",
          }}>
            <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-num)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: "var(--font-num)",
              fontSize: s.bold ? 16 : 14,
              fontWeight: s.bold ? 600 : 500,
              color: "var(--ink)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* Line items */}
      <div style={{ padding: "14px 20px 8px" }}>
        <div style={{
          fontSize: 10.5, color: "var(--ink-3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          fontFamily: "var(--font-num)", marginBottom: 8,
          display: "flex", justifyContent: "space-between",
        }}>
          <span>주문 품목</span>
          <span>{order.items.length}개 라인</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {order.items.map((it, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 70px 100px 110px",
              gap: 10, alignItems: "center",
              padding: "10px 0",
              borderBottom: i === order.items.length - 1 ? "none" : "1px solid var(--line)",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, color: it.isReturn ? "var(--danger)" : "var(--ink)",
                  fontWeight: 500,
                  textDecoration: it.isReturn ? "line-through" : "none",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {it.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-num)", letterSpacing: "0.04em" }}>
                    {it.code}
                  </span>
                  {it.isReturn && (
                    <span style={{
                      fontSize: 9.5, color: "var(--danger)", fontWeight: 500,
                      background: "var(--danger-wash)", padding: "1px 5px", borderRadius: 4,
                      letterSpacing: "0.04em",
                    }}>반품</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", fontFamily: "var(--font-num)", fontSize: 12, fontWeight: 500, color: it.isReturn ? "var(--danger)" : "var(--ink-2)" }}>
                {it.qty > 0 ? "+" : ""}{it.qty}
                <span style={{ color: "var(--ink-4)", fontSize: 10.5, marginLeft: 2 }}>ea</span>
              </div>
              <div style={{ textAlign: "right", fontFamily: "var(--font-num)", fontSize: 12, color: "var(--ink-3)" }}>
                {it.price.toLocaleString("ko-KR")}원
              </div>
              <div style={{ textAlign: "right", fontFamily: "var(--font-num)", fontSize: 13, fontWeight: 600, color: it.isReturn ? "var(--danger)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                {it.amount.toLocaleString("ko-KR")}
                <span style={{ color: "var(--ink-4)", fontSize: 10, fontWeight: 500, marginLeft: 2 }}>KRW</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div style={{
        padding: "12px 20px 16px",
        borderTop: "1px solid var(--line)",
        background: "var(--surface-2)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { label: "판매 소계", v: subtotal, mono: true },
            ...(returnTotal < 0 ? [{ label: "반품", v: returnTotal, tone: "danger", mono: true }] : []),
            { label: "VAT (10%)", v: tax, faded: true, mono: true },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: r.faded ? "var(--ink-3)" : "var(--ink-2)" }}>
              <span>{r.label}</span>
              <span style={{
                fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums",
                color: r.tone === "danger" ? "var(--danger)" : "inherit",
              }}>{r.v.toLocaleString("ko-KR")}원</span>
            </div>
          ))}
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>합계</span>
            <span style={{ fontFamily: "var(--font-num)", fontSize: 18, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {total.toLocaleString("ko-KR")}
              <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500, marginLeft: 3 }}>KRW</span>
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        padding: "12px 20px", borderTop: "1px solid var(--line)",
        display: "flex", flexWrap: "wrap", gap: 6,
      }}>
        <button className="btn primary" style={{ height: 32, fontSize: 12.5 }}>
          <I.truck size={13}/> 출고 처리
        </button>
        <button className="btn" style={{ height: 32, fontSize: 12.5 }}>
          <I.doc size={13}/> 거래명세서
        </button>
        <button className="btn" style={{ height: 32, fontSize: 12.5 }}>
          <I.printer size={13}/> 송장 인쇄
        </button>
        <div style={{ flex: 1 }}/>
        <button className="btn ghost" style={{ height: 32, fontSize: 12.5 }}>
          <I.dots size={13}/>
        </button>
      </div>
    </div>
  );
}

function thO(w) {
  return {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 10.5,
    fontWeight: 500,
    color: "var(--ink-3)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "var(--font-num)",
    width: w,
    whiteSpace: "nowrap",
  };
}
function statusDot(c) {
  return { display: "inline-block", width: 8, height: 8, borderRadius: 999, background: c, flexShrink: 0 };
}

/* ─── Column resize handle ─────────────────────── */
function ColHandle({ onMouseDown, side = "right" }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        [side]: -8, top: -10, bottom: -10,
        width: 14,
        cursor: "col-resize",
        zIndex: 2,
      }}
    >
      <div style={{
        position: "absolute",
        left: "50%", top: 0, bottom: 0,
        width: hover ? 2 : 1,
        background: hover ? "var(--brand)" : "transparent",
        transform: "translateX(-50%)",
        transition: "background .12s, width .12s",
      }}/>
    </div>
  );
}
function pageBtn(active, disabled) {
  return {
    minWidth: 26, height: 26, padding: "0 6px",
    border: "1px solid " + (active ? "var(--brand-wash-2)" : "var(--line)"),
    borderRadius: 6,
    background: active ? "var(--brand-wash)" : "var(--surface)",
    color: active ? "var(--brand)" : "var(--ink-2)",
    fontFamily: "var(--font-num)", fontSize: 11,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}
function pagesAround(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  if (cur > 3) out.push("…");
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
  if (cur < total - 2) out.push("…");
  out.push(total);
  return out;
}

ReactDOM.createRoot(document.getElementById("app")).render(<OrdersApp/>);
