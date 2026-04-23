-- ============================================================
-- Migration 02: 기본 인덱스
-- company_id 필수, FK 인덱스, 자주 쓰는 컬럼 (status/date)
-- ============================================================

CREATE INDEX idx_memberships_company_id ON mochicraft_demo.memberships(company_id);
CREATE INDEX idx_memberships_user_id ON mochicraft_demo.memberships(user_id);
CREATE INDEX idx_subscriptions_company_id ON mochicraft_demo.subscriptions(company_id);
CREATE INDEX idx_subscriptions_status ON mochicraft_demo.subscriptions(status);
CREATE INDEX idx_invoices_company_id ON mochicraft_demo.invoices(company_id);
CREATE INDEX idx_invoices_subscription_id ON mochicraft_demo.invoices(subscription_id);
CREATE INDEX idx_invitations_company_id ON mochicraft_demo.invitations(company_id);
CREATE INDEX idx_invitations_token ON mochicraft_demo.invitations(token);
CREATE INDEX idx_audit_logs_company_id ON mochicraft_demo.audit_logs(company_id);
CREATE INDEX idx_audit_logs_actor_id ON mochicraft_demo.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON mochicraft_demo.audit_logs(created_at DESC);

CREATE INDEX idx_businesses_company_id ON mochicraft_demo.businesses(company_id);
CREATE INDEX idx_customers_company_id ON mochicraft_demo.customers(company_id);
CREATE INDEX idx_customers_business_id ON mochicraft_demo.customers(business_id);
CREATE INDEX idx_customers_is_active ON mochicraft_demo.customers(is_active);
CREATE INDEX idx_customer_users_company_id ON mochicraft_demo.customer_users(company_id);
CREATE INDEX idx_customer_users_customer_id ON mochicraft_demo.customer_users(customer_id);

CREATE INDEX idx_products_company_id ON mochicraft_demo.products(company_id);
CREATE INDEX idx_products_is_active ON mochicraft_demo.products(is_active);
CREATE INDEX idx_products_category ON mochicraft_demo.products(category);

CREATE INDEX idx_orders_company_id ON mochicraft_demo.orders(company_id);
CREATE INDEX idx_orders_customer_id ON mochicraft_demo.orders(customer_id);
CREATE INDEX idx_orders_status ON mochicraft_demo.orders(status);
CREATE INDEX idx_orders_order_date ON mochicraft_demo.orders(order_date DESC);
CREATE INDEX idx_orders_created_by ON mochicraft_demo.orders(created_by);

CREATE INDEX idx_order_items_company_id ON mochicraft_demo.order_items(company_id);
CREATE INDEX idx_order_items_order_id ON mochicraft_demo.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON mochicraft_demo.order_items(product_id);

CREATE INDEX idx_inventory_lots_company_id ON mochicraft_demo.inventory_lots(company_id);
CREATE INDEX idx_inventory_lots_product_id ON mochicraft_demo.inventory_lots(product_id);
CREATE INDEX idx_inventory_lots_lot_date ON mochicraft_demo.inventory_lots(lot_date);
CREATE INDEX idx_inventory_lots_remaining ON mochicraft_demo.inventory_lots(product_id, lot_date) WHERE remaining_quantity > 0;

CREATE INDEX idx_inventory_transactions_company_id ON mochicraft_demo.inventory_transactions(company_id);
CREATE INDEX idx_inventory_transactions_product_id ON mochicraft_demo.inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_date ON mochicraft_demo.inventory_transactions(transaction_date DESC);

CREATE INDEX idx_purchase_orders_company_id ON mochicraft_demo.purchase_orders(company_id);
CREATE INDEX idx_purchase_orders_status ON mochicraft_demo.purchase_orders(status);
CREATE INDEX idx_purchase_orders_po_date ON mochicraft_demo.purchase_orders(po_date DESC);

CREATE INDEX idx_purchases_company_id ON mochicraft_demo.purchases(company_id);
CREATE INDEX idx_purchases_product_id ON mochicraft_demo.purchases(product_id);
CREATE INDEX idx_purchases_purchase_order_id ON mochicraft_demo.purchases(purchase_order_id);
CREATE INDEX idx_purchases_date ON mochicraft_demo.purchases(purchase_date DESC);

CREATE INDEX idx_bank_transactions_company_id ON mochicraft_demo.bank_transactions(company_id);
CREATE INDEX idx_bank_transactions_customer_id ON mochicraft_demo.bank_transactions(customer_id);
CREATE INDEX idx_bank_transactions_match_status ON mochicraft_demo.bank_transactions(match_status);
CREATE INDEX idx_bank_transactions_date ON mochicraft_demo.bank_transactions(transaction_date DESC);

CREATE INDEX idx_tax_invoices_company_id ON mochicraft_demo.tax_invoices(company_id);
CREATE INDEX idx_tax_invoices_business_id ON mochicraft_demo.tax_invoices(business_id);
CREATE INDEX idx_tax_invoices_year_month ON mochicraft_demo.tax_invoices(invoice_year DESC, invoice_month DESC);
