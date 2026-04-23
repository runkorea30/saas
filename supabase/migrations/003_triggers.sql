-- ============================================================
-- Migration 03: updated_at 자동 갱신 트리거
-- audit_logs 제외 (immutable)
-- ============================================================

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON mochicraft_demo.companies FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON mochicraft_demo.user_profiles FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON mochicraft_demo.plans FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_memberships_updated_at BEFORE UPDATE ON mochicraft_demo.memberships FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON mochicraft_demo.subscriptions FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON mochicraft_demo.invoices FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_invitations_updated_at BEFORE UPDATE ON mochicraft_demo.invitations FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON mochicraft_demo.businesses FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON mochicraft_demo.customers FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_customer_users_updated_at BEFORE UPDATE ON mochicraft_demo.customer_users FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON mochicraft_demo.products FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON mochicraft_demo.orders FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_order_items_updated_at BEFORE UPDATE ON mochicraft_demo.order_items FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_inventory_lots_updated_at BEFORE UPDATE ON mochicraft_demo.inventory_lots FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_inventory_transactions_updated_at BEFORE UPDATE ON mochicraft_demo.inventory_transactions FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON mochicraft_demo.purchase_orders FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON mochicraft_demo.purchases FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_bank_transactions_updated_at BEFORE UPDATE ON mochicraft_demo.bank_transactions FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
CREATE TRIGGER trg_tax_invoices_updated_at BEFORE UPDATE ON mochicraft_demo.tax_invoices FOR EACH ROW EXECUTE FUNCTION mochicraft_demo.set_updated_at();
