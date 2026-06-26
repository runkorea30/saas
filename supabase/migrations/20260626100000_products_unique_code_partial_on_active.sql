-- products.(company_id, code) UNIQUE 를 soft-delete 무시 partial unique 로 전환.
-- 기존 plain UNIQUE 는 deleted_at IS NOT NULL 행까지 잡아서, 삭제된 코드의 재사용을 막던 버그였다.
-- 활성 행끼리는 여전히 UNIQUE 가 강제됨 (WHERE deleted_at IS NULL).

ALTER TABLE mochicraft_demo.products
  DROP CONSTRAINT IF EXISTS products_company_id_code_key;

CREATE UNIQUE INDEX products_company_id_code_key
  ON mochicraft_demo.products (company_id, code)
  WHERE deleted_at IS NULL;
