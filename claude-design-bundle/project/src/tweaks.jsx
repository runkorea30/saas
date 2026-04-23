// Tweaks panel — edit mode controls
const { useState: useStateT, useEffect: useEffectT } = React;

function TweaksPanel({ state, setState }) {
  const [visible, setVisible] = useStateT(false);

  useEffectT(() => {
    const handler = (e) => {
      if (e.data?.type === "__activate_edit_mode") setVisible(true);
      if (e.data?.type === "__deactivate_edit_mode") setVisible(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!visible) return null;

  const set = (k, v) => {
    setState(s => ({ ...s, [k]: v }));
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
  };

  const brandColors = [
    { id: "burgundy", color: "#6B1F2A", label: "Burgundy" },
    { id: "tan",      color: "#A0633A", label: "Tan" },
    { id: "oxblood",  color: "#8B2C2A", label: "Oxblood" },
    { id: "espresso", color: "#3E2723", label: "Espresso" },
    { id: "olive",    color: "#5A6B3A", label: "Olive" },
    { id: "navy",     color: "#2A3E5A", label: "Navy" },
  ];

  return (
    <div className="tweaks-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="disp" style={{ fontSize: 15, fontWeight: 500 }}>Tweaks</div>
        <button onClick={() => setVisible(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)" }}>
          <I.x size={14}/>
        </button>
      </div>

      <div className="tweak-row">
        <label>테마</label>
        <div style={{ display: "flex", gap: 4 }}>
          {["light", "dark"].map(t => (
            <button key={t} onClick={() => set("theme", t)} style={{
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid var(--line)",
              background: state.theme === t ? "var(--brand)" : "var(--surface)",
              color: state.theme === t ? "#fff" : "var(--ink-2)",
              cursor: "pointer",
              fontFamily: "var(--font-kr)",
            }}>{t === "light" ? "라이트" : "다크"}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row" style={{ alignItems: "flex-start" }}>
        <label style={{ paddingTop: 4 }}>포인트 컬러</label>
        <div className="swatch-row" style={{ flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 170 }}>
          {brandColors.map(b => (
            <button key={b.id} className={"swatch" + (state.brand === b.id ? " active" : "")}
              onClick={() => set("brand", b.id)}
              title={b.label}
              style={{ background: b.color, border: "none" }}
            />
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>종이 그레인</label>
        <button onClick={() => set("grain", !state.grain)} style={{
          width: 36, height: 20, borderRadius: 999,
          border: "none",
          background: state.grain ? "var(--brand)" : "var(--line-strong)",
          cursor: "pointer", position: "relative",
        }}>
          <div style={{
            position: "absolute", top: 2,
            left: state.grain ? 18 : 2,
            width: 16, height: 16, borderRadius: 999,
            background: "#fff",
            transition: "left .15s",
          }}/>
        </button>
      </div>

      <div className="tweak-row">
        <label>정보 밀도</label>
        <div style={{ display: "flex", gap: 4 }}>
          {["compact", "medium", "comfy"].map(d => (
            <button key={d} onClick={() => set("density", d)} style={{
              padding: "4px 8px",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid var(--line)",
              background: state.density === d ? "var(--brand-wash)" : "var(--surface)",
              color: state.density === d ? "var(--brand)" : "var(--ink-2)",
              cursor: "pointer",
              fontFamily: "var(--font-kr)",
            }}>{d === "compact" ? "촘촘" : d === "medium" ? "중간" : "여유"}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

window.TweaksPanel = TweaksPanel;
