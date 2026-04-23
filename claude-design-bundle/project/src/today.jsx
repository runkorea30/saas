// "오늘 처리할 것" — 2/3 width inbox-style section with 4 sub-cards in a 2x2 grid
function TodaySection() {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", height: "100%" }}>
      <SectionHeader
        title="오늘 처리할 것"
        sub="우선순위 기준으로 자동 정렬됩니다"
        action={<button className="btn ghost" style={{ fontSize: 12 }}><I.refresh size={13}/> 새로고침</button>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid var(--line)" }}>
        <TaskCard
          title="미입고 발주서"
          count={TODAY_TASKS.unreceivedPOs.count}
          meta={`최장 ${TODAY_TASKS.unreceivedPOs.oldestDays}일 경과`}
          tone="warning"
          icon="truck"
          rows={TODAY_TASKS.unreceivedPOs.items.slice(0,3).map(p => ({
            main: p.po,
            sub: p.vendor,
            right: fmtWon(p.amount)+"원",
            rightSub: `${p.days}일 전 · ${p.items}건`,
            status: p.days > 7 ? "warning" : "info",
          }))}
          cta={`발주 ${TODAY_TASKS.unreceivedPOs.count}건 보기`}
          borderR
          borderB
        />
        <TaskCard
          title="미수금 경과"
          count={TODAY_TASKS.receivables.count}
          meta="30일 이상 경과"
          tone="danger"
          icon="coin"
          rows={TODAY_TASKS.receivables.items.slice(0,3).map(c => ({
            main: c.name,
            sub: `등급 ${c.grade} · 최근 거래 ${c.last}`,
            right: fmtWon(c.amount)+"원",
            rightSub: `${c.days}일 경과`,
            status: c.days > 45 ? "danger" : "warning",
          }))}
          cta="미수금 전체 보기"
          borderB
        />
        <TaskCard
          title="재고 부족"
          count={TODAY_TASKS.lowStock.count}
          meta="발주 권장 임계 이하"
          tone="warning"
          icon="box"
          rows={TODAY_TASKS.lowStock.items.slice(0,3).map(s => ({
            main: s.name,
            sub: s.code,
            right: `${s.onhand} ${s.unit}`,
            rightSub: `권장 ${s.suggest} ${s.unit}`,
            status: s.onhand <= 3 ? "danger" : "warning",
            bar: { cur: s.onhand, max: s.suggest },
          }))}
          cta="재고 현황 열기"
          borderR
        />
        <TaskCard
          title="미매칭 입금"
          count={TODAY_TASKS.unmatchedDeposits.count}
          meta="최근 7일 자동매칭 실패"
          tone="info"
          icon="bank"
          rows={TODAY_TASKS.unmatchedDeposits.items.map(d => ({
            main: d.depositor,
            sub: `${d.bank} · ${d.memo}`,
            right: fmtWon(d.amount)+"원",
            rightSub: d.date,
            status: "info",
          }))}
          cta="은행거래 매칭하기"
        />
      </div>
    </div>
  );
}

function SectionHeader({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 14px" }}>
      <div>
        <div className="disp" style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.01em" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function TaskCard({ title, count, meta, tone, icon, rows, cta, borderR, borderB }) {
  const toneMap = {
    warning: { c: "var(--warning)", w: "var(--warning-wash)" },
    danger:  { c: "var(--danger)",  w: "var(--danger-wash)" },
    info:    { c: "var(--info)",    w: "var(--info-wash)" },
    success: { c: "var(--success)", w: "var(--success-wash)" },
  };
  const t = toneMap[tone];
  const Icon = I[icon];
  return (
    <div style={{
      padding: "14px 18px 14px",
      borderRight: borderR ? "1px solid var(--line)" : "none",
      borderBottom: borderB ? "1px solid var(--line)" : "none",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: t.w, color: t.c,
          display: "grid", placeItems: "center",
          flexShrink: 0,
        }}><Icon size={15} stroke={t.c}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{meta}</div>
        </div>
        <div className="num" style={{
          fontSize: 20, fontWeight: 500, color: t.c, lineHeight: 1,
        }}>{count}<span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 2 }}>건</span></div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((r, i) => <TaskRow key={i} row={r}/>)}
      </div>

      {/* CTA */}
      <a href="#" className="row-link" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 10, paddingTop: 10, gap: 8,
        borderTop: "1px dashed var(--line-strong)",
        fontSize: 12, color: "var(--brand)", fontWeight: 500,
      }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cta}</span>
        <span className="hover-arrow" style={{ opacity: 1, flexShrink: 0 }}><I.arrowRight size={13} stroke="var(--brand)"/></span>
      </a>
    </div>
  );
}

function TaskRow({ row }) {
  const toneColor = {
    warning: "var(--warning)",
    danger:  "var(--danger)",
    info:    "var(--info)",
    success: "var(--success)",
  }[row.status] || "var(--ink-3)";
  return (
    <a href="#" className="row-link" style={{
      display: "flex", alignItems: "center",
      gap: 10, padding: "8px 10px",
      borderRadius: 8,
      color: "var(--ink)",
      position: "relative",
      transition: "background .1s",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ width: 2, alignSelf: "stretch", background: toneColor, borderRadius: 2 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.main}</div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--font-num)" }}>{row.sub}</div>
        {row.bar && (
          <div style={{ marginTop: 4, height: 3, background: "var(--bg-sunken)", borderRadius: 2, overflow: "hidden", maxWidth: 140 }}>
            <div style={{ height: "100%", width: `${Math.min(100, row.bar.cur/row.bar.max*100)}%`, background: toneColor }}/>
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="num" style={{ fontSize: 12.5, fontWeight: 500 }}>{row.right}</div>
        <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-num)" }}>{row.rightSub}</div>
      </div>
      <span className="hover-arrow" style={{ flexShrink: 0 }}><I.chevR size={13}/></span>
    </a>
  );
}

window.TodaySection = TodaySection;
