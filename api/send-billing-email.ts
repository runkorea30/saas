/**
 * Vercel Serverless Function — Gmail SMTP 청구서 발송 프록시.
 *
 * 브라우저에서 직접 Gmail REST API 호출 시 발생하던 MIME 한글 인코딩/반송 문제 해결을 위해
 * 서버측 nodemailer 로 SMTP 발송. 인증은 Gmail 앱 비밀번호 (영구, OAuth refresh 불필요).
 *
 * 🔴 환경변수 (Vercel 대시보드에서 등록):
 *   GMAIL_USER         — 발송 계정 (runkorea30@gmail.com)
 *   GMAIL_APP_PASSWORD — Google 계정 → 보안 → 2단계 인증 → 앱 비밀번호 16자리
 *
 * 🟠 로컬 개발에서는 `npx vercel dev` 로 실행해야 /api/* 라우팅 동작.
 *    `npm run dev` 는 Vite 만 띄우므로 이 엔드포인트 404 발생 — 정상.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

interface Attachment {
  filename: string;
  /** MIME 타입 — 'application/pdf' 등. */
  mimeType: string;
  /** 순수 base64 (data URI prefix 제외). */
  base64Data: string;
}

interface RequestBody {
  toEmail: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { toEmail, subject, body, attachments = [] } = (req.body ??
    {}) as RequestBody;

  if (!toEmail || !subject) {
    res.status(400).json({ error: '받는 사람(toEmail)과 제목(subject)은 필수입니다' });
    return;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res
      .status(500)
      .json({ error: 'GMAIL_USER / GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  try {
    await transporter.sendMail({
      from: `런코리아 <${gmailUser}>`,
      to: toEmail,
      subject,
      text: body,
      attachments: attachments.map((att) => ({
        filename: att.filename,
        content: att.base64Data,
        encoding: 'base64',
        contentType: att.mimeType,
      })),
    });
    res.status(200).json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '발송 실패';
    // eslint-disable-next-line no-console
    console.error('[send-billing-email] Gmail 발송 오류:', error);
    res.status(500).json({ error: message });
  }
}
