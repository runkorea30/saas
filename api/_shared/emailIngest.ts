/**
 * 이메일 자동 수집 공용 헬퍼 — api/ingest-emails.ts 와 scripts/ 의 1회성 스크립트가 공유.
 *
 * ⚠️ `_` 접두 폴더는 Vercel 이 라우트로 노출하지 않음 (endpoint 아님).
 *    순수 유틸/타입만 위치시킬 것.
 */
import type { Attachment as MailAttachment } from 'mailparser';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

export const FEDEX_PROMPT = `이 페덱스 수입 관련 PDF에서 아래 필드를 추출해 JSON 하나만 응답하세요.
{
  "doc_no": "수입신고번호 (없으면 null)",
  "doc_date": "신고일자 YYYY-MM-DD (없으면 null)",
  "transport_type": "air | sea | null",
  "mawb_hawb": "MAWB 또는 HAWB 번호 (없으면 null)"
}
찾을 수 없으면 null. 마크다운/설명 없이 { 로 시작 } 로 끝나는 JSON 만 출력.`;

export const ANGELUS_PROMPT = `이 엔젤러스 인보이스 PDF에서 아래 필드를 추출해 JSON 하나만 응답하세요.
{
  "invoice_no": "인보이스 번호 (없으면 null)",
  "po_reference": "PO/주문 참조번호 (없으면 null)",
  "doc_subtype": "proforma | revised | final | unknown",
  "has_amount": true,
  "has_freight": false
}
분류 근거:
 - 문서 상단 제목("Proforma Invoice" → proforma, "Revised" 표시 → revised, "Commercial Invoice" 이면서 Freight 포함 → final).
 - 운송비(Freight/Shipping) 항목이 있으면 has_freight=true, 최종본일 가능성 높음.
 - 판단 불가 시 doc_subtype="unknown".
찾을 수 없으면 null. 마크다운/설명 없이 { 로 시작 } 로 끝나는 JSON 만 출력.`;

/**
 * 수입면장(수입신고필증) 판별 프롬프트.
 * 1회성 백업 zip 안에는 배송 알림/요금 청구서/운송장 등이 함께 있어, 실제 수입면장인 PDF 만 골라내기 위해 사용.
 */
export const FEDEX_IS_DECLARATION_PROMPT = `이 PDF 가 대한민국 수입면장(관세청 발행 수입신고 서식) 을 포함하는지 판별해 JSON 하나만 응답하세요.
{
  "is_import_declaration": true 또는 false,
  "reason": "판단 근거 (한 줄, 어느 페이지에서 근거를 찾았는지 포함)"
}

⚠️ 반드시 PDF 전체 페이지를 확인할 것.
 - FedEx 가 보내는 수입면장 PDF 는 흔히 다음 구성입니다:
   · 1페이지: "수입세금계산서" (세금 청구서)
   · 2페이지 이후: "수입신고내역서" 또는 "수입신고필증" (관세청 UNI-PASS 서식)
 - 뒷페이지에 신고 서식이 있으면 앞페이지 세금계산서만 보고 false 로 판단하지 말 것.

✅ true 조건 (PDF 어느 한 페이지라도 아래 중 하나 만족):
 - 문서 제목/상단이 "수입신고필증", "수입신고내역서", "수입신고서", "Import Declaration" 계열이다.
 - UNI-PASS 워터마크 또는 관세청 로고가 있는 신고 서식.
 - "수입신고번호"(예: 23176-26-573807M 형태) + "신고일자" + "세관.과" + "B/L(AWB)번호" 등 UNI-PASS 신고서 특유의 항목이 표 형태로 존재.
 - "HS번호"/"세번부호" + "품명" + "과세가격(CIF)" + "환급물량" 등 신고서 후단부 항목이 존재.

❌ false 조건 (해당 페이지가 하나도 없고, PDF 전체가 아래 유형만으로 구성):
 - "수입세금계산서"만 있고 뒷장에 신고서가 전혀 없는 세금 청구서 단독 문서.
 - AWB(Air Waybill), House Air Waybill 라벨/운송장만 있는 문서.
 - "수입 통관 정보 제출 안내" 같은 서류 요청 안내 (실제 신고서 아님).
 - Commercial Invoice, Packing List, Proforma Invoice 같은 무역 서류만 있는 경우.

마크다운/설명 없이 { 로 시작 } 로 끝나는 JSON 만 출력.`;

export interface FedexMeta {
  doc_no: string | null;
  doc_date: string | null;
  transport_type: 'air' | 'sea' | null;
  mawb_hawb: string | null;
}

export interface AngelusMeta {
  invoice_no: string | null;
  po_reference: string | null;
  doc_subtype: 'proforma' | 'revised' | 'final' | 'unknown' | null;
  has_amount: boolean | null;
  has_freight: boolean | null;
}

export interface IsDeclarationResult {
  is_import_declaration: boolean;
  reason?: string;
}

export type MatchedCategory = 'import_declaration' | 'angelus_invoice';

/**
 * 발신자 문자열에서 카테고리 분류. 매칭 실패 시 null.
 */
export function classifySender(from: string): MatchedCategory | null {
  const lower = from.toLowerCase();
  if (lower.includes('fedex')) return 'import_declaration';
  if (/@angelusshoepolish\.com>?/.test(lower)) return 'angelus_invoice';
  return null;
}

/** 파일 시스템 / Storage 경로용으로 안전한 이름. */
export function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

/** mailparser attachments 에서 PDF 만 필터링. */
export function pdfAttachments(
  atts: MailAttachment[] | undefined,
): MailAttachment[] {
  if (!atts) return [];
  return atts.filter((a) => {
    const ct = (a.contentType ?? '').toLowerCase();
    const name = (a.filename ?? '').toLowerCase();
    return ct === 'application/pdf' || name.endsWith('.pdf');
  });
}

/**
 * Claude API 로 PDF 를 넘겨 text 응답을 받아옴. 실패/네트워크 오류 시 null.
 * max_tokens 는 짧은 JSON 만 뽑는 용도로 1024 로 충분.
 *
 * 🟠 실패 원인은 process-scope에 최대 1회만 stderr 로 출력해 batch 실행 중 로그 폭주를
 *    막으면서, credit-low/rate-limit 같은 배치 전체를 무의미하게 만드는 문제는 눈에 띄게 함.
 */
let _claudeErrorLoggedOnce = false;
export async function callClaude(
  apiKey: string,
  pdfBase64: string,
  prompt: string,
  maxTokens = 1024,
): Promise<string | null> {
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
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
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      if (!_claudeErrorLoggedOnce) {
        _claudeErrorLoggedOnce = true;
        const body = await res.text().catch(() => '');
        // eslint-disable-next-line no-console
        console.error(
          `[callClaude] first failure ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
        );
      }
      return null;
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((c) => c.type === 'text')?.text;
    return text ?? null;
  } catch (err) {
    if (!_claudeErrorLoggedOnce) {
      _claudeErrorLoggedOnce = true;
      // eslint-disable-next-line no-console
      console.error('[callClaude] first exception:', err);
    }
    return null;
  }
}

/** 마크다운 코드블록 등이 섞여도 첫 `{` ~ 마지막 `}` 만 뽑아 JSON 파싱. 실패 시 null. */
export function parseJsonLoose<T>(text: string | null): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
