-- ============================================================
-- Migration 05: 기본 요금제 4종 시드
-- ============================================================

INSERT INTO mochicraft_demo.plans (id, name, price_krw, max_users, max_products, max_orders_per_month, has_api_access, is_active) VALUES
  ('free',       'Free',         0,       1,     50,    100,   false, true),
  ('starter',    'Starter',      29000,   3,     500,   1000,  false, true),
  ('pro',        'Pro',          79000,   10,    NULL,  NULL,  true,  true),
  ('business',   'Business',     199000,  NULL,  NULL,  NULL,  true,  true)
ON CONFLICT (id) DO NOTHING;
