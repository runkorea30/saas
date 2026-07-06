/**
 * Vercel Serverless Function — 인보이스 PDF → 로컬 정규식 파서.
 *
 * 🔴 (2026-07-06 §47-d) 원인 확정 및 최종 수정:
 *   1차: pdf-parse@2 + pdfjs-dist@5 → @napi-rs/canvas 요구 → 크래시
 *   2차: pdf-parse@1.1.1 → 컬럼 사이 공백 손실로 정규식 재작성 불가
 *   3차: pdfjs-dist@4.10.38 legacy build (canvas optional 로 가정)
 *   ✅ 4차 (현재): 3차 위에 DOMMatrix/ImageData/Path2D **stub 을 pdfjs import 전에**
 *      globalThis 에 preload. Vercel 로그에서 아래 시퀀스 확인됨:
 *        Warning: Cannot load "@napi-rs/canvas" package (optional dep 누락)
 *        Warning: Cannot polyfill `DOMMatrix`
 *        ReferenceError: DOMMatrix is not defined  ← try/catch 로 못 잡음, 프로세스 즉사
 *      canvas optional 은 실제 함수 번들에 없어 pdfjs 의 자체 폴리필이 실패 →
 *      특정 PDF (embedded 이미지·패턴 등) 파싱 시 렌더링 경로가 부수적으로 호출되어
 *      DOMMatrix 참조 → 크래시. stub 은 텍스트 추출 결과에 영향 없음 (모든 매트릭스
 *      메서드가 no-op self-return, 실제 좌표계는 pdfjs 가 내부 배열로 계산).
 *
 * 🟠 응답 스키마는 이전 Claude 프록시 응답과 동일하게 유지 — 클라이언트
 *    `src/utils/invoiceParser.ts` 가 변경 없이 그대로 동작:
 *      { content: [{ type: 'text', text: '<InvoiceParsed 를 JSON.stringify 한 문자열>' }] }
 *
 * 🟡 에러: 400 body 는 `{ error: '문자열' }` 로 통일.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseAngelusInvoiceText } from './_shared/invoice-local-parser.js';

// ─── pdfjs worker 번들 포함 (§47-e/§47-f) ───────────────────────────
//
// pdfjs-dist 는 `workerSrc` 가 설정되지 않으면 fake worker 모드로 폴백하며
// `pdf.worker.mjs` 를 동적 import 한다. 이 동적 import 는 Vercel 의 @vercel/nft
// (파일 트레이싱) 이 정적 분석에서 못 잡아 배포 번들에서 워커 파일이 누락됨:
//    "Cannot find module '/var/task/.../pdf.worker.mjs' imported from ... pdf.mjs"
//
// 최종 해결:
//   ① `vercel.json` 의 `functions."api/analyze-invoice.ts".includeFiles` 로 워커
//      파일을 명시적으로 배포 번들에 포함. (@vercel/nft 자동 트레이싱과 무관하게 강제)
//   ② `require.resolve(...)` 로 런타임 절대 경로 획득. workerSrc 는 `file://` URL 로 설정.
//      pdfjs 내부에서 워커 로드 시 `import(workerSrc)` 하므로 절대 URL 형식 필요.
//
// 🔴 (§47-f) require.resolve 호출은 **모듈 top-level 이 아니라 요청 handler 안에서만**
//   실행. 이전 시도 (§47-e) 는 top-level 에서 호출해 콜드스타트 시 실패하면 프로세스
//   자체가 죽어 try/catch 로 못 잡히던 문제 있음. handler 스코프로 옮기고 try/catch
//   로 감싸면 실패해도 해당 요청만 500 반환 + 다른 요청/콜드스타트에 영향 없음.
//   createRequire 자체는 실제 파일 해결을 안 하므로 top-level 안전.
const require_ = createRequire(import.meta.url);

// ─── DOM stub preload (§47-d) ──────────────────────────────────────
//
// pdfjs-dist legacy build 는 top-level 에서 canvas 패키지 로드를 시도하고 실패하면
// `if (!globalThis.DOMMatrix)` 체크로 자체 폴리필을 씌우려 하지만, canvas 미설치
// 환경에서는 최종적으로 warn 만 남기고 `globalThis.DOMMatrix` 를 미정의로 방치.
// 이후 텍스트 추출 경로에서 예기치 않게 이 심볼을 참조하면 ReferenceError.
//
// 여기서 **pdfjs import 전에** minimal stub 을 globalThis 에 심어두면:
//   ① pdfjs 의 `!globalThis.DOMMatrix` 가 false → 자체 폴리필 로직 skip (warn 소멸)
//   ② 렌더링 경로가 우연히 호출돼도 stub 이 no-op 체인을 제공해 크래시 방지
//
// stub 메서드 목록은 pdfjs-dist@4.10.38 소스에서 실제 호출 대상만 뽑음:
//   DOMMatrix: translate / scale / invertSelf / multiplySelf / preMultiplySelf
//   Path2D:   addPath
//   ImageData: (constructor 만)
function installPdfjsDomStubs(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === 'undefined') {
    class DOMMatrixStub {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_init?: unknown) {}
      translate(): this { return this; }
      scale(): this { return this; }
      invertSelf(): this { return this; }
      multiplySelf(): this { return this; }
      preMultiplySelf(): this { return this; }
    }
    g.DOMMatrix = DOMMatrixStub;
  }
  if (typeof g.ImageData === 'undefined') {
    class ImageDataStub {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(..._args: unknown[]) {}
    }
    g.ImageData = ImageDataStub;
  }
  if (typeof g.Path2D === 'undefined') {
    class Path2DStub {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_init?: unknown) {}
      addPath(): void {}
    }
    g.Path2D = Path2DStub;
  }
}

// 🔴 반드시 pdfjs 동적 import 이전 (모듈 top-level) 에서 실행.
installPdfjsDomStubs();

export const config = {
  api: {
    // 인보이스 PDF base64 는 수 MB. 이전과 동일 상한 유지.
    bodyParser: { sizeLimit: '10mb' },
  },
  // 큰 인보이스(18페이지) 파싱은 로컬 실측 ~200ms 이지만 콜드 스타트 여유 확보.
  maxDuration: 30,
};

interface RequestBody {
  /** PDF 파일의 순수 base64 (data URI prefix 제외). */
  pdfBase64: string;
}

/** pdfjs textContent item shape (필요한 부분만). */
interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

/**
 * pdfjs-dist v4 legacy build 로 PDF → text 추출.
 * items 배열 원 스트림 순서(문서 reading order) 를 유지하며 `\t` 로 join. `hasEOL` 이면 개행.
 * 이 결과 shape 이 `parseAngelusInvoiceText` (정규식 파서) 가 기대하는 pdf-parse@2 유사 layout.
 */
async function extractTextFromPdf(buf: Buffer): Promise<string> {
  // 동적 import — Vercel 콜드스타트 시 top-level import 실패해도 handler 안에서 잡히도록.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // §47-f: 워커 경로 해결을 요청 스코프 안 try/catch 로. 실패해도 프로세스 크래시 대신
  //        해당 요청만 500 반환. `require.resolve` 는 리터럴 인자를 유지해야 @vercel/nft
  //        가 정적 분석에서 워커 파일을 트레이스할 수 있음 (fallback 안전망).
  try {
    const workerPath = require_.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`PDF 파서 초기화 실패 (worker 모듈 해결 불가): ${msg}`);
  }

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    // 워커/폰트 다운로드 불필요 — Node 환경.
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items as PdfTextItem[]) {
      if (typeof it.str !== 'string') continue;
      text += it.str + (it.hasEOL ? '\n' : '\t');
    }
  }
  await doc.destroy();
  return text;
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
    const buf = Buffer.from(pdfBase64, 'base64');
    const rawText = await extractTextFromPdf(buf);
    if (!rawText.trim()) {
      res.status(400).json({
        error:
          'PDF 에서 텍스트를 추출하지 못했습니다. 이미지/스캔본 인보이스일 수 있습니다.',
      });
      return;
    }
    const invoice = parseAngelusInvoiceText(rawText);
    if (invoice.rows.length === 0) {
      res.status(400).json({
        error: `품목을 하나도 찾지 못했습니다. 인보이스 레이아웃이 예상과 다를 수 있습니다. (invoice_no=${invoice.invoice_no || '?'}, text.length=${rawText.length})`,
      });
      return;
    }
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
