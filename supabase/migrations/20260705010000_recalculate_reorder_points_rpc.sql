-- 재주문점 자동 재계산 RPC.
--
-- 정책 (2026-07-05 확정):
--   safety_stock = 0 고정 (안전재고 미반영).
--   reorder_point = ROUND(일평균판매량 × 리드타임(일)).
--     · 일평균판매량 = 최근 180일 순판매수량 / 180
--       (순판매 = SUM(quantity WHERE is_return=false) - SUM(quantity WHERE is_return=true)).
--     · 리드타임 = 카테고리 기준
--         '2-1.레더다이', '2-2.스웨이드다이', '3-1.디글레이저' → 90일 (해상 수입)
--         그 외 → 15일 (FedEx 항공)
--   `orders.deleted_at IS NULL` AND `status <> 'canceled'` AND `order_items.deleted_at IS NULL`
--   6개월 판매이력 없는 품목은 daily_avg = 0 → reorder_point = 0.
--
-- 반환값: 계산 완료 시각(now()) — 프론트에서 "마지막 계산" 배너에 사용.
-- SECURITY DEFINER 로 실행되어 anon 클라이언트에서도 호출 가능.

CREATE OR REPLACE FUNCTION mochicraft_demo.recalculate_reorder_points(p_company_id UUID)
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
          WHEN p.category IN ('2-1.레더다이', '2-2.스웨이드다이', '3-1.디글레이저') THEN 90
          ELSE 15
        END
      )::integer
    ),
    updated_at = v_now
  WHERE p.company_id = p_company_id;

  RETURN v_now;
END;
$$;

GRANT EXECUTE ON FUNCTION mochicraft_demo.recalculate_reorder_points(UUID) TO anon;
GRANT EXECUTE ON FUNCTION mochicraft_demo.recalculate_reorder_points(UUID) TO authenticated;

-- PostgREST 스키마 캐시 즉시 리로드 — 이거 없으면 신규 함수가 anon 클라이언트에서 안 보임.
NOTIFY pgrst, 'reload schema';
