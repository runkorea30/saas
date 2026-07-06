/**
 * Angelus 문서 PDF → 구조화 JSON.
 *
 * 🔴 (2026-07-06 §47-g) pdfjs-dist 실제 추출 원문을 근거로 두 문서 유형 모두 대응:
 *   ① **Invoice** (예: Inv_81252) — INVOICE / `INVOICE # N` / `DATE M/D/YYYY` (한 줄)
 *      컬럼 헤더: `ITEM CODE\tDESCRIPTION\tQTY SHPD\tPRICE\tAMOUNT\tU/M\tQTY BO`
 *      아이템 tail: `qty price amount UNIT [BO]`
 *   ② **Sales Order/Acknowledgement** (예: SalesOrd_67864) — ACKNOWLEDGEMENT /
 *      `DOC NO.\nN` (두 줄) / `DATE\nM/D/YYYY` (두 줄)
 *      컬럼 헤더: `Item\tDescription\tOrdered\tU/M\tRate\tAmount`
 *      아이템 tail: **`qty UNIT price amount`** (UNIT 위치가 다름)
 *
 * 반환 스키마는 이전 Claude 프롬프트가 뽑아주던 JSON 과 동일:
 *   { invoice_no, invoice_date(YYYY-MM-DD), rows: [{item_code, description, unit, qty_shipped, price, amount}] }
 *
 * 감지 규칙:
 *   · 헤더: `RE_DATE_INLINE` / `RE_INVOICE_NO_INLINE` 우선, 없으면 라벨-only 매치 후
 *     다음 non-empty 라인에서 값 추출 (DOC NO. / DATE 두-줄 케이스).
 *   · 각 페이지 컬럼 헤더는 `ITEM CODE DESCRIPTION` 또는 `Item Description` 둘 다 인정.
 *   · **핵심 신호** (라인 tail):
 *      `{qty} [UNIT] {price(N.NN)} {amount(N.NN)} [UNIT] [BO]`
 *      UNIT 은 qty 뒤(Ack) 또는 amount 뒤(Invoice) 어느 쪽에 나와도 매치.
 *      price/amount 는 반드시 소수점 2자리 → 설명 라인의 우연한 숫자에 매치되지 않음.
 *   · 코드/설명 분리(finalize):
 *     ① `Misc sale ` 로 시작 → code=`Misc sale`
 *     ② ` - `(space-hyphen-space) 있으면 그 앞이 code
 *     ③ 그 외에는 첫 공백 토큰이 code (예: `720-01-162`)
 *   · Page 마커: `Page N` 뒤에 트레일링 텍스트 허용 (`^Page\s+\d+`).
 *   · 마지막 페이지 하단의 `$2,893.34 / $0.00` 총합 라인은 컬럼헤더~Page 밖이므로 자연 제외.
 *
 * 유닛(DZ/EA/PT/…)은 최대한 캡처하지만 클라이언트 `normalizeInvoice` 가 DZ/EA 만 인정하고
 * 그 외는 DZ 로 재정규화하므로 여기서는 원값 유지.
 */

export interface InvoiceParsedRow {
  item_code: string; // 하이픈 유지 (클라이언트 normalizeInvoice 에서 제거)
  description: string;
  unit: 'DZ' | 'EA';
  qty_shipped: number;
  price: number;
  amount: number;
}

export interface InvoiceParsed {
  invoice_no: string;
  invoice_date: string; // YYYY-MM-DD
  rows: InvoiceParsedRow[];
}

// ─── 정규식 ──────────────────────────────────────────────────────

/** Invoice: `DATE\t \t5/12/2026` (한 줄). */
const RE_DATE_INLINE = /^DATE\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
/** Ack: `DATE` 라벨만 있는 줄 → 다음 non-empty 라인이 값. */
const RE_DATE_LABEL = /^DATE\s*$/;
/** 라벨 다음 줄의 순수 날짜 값. */
const RE_DATE_VALUE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;

/** Invoice: `INVOICE #\t \t81252` (한 줄). */
const RE_INVOICE_NO_INLINE = /^INVOICE\s*#\s*(\S+)\s*$/i;
/** Invoice or Ack 라벨만: `INVOICE #` / `DOC NO.` — 다음 non-empty 라인이 값. */
const RE_DOC_LABEL = /^(?:INVOICE\s*#|DOC\s*NO\.?)\s*$/i;
/** 라벨 다음 줄의 순수 문서번호 값. */
const RE_DOC_VALUE = /^(\S+)\s*$/;

/**
 * 컬럼 헤더 — Invoice 는 `ITEM CODE DESCRIPTION`, Ack 는 `Item Description`.
 * 대소문자 무시 + `CODE` 는 선택.
 */
const RE_HEADER_ITEMS = /^item(?:\s+code)?\s+description/i;

/** Page 마커. 트레일링 텍스트(예: `Page 1\tINVOICE\t...`) 허용. */
const RE_PAGE_END = /^Page\s+\d+\b/;

/**
 * 라인 오른쪽 끝의 숫자 패턴 — 두 컬럼 순서 모두 대응:
 *   Invoice: `qty price amount UNIT [BO]`
 *   Ack:     `qty UNIT price amount`
 *
 *   ...(prefix)... {qty} [UNIT_pre]? {price(N.NN)} {amount(N.NN)} [UNIT_post]? [BO]?
 *
 * 캡처: 1=qty 2=unit_pre? 3=price 4=amount 5=unit_post? 6=bo?
 * → 실제 unit = m[2] ?? m[5]
 */
const RE_NUMS_TAIL =
  /(\d+)\s+(?:([A-Z]{2,3})\s+)?(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s*(?:[\t ]+([A-Z]{2,3}))?\s*(?:[\t ]+(\d+))?\s*$/;

// ─── 파서 ────────────────────────────────────────────────────────

/** `raw` 를 trim + 내부 연속 whitespace 정규화. 라벨 매칭용 (탭/공백 혼재 대비). */
function normalizeLabel(raw: string): string {
  return raw.trim().replace(/[\t ]+/g, ' ');
}

/** i 이후 첫 non-empty 라인(trimmed) 반환. 없으면 ''. */
function findNextNonEmpty(lines: readonly string[], from: number): string {
  for (let j = from + 1; j < lines.length; j += 1) {
    const s = lines[j].trim();
    if (s) return s;
  }
  return '';
}

function extractHeader(lines: readonly string[]): {
  invoice_no: string;
  invoice_date: string;
} {
  let invoice_no = '';
  let invoice_date = '';
  const fmtDate = (mm: string, dd: string, yyyy: string): string =>
    `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;

  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLabel(lines[i]);

    // DATE — 한 줄 형식 우선, 없으면 라벨-only 매치 후 다음 라인이 값.
    if (!invoice_date) {
      const m1 = RE_DATE_INLINE.exec(line);
      if (m1) {
        invoice_date = fmtDate(m1[1], m1[2], m1[3]);
      } else if (RE_DATE_LABEL.test(line)) {
        const next = findNextNonEmpty(lines, i);
        const m2 = RE_DATE_VALUE.exec(next);
        if (m2) invoice_date = fmtDate(m2[1], m2[2], m2[3]);
      }
    }

    // INVOICE # / DOC NO. — 한 줄 형식 우선, 없으면 라벨-only 매치 후 다음 라인이 값.
    if (!invoice_no) {
      const m1 = RE_INVOICE_NO_INLINE.exec(line);
      if (m1) {
        invoice_no = m1[1];
      } else if (RE_DOC_LABEL.test(line)) {
        const next = findNextNonEmpty(lines, i);
        const m2 = RE_DOC_VALUE.exec(next);
        if (m2) invoice_no = m2[1];
      }
    }

    if (invoice_no && invoice_date) break;
  }
  return { invoice_no, invoice_date };
}

function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 코드-shape 판정 정규식 — Angelus 상품코드 형태.
 *   `720-01-001`, `992E-00-PS...`, `992-00-KNI...`, `AGLET-BUL-GLD` 등.
 *   `[영문/숫자 2-5자] (-[영문/숫자 1자 이상])+ (...)? `
 */
const RE_PRODUCT_CODE_SHAPED = /^[A-Z0-9]{2,5}(?:-[A-Z0-9]+)+(?:\.{3,})?$/i;

/** `<prefix>` 를 `code + description` 으로 분할. */
function splitCodeAndDesc(prefix: string): { code: string; description: string } {
  const trimmed = prefix.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { code: '', description: '' };
  // ① Misc sale 특수 케이스
  if (/^Misc\s+sale\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^Misc\s+sale\s*/i, '').trim();
    return { code: 'Misc sale', description: rest };
  }
  // ② 🆕 첫 토큰이 상품코드 형태면 그것이 code, 나머지가 description.
  //    설명 안의 ` - ` (space-hyphen-space) 와의 충돌 방지 —
  //    예: `902-01-000 4-Coat - Matte 1 Oz.` → code 를 `902-01-000` 로 정확히 분리.
  //    설명이 `- ` 로 시작하면 leading separator 제거.
  const firstSpaceIdx = trimmed.indexOf(' ');
  if (firstSpaceIdx > 0) {
    const firstToken = trimmed.slice(0, firstSpaceIdx);
    if (RE_PRODUCT_CODE_SHAPED.test(firstToken)) {
      const rest = trimmed.slice(firstSpaceIdx + 1).trim();
      const cleaned = rest.startsWith('- ') ? rest.slice(2).trim() : rest;
      return { code: firstToken, description: cleaned };
    }
  }
  // ③ ` - `(space-hyphen-space) — 코드에 하이픈이 없는 케이스 (`AGLET-BUL-GLD - Gold`,
  //    `Boot BLA63 - ...`, `XI Rope BLA45 - ...`) 대응.
  const sepIdx = trimmed.indexOf(' - ');
  if (sepIdx > 0) {
    return {
      code: trimmed.slice(0, sepIdx).trim(),
      description: trimmed.slice(sepIdx + 3).trim(),
    };
  }
  // ④ 그 외 — 첫 공백 토큰이 code (또는 공백 없으면 통째로).
  if (firstSpaceIdx < 0) return { code: trimmed, description: '' };
  return {
    code: trimmed.slice(0, firstSpaceIdx),
    description: trimmed.slice(firstSpaceIdx + 1).trim(),
  };
}

/**
 * 라인 오른쪽 끝의 숫자 패턴을 찾음. 매치되면 { prefix, ... } 반환.
 * pdfjs-dist 는 열 사이 구분자로 `\t \t` (tab-space-tab) 을 넣으므로 그대로 인식.
 *
 * unit 은 Invoice(amount 뒤) / Ack(qty 뒤) 어느 쪽에 있어도 하나로 수렴.
 */
function matchNumsTail(line: string): {
  prefix: string;
  qty: string;
  price: string;
  amount: string;
  unit: string | undefined;
} | null {
  // 연속 탭만 단일 탭으로 정규화. `\t \t` 는 whitespace class 로 이미 커버.
  const normalized = line.replace(/[\t]+/g, '\t');
  const m = RE_NUMS_TAIL.exec(normalized);
  if (!m) return null;
  const matchStart = m.index;
  const prefix = normalized.slice(0, matchStart).replace(/\t+$/, '').trimEnd();
  return {
    prefix,
    qty: m[1],
    // Invoice: unit_pre 없음, unit_post(=m[5]) 존재 → unit=m[5]
    // Ack:     unit_pre(=m[2]) 존재, unit_post 없음     → unit=m[2]
    unit: m[2] ?? m[5],
    price: m[3],
    amount: m[4],
  };
}

/** PDF 원문 텍스트 → InvoiceParsed. */
export function parseAngelusInvoiceText(text: string): InvoiceParsed {
  const lines = text.split(/\r?\n/);
  const { invoice_no, invoice_date } = extractHeader(lines);

  const rows: InvoiceParsedRow[] = [];
  let inItemSection = false;
  let descBuffer: string[] = [];

  const finalize = (
    prefix: string,
    qty: string,
    price: string,
    amount: string,
    unit: string | undefined,
  ): void => {
    // 이전 라인들 + 이번 prefix = 코드 + 설명
    const combined = [...descBuffer, prefix].filter(Boolean).join(' ');
    const { code, description } = splitCodeAndDesc(combined);
    if (!code) {
      // 코드 없이 숫자만 나오는 이상 케이스 — 스킵.
      descBuffer = [];
      return;
    }
    rows.push({
      item_code: code,
      description,
      unit: unit === 'EA' ? 'EA' : 'DZ',
      qty_shipped: Math.round(toNum(qty)),
      price: toNum(price),
      amount: toNum(amount),
    });
    descBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, ''); // trailing whitespace 만 제거 (내부 탭 보존)
    const trimmed = line.trim();

    if (RE_PAGE_END.test(trimmed)) {
      inItemSection = false;
      descBuffer = [];
      continue;
    }
    if (RE_HEADER_ITEMS.test(line)) {
      inItemSection = true;
      descBuffer = [];
      continue;
    }
    if (!inItemSection) continue;
    if (!trimmed) continue; // 빈 줄 스킵

    // 라인 끝에 숫자 패턴이 있으면 이 라인은 아이템 완결.
    const tail = matchNumsTail(line);
    if (tail) {
      finalize(tail.prefix, tail.qty, tail.price, tail.amount, tail.unit);
      continue;
    }
    // 숫자 패턴 없음 → 코드 + 설명 라인의 일부(wrap 대응). 버퍼 축적.
    descBuffer.push(trimmed);
  }

  return { invoice_no, invoice_date, rows };
}
