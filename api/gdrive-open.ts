/**
 * Vercel Serverless Function — 신청서 xlsx 를 구글 스프레드시트로 변환 업로드.
 *
 * 요청: POST { cert_id, file_name, file_base64, company_id }
 * 흐름:
 *  1) GOOGLE_OAUTH_* 3종으로 OAuth2Client → access_token
 *  2) drive.files.create({ mimeType: 'application/vnd.google-apps.spreadsheet' }) — 엑셀 → 시트 자동 변환
 *  3) inspection_certificates.google_drive_file_id UPDATE (service_role)
 *  4) { fileId } 응답
 *
 * 🔴 보안: GOOGLE_OAUTH_* / SUPABASE_SERVICE_ROLE_KEY 는 서버 전용. 브라우저 노출 금지.
 * 🟠 scope: drive.file — 앱이 생성한 파일에만 접근 가능 (기존 사용자 파일은 건드리지 못함).
 * 🟠 파일명 규약: `[{companyId 앞 8자리} {certId 앞 8자리}] {원본파일명}` — 공용 드라이브 충돌 방지.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'node:stream';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    // 20MB xlsx base64 대응 (신청서 최대 20MB, base64 오버헤드 ~33%).
    bodyParser: { sizeLimit: '32mb' },
  },
  maxDuration: 30,
};

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

function pickSourceMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return XLSX_MIME;
  if (lower.endsWith('.xls')) return XLS_MIME;
  return XLSX_MIME;
}

function buildDriveName(
  companyId: string,
  certId: string,
  fileName: string,
): string {
  const c = companyId.slice(0, 8);
  const r = certId.slice(0, 8);
  return `[${c} ${r}] ${fileName}`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (
    !clientId ||
    !clientSecret ||
    !refreshToken ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return res
      .status(500)
      .json({ error: '서버 환경변수(GOOGLE_OAUTH_*/SUPABASE_*) 누락' });
  }

  const {
    cert_id,
    file_name,
    file_base64,
    company_id,
  } = (req.body ?? {}) as {
    cert_id?: string;
    file_name?: string;
    file_base64?: string;
    company_id?: string;
  };

  if (!cert_id || !file_name || !file_base64 || !company_id) {
    return res
      .status(400)
      .json({ error: 'cert_id / file_name / file_base64 / company_id 필수' });
  }

  const lower = file_name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    return res.status(400).json({ error: '엑셀(.xlsx/.xls) 파일만 지원합니다' });
  }

  try {
    const oauth2 = new OAuth2Client({
      clientId,
      clientSecret,
    });
    oauth2.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth: oauth2 });

    const buffer = Buffer.from(file_base64, 'base64');
    const bodyStream = Readable.from(buffer);

    const created = await drive.files.create({
      requestBody: {
        name: buildDriveName(company_id, cert_id, file_name),
        mimeType: GSHEET_MIME,
      },
      media: {
        mimeType: pickSourceMime(file_name),
        body: bodyStream,
      },
      fields: 'id',
    });

    const fileId = created.data.id;
    if (!fileId) {
      return res.status(502).json({ error: '드라이브 파일 ID 미반환' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: updateError } = await supabase
      .schema('mochicraft_demo')
      .from('inspection_certificates')
      .update({ google_drive_file_id: fileId })
      .eq('id', cert_id);
    if (updateError) {
      return res
        .status(500)
        .json({ error: `DB 갱신 실패: ${updateError.message}`, fileId });
    }

    return res.status(200).json({ fileId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return res.status(500).json({ error: `업로드 실패: ${msg}` });
  }
}
