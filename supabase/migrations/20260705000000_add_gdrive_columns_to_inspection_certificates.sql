-- 시험검사번호 신청서 → 구글 스프레드시트 연동 지원 컬럼.
--
-- 🟠 google_drive_file_id: 최초 "시트 열기" 시 앱이 드라이브에 생성한 파일 ID.
--    NULL = 아직 시트로 변환·업로드되지 않은 상태.
-- 🟠 google_drive_synced_at: 마지막 "동기화" (드라이브 → OPS 덮어쓰기) 시각.
--    application_uploaded_at 이 최초 업로드/동기화 후 갱신되므로 별도 push_at 컬럼은 두지 않음.
-- 🟠 dev 단계 anon RLS 원칙 그대로 상속 (별도 GRANT/policy 추가 불필요).

ALTER TABLE mochicraft_demo.inspection_certificates
  ADD COLUMN google_drive_file_id text NULL,
  ADD COLUMN google_drive_synced_at timestamptz NULL;

NOTIFY pgrst, 'reload schema';
