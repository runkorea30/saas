# 마이그레이션 가이드

## 현재 상태 — 이미 실행됨

아래 5개 마이그레이션은 **이미 Supabase `adfobvwuzkufsmukdfrt` 프로젝트에 실행 완료**된 상태입니다.

| 파일 | 내용 | 실행 상태 |
|---|---|---|
| `001_init_schema.sql` | Schema 생성 + 20개 테이블 + FK | ✅ |
| `002_indexes.sql` | 인덱스 (FK + company_id + 주요 컬럼) | ✅ |
| `003_triggers.sql` | `updated_at` 자동 갱신 트리거 19개 | ✅ |
| `004_rls_policies.sql` | RLS 정책 31개 (`company_id` 격리 기반) | ✅ |
| `005_seed_plans.sql` | 요금제 4종 시드 (Free/Starter/Pro/Business) | ✅ |

## ⚠️ 중요: Supabase Dashboard 수동 설정 필요

클라이언트에서 `mochicraft_demo` 스키마에 접근하려면 **한 번 수동 설정**이 필요합니다.

1. Supabase Dashboard 접속 (프로젝트 `adfobvwuzkufsmukdfrt`)
2. 좌측 메뉴 **Project Settings** → **API**
3. **Exposed schemas** 필드에서 기존 값(보통 `public, graphql_public`)에 `mochicraft_demo` 추가
4. **Save** 클릭

설정 후 클라이언트 코드에서 이렇게 사용:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    db: { schema: 'mochicraft_demo' }
  }
);
```

## RLS 동작 방식

RLS는 `memberships` 테이블을 기반으로 작동합니다 (JWT 클레임 X):

```
auth.uid() → memberships에서 사용자의 company_id들 조회 → 데이터 필터링
```

## 헬퍼 함수

Claude Code가 쿼리 작성할 때 활용:

```sql
-- 현재 사용자의 모든 company_id 배열
SELECT mochicraft_demo.current_company_ids();

-- 특정 회사에서의 내 role
SELECT mochicraft_demo.my_role('company-uuid-here');
```

## 확인 쿼리

```sql
-- 마이그레이션 상태 확인
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'mochicraft_demo') AS tables,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'mochicraft_demo') AS indexes,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'mochicraft_demo') AS triggers,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'mochicraft_demo') AS rls_policies,
  (SELECT COUNT(*) FROM mochicraft_demo.plans) AS plans_seeded;
```

기대 결과: `tables=20, indexes=75, triggers=19, rls_policies=31, plans_seeded=4`
