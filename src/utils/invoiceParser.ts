/**
 * 인보이스 PDF 파싱 — Vercel Serverless `/api/analyze-invoice` 호출.
 *
 * 🔴 (2026-07-06) 서버측 구현이 Anthropic Claude 호출 → 로컬 `pdf-parse` + 정규식
 *    파서로 완전 대체됨. 클라이언트 코드는 그대로 (응답 shape 하위호환 유지).
 * 🟠 이전 잔재: 응답 shape `{content:[{type:'text', text:'<InvoiceParsed JSON>'}]}` 은
 *    Claude 응답 계약을 그대로 유지 — 이 파일의 파싱 로직(extractJson, normalizeInvoice)
 *    을 건드리지 않고 서버만 교체하기 위함.
 * 🟡 응답 형식: 서버가 뽑은 InvoiceParsed 를 JSON.stringify 한 문자열이 content[0].text 에 담김.
 */

export interface InvoiceParsedRow {
  /** 하이픈 제거된 코드. */
  item_code: string;
  description: string;
  unit: 'DZ' | 'EA';
  qty_shipped: number;
  price: number;
  amount: number;
}

export interface InvoiceParsed {
  invoice_no: string;
  /** 'YYYY-MM-DD' (Claude 가 정규화한 값). */
  invoice_date: string;
  rows: InvoiceParsedRow[];
}

const ANALYZE_ENDPOINT = '/api/analyze-invoice';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
interface AnthropicResponseShape {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

export async function parseInvoicePDF(file: File): Promise<InvoiceParsed> {
  const base64 = await fileToBase64(file);

  const res = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64: base64 }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // 🔴 (2026-07-06) 두 가지 응답 shape 모두 지원:
    //   1) 서버 프록시(api/analyze-invoice.ts) 자체 오류: `{ error: "문자열" }`
    //   2) Anthropic 원문 프록시: `{ type: "error", error: { type, message } }`
    //      이전엔 (2) 케이스에서 parsed.error 가 객체라 `${msg}` 보간 시
    //      `[object Object]` 로 뭉개져 사용자가 진짜 원인을 못 봤음.
    let msg = errText.slice(0, 500);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = JSON.parse(errText) as any;
      const err = parsed?.error;
      if (typeof err === 'string') {
        msg = err;
      } else if (err && typeof err.message === 'string') {
        msg = err.type ? `${err.type}: ${err.message}` : err.message;
      } else if (err) {
        msg = JSON.stringify(err).slice(0, 500);
      }
    } catch { /* JSON 아니면 원문 그대로 노출 */ }
    throw new Error(`인보이스 분석 오류 (${res.status}): ${msg}`);
  }

  const data = (await res.json()) as AnthropicResponseShape;
  if (data.error) {
    throw new Error(`Claude API 에러: ${data.error.message}`);
  }
  const text =
    (data.content ?? [])
      .filter((c): c is AnthropicTextBlock => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
      .trim() || '';

  if (!text) throw new Error('Claude 응답에서 텍스트를 찾지 못했습니다.');

  const cleaned = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // 잘림 감지: '{' 로 시작했는데 '}' 로 끝나지 않으면 max_tokens 초과 가능성.
    const trimmed = cleaned.trim();
    if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      throw new Error(
        '인보이스가 너무 길어 Claude 응답이 잘렸습니다. PDF 를 페이지 단위로 나눠 업로드해 주세요.',
      );
    }
    console.error('인보이스 JSON 파싱 실패. 응답 앞부분:', cleaned.slice(0, 300));
    throw new Error(
      `JSON 파싱 실패 — 응답 앞부분: ${cleaned.slice(0, 200)}${cleaned.length > 200 ? '…' : ''}`,
    );
  }

  return normalizeInvoice(parsed);
}

// ───────────────────────────────────────────────────────────

/**
 * Claude 응답에서 JSON 본문만 추출.
 *  1) ```json ... ``` 또는 ``` ... ``` 코드펜스 안 내용 우선
 *  2) 펜스 없으면 첫 '{' ~ 마지막 '}' 까지 부분문자열
 *  3) 둘 다 실패하면 원문 trim
 */
function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  return text.trim();
}

function normalizeInvoice(raw: unknown): InvoiceParsed {
  if (!isObject(raw)) throw new Error('Claude 응답이 객체가 아닙니다.');
  const invoiceNo = String(raw.invoice_no ?? '').trim();
  const invoiceDate = String(raw.invoice_date ?? '').trim();
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : [];
  const rows: InvoiceParsedRow[] = [];
  for (const r of rowsRaw) {
    if (!isObject(r)) continue;
    const code = String(r.item_code ?? '').replace(/-/g, '').trim();
    if (!code) continue;
    const unit = String(r.unit ?? 'DZ').toUpperCase() === 'EA' ? 'EA' : 'DZ';
    rows.push({
      item_code: code,
      description: String(r.description ?? '').trim(),
      unit,
      qty_shipped: toIntOrZero(r.qty_shipped),
      price: toNumOrZero(r.price),
      amount: toNumOrZero(r.amount),
    });
  }
  return { invoice_no: invoiceNo, invoice_date: invoiceDate, rows };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('파일 읽기 실패'));
        return;
      }
      // result: "data:application/pdf;base64,XXXX..." — 헤더 제거.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('파일 읽기 오류'));
    reader.readAsDataURL(file);
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toNumOrZero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/[,\s$]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toIntOrZero(v: unknown): number {
  const n = toNumOrZero(v);
  return Math.round(n);
}
