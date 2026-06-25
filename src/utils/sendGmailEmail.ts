/**
 * Gmail REST API 직접 호출 발송 유틸.
 *
 * `gmail.users.messages.send` 엔드포인트에 MIME 멀티파트 메시지를 base64url 인코딩으로 전송.
 * 첨부파일(PDF / XLSX) 1개 이상 포함 가능.
 *
 * 🔴 한글 제목/본문은 RFC 2047 / UTF-8 base64 인코딩으로 처리 (Gmail 깨짐 방지).
 * 🔴 access_token 은 gmailAuth.ts 에서 발급받은 것을 그대로 사용.
 */

export interface GmailAttachment {
  filename: string;
  /** MIME 타입 — 'application/pdf' / 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 등. */
  mimeType: string;
  /** 순수 base64 문자열 (data URI prefix 제외). */
  base64Data: string;
}

export interface SendGmailParams {
  accessToken: string;
  toEmail: string;
  subject: string;
  body: string;
  attachments: GmailAttachment[];
}

/** UTF-8 안전 base64 (한글 포함). */
function utf8ToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

/** RFC 2047 — UTF-8 base64 인코딩된 헤더 값 (한글 제목/파일명용). */
function encodeHeader(value: string): string {
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

/** base64 → base64url (Gmail API raw 인코딩 규약). */
function toBase64Url(s: string): string {
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 첨부 데이터를 76자 단위로 줄바꿈 (MIME 사양). */
function chunkBase64(s: string, size = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < s.length; i += size) lines.push(s.slice(i, i + size));
  return lines.join('\r\n');
}

export async function sendGmailEmail(params: SendGmailParams): Promise<void> {
  const { accessToken, toEmail, subject, body, attachments } = params;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const nl = '\r\n';

  let mime = '';
  mime += `To: ${toEmail}${nl}`;
  mime += `Subject: ${encodeHeader(subject)}${nl}`;
  mime += `MIME-Version: 1.0${nl}`;
  mime += `Content-Type: multipart/mixed; boundary="${boundary}"${nl}`;
  mime += nl;

  // 본문 (text/plain, UTF-8 base64)
  mime += `--${boundary}${nl}`;
  mime += `Content-Type: text/plain; charset=UTF-8${nl}`;
  mime += `Content-Transfer-Encoding: base64${nl}`;
  mime += nl;
  mime += chunkBase64(utf8ToBase64(body)) + nl;

  // 첨부파일
  for (const att of attachments) {
    mime += `--${boundary}${nl}`;
    mime += `Content-Type: ${att.mimeType}; name="${encodeHeader(att.filename)}"${nl}`;
    mime += `Content-Transfer-Encoding: base64${nl}`;
    mime += `Content-Disposition: attachment; filename="${encodeHeader(att.filename)}"${nl}`;
    mime += nl;
    mime += chunkBase64(att.base64Data) + nl;
  }
  mime += `--${boundary}--`;

  const raw = toBase64Url(utf8ToBase64(mime));

  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const json = await response.json();
      detail = json?.error?.message ?? detail;
    } catch {
      // ignore
    }
    throw new Error(`Gmail 발송 실패 (${response.status}): ${detail}`);
  }
}
