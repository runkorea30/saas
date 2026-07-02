-- 인보이스 검증 세션에 Storage 원본 PDF 경로 컬럼 추가.
--  invoice_file_name 은 기존대로 표시용 파일명. invoice_file_path 는 documents 버킷 실제 경로.
--  "입고처리로 이관" 시 이 경로의 파일을 안내 설정 슬롯(document_files) 으로 복사한다.

ALTER TABLE mochicraft_demo.invoice_verifications
  ADD COLUMN IF NOT EXISTS invoice_file_path TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON mochicraft_demo.invoice_verifications
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
