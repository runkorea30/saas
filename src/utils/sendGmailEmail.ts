/**
 * Gmail REST API 직접 호출 발송 유틸.
 *
 * `gmail.users.messages.send` 엔드포인트에 MIME 메시지를 base64url 인코딩으로 전송.
 *
 * 발송 모드:
 *  - 첨부 0개  → 단일 파트 text/plain MIME (반송률 낮음, 단순)
 *  - 첨부 1개+ → multipart/mixed MIME
 *
 * 🔴 한글 헤더(Subject, filename)는 RFC 2047 UTF-8 base64 형식으로 인코딩.
 * 🔴 raw 필드는 TextEncoder 기반 UTF-8 → base64url (btoa 직접 사용 시 한글 깨짐).
 * 🔴 From 헤더 명시 → 일부 수신 메일서버(daum 등)가 미명시 시 반송 가능성.
 */

const FROM_DISPLAY = '런코리아';
const FROM_ADDRESS = 'runkorea30@gmail.com';

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

// ── 인코딩 헬퍼 ────────────────────────────────────────────────────────

/** Uint8Array → binary string (chunked, stack overflow 회피). */
function bytesToBinary(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return binary;
}

/** UTF-8 문자열 → base64. 한글 안전. */
function utf8ToBase64(s: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(s)));
}

/** UTF-8 문자열 → base64url (Gmail API raw 인코딩 규약). */
function toBase64Url(s: string): string {
  return utf8ToBase64(s)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** RFC 2047 — UTF-8 base64 인코딩된 헤더 값 (한글 제목/파일명용). */
function encodeHeader(value: string): string {
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

/** ASCII-only 헤더 확인 — ASCII 만이면 그대로, 그 외 RFC 2047 인코딩. */
function safeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value) ? value : encodeHeader(value);
}

/** 첨부 base64 데이터를 76자 단위로 줄바꿈 (MIME 사양). */
function chunkBase64(s: string, size = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < s.length; i += size) lines.push(s.slice(i, i + size));
  return lines.join('\r\n');
}

// ── MIME 빌더 ─────────────────────────────────────────────────────────

/** 첨부 없는 단순 text/plain MIME. */
function buildSimpleMime(opts: {
  toEmail: string;
  subject: string;
  body: string;
}): string {
  const { toEmail, subject, body } = opts;
  return [
    `From: ${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    `To: ${toEmail}`,
    `Subject: ${safeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    chunkBase64(utf8ToBase64(body)),
  ].join('\r\n');
}

/** multipart/mixed MIME — 첨부 1개 이상. */
function buildMultipartMime(opts: {
  toEmail: string;
  subject: string;
  body: string;
  attachments: GmailAttachment[];
}): string {
  const { toEmail, subject, body, attachments } = opts;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const nl = '\r\n';

  const parts: string[] = [
    `From: ${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    `To: ${toEmail}`,
    `Subject: ${safeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    chunkBase64(utf8ToBase64(body)),
  ];

  for (const att of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${safeHeader(att.filename)}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${safeHeader(att.filename)}"`,
      ``,
      chunkBase64(att.base64Data),
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join(nl);
}

// ── 메인 발송 함수 ─────────────────────────────────────────────────────

export async function sendGmailEmail(params: SendGmailParams): Promise<void> {
  const { accessToken, toEmail, subject, body, attachments } = params;

  const mime =
    attachments.length === 0
      ? buildSimpleMime({ toEmail, subject, body })
      : buildMultipartMime({ toEmail, subject, body, attachments });

  const raw = toBase64Url(mime);

  // [DEBUG] 반송 진단용 임시 로그 — 안정화 후 제거.
  /* eslint-disable no-console */
  console.log('[sendGmailEmail] toEmail:', toEmail);
  console.log('[sendGmailEmail] subject:', subject);
  console.log('[sendGmailEmail] attachments count:', attachments.length);
  console.log('[sendGmailEmail] raw (first 200):', raw.substring(0, 200));
  /* eslint-enable no-console */

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

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    // ignore parse error
  }

  /* eslint-disable no-console */
  console.log('[sendGmailEmail] status:', response.status);
  console.log(
    '[sendGmailEmail] response body:',
    JSON.stringify(responseBody, null, 2),
  );
  /* eslint-enable no-console */

  if (!response.ok) {
    const errObj = responseBody as
      | { error?: { message?: string; status?: string } }
      | null;
    const message =
      errObj?.error?.message ??
      `Gmail 발송 실패 (${response.status}) ${response.statusText}`;
    throw new Error(message);
  }
}
