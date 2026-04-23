// 최근 거래 타임라인
function Timeline() {
  const typeConf = {
    order:      { icon: "cart",    color: "var(--brand)",   wash: "var(--brand-wash)",   label: "주문" },
    deposit:    { icon: "bank",    color: "var(--info)",    wash: "var(--info-wash)",    label: "입금" },
    po_confirm: { icon: "truck",   color: "var(--tan)",     wash: "var(--tan-wash)",     label: "발주" },
    invoice:    { icon: "receipt", color: "var(--success)", wash: "var(--success-wash)", label: "세금계산서" },
    stock_move: { icon: "box",     color: "var(--warning)", wash: "var(--warning-wash)", label: "재고" },
  };
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px" }}>
        <div>
          <div className="disp" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>최근 거래 타임라인</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>최근 10개 이벤트 · 시간 역순</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" style={{ fontSize: 12 }}><I.filter size={13}/> 필터</button>
          <button className="btn ghost" style={{ fontSize: 12 }}>전체 보기 <I.arrowRight size={13}/></button>
        </div>
      </div>

      <div style={{ padding: "4px 12px 16px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "2px 16px" }}>
        {TIMELINE.map((ev, i) => {
          const conf = typeConf[ev.type];
          const Icon = I[conf.icon];
          return (
            <a key={i} href="#" className="row-link" style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 12,
              padding: "11px 10px",
              borderRadius: 8,
              alignItems: "center",
              color: "var(--ink)",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: conf.wash, color: conf.color,
                display: "grid", placeItems: "center",
                position: "relative",
                flexShrink: 0,
              }}>
                <Icon size={15} stroke={conf.color}/>
                {ev.warn && (
                  <span style={{
                    position: "absolute", top: -3, right: -3,
                    width: 12, height: 12, borderRadius: 999,
                    background: "var(--danger)", color: "#fff",
                    display: "grid", placeItems: "center",
                    fontSize: 9, fontWeight: 700, fontFamily: "var(--font-num)",
                    border: "2px solid var(--surface)",
                  }}>!</span>
                )}
              </div>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>{ev.title}</span>
                  <span style={{
                    fontFamily: "var(--font-num)",
                    fontSize: 10,
                    color: "var(--ink-3)",
                    background: "var(--bg-sunken)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}>{ev.ref}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--font-num)" }}>{ev.desc}</div>
              </div>
              <div style={{ textAlign: "right", color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-num)", flexShrink: 0, whiteSpace: "nowrap" }}>
                {relTime(ev.ago)}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

window.Timeline = Timeline;
