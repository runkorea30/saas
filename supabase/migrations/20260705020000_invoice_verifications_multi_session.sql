-- invoice_verifications: 회사당 1행 UNIQUE → 회사당 여러 세션 지원.
--
-- 배경 (Phase 1 조사):
--   현재는 UNIQUE(company_id) 라 미확정 이관(transfer_rows) 이 있는 상태에서
--   새 발주서를 뽑으면 그 행이 그대로 덮어써져 "곧 입고될 수량" 정보가 유실.
--
-- 정책 (2026-07-05 확정):
--   · resolved_at TIMESTAMPTZ NULL — 입고확정 완료 시각. NULL 이면 아직 미확정.
--   · UNIQUE(company_id, invoice_no) partial (WHERE invoice_no <> '') — 같은
--     회사에서 동일 invoice_no 중복 방지. 빈 문자열(사용자가 아직 인보이스 번호
--     입력 전인 드래프트 세션)은 여러 개 허용 (일시적 상태).
--   · 기존 데이터 마이그레이션: 남은 1행은 그대로 resolved_at=NULL (미확정 유지).
--
-- 클라이언트 계약 변경:
--   · InvoiceUploadCard 는 이제 session id (PK) 로 UPDATE. company_id 로만
--     upsert 하던 기존 방식은 다중 세션에서 잘못된 행을 덮어쓸 위험.
--   · 입고확정(useCreateImportWithLots) 성공 시 해당 invoice_no 의 세션 행에
--     resolved_at=now() 설정하고 transfer_rows=[] 로 정리.

-- 1) resolved_at 컬럼 추가.
ALTER TABLE mochicraft_demo.invoice_verifications
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN mochicraft_demo.invoice_verifications.resolved_at IS
  '입고확정 완료 시각. NULL 이면 아직 미확정(진행중 또는 이관됨/미확정).';

-- 2) 기존 UNIQUE(company_id) 제거.
ALTER TABLE mochicraft_demo.invoice_verifications
  DROP CONSTRAINT IF EXISTS invoice_verifications_company_id_key;

-- 3) 새 파셜 UNIQUE 추가 — invoice_no 가 있는 경우에만 (company_id, invoice_no) 유일성.
DROP INDEX IF EXISTS mochicraft_demo.invoice_verifications_company_invoice_uniq;
CREATE UNIQUE INDEX invoice_verifications_company_invoice_uniq
  ON mochicraft_demo.invoice_verifications (company_id, invoice_no)
  WHERE invoice_no <> '';

-- 4) 조회 성능 — 회사별 미확정 세션 리스팅에 필요.
CREATE INDEX IF NOT EXISTS invoice_verifications_company_unresolved_idx
  ON mochicraft_demo.invoice_verifications (company_id, updated_at DESC)
  WHERE resolved_at IS NULL;

NOTIFY pgrst, 'reload schema';
