/**
 * 인보이스 PDF 파싱 — Claude API (Sonnet 4.6) 호출.
 *
 * 🔴 보안: `VITE_ANTHROPIC_API_KEY` 는 클라이언트 번들에 노출됨.
 *    `anthropic-dangerous-direct-browser-access` 헤더로 CORS 우회 허용.
 *    프로덕션 전환 시 Supabase Edge Function 으로 이전 권장 (SESSION_HANDOFF 참고).
 * 🟠 모델: `claude-sonnet-4-6` (최신 Sonnet — 문서 처리 + 구조화 JSON 출력 강점).
 * 🟡 응답 형식: 마크다운 ```json ``` 래퍼 제거 후 JSON.parse.
 *    예외 시 원문을 throw 메시지에 포함 (디버깅 편의).
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

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

const PROMPT = `이 인보이스 PDF에서 품목 데이터를 추출해 JSON 객체 1개만 반환하세요.

형식:
{
  "invoice_no": "81252",
  "invoice_date": "2026-05-12",
  "rows": [
    {"item_code":"72001001","description":"Leather Paint Black 1 oz.","unit":"DZ","qty_shipped":48,"price":21.06,"amount":1010.88}
  ]
}

규칙:
- item_code: 하이픈 모두 제거 (720-01-001 → 72001001)
- unit: QTY SHPD 옆 U/M 컬럼값 (DZ 또는 EA). 알 수 없으면 "DZ".
- qty_shipped: QTY SHPD 컬럼 숫자 (정수)
- QTY BO(백오더) 행은 qty_shipped=0 으로 포함
- price/amount: 숫자 (통화기호/콤마 제거)
- invoice_date: DATE 필드를 YYYY-MM-DD 형식으로

⚠️ 중요: 마크다운 코드블록(\`\`\`), 설명 텍스트, 서문, 후기 일절 없이 { 로 시작해서 } 로 끝나는 순수 JSON 객체만 응답하세요. 모든 품목을 빠짐없이 포함하세요 (페이지가 여러 장이어도 끝까지).`;

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
interface AnthropicResponseShape {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

export async function parseInvoicePDF(file: File): Promise<InvoiceParsed> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      '환경변수 VITE_ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 에 키를 추가해 주세요.',
    );
  }
  const base64 = await fileToBase64(file);

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      // 8페이지/100품목 인보이스 응답을 위한 여유. (Sonnet 4.6 max output 64K 내)
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API 오류 (${res.status}): ${errText.slice(0, 500)}`);
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
