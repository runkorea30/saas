/**
 * Supabase 싱글톤 클라이언트.
 *
 * 🔴 스키마 `mochicraft_demo`로 전역 고정 — 이 설정을 바꾸지 말 것.
 * 🔴 secret 키(sb_secret_...)는 서버(Vercel Serverless / Edge Function) 전용.
 *    프론트에서 절대 import 금지.
 *
 * 🟠 키 체계: 레거시 anon/service_role JWT 대신 신규 publishable/secret opaque 키 사용.
 *    - publishable(sb_publishable_...): 브라우저 노출 OK, anon 과 동일한 권한 레벨.
 *    - secret(sb_secret_...): 서버 전용. User-Agent 감지로 브라우저 사용 시 401.
 *
 * Phase 3에서 `supabase gen types typescript --schema mochicraft_demo`로 생성한
 * `Database` 타입을 `createClient<Database>(...)` 제네릭으로 주입한다.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Supabase 환경변수가 누락되었습니다. .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY 를 입력하세요.',
  );
}

export const supabase = createClient<Database, 'mochicraft_demo'>(
  url,
  publishableKey,
  {
    db: {
      // 🔴 mochicraft_demo 스키마 고정. 모든 쿼리가 이 스키마로 라우팅됨.
      schema: 'mochicraft_demo',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      // 🟡 Phase 2 임시: 현재 RLS 는 anon 정책 기반이라 로그인 세션이 있어도
      //    쿼리는 anon-level 로 처리되어야 한다. supabase-js 는 세션이 있으면
      //    `Authorization: Bearer <session_access_token>` 을 자동 삽입해
      //    authenticated 정책 쪽으로 넘어가 버리므로, 그것을 빈 문자열로 override.
      //    이 상태에서는 apikey 헤더(publishable) 만 남아 서버가 anon 으로 판단 → 기존 RLS 유지.
      //
      //    ⚠️ 이전 버전은 여기 `Bearer ${anonKey}` 를 강제로 넣었지만 신규 publishable 은
      //    JWT 가 아닌 opaque 문자열이라 Bearer 로 보내면 서버가 인식 못 함.
      //
      // 🔴 Phase 3 (RLS authenticated 전환) 시 이 옵션 제거.
      headers: {
        Authorization: '',
      },
    },
  },
);
