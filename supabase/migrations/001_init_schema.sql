-- ============================================================
-- Migration 01: Schema + 20 tables
-- mochicraft_demo: SaaS 관리 대시보드 (엔젤러스 dogfooding)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS mochicraft_demo;

-- 공통 유틸 함수: updated_at 자동 갱신
CREATE OR REPLACE FUNCTION mochicraft_demo.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────── 인증/테넌트 그룹 ──────────

CREATE TABLE mochicraft_demo.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  business_number VARCHAR(20),
  industry VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','suspended')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  price_krw INTEGER NOT NULL,
  max_users INTEGER,
  max_products INTEGER,
  max_orders_per_month INTEGER,
  has_api_access BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES mochicraft_demo.user_profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

CREATE TABLE mochicraft_demo.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  plan_id VARCHAR(50) NOT NULL REFERENCES mochicraft_demo.plans(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('active','past_due','canceled')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  toss_billing_key VARCHAR(255),
  canceled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES mochicraft_demo.subscriptions(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('paid','failed','pending')),
  paid_at TIMESTAMPTZ,
  invoice_number VARCHAR(50) NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner','admin','member')),
  token VARCHAR(100) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES mochicraft_demo.user_profiles(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────── 비즈니스 마스터 ──────────

CREATE TABLE mochicraft_demo.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  business_number VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  representative VARCHAR(50),
  business_type VARCHAR(50),
  business_item VARCHAR(100),
  address TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  business_id UUID REFERENCES mochicraft_demo.businesses(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  contact1 VARCHAR(20),
  contact2 VARCHAR(20),
  email VARCHAR(255),
  delivery_address TEXT,
  grade VARCHAR(1) CHECK (grade IN ('A','B','C','D','E')),
  settlement_cycle VARCHAR(20),
  bank_aliases TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────── 판매 ──────────

CREATE TABLE mochicraft_demo.customer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES mochicraft_demo.customers(id) ON DELETE CASCADE,
  login_id VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, login_id)
);

CREATE TABLE mochicraft_demo.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  sell_price INTEGER NOT NULL,
  supply_price INTEGER NOT NULL,
  unit_price_usd NUMERIC(10,2),
  unit VARCHAR(20) NOT NULL DEFAULT 'ea',
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE TABLE mochicraft_demo.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES mochicraft_demo.customers(id),
  order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','shipped','done')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('manual','portal','ai')),
  memo TEXT,
  created_by UUID REFERENCES mochicraft_demo.user_profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES mochicraft_demo.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES mochicraft_demo.products(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  is_return BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────── 재고/매입 ──────────

CREATE TABLE mochicraft_demo.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES mochicraft_demo.products(id),
  lot_type VARCHAR(20) NOT NULL CHECK (lot_type IN ('opening','purchase','import')),
  quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  cost_krw INTEGER,
  cost_usd NUMERIC(10,2),
  lot_date TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES mochicraft_demo.products(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('out','return','damage')),
  quantity INTEGER NOT NULL,
  memo TEXT,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  po_number VARCHAR(50) NOT NULL,
  po_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  template_id VARCHAR(50) NOT NULL,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('USD','KRW','EUR')),
  total_amount NUMERIC(15,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','confirmed')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, po_number)
);

CREATE TABLE mochicraft_demo.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES mochicraft_demo.products(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('import','domestic')),
  quantity INTEGER NOT NULL,
  unit_cost_usd NUMERIC(10,2),
  exchange_rate NUMERIC(10,4),
  total_krw INTEGER NOT NULL,
  purchase_date TIMESTAMPTZ NOT NULL,
  purchase_order_id UUID REFERENCES mochicraft_demo.purchase_orders(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────── 재무 ──────────

CREATE TABLE mochicraft_demo.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES mochicraft_demo.customers(id) ON DELETE SET NULL,
  transaction_date TIMESTAMPTZ NOT NULL,
  amount INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('deposit','withdraw')),
  depositor_name VARCHAR(100),
  description TEXT,
  match_status VARCHAR(20) NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('matched','unmatched','excluded')),
  is_excluded BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mochicraft_demo.tax_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mochicraft_demo.companies(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES mochicraft_demo.businesses(id),
  invoice_year INTEGER NOT NULL,
  invoice_month INTEGER NOT NULL CHECK (invoice_month BETWEEN 1 AND 12),
  total_amount INTEGER NOT NULL,
  supply_amount INTEGER NOT NULL,
  vat_amount INTEGER NOT NULL,
  exported_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, invoice_year, invoice_month)
);
