/**
 * Vercel Serverless Function — 인보이스 PDF → Claude Sonnet 4.6 파싱 프록시.
 *
 * 🔴 보안: `ANTHROPIC_API_KEY` 는 서버 전용 환경변수. `VITE_` 접두사 없으므로 브라우저 번들에 노출되지 않는다.
 *    이전 버전은 클라이언트에서 `VITE_ANTHROPIC_API_KEY` 로 직접 Anthropic API 를 호출해
 *    키가 공개 자산에 그대로 실려나가는 상태였다.
 *
 * 🟠 프롬프트/모델 상수는 클라이언트가 아니라 여기(서버) 에 둔다.
 *    악의적 사용자가 프롬프트를 조작해 다른 용도로 API 를 남용하지 못하게 하기 위함.
 *
 * 🟠 응답은 Anthropic 원문을 그대로 프록시(상태코드 + body 그대로).
 *    JSON 추출·정규화(normalizeInvoice) 는 여전히 클라이언트의 invoiceParser.ts 에서 처리.
 *
 * 로컬 개발: `npx vercel dev` 로 실행해야 /api/analyze-invoice 라우팅 동작.
 * (`npm run dev` 는 Vite 만 띄우므로 이 엔드포인트 404 발생 — 정상)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    // 8페이지 인보이스 PDF base64 는 수 MB. billing-email 과 동일한 상한 사용.
    bodyParser: { sizeLimit: '10mb' },
  },
};

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

interface RequestBody {
  /** PDF 파일의 순수 base64 (data URI prefix 제외). */
  pdfBase64: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { pdfBase64 } = (req.body ?? {}) as RequestBody;
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    res.status(400).json({ error: 'pdfBase64(문자열) 은 필수입니다.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        '서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. Vercel Environment Variables 또는 로컬 .env.local 에 추가해 주세요.',
    });
    return;
  }

  try {
    const upstream = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
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
                  data: pdfBase64,
                },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });

    const text = await upstream.text();
    // 🟠 (2026-07-06) 400/500 등 실패 응답은 Vercel 로그에 원문을 남겨 진짜 원인 추적 가능하도록.
    //    성공 응답은 크기 크므로 로깅 안 함.
    if (!upstream.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[analyze-invoice] Anthropic ${upstream.status}:`,
        text.slice(0, 800),
      );
    }
    res
      .status(upstream.status)
      .setHeader('Content-Type', 'application/json')
      .send(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[analyze-invoice] Anthropic 호출 실패:', e);
    res.status(502).json({ error: `Anthropic 프록시 실패: ${message}` });
  }
}
