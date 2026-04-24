ALTER TABLE mochicraft_demo.products
  ADD COLUMN IF NOT EXISTS safety_stock integer NULL,
  ADD COLUMN IF NOT EXISTS reorder_point integer NULL;

COMMENT ON COLUMN mochicraft_demo.products.safety_stock IS '안전재고 하한선 (개수). NULL이면 미설정.';
COMMENT ON COLUMN mochicraft_demo.products.reorder_point IS '발주 트리거 수량 (개수). NULL이면 미설정. 일반적으로 safety_stock보다 높게 설정.';
