/**
 * Gmail REST API 직접 호출 발송 유틸.
 *
 * `gmail.users.messages.send` 엔드포인트에 MIME 메시지를 base64url 인코딩으로 전송.
 *
 * 🔴 MIME 헤더 라인은 반드시 **ASCII 만** 유지 (한글 직접 삽입 금지).
 *    한글 값(From 표시이름, Subject, 첨부 filename) 은 RFC 2047 base64 헤더로 인코딩.
 *    이전 버그: From: '런코리아 <...>' 처럼 한글 raw 삽입 → 이후 To/Subject 파싱 손상,
 *    수신측(daum 등) 메일서버가 메시지 거부/반송.
 *
 * 🔴 전체 MIME 문자열 → UTF-8 바이트 → base64url (TextEncoder 기반, 한글 안전).
 * 🔴 From 헤더 명시 — 미명시 시 일부 메일서버 반송.
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

/** RFC 2047 — UTF-8 base64 헤더 값. ASCII-only 입력은 그대로 통과. */
function encodeRFC2047(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=`;
}

/** UTF-8 본문 → base64 (header가 아닌 body 인코딩용, 짧은 텍스트). */
function utf8BodyToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

/** MIME 문자열 전체 → base64url (TextEncoder 기반, 청크 분할로 stack overflow 회피). */
function mimeToBase64Url(mimeStr: string): string {
  const bytes = new TextEncoder().encode(mimeStr);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── 메인 발송 함수 ─────────────────────────────────────────────────────

export async function sendGmailEmail(params: SendGmailParams): Promise<void> {
  const { accessToken, toEmail, subject, body, attachments } = params;
  const boundary = `boundary_${Date.now()}`;
  const nl = '\r\n';

  // 한글 헤더 값은 RFC 2047 로 인코딩 → 결과 라인은 ASCII 만 포함.
  const fromName = encodeRFC2047(FROM_DISPLAY);
  const encodedSubject = encodeRFC2047(subject);

  const lines: string[] = [
    `From: ${fromName} <${FROM_ADDRESS}>`,
    `To: ${toEmail}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
  ];

  if (attachments.length === 0) {
    // 첨부 없음 — 단순 text/plain
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push(``);
    lines.push(utf8BodyToBase64(body));
  } else {
    // 첨부 있음 — multipart/mixed
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push(``);

    // 본문 파트
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push(``);
    lines.push(utf8BodyToBase64(body));
    lines.push(``);

    // 첨부 파트들
    for (const att of attachments) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mimeType}`);
      lines.push(`Content-Transfer-Encoding: base64`);
      lines.push(
        `Content-Disposition: attachment; filename="${encodeRFC2047(att.filename)}"`,
      );
      lines.push(``);
      lines.push(att.base64Data);
      lines.push(``);
    }
    lines.push(`--${boundary}--`);
  }

  const mimeStr = lines.join(nl);
  const raw = mimeToBase64Url(mimeStr);

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
      `Gmail API 오류 (${response.status}) ${response.statusText}`;
    throw new Error(message);
  }
}
