-- recalculate_reorder_points RPC 를 리드타임(해상/FedEx) 파라미터화.
--
-- 배경 (2026-07-05):
--   기존 시그니처: recalculate_reorder_points(p_company_id UUID)
--   내부 CASE 문에 90 / 15 하드코딩. 사용자가 화면에서 리드타임을 조정해도
--   RPC 결과는 항상 90/15 기준이라 화면 표시와 DB 저장값이 어긋남.
--
-- 정책:
--   · 시그니처 확장: (uuid, integer DEFAULT 90, integer DEFAULT 15).
--   · CASE 문에서 하드코딩 → 파라미터 참조.
--   · 카테고리 목록 자체는 그대로 (해상: 2-1.레더다이, 2-2.스웨이드다이, 3-1.디글레이저).
--   · 파라미터 범위 방어: 프론트에서 clamp(1..365) 후 넘김. RPC 는 신뢰.
--
-- 시그니처가 바뀌므로 CREATE OR REPLACE 불가 → DROP 후 CREATE.

DROP FUNCTION IF EXISTS mochicraft_demo.recalculate_reorder_points(UUID);

CREATE OR REPLACE FUNCTION mochicraft_demo.recalculate_reorder_points(
  p_company_id UUID,
  p_sea_leadtime INTEGER DEFAULT 90,
  p_fedex_leadtime INTEGER DEFAULT 15
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mochicraft_demo, public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_since TIMESTAMPTZ := v_now - INTERVAL '180 days';
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  UPDATE mochicraft_demo.products p
  SET
    safety_stock = 0,
    reorder_point = GREATEST(
      0,
      ROUND(
        COALESCE((
          SELECT
            SUM(CASE WHEN oi.is_return THEN -oi.quantity ELSE oi.quantity END)::numeric / 180
          FROM mochicraft_demo.order_items oi
          JOIN mochicraft_demo.orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id
            AND oi.deleted_at IS NULL
            AND o.deleted_at IS NULL
            AND o.status <> 'canceled'
            AND o.company_id = p_company_id
            AND o.order_date >= v_since
        ), 0) *
        CASE
          WHEN p.category IN ('2-1.레더다이', '2-2.스웨이드다이', '3-1.디글레이저') THEN p_sea_leadtime
          ELSE p_fedex_leadtime
        END
      )::integer
    ),
    updated_at = v_now
  WHERE p.company_id = p_company_id;

  RETURN v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION mochicraft_demo.recalculate_reorder_points(UUID, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION mochicraft_demo.recalculate_reorder_points(UUID, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
