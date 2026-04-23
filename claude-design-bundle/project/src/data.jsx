// Dummy data for 한국 가죽용품 도매 B2B SaaS
// Currency: KRW. Products lean Angelus-family leather care.

const TENANTS = [
  { id: "t1", name: "앤젤러스 코리아", sub: "Angelus Korea · 가죽용품 수입" },
  { id: "t2", name: "모치크래프트", sub: "가죽 공방 원자재" },
];

const KPI = [
  {
    id: "revenue",
    label: "이번달 매출",
    value: 128_430_000,
    fmt: (v) => `${fmtWon(v)}원`,
    display: "₩128.4M",
    deltaPct: +12.4,
    sub: "전월 대비",
    spark: sparkSeries(30, 3_200_000, 6_400_000, 0.18),
    hint: "4월 1일 — 4월 19일 기준",
  },
  {
    id: "ar",
    label: "미수금 합계",
    value: 42_870_000,
    fmt: (v) => `${fmtWon(v)}원`,
    display: "₩42.8M",
    deltaPct: -3.1,
    sub: "전월 대비",
    badge: { text: "30일 경과 6건", tone: "danger" },
    spark: sparkSeries(30, 36_000_000, 46_000_000, 0.1),
    invertDelta: true,
  },
  {
    id: "inv",
    label: "재고자산 평가액",
    value: 284_120_000,
    fmt: (v) => `${fmtWon(v)}원`,
    display: "₩284.1M",
    deltaPct: +4.8,
    sub: "전월 대비",
    hint: "가중평균단가 × 1.1",
    spark: sparkSeries(30, 250_000_000, 290_000_000, 0.06),
  },
  {
    id: "margin",
    label: "이익률",
    value: 38.2,
    fmt: (v) => `${v.toFixed(1)}%`,
    display: "38.2%",
    deltaPct: +1.8,
    deltaUnit: "pp",
    sub: "전월 대비",
    spark: sparkSeries(30, 33, 40, 0.08),
  },
];

// "오늘 처리할 것"
const TODAY_TASKS = {
  unreceivedPOs: {
    count: 4,
    oldestDays: 11,
    items: [
      { po: "PO-2604-018", vendor: "Angelus USA", amount: 8_420_000, days: 11, items: 14, eta: "2026.04.22" },
      { po: "PO-2604-021", vendor: "Fiebing's", amount: 3_150_000, days: 7, items: 6, eta: "2026.04.24" },
      { po: "PO-2604-024", vendor: "Tandy Leather", amount: 6_780_000, days: 4, items: 9, eta: "2026.04.28" },
      { po: "PO-2604-027", vendor: "Weaver Leather", amount: 1_920_000, days: 2, items: 3, eta: "2026.04.30" },
    ],
  },
  receivables: {
    count: 6,
    items: [
      { name: "한길가죽공방", grade: "B", amount: 14_230_000, days: 58, last: "2026.02.20" },
      { name: "서울레더스튜디오", grade: "A", amount: 9_840_000, days: 41, last: "2026.03.09" },
      { name: "부산크래프트마트", grade: "C", amount: 6_210_000, days: 36, last: "2026.03.14" },
      { name: "대구가죽공예협동조합", grade: "B", amount: 4_120_000, days: 33, last: "2026.03.17" },
    ],
  },
  lowStock: {
    count: 5,
    items: [
      { code: "AGL-ACR-BLK-4oz", name: "Angelus Acrylic Leather Paint — Black 4oz", onhand: 8, suggest: 48, unit: "ea", avgWeekly: 12 },
      { code: "AGL-FIN-MAT-4oz", name: "Angelus Acrylic Finisher — Matte 4oz", onhand: 3, suggest: 36, unit: "ea", avgWeekly: 9 },
      { code: "AGL-DYE-BRN-3oz", name: "Angelus Leather Dye — Brown 3oz", onhand: 14, suggest: 60, unit: "ea", avgWeekly: 15 },
      { code: "FIE-SAD-NAT-8oz", name: "Fiebing's Saddle Soap — Natural 8oz", onhand: 2, suggest: 24, unit: "ea", avgWeekly: 6 },
      { code: "AGL-ACR-WHT-4oz", name: "Angelus Acrylic Leather Paint — White 4oz", onhand: 11, suggest: 40, unit: "ea", avgWeekly: 10 },
    ],
  },
  unmatchedDeposits: {
    count: 3,
    items: [
      { depositor: "김지훈", amount: 2_140_000, date: "2026.04.18", memo: "4월 결제분", bank: "국민은행" },
      { depositor: "(주)레더하우스", amount: 3_680_000, date: "2026.04.17", memo: "—", bank: "신한은행" },
      { depositor: "PARK MINJI", amount: 780_000, date: "2026.04.17", memo: "운송비 포함", bank: "우리은행" },
    ],
  },
};

// 30일 매출 추이 — 이번기간 + 전년동기
const CHART_DATA = (() => {
  const days = 30;
  const today = new Date("2026-04-19");
  const arr = [];
  let cur = 3_800_000;
  let prev = 3_100_000;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // inject weekly rhythm — weekends lower
    const dow = d.getDay();
    const weekend = (dow === 0 || dow === 6) ? 0.55 : 1.0;
    cur  = cur  * (0.92 + Math.random()*0.18) * weekend + 500_000;
    prev = prev * (0.93 + Math.random()*0.16) * weekend + 400_000;
    arr.push({
      date: d,
      label: `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`,
      cur:  Math.round(cur),
      prev: Math.round(prev),
    });
  }
  return arr;
})();

// 최근 거래 타임라인
const NOW = new Date("2026-04-19T14:32:00+09:00");
const TIMELINE = [
  { type: "order",       ago:  8 * 60 * 1000,        title: "신규 주문",         desc: "서울레더스튜디오 — 12개 품목, ₩4,320,000",            ref: "ORD-26041902" },
  { type: "deposit",     ago: 42 * 60 * 1000,        title: "입금 매칭",          desc: "한길가죽공방 ₩2,140,000 자동 매칭 완료",               ref: "DEP-26041904" },
  { type: "po_confirm",  ago:  2 * 3600 * 1000,      title: "발주 확정",          desc: "Angelus USA · PO-2604-027 · $1,418.00 (₩1,920,000)",  ref: "PO-2604-027" },
  { type: "invoice",     ago:  3 * 3600 * 1000,      title: "세금계산서 발행",     desc: "부산크래프트마트 — ₩6,210,000 발행 완료",              ref: "TAX-26041901" },
  { type: "stock_move",  ago:  5 * 3600 * 1000,      title: "재고 이동",          desc: "본사창고 → 부산지점 · 24건 · AGL-ACR 시리즈",           ref: "MV-26041902" },
  { type: "order",       ago:  7 * 3600 * 1000,      title: "신규 주문",          desc: "대구가죽공예협동조합 — 8개 품목, ₩2,180,000",          ref: "ORD-26041901" },
  { type: "deposit",     ago: 22 * 3600 * 1000,      title: "입금 미매칭",        desc: "PARK MINJI ₩780,000 — 거래처 자동 매칭 실패",          ref: "DEP-26041803", warn: true },
  { type: "po_confirm",  ago: 26 * 3600 * 1000,      title: "발주 확정",          desc: "Fiebing's · PO-2604-021 · $2,324.00 (₩3,150,000)",    ref: "PO-2604-021" },
  { type: "invoice",     ago: 30 * 3600 * 1000,      title: "세금계산서 발행",     desc: "한길가죽공방 — ₩14,230,000 발행 완료",                 ref: "TAX-26041801" },
  { type: "stock_move",  ago: 48 * 3600 * 1000,      title: "입고 완료",          desc: "Tandy Leather · PO-2604-014 · 32건 입고",              ref: "PO-2604-014" },
];

// ========== Helpers ==========
function fmtWon(n) {
  const v = Math.abs(n);
  if (v >= 100_000_000) return (n/100_000_000).toFixed(1).replace(/\.0$/,"") + "억";
  if (v >= 10_000) return (n/10_000).toFixed(0) + "만";
  return n.toLocaleString("ko-KR");
}
function fmtWonFull(n) {
  return n.toLocaleString("ko-KR") + "원";
}
function fmtPct(n, pp) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}${pp ? "pp" : "%"}`;
}
function sparkSeries(n, min, max, volatility) {
  const out = [];
  let v = (min + max) / 2;
  for (let i = 0; i < n; i++) {
    v += (Math.random() - 0.48) * (max - min) * volatility;
    v = Math.max(min*0.9, Math.min(max*1.1, v));
    out.push(v);
  }
  // gentle upward tilt
  return out.map((y, i) => y + (i/n) * (max-min) * 0.12);
}
function relTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24);
  return `${d}일 전`;
}

Object.assign(window, {
  TENANTS, KPI, TODAY_TASKS, CHART_DATA, TIMELINE, NOW,
  fmtWon, fmtWonFull, fmtPct, relTime,
});
