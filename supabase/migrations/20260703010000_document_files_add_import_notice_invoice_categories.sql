-- document_files.category CHECK 제약에 안내 설정용 두 카테고리 추가.
--  이전 CHECK 는 import_declaration / angelus_invoice / chemical / other / certificate_of_origin 만 허용.
--  "입고처리로 이관" 이 인보이스 PDF 를 거래처 안내 설정(항공/해상) 슬롯에 복사·등록할 때
--  import_notice_invoice_air / import_notice_invoice_sea 로 INSERT 하는데, allowlist 에 없어
--  23514(check_violation) 로 조용히 실패하고 있었다.

ALTER TABLE mochicraft_demo.document_files
  DROP CONSTRAINT IF EXISTS document_files_category_check;

ALTER TABLE mochicraft_demo.document_files
  ADD CONSTRAINT document_files_category_check CHECK (
    category = ANY (ARRAY[
      'import_declaration'::text,
      'angelus_invoice'::text,
      'chemical'::text,
      'other'::text,
      'certificate_of_origin'::text,
      'import_notice_invoice_air'::text,
      'import_notice_invoice_sea'::text
    ])
  );

NOTIFY pgrst, 'reload schema';
