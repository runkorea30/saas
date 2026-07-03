-- 인보이스 → 입고처리 이관 시 태그 자동 동기화용 RPC.
-- 기존 목록에 없는 코드만 append. 원자적 UPDATE 로 race 방지.
-- p_is_sea = true 면 sea_products, 아니면 (항공/페덱스) products 컬럼.
--
-- 코드 매칭 정규화 규칙: 프론트 normalizeCode() 와 일치
--   String(code).trim().replace(/-/g,'').replace(/\s/g,'').toLowerCase()
-- → SQL 에서는 regexp_replace(lower(code), '[-\s]', '', 'g') 로 재현.

CREATE OR REPLACE FUNCTION mochicraft_demo.append_import_notice_products(
  p_company_id UUID,
  p_items JSONB,
  p_is_sea BOOLEAN
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mochicraft_demo, public
AS $$
DECLARE
  v_col_products JSONB;
  v_new_items JSONB;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- 대상 컬럼 현재값 (row lock)
  IF p_is_sea THEN
    SELECT COALESCE(import_notice_sea_products, '[]'::jsonb)
      INTO v_col_products
    FROM mochicraft_demo.companies
    WHERE id = p_company_id
    FOR UPDATE;
  ELSE
    SELECT COALESCE(import_notice_products, '[]'::jsonb)
      INTO v_col_products
    FROM mochicraft_demo.companies
    WHERE id = p_company_id
    FOR UPDATE;
  END IF;

  IF v_col_products IS NULL THEN
    RAISE EXCEPTION 'company % not found', p_company_id;
  END IF;

  -- p_items 중 v_col_products 에 없는 것만 필터 (정규화된 code 비교)
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
    INTO v_new_items
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) x
  WHERE
    (x ->> 'code') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_col_products) e
      WHERE regexp_replace(lower(e ->> 'code'), '[-\s]', '', 'g')
          = regexp_replace(lower(x ->> 'code'), '[-\s]', '', 'g')
    );

  IF jsonb_array_length(v_new_items) = 0 THEN
    RETURN;
  END IF;

  -- append. updated_at 은 트리거가 있으면 자동, 없으면 여기서 갱신.
  IF p_is_sea THEN
    UPDATE mochicraft_demo.companies
    SET import_notice_sea_products = v_col_products || v_new_items,
        updated_at = NOW()
    WHERE id = p_company_id;
  ELSE
    UPDATE mochicraft_demo.companies
    SET import_notice_products = v_col_products || v_new_items,
        updated_at = NOW()
    WHERE id = p_company_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION mochicraft_demo.append_import_notice_products(UUID, JSONB, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION mochicraft_demo.append_import_notice_products(UUID, JSONB, BOOLEAN) TO authenticated;

-- PostgREST 스키마 캐시 즉시 리로드 — 이거 없으면 신규 함수가 anon 클라이언트에서 안 보임.
NOTIFY pgrst, 'reload schema';
