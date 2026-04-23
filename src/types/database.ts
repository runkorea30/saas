/**
 * Supabase 자동생성 타입 플레이스홀더.
 *
 * Phase 3에서 다음 명령으로 이 파일을 덮어쓴다:
 *   supabase gen types typescript \
 *     --project-id adfobvwuzkufsmukdfrt \
 *     --schema mochicraft_demo > src/types/database.ts
 *
 * 그 이후 `src/lib/supabase.ts`에서 `createClient<Database>(...)`로 주입.
 */

export type Database = {
  mochicraft_demo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
