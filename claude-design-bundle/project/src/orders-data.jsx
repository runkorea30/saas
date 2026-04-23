// Orders data — ~35 orders with line items spanning 6 weeks.
// Customer IDs match the lightweight customers list below.

const ORDER_CUSTOMERS = [
  { id: "c01", name: "서울레더스튜디오",      grade: "A" },
  { id: "c02", name: "한길가죽공방",          grade: "B" },
  { id: "c03", name: "부산크래프트마트",      grade: "C" },
  { id: "c04", name: "대구가죽공예협동조합",  grade: "B" },
  { id: "c05", name: "인천레더웍스",          grade: "A" },
  { id: "c06", name: "광주핸드메이드스튜디오",grade: "C" },
  { id: "c07", name: "수원가죽마을",          grade: "D" },
  { id: "c08", name: "제주가죽공방",          grade: "B" },
  { id: "c09", name: "(주)레더하우스",        grade: "A" },
  { id: "c10", name: "모치크래프트 직영점",    grade: "A" },
  { id: "c11", name: "청주가죽클래스",        grade: "C" },
  { id: "c12", name: "울산핸드크래프트",      grade: "D" },
  { id: "c13", name: "전주가죽공예원",        grade: "B" },
  { id: "c14", name: "춘천가죽공방",          grade: "E" },
];

const ORDER_PRODUCTS = [
  { id: "p01", code: "AGL-ACR-BLK-4oz", name: "Angelus Acrylic Paint — Black 4oz",   price:  9_800 },
  { id: "p02", code: "AGL-ACR-WHT-4oz", name: "Angelus Acrylic Paint — White 4oz",   price:  9_800 },
  { id: "p03", code: "AGL-ACR-RED-4oz", name: "Angelus Acrylic Paint — Red 4oz",     price: 10_200 },
  { id: "p04", code: "AGL-ACR-GLD-4oz", name: "Angelus Acrylic Paint — Gold 4oz",    price: 12_400 },
  { id: "p05", code: "AGL-DYE-BRN-3oz", name: "Angelus Leather Dye — Brown 3oz",     price:  8_600 },
  { id: "p06", code: "AGL-DYE-BLK-3oz", name: "Angelus Leather Dye — Black 3oz",     price:  8_600 },
  { id: "p07", code: "AGL-FIN-MAT-4oz", name: "Angelus Acrylic Finisher — Matte",    price:  9_200 },
  { id: "p08", code: "AGL-FIN-GLS-4oz", name: "Angelus Acrylic Finisher — Gloss",    price:  9_200 },
  { id: "p09", code: "FIE-SAD-NAT-8oz", name: "Fiebing's Saddle Soap — Natural",     price: 12_000 },
  { id: "p10", code: "FIE-EDG-BLK-4oz", name: "Fiebing's Edge Kote — Black",         price: 14_800 },
  { id: "p11", code: "TND-BVL-001",     name: "Tandy Edge Beveler #1",               price: 24_500 },
  { id: "p12", code: "TND-MLT-PLY",     name: "Tandy Poly Mallet 16oz",              price: 38_000 },
  { id: "p13", code: "WVR-TRD-WX-BRN",  name: "Weaver Waxed Thread — Brown",         price:  6_800 },
  { id: "p14", code: "WVR-NDL-HEV",     name: "Weaver Harness Needle — Heavy",       price:  4_200 },
  { id: "p15", code: "AGL-PRP-BLK-4oz", name: "Angelus Preparer & Deglazer",         price: 11_400 },
];

const USERS = [
  { id: "u1", name: "정민호", init: "JM", seed: 0 },
  { id: "u2", name: "박서연", init: "SY", seed: 1 },
  { id: "u3", name: "이수진", init: "SJ", seed: 2 },
  { id: "u4", name: "김재현", init: "JH", seed: 3 },
];

// Deterministic pseudo-random for repeatable orders
function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function genOrders() {
  const rnd = mulberry32(42);
  const today = new Date("2026-04-19T14:32:00+09:00");
  const orders = [];
  let seq = 35;
  for (let i = 0; i < 35; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - Math.floor(i * 1.2 + rnd() * 1.5));
    d.setHours(9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60));
    const cust = ORDER_CUSTOMERS[Math.floor(rnd() * ORDER_CUSTOMERS.length)];
    const nItems = 1 + Math.floor(rnd() * 6);
    const items = [];
    const usedProducts = new Set();
    let gross = 0;
    let returnAmt = 0;
    for (let k = 0; k < nItems; k++) {
      let p;
      do { p = ORDER_PRODUCTS[Math.floor(rnd() * ORDER_PRODUCTS.length)]; } while (usedProducts.has(p.id));
      usedProducts.add(p.id);
      const isReturn = rnd() > 0.92 && k > 0;
      const qty = isReturn ? -(1 + Math.floor(rnd() * 3)) : (1 + Math.floor(rnd() * 18));
      const amount = qty * p.price;
      items.push({ productId: p.id, code: p.code, name: p.name, qty, price: p.price, amount, isReturn });
      gross += amount;
      if (isReturn) returnAmt += amount; // negative
    }
    // bucket recent orders into statuses that match calendar logic
    const daysAgo = Math.round((today - d) / 86400000);
    let status;
    if (daysAgo === 0 && rnd() > 0.5) status = "draft";
    else if (daysAgo <= 1) status = rnd() > 0.4 ? "confirmed" : "draft";
    else if (daysAgo <= 3) status = rnd() > 0.3 ? "shipped" : "confirmed";
    else status = "done";
    if (rnd() > 0.96) status = "cancel";

    const src = rnd() > 0.7 ? "portal" : (rnd() > 0.85 ? "ai" : "manual");
    const user = USERS[Math.floor(rnd() * USERS.length)];
    orders.push({
      id: "ORD-26" + String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0") + String(seq--).padStart(2,"0"),
      date: d,
      customer: cust,
      items,
      totalQty: items.reduce((s, it) => s + Math.abs(it.qty), 0),
      totalNetQty: items.reduce((s, it) => s + it.qty, 0),
      gross,
      net: gross, // gross already accounts for returns (neg qty)
      hasReturn: items.some(it => it.isReturn),
      returnAmt,
      status,
      source: src,
      user,
      memo: rnd() > 0.75 ? ["퀵 배송", "세금계산서 별도 발행", "착불", "창고 직접 픽업", "선결제"][Math.floor(rnd()*5)] : null,
    });
  }
  return orders.sort((a,b) => b.date - a.date);
}

const ORDERS = genOrders();

// Period helpers
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function fmtDateTime(d) {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDate(d) {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
}

function periodRange(key, today = new Date("2026-04-19T14:32:00+09:00")) {
  const end = endOfDay(today);
  const start = new Date(today);
  if (key === "today") return [startOfDay(today), end];
  if (key === "week") {
    const dow = today.getDay();
    const monOffset = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today); mon.setDate(mon.getDate() - monOffset);
    return [startOfDay(mon), end];
  }
  if (key === "month") return [startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), end];
  if (key === "lastmonth") {
    const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthEnd = new Date(firstThis); lastMonthEnd.setDate(0);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    return [startOfDay(lastMonthStart), endOfDay(lastMonthEnd)];
  }
  if (key === "90d") { start.setDate(start.getDate() - 90); return [startOfDay(start), end]; }
  return [startOfDay(new Date(2025,0,1)), end];
}

function productById(id) { return ORDER_PRODUCTS.find(p => p.id === id); }

Object.assign(window, {
  ORDERS, ORDER_CUSTOMERS, ORDER_PRODUCTS, USERS,
  fmtDateTime, fmtDate, periodRange, productById,
});
