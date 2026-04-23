-- ============================================================
-- Migration 04: RLS 정책 (기본 - company_id 기반)
-- role 상세 체크는 구현 단계에서 강화
-- ============================================================

-- ────────── 헬퍼 함수 ──────────

-- 현재 사용자가 속한 모든 company_id 조회
CREATE OR REPLACE FUNCTION mochicraft_demo.current_company_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY_AGG(company_id)
  FROM mochicraft_demo.memberships
  WHERE user_id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 특정 회사에서의 내 role 조회
CREATE OR REPLACE FUNCTION mochicraft_demo.my_role(p_company_id UUID)
RETURNS VARCHAR AS $$
  SELECT role FROM mochicraft_demo.memberships
  WHERE user_id = auth.uid() AND company_id = p_company_id AND deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ────────── RLS 활성화 ──────────

ALTER TABLE mochicraft_demo.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mochicraft_demo.tax_invoices ENABLE ROW LEVEL SECURITY;

-- ────────── 특수 케이스 ──────────

CREATE POLICY plans_select_all ON mochicraft_demo.plans FOR SELECT USING (true);

CREATE POLICY user_profiles_self_select ON mochicraft_demo.user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY user_profiles_self_update ON mochicraft_demo.user_profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY user_profiles_self_insert ON mochicraft_demo.user_profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY companies_member_select ON mochicraft_demo.companies FOR SELECT USING (id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY companies_owner_update ON mochicraft_demo.companies FOR UPDATE USING (mochicraft_demo.my_role(id) = 'owner');
CREATE POLICY companies_insert ON mochicraft_demo.companies FOR INSERT WITH CHECK (true);

CREATE POLICY memberships_self_select ON mochicraft_demo.memberships FOR SELECT USING (user_id = auth.uid() OR company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY memberships_admin_insert ON mochicraft_demo.memberships FOR INSERT WITH CHECK (user_id = auth.uid() OR mochicraft_demo.my_role(company_id) IN ('owner','admin'));
CREATE POLICY memberships_admin_update ON mochicraft_demo.memberships FOR UPDATE USING (mochicraft_demo.my_role(company_id) IN ('owner','admin'));
CREATE POLICY memberships_admin_delete ON mochicraft_demo.memberships FOR DELETE USING (mochicraft_demo.my_role(company_id) = 'owner');

-- ────────── 표준 company_id 정책 ──────────

CREATE POLICY subscriptions_tenant_select ON mochicraft_demo.subscriptions FOR SELECT USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY subscriptions_owner_write ON mochicraft_demo.subscriptions FOR ALL USING (mochicraft_demo.my_role(company_id) = 'owner');

CREATE POLICY invoices_tenant_select ON mochicraft_demo.invoices FOR SELECT USING (company_id = ANY(mochicraft_demo.current_company_ids()));

CREATE POLICY invitations_admin_all ON mochicraft_demo.invitations FOR ALL USING (mochicraft_demo.my_role(company_id) IN ('owner','admin'));

CREATE POLICY audit_logs_tenant_select ON mochicraft_demo.audit_logs FOR SELECT USING (company_id = ANY(mochicraft_demo.current_company_ids()));

CREATE POLICY businesses_tenant_all ON mochicraft_demo.businesses FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY customers_tenant_all ON mochicraft_demo.customers FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY customer_users_tenant_all ON mochicraft_demo.customer_users FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY products_tenant_all ON mochicraft_demo.products FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));

CREATE POLICY orders_tenant_select ON mochicraft_demo.orders FOR SELECT USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY orders_tenant_write ON mochicraft_demo.orders FOR INSERT WITH CHECK (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY orders_tenant_update ON mochicraft_demo.orders FOR UPDATE USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY orders_admin_delete ON mochicraft_demo.orders FOR DELETE USING (mochicraft_demo.my_role(company_id) IN ('owner','admin'));

CREATE POLICY order_items_tenant_all ON mochicraft_demo.order_items FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY inventory_lots_tenant_all ON mochicraft_demo.inventory_lots FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY inventory_transactions_tenant_all ON mochicraft_demo.inventory_transactions FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY purchase_orders_tenant_all ON mochicraft_demo.purchase_orders FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY purchases_tenant_all ON mochicraft_demo.purchases FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY bank_transactions_tenant_all ON mochicraft_demo.bank_transactions FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
CREATE POLICY tax_invoices_tenant_all ON mochicraft_demo.tax_invoices FOR ALL USING (company_id = ANY(mochicraft_demo.current_company_ids()));
