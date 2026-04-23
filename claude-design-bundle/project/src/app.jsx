// Root app
const { useState: useStateA, useEffect: useEffectA } = React;

const BRAND_MAP = {
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

function applyBrand(id, theme) {
  const b = BRAND_MAP[id] || BRAND_MAP.burgundy;
  const root = document.documentElement;
  if (theme === "dark" || theme === "grey") {
    root.style.setProperty("--brand", b.dark.brand);
    root.style.setProperty("--brand-deep", b.dark.deep);
    root.style.setProperty("--brand-ink", b.dark.ink);
    root.style.setProperty("--brand-wash", b.dark.wash);
    root.style.setProperty("--brand-wash-2", b.dark.wash2);
  } else {
    root.style.setProperty("--brand", b.brand);
    root.style.setProperty("--brand-deep", b.deep);
    root.style.setProperty("--brand-ink", b.ink);
    root.style.setProperty("--brand-wash", b.wash);
    root.style.setProperty("--brand-wash-2", b.wash2);
  }
}

function App() {
  const [theme, setTheme] = useStateA(TWEAKS.theme || "light");
  const [tweaks, setTweaks] = useStateA(TWEAKS);

  useEffectA(() => {
    document.documentElement.setAttribute("data-theme", theme);
    applyBrand(tweaks.brand, theme);
  }, [theme, tweaks.brand]);

  useEffectA(() => {
    document.body.style.backgroundImage = tweaks.grain ? "" : "none";
  }, [tweaks.grain]);

  // Sync theme when tweaks.theme changes
  useEffectA(() => {
    if (tweaks.theme !== theme) setTheme(tweaks.theme);
  }, [tweaks.theme]);

  const toggleTheme = () => {
    const cycle = { light: "grey", grey: "dark", dark: "light" };
    const next = cycle[theme] || "light";
    setTheme(next); setTweaks(s => ({ ...s, theme: next }));
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { theme: next } }, "*");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }} data-screen-label="01 Home Dashboard">
      <TopNav theme={theme} onToggleTheme={toggleTheme} active="home"/>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <main style={{ flex: 1, padding: "24px 32px 40px", maxWidth: 1720, width: "100%", margin: "0 auto" }}>
          {/* Page title — slim */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-num)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                <span>홈 대시보드</span>
                <span style={{ color: "var(--ink-4)" }}>·</span>
                <span>2026.04.19 · 금요일</span>
              </div>
              <h1 className="disp" style={{ fontSize: 26, fontWeight: 400, margin: "6px 0 4px", letterSpacing: "-0.015em" }}>
                안녕하세요, <em style={{ fontStyle: "italic", color: "var(--brand)" }}>정민호</em> 님
              </h1>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                오늘 처리할 일이 <span style={{ fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-num)" }}>18</span>건 있습니다. 이번 달 매출은 목표의 <span style={{ fontWeight: 600, color: "var(--brand)", fontFamily: "var(--font-num)" }}>64%</span>를 달성했어요.
              </div>
            </div>
          </div>

          {/* KPI */}
          <div style={{ marginBottom: 20 }}>
            <KPIGrid/>
          </div>

          {/* Today + Chart */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 20, marginBottom: 20 }}>
            <TodaySection/>
            <RevenueChart/>
          </div>

          {/* Timeline */}
          <Timeline/>

          <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--ink-3)", fontSize: 11.5, fontFamily: "var(--font-num)" }}>
            <span>© 2026 MochiCraft · 데이터 최신 시각 2026.04.19 14:32</span>
            <span>v0.9.3 · KST (UTC+9) · KRW</span>
          </div>
        </main>
      </div>
      <TweaksPanel state={tweaks} setState={setTweaks}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App/>);
