# 세션 핸드오프 (Session Handoff)

이 문서는 Claude와의 작업 세션을 이어가기 위한 공유 메모입니다.
대화가 끊기거나 새 대화를 열 때, Claude는 이 파일을 먼저 읽어 상태를 파악합니다.

---

## 📋 프로토콜

### 새 대화 시작 시 (Claude의 행동)
1. 이 파일의 **"현재 상태"**, **"다음 작업"** 섹션을 먼저 읽는다
2. 이전 세션에서 이어가는 작업임을 사용자에게 간단히 요약 보고
3. 바로 다음 작업 단계부터 시작

### 세션 종료 전 (Claude의 행동)
Claude는 종료 전에 다음을 업데이트해야 한다:
- **현재 상태** — 이번 세션에서 완료한 것
- **다음 작업** — 바로 다음에 해야 할 구체적인 단계
- **결정 필요 사항** — 사용자 확인이 필요한 항목
- **세션 로그** — 날짜 + 한 줄 요약

업데이트 후 반드시 커밋/푸시.

### 사용자 트리거 문구
- **"핸드오프 저장"** → 지금까지 작업을 이 파일에 반영 + commit + push
- **"이어서 작업"** → 이 파일 읽고 요약 + 다음 단계 제안

### 대화가 길어질 때
Claude는 정확한 컨텍스트 % 를 측정할 수 없다. 숫자 추측 금지.
대신, 긴 세션이 이어지면 **"슬슬 새 대화로 옮길 시점이에요"** 라고 경고하고, 핸드오프 저장을 제안한다.

---

## 🎯 프로젝트 개요

- **레포:** https://github.com/runkorea30/saas
- **목적:** MochiCraft OPS 데모 — 한국 소형 도매 유통업체(1–10인) 대상 B2B SaaS 관리 대시보드
- **Dogfooding 레퍼런스:** 엔젤러스(Angelus) 가죽용품 수입·유통업
- **스택:** React + Vite, Tailwind, shadcn/ui, Supabase, Vercel, GitHub, Claude Code

**Supabase**
- 프로젝트 ID: `adfobvwuzkufsmukdfrt`
- 스키마: `mochicraft_demo`
- 상태: 20 테이블 / 75 인덱스 / 19 트리거 / 31 RLS / 요금제 4종 시드 완료

**핵심 원칙**
- 멀티테넌시: `company_id` UUID + RLS (JWT claims 아님, memberships 테이블 기반)
- 요금제: Free / Starter ₩29K / Pro ₩79K / Business ₩199K

---

## ✅ 현재 상태

**최근 업데이트:** 2026-04-24

**완료:**
- Supabase 스키마 `mochicraft_demo` 전체 구축
- Claude Design 익스포트 (14개 React JSX + tokens.css) → `claude-design-bundle/` 에 포함
- 로컬 프로젝트 → GitHub `runkorea30/saas` 레포 초기 푸시 완료
- 커밋: `chore: initial project setup for saas` (Author: runkorea30)

**완료된 UI 페이지 (디자인 단계):**
- 홈 대시보드 (수평 상단 네비게이션)
- 주문 내역
- 고객

---

## ⏭️ 다음 작업: Claude Code 핸드오프 — 데이터 바인딩

1. Vite 프로젝트 초기화 (`claude-design-bundle/` JSX 통합)
2. Supabase 클라이언트 설정 (`@supabase/supabase-js`)
3. `.env` 파일 구성 (`.env.example` 참고)
4. 더미 데이터 → `useQuery` 훅으로 `mochicraft_demo` 스키마에 연결
5. 디자인 완료된 3개 페이지부터 먼저 바인딩

---

## ❓ 결정 필요 사항

- (없음)

---

## 📚 참고 / 주의사항

**한글 인코딩 (Windows PowerShell)**
기본 인코딩이 한글을 깨뜨림. 파일 수정 시 반드시 UTF-8 명시:
```powershell
[System.IO.File]::WriteAllText("$PWD\파일.md", ([System.IO.File]::ReadAllText("$PWD\파일.md") -replace '찾을문자', '바꿀문자'), [System.Text.UTF8Encoding]::new($false))
```

**MochiCraft 프론트엔드 자동 저장 충돌**
`project_data` 테이블을 직접 SQL로 수정하면 브라우저 탭이 열려있을 때 덮어쓰기됨.
벌크 스키마 업데이트는 MochiCraft UI의 Import 기능을 사용.

**MCP 도구 우회**
`mochi_generate_docs` / `mochi_update_design` 실패 시 ("Cannot coerce the result to a single JSON object" 에러) →
`Supabase:apply_migration` 또는 `Supabase:execute_sql` 직접 사용.

**마이그레이션 패턴**
큰 SQL 블록은 분할해서 순차 적용 (`_01_schema_and_tables`, `_02_indexes` 형태). 한 번에 올리는 것보다 안정적.

**대용량 JSONB 페이로드**
이스케이프 문제 회피를 위해 달러 쿼팅 사용: `$MOCHI_KR_V2$...$MOCHI_KR_V2$::jsonb`

**MochiCraft ↔ Claude Design 워크플로**
1. MochiCraft에서 DB 스키마·비즈니스 로직 먼저 설계
2. 그 스키마의 컬럼명을 Claude Design 프롬프트에 명시적으로 전달 (필드명 일치)
3. Claude Code가 데이터 바인딩 자동 처리
— 자동 연동 없음, 전부 수동.

---

## 📝 세션 로그

| 날짜 | 주요 작업 |
|------|-----------|
| 2026-04-24 | GitHub 레포 `saas` 생성 및 초기 푸시 완료, SESSION_HANDOFF 도입 |
