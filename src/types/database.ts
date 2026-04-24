export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  mochicraft_demo: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          depositor_name: string | null
          description: string | null
          id: string
          is_excluded: boolean
          match_status: string
          transaction_date: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          depositor_name?: string | null
          description?: string | null
          id?: string
          is_excluded?: boolean
          match_status?: string
          transaction_date: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          depositor_name?: string | null
          description?: string | null
          id?: string
          is_excluded?: boolean
          match_status?: string
          transaction_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          business_item: string | null
          business_number: string
          business_type: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          representative: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_item?: string | null
          business_number: string
          business_type?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          representative?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_item?: string | null
          business_number?: string
          business_type?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          representative?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          business_number: string | null
          created_at: string
          deleted_at: string | null
          id: string
          industry: string | null
          name: string
          status: string
          trial_ends_at: string
          updated_at: string
        }
        Insert: {
          business_number?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          industry?: string | null
          name: string
          status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Update: {
          business_number?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_users: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          login_id: string
          password_hash: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          login_id: string
          password_hash: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          login_id?: string
          password_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          bank_aliases: string | null
          business_id: string | null
          company_id: string
          contact1: string | null
          contact2: string | null
          created_at: string
          deleted_at: string | null
          delivery_address: string | null
          email: string | null
          grade: string | null
          id: string
          is_active: boolean
          name: string
          settlement_cycle: string | null
          updated_at: string
        }
        Insert: {
          bank_aliases?: string | null
          business_id?: string | null
          company_id: string
          contact1?: string | null
          contact2?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_address?: string | null
          email?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean
          name: string
          settlement_cycle?: string | null
          updated_at?: string
        }
        Update: {
          bank_aliases?: string | null
          business_id?: string | null
          company_id?: string
          contact1?: string | null
          contact2?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_address?: string | null
          email?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean
          name?: string
          settlement_cycle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_invoices: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          exchange_rate: number
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          shipping_cost_usd: number
          supplier_name: string | null
          total_usd: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          exchange_rate: number
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          shipping_cost_usd?: number
          supplier_name?: string | null
          total_usd?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          exchange_rate?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          shipping_cost_usd?: number
          supplier_name?: string | null
          total_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          company_id: string
          cost_krw: number | null
          cost_usd: number | null
          created_at: string
          deleted_at: string | null
          id: string
          invoice_id: string | null
          lot_date: string
          lot_type: string
          product_id: string
          quantity: number
          remaining_quantity: number
          shipping_allocated_usd: number | null
          source_code: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          cost_krw?: number | null
          cost_usd?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          lot_date: string
          lot_type: string
          product_id: string
          quantity: number
          remaining_quantity: number
          shipping_allocated_usd?: number | null
          source_code?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost_krw?: number | null
          cost_usd?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          lot_date?: string
          lot_type?: string
          product_id?: string
          quantity?: number
          remaining_quantity?: number
          shipping_allocated_usd?: number | null
          source_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "import_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          memo: string | null
          product_id: string
          quantity: number
          transaction_date: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          memo?: string | null
          product_id: string
          quantity: number
          transaction_date?: string
          type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          memo?: string | null
          product_id?: string
          quantity?: number
          transaction_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          email: string
          expires_at: string
          id: string
          role: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          email: string
          expires_at: string
          id?: string
          role: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          invoice_number: string
          paid_at: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_number: string
          paid_at?: string | null
          status: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_number?: string
          paid_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_return: boolean
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_return?: boolean
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_return?: boolean
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          memo: string | null
          order_date: string
          source: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          memo?: string | null
          order_date?: string
          source: string
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          memo?: string | null
          order_date?: string
          source?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          has_api_access: boolean
          id: string
          is_active: boolean
          max_orders_per_month: number | null
          max_products: number | null
          max_users: number | null
          name: string
          price_krw: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          has_api_access?: boolean
          id: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_products?: number | null
          max_users?: number | null
          name: string
          price_krw: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          has_api_access?: boolean
          id?: string
          is_active?: boolean
          max_orders_per_month?: number | null
          max_products?: number | null
          max_users?: number | null
          name?: string
          price_krw?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          code: string
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          sell_price: number
          supply_price: number
          unit: string
          unit_price_usd: number | null
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          sell_price: number
          supply_price: number
          unit?: string
          unit_price_usd?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sell_price?: number
          supply_price?: number
          unit?: string
          unit_price_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          po_date: string
          po_number: string
          status: string
          template_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency: string
          deleted_at?: string | null
          id?: string
          po_date?: string
          po_number: string
          status?: string
          template_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          po_date?: string
          po_number?: string
          status?: string
          template_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          exchange_rate: number | null
          id: string
          product_id: string
          purchase_date: string
          purchase_order_id: string | null
          quantity: number
          total_krw: number
          type: string
          unit_cost_usd: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          exchange_rate?: number | null
          id?: string
          product_id: string
          purchase_date: string
          purchase_order_id?: string | null
          quantity: number
          total_krw: number
          type: string
          unit_cost_usd?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          exchange_rate?: number | null
          id?: string
          product_id?: string
          purchase_date?: string
          purchase_order_id?: string | null
          quantity?: number
          total_krw?: number
          type?: string
          unit_cost_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          canceled_at: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          deleted_at: string | null
          id: string
          plan_id: string
          status: string
          toss_billing_key: string | null
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          company_id: string
          created_at?: string
          current_period_end: string
          current_period_start: string
          deleted_at?: string | null
          id?: string
          plan_id: string
          status: string
          toss_billing_key?: string | null
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          deleted_at?: string | null
          id?: string
          plan_id?: string
          status?: string
          toss_billing_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_invoices: {
        Row: {
          business_id: string
          company_id: string
          created_at: string
          deleted_at: string | null
          exported_at: string | null
          id: string
          invoice_month: number
          invoice_year: number
          supply_amount: number
          total_amount: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          business_id: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          exported_at?: string | null
          id?: string
          invoice_month: number
          invoice_year: number
          supply_amount: number
          total_amount: number
          updated_at?: string
          vat_amount: number
        }
        Update: {
          business_id?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          exported_at?: string | null
          id?: string
          invoice_month?: number
          invoice_year?: number
          supply_amount?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          is_super_admin: boolean
          last_login_at: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          id: string
          is_super_admin?: boolean
          last_login_at?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          is_super_admin?: boolean
          last_login_at?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_ids: { Args: never; Returns: string[] }
      my_role: { Args: { p_company_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  mochicraft_demo: {
    Enums: {},
  },
} as const
