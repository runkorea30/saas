/**
 * Vercel Serverless Function — 인보이스 PDF → 로컬 정규식 파서.
 *
 * 🔴 (2026-07-06) 이전 방식(Anthropic Claude 문서 첨부 호출) 을 완전히 제거하고,
 *    `pdf-parse` 로 텍스트 추출 후 `_shared/invoice-local-parser.ts` 정규식 파서에서
 *    구조화 JSON 을 만듦. Anthropic API/키/네트워크 의존성 없음, 크레딧 비용 0.
 *
 * 🟠 응답 스키마는 이전 Claude 프록시 응답과 동일하게 유지 — 클라이언트
 *    `src/utils/invoiceParser.ts` 가 변경 없이 그대로 동작:
 *      { content: [{ type: 'text', text: '<InvoiceParsed 를 JSON.stringify 한 문자열>' }] }
 *
 * 🟡 에러: 400 body 는 `{ error: '문자열' }` 로 통일 (44번 fix 에서 클라이언트가 이 shape 처리).
 *
 * 로컬 개발: `npx vercel dev` 로 실행 (`npm run dev` 는 Vite 만 띄우므로 이 엔드포인트 404).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PDFParse } from 'pdf-parse';
import { parseAngelusInvoiceText } from './_shared/invoice-local-parser.js';

export const config = {
  api: {
    // 인보이스 PDF base64 는 수 MB. 이전과 동일 상한 유지.
    bodyParser: { sizeLimit: '10mb' },
  },
};

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

  try {
    // 1) base64 → Buffer
    const buf = Buffer.from(pdfBase64, 'base64');
    // 2) pdf-parse 로 텍스트 추출 (v2 API: PDFParse 클래스)
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    const rawText = parsed?.text ?? '';
    if (!rawText.trim()) {
      res.status(400).json({
        error:
          'PDF 에서 텍스트를 추출하지 못했습니다. 이미지/스캔본 인보이스일 수 있습니다.',
      });
      return;
    }
    // 3) 정규식 파서로 구조화
    const invoice = parseAngelusInvoiceText(rawText);
    if (invoice.rows.length === 0) {
      res.status(400).json({
        error: `품목을 하나도 찾지 못했습니다. 인보이스 레이아웃이 예상과 다를 수 있습니다. (invoice_no=${invoice.invoice_no || '?'}, text.length=${rawText.length})`,
      });
      return;
    }
    // 4) Claude 응답과 동일한 shape 로 감싸 반환 (클라이언트 계약 유지).
    res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(invoice) }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[analyze-invoice] 로컬 파싱 실패:', e);
    res.status(500).json({ error: `로컬 인보이스 파싱 실패: ${message}` });
  }
}
