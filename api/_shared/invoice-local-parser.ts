/**
 * Angelus 인보이스 PDF → 구조화 JSON.
 *
 * 🔴 (2026-07-06) 이전 방식(Claude Sonnet 문서 첨부 호출) 을 완전히 대체.
 *    실제 Angelus 인보이스 5건 샘플(72609, 74257, 75873, 76474, 76697) 의 텍스트
 *    레이아웃을 확인해 정규식 파서로 이식. Σamount 가 인보이스 하단 총합과 정확 일치.
 *
 * 반환 스키마는 이전 Claude 프롬프트가 뽑아주던 JSON 과 동일:
 *   { invoice_no, invoice_date(YYYY-MM-DD), rows: [{item_code, description, unit, qty_shipped, price, amount}] }
 *
 * 감지 규칙:
 *   · 헤더 첫 3줄: `INVOICE` / `DATE M/D/YYYY` / `INVOICE # NNNNN`
 *   · 각 페이지는 `ITEM CODE DESCRIPTION\tQTY ... PRICE AMOUNT\t...QTY BO` 컬럼 헤더로 시작,
 *     `Page N` 로 끝남. 그 사이가 품목 영역.
 *   · **핵심 신호**: 라인의 오른쪽 끝에 `{qty} {price(N.NN)} {amount(N.NN,콤마)} [\tUNIT] [\tBO]`
 *     패턴이 있으면 그 라인은 "아이템 완결" 이다.
 *     · price/amount 는 반드시 소수점 2자리 → 설명 라인에 우연히 숫자가 있어도 이 패턴엔 안 맞음.
 *     · 라인의 그 앞 부분(있으면) + 이전 버퍼 = 코드 + 설명.
 *   · 코드/설명 분리(finalize 시점):
 *     ① `Misc sale ` 로 시작하면 code=`Misc sale`, 나머지가 설명.
 *     ② ` - `(space-hyphen-space) 가 있으면 그 앞이 code (예: `AGLET-BUL-GLD`, `Boot BLA63`,
 *        `XI Rope BLA45`), 뒤가 설명.
 *     ③ 그 외에는 첫 공백 토큰이 code (예: `720-01-162 Leather Paint Cream 1 oz.`).
 *   · 페이지 재출력되는 헤더(INVOICE~ITEM CODE) 는 무시.
 *   · 마지막 페이지 하단의 `$4,020.28 / $0.00` 총합 라인은 품목 아님 → 컬럼헤더~Page 사이에서만 파싱하므로 자연 제외.
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

const RE_DATE = /^DATE\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
const RE_INVOICE_NO = /^INVOICE\s*#\s*(\S+)\s*$/;
const RE_HEADER_ITEMS = /^ITEM CODE\s+DESCRIPTION/;
const RE_PAGE_END = /^Page\s+\d+\s*$/;

/**
 * 라인 오른쪽 끝의 숫자 패턴. `m` 은 매치 그룹 1=qty 2=price 3=amount 4=unit? 5=bo?
 * 이 정규식이 매치되는 라인은 "아이템 완결" 이다.
 *
 *   ...(prefix, 코드+설명 부분)... {qty} {price(N.NN)} {amount(N.NN|N,NNN.NN)}[\t UNIT]?[\t BO]?
 *
 * `end-anchor` 로 라인 끝을 강하게 잡음. price 는 정수 대신 반드시 `.NN` 소수 2자리 요구
 * → 설명 라인 중간의 `5 1 Oz.` 같은 우연한 숫자에 매치되지 않음.
 *
 * 캡처: 1=qty 2=price 3=amount 4=unit(optional 2-3자리 대문자) 5=bo(optional 정수)
 */
const RE_NUMS_TAIL =
  /(\d+)\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})\s*(?:[\t ]+([A-Z]{2,3}))?\s*(?:[\t ]+(\d+))?\s*$/;

// ─── 파서 ────────────────────────────────────────────────────────

function extractHeader(lines: readonly string[]): {
  invoice_no: string;
  invoice_date: string;
} {
  let invoice_no = '';
  let invoice_date = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!invoice_date) {
      const m = RE_DATE.exec(line);
      if (m) {
        const [, mm, dd, yyyy] = m;
        invoice_date = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      }
    }
    if (!invoice_no) {
      const m = RE_INVOICE_NO.exec(line);
      if (m) invoice_no = m[1];
    }
    if (invoice_no && invoice_date) break;
  }
  return { invoice_no, invoice_date };
}

function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** `<prefix>` 를 `code + description` 으로 분할. */
function splitCodeAndDesc(prefix: string): { code: string; description: string } {
  const trimmed = prefix.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { code: '', description: '' };
  // ① Misc sale 특수 케이스
  if (/^Misc\s+sale\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^Misc\s+sale\s*/i, '').trim();
    return { code: 'Misc sale', description: rest };
  }
  // ② ` - `(space-hyphen-space) 우선 — Angelus 가 코드와 설명을 명확히 구분한 형태
  const sepIdx = trimmed.indexOf(' - ');
  if (sepIdx > 0) {
    return {
      code: trimmed.slice(0, sepIdx).trim(),
      description: trimmed.slice(sepIdx + 3).trim(),
    };
  }
  // ③ 첫 공백 토큰이 code (예: `720-01-162 Leather Paint Cream 1 oz.`)
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace < 0) return { code: trimmed, description: '' };
  return {
    code: trimmed.slice(0, firstSpace),
    description: trimmed.slice(firstSpace + 1).trim(),
  };
}

/**
 * 라인 오른쪽 끝의 숫자 패턴을 찾음. 매치되면 { prefix, numsGroups } 반환.
 * pdf-parse 는 탭을 그대로 보존하므로 tabs 도 인식.
 */
function matchNumsTail(line: string): {
  prefix: string;
  qty: string;
  price: string;
  amount: string;
  unit: string | undefined;
} | null {
  // 라인 오른쪽에서 numbers-tail 패턴 검색. 다중 매치 가능성 방지 위해 마지막 매치를 씀.
  //   예: `10 162.63 1,626.30\tDZ 0` — 여기서 마지막 매치가 진짜.
  // 정규식은 line-end anchor 를 가지고 있어 어차피 라인 끝에서 시작.
  const normalized = line.replace(/[\t]+/g, '\t'); // 연속 탭 → 단일 탭 (안전 정규화)
  const m = RE_NUMS_TAIL.exec(normalized);
  if (!m) return null;
  const matchStart = m.index;
  const prefix = normalized.slice(0, matchStart).replace(/\t+$/, '').trimEnd();
  return {
    prefix,
    qty: m[1],
    price: m[2],
    amount: m[3],
    unit: m[4],
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
