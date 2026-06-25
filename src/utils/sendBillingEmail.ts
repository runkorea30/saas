/**
 * 청구서 이메일 발송 — Vercel API Route 호출 래퍼.
 *
 * 백엔드 (`api/send-billing-email.ts`) 가 nodemailer + Gmail SMTP 로 처리.
 * 브라우저는 첨부 base64 와 메타데이터만 JSON 으로 전달 → 한글/MIME/OAuth 모두 서버에 위임.
 *
 * 🟠 로컬 개발: `npx vercel dev` 필요. `npm run dev` 만으로는 /api/* 가 404.
 */

export interface BillingEmailAttachment {
  filename: string;
  /** MIME 타입 — 'application/pdf' / 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' */
  mimeType: string;
  /** 순수 base64 (data URI prefix 제외). */
  base64Data: string;
}

export interface SendBillingEmailParams {
  toEmail: string;
  subject: string;
  body: string;
  attachments: BillingEmailAttachment[];
}

export async function sendBillingEmail(
  params: SendBillingEmailParams,
): Promise<void> {
  const response = await fetch('/api/send-billing-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    let detail = `발송 실패 (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) detail = json.error;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
}
