# saas 프로젝트 지침

## 프로젝트 개요
MochiCraft OPS 데모 — 한국 소형 도매 유통업체(1–10인) 대상 B2B SaaS 관리 대시보드.
엔젤러스(Angelus) 가죽용품 수입·유통업을 dogfooding 레퍼런스로 삼음.

**레포:** https://github.com/runkorea30/saas
**스택:** React + Vite, Tailwind, shadcn/ui, Supabase, Vercel, GitHub, Claude Code
**Supabase:** 프로젝트 `adfobvwuzkufsmukdfrt`, 스키마 `mochicraft_demo`

---

## Claude의 행동 규칙

### 1. 세션 시작 시
- `docs/SESSION_HANDOFF.md` 를 먼저 확인하고 **"현재 상태"**, **"다음 작업"** 섹션을 읽은 뒤 작업 시작
- 사용자에게 한 줄로 "지난번 어디까지, 이번엔 뭐부터" 요약

### 2. 세션 종료 전
사용자가 **"핸드오프 저장"** 이라고 말하면:
- `docs/SESSION_HANDOFF.md` 의 **현재 상태 / 다음 작업 / 세션 로그** 를 이번 세션 내용으로 업데이트
- 변경분 commit + push

### 3. 컨텍스트 관리
- Claude는 자신의 컨텍스트 사용량(%)을 측정할 수 없음. **절대 추측 금지.**
- 대화가 길어지면 "슬슬 새 대화로 옮길 시점이에요" 라고 경고하고 **"핸드오프 저장"** 을 제안

### 4. 지시 방식
- 터미널 명령어는 **한 번에 하나씩**만 안내 (여러 명령어 한 번에 X)
- 복잡한 선택지는 A/B/C 로 명시
- 명령어 결과를 사용자가 붙여넣은 뒤 다음 단계로 진행

### 5. 호칭
- 사용자 이름: **양시혁** (운영 계정명: `runkorea30`)
- "JH" 등 불확실한 약칭 사용 금지

### 6. 환경 주의사항
- 사용자는 **Windows + PowerShell** 환경
- 한글 포함 파일 수정 시 반드시 **UTF-8 명시** (기본 인코딩이 한글을 깨뜨림):
  ```powershell
  [System.IO.File]::WriteAllText("$PWD\파일", ([System.IO.File]::ReadAllText("$PWD\파일") -replace 'a', 'b'), [System.Text.UTF8Encoding]::new($false))
  ```

### 7. 제약 및 우회
- MochiCraft `project_data` 직접 SQL 수정 시 → 브라우저 탭 닫혀 있어야 함 (열려있으면 프론트가 덮어씀)
- 벌크 스키마 업데이트는 MochiCraft UI의 Import 기능 사용
- MCP 도구 `mochi_generate_docs` / `mochi_update_design` 실패 시 → `Supabase:apply_migration` 또는 `execute_sql` 직접 사용
- 큰 SQL은 분할 마이그레이션으로 (`_01_`, `_02_` 순차)

---

## 답변 스타일
- 정직 우선. 모르는 건 모른다고. 추측한 숫자·사실 만들어내지 않기.
- 불필요한 사과·과잉 확인 금지
- 간결하게, 필요한 것만
