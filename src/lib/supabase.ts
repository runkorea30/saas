/**
 * Supabase 싱글톤 클라이언트.
 *
 * 🔴 스키마 `mochicraft_demo`로 전역 고정 — 이 설정을 바꾸지 말 것.
 * 🔴 service_role 키는 Edge Function 전용. 프론트에서 절대 import 금지.
 *
 * Phase 3에서 `supabase gen types typescript --schema mochicraft_demo`로 생성한
 * `Database` 타입을 `createClient<Database>(...)` 제네릭으로 주입한다.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase 환경변수가 누락되었습니다. .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 입력하세요.',
  );
}

export const supabase = createClient<Database, 'mochicraft_demo'>(url, anonKey, {
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
    // 🟡 Phase 2 임시: RLS가 anon 정책 기반이므로 DB 요청 시 Auth 헤더 제거.
    // 로그인 세션은 OPS 진입 게이트(useOpsAuth)에서만 사용하고
    // 실제 DB 쿼리는 항상 anon 키로 전송해 기존 RLS 정책이 동작하게 함.
    // 🔴 Phase 3(RLS authenticated 전환) 시 이 옵션 제거.
    headers: {
      Authorization: `Bearer ${anonKey}`,
    },
  },
});
