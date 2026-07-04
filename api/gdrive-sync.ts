/**
 * Vercel Serverless Function — 구글 스프레드시트 → OPS 역방향 동기화 (pull).
 *
 * 요청: POST { cert_id }
 * 흐름:
 *  1) inspection_certificates 에서 google_drive_file_id, application_file_url 조회.
 *     google_drive_file_id 가 NULL 이면 400 ("먼저 시트로 열어주세요").
 *  2) GOOGLE_OAUTH_* 로 OAuth2Client → access_token.
 *  3) drive.files.export({ fileId, mimeType: xlsx }) 로 xlsx 바이너리 획득.
 *  4) Supabase Storage `documents` 버킷의 기존 application_file_url 경로에 upsert 덮어쓰기.
 *  5) inspection_certificates.UPDATE application_uploaded_at=NOW(), google_drive_synced_at=NOW().
 *  6) { success:true, synced_at } 응답.
 *
 * 🔴 GOOGLE_OAUTH_* / SUPABASE_SERVICE_ROLE_KEY 서버 전용.
 * 🟠 scope: drive.file — 앱이 생성한 파일만 export 가능.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 30,
};

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STORAGE_BUCKET = 'documents';

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

  const { cert_id } = (req.body ?? {}) as { cert_id?: string };
  if (!cert_id) {
    return res.status(400).json({ error: 'cert_id 필수' });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: row, error: selError } = await supabase
      .schema('mochicraft_demo')
      .from('inspection_certificates')
      .select('google_drive_file_id, application_file_url')
      .eq('id', cert_id)
      .maybeSingle();
    if (selError) {
      return res.status(500).json({ error: `조회 실패: ${selError.message}` });
    }
    if (!row) {
      return res.status(404).json({ error: '해당 시험검사번호 행을 찾을 수 없습니다' });
    }
    if (!row.google_drive_file_id) {
      return res
        .status(400)
        .json({ error: '먼저 "시트 열기"를 눌러 드라이브에 업로드해 주세요' });
    }
    if (!row.application_file_url) {
      return res.status(400).json({
        error: '원본 파일 저장 경로가 없어 동기화할 수 없습니다',
      });
    }

    const oauth2 = new OAuth2Client({ clientId, clientSecret });
    oauth2.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2 });

    // 🔴 stream 응답 필수 — arraybuffer 는 gaxios 가 응답을 텍스트로 처리해
    //    xlsx zip 컨테이너 바이트가 미묘하게 손상되어 Excel "내용에 문제가 있습니다" 경고 발생.
    const exportResp = await drive.files.export(
      { fileId: row.google_drive_file_id, mimeType: XLSX_MIME },
      { responseType: 'stream' },
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      (exportResp.data as NodeJS.ReadableStream)
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });
    const buffer = Buffer.concat(chunks);

    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(row.application_file_url, buffer, {
        contentType: XLSX_MIME,
        upsert: true,
        // 🔴 CDN 캐시(기본 3600s) 로 인해 동기화 직후 다운로드가 옛 파일을 반환하는 버그.
        //    cacheControl:'0' 로 매 요청 원본 재조회 강제.
        cacheControl: '0',
      });
    if (upErr) {
      return res
        .status(500)
        .json({ error: `Storage 업로드 실패: ${upErr.message}` });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .schema('mochicraft_demo')
      .from('inspection_certificates')
      .update({
        application_uploaded_at: nowIso,
        google_drive_synced_at: nowIso,
      })
      .eq('id', cert_id);
    if (updateError) {
      return res
        .status(500)
        .json({ error: `DB 갱신 실패: ${updateError.message}` });
    }

    return res.status(200).json({ success: true, synced_at: nowIso });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return res.status(500).json({ error: `동기화 실패: ${msg}` });
  }
}
