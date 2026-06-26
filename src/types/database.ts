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
          exclude_reason: string | null
          id: string
          is_excluded: boolean
          match_status: string
          match_type: string | null
          moved_to_monthly: boolean
          target_sales_month: string | null
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
          exclude_reason?: string | null
          id?: string
          is_excluded?: boolean
          match_status?: string
          match_type?: string | null
          moved_to_monthly?: boolean
          target_sales_month?: string | null
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
          exclude_reason?: string | null
          id?: string
          is_excluded?: boolean
          match_status?: string
          match_type?: string | null
          moved_to_monthly?: boolean
          target_sales_month?: string | null
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
      bank_transaction_splits: {
        Row: {
          amount: number
          bank_transaction_id: string
          company_id: string
          created_at: string
          id: string
          memo: string | null
          target_sales_month: string
        }
        Insert: {
          amount: number
          bank_transaction_id: string
          company_id: string
          created_at?: string
          id?: string
          memo?: string | null
          target_sales_month: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string
          company_id?: string
          created_at?: string
          id?: string
          memo?: string | null
          target_sales_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transaction_splits_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_splits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_mappings: {
        Row: {
          bank_name: string
          company_id: string
          created_at: string
          customer_id: string | null
          customer_name: string
          id: string
          updated_at: string
        }
        Insert: {
          bank_name: string
          company_id: string
          created_at?: string
          customer_id?: string | null
          customer_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          bank_name?: string
          company_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_mappings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_exclude_keywords: {
        Row: {
          company_id: string
          created_at: string
          id: string
          keyword: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          keyword: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          keyword?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_exclude_keywords_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          import_notice_arrival_text: string | null
          import_notice_customs_date: string | null
          import_notice_date: string | null
          import_notice_order_date: string | null
          import_notice_products: Json
          import_notice_sea_arrival_text: string | null
          import_notice_sea_customs_date: string | null
          import_notice_sea_order_date: string | null
          import_notice_sea_products: Json
          import_notice_sea_ship_date: string | null
          import_notice_sea_status: string | null
          import_notice_ship_date: string | null
          import_notice_status: string | null
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
          import_notice_arrival_text?: string | null
          import_notice_customs_date?: string | null
          import_notice_date?: string | null
          import_notice_order_date?: string | null
          import_notice_products?: Json
          import_notice_sea_arrival_text?: string | null
          import_notice_sea_customs_date?: string | null
          import_notice_sea_order_date?: string | null
          import_notice_sea_products?: Json
          import_notice_sea_ship_date?: string | null
          import_notice_sea_status?: string | null
          import_notice_ship_date?: string | null
          import_notice_status?: string | null
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
          import_notice_arrival_text?: string | null
          import_notice_customs_date?: string | null
          import_notice_date?: string | null
          import_notice_order_date?: string | null
          import_notice_products?: Json
          import_notice_sea_arrival_text?: string | null
          import_notice_sea_customs_date?: string | null
          import_notice_sea_order_date?: string | null
          import_notice_sea_products?: Json
          import_notice_sea_ship_date?: string | null
          import_notice_sea_status?: string | null
          import_notice_ship_date?: string | null
          import_notice_status?: string | null
          industry?: string | null
          name?: string
          status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_order_uploads: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          file_name: string | null
          file_url: string | null
          id: string
          items: Json | null
          message: string | null
          shipping_info: Json | null
          status: string
          upload_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          items?: Json | null
          message?: string | null
          shipping_info?: Json | null
          status?: string
          upload_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          items?: Json | null
          message?: string | null
          shipping_info?: Json | null
          status?: string
          upload_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_uploads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      customer_groups: {
        Row: {
          billing_name: string
          business_address: string | null
          business_category: string | null
          business_registration_number: string | null
          business_type: string | null
          ceo_name: string | null
          company_id: string
          created_at: string
          deduction_note: string | null
          id: string
          monthly_deduction: number
          name: string
          sub_business_number: string | null
          tax_email: string | null
          updated_at: string
        }
        Insert: {
          billing_name: string
          business_address?: string | null
          business_category?: string | null
          business_registration_number?: string | null
          business_type?: string | null
          ceo_name?: string | null
          company_id: string
          created_at?: string
          deduction_note?: string | null
          id?: string
          monthly_deduction?: number
          name: string
          sub_business_number?: string | null
          tax_email?: string | null
          updated_at?: string
        }
        Update: {
          billing_name?: string
          business_address?: string | null
          business_category?: string | null
          business_registration_number?: string | null
          business_type?: string | null
          ceo_name?: string | null
          company_id?: string
          created_at?: string
          deduction_note?: string | null
          id?: string
          monthly_deduction?: number
          name?: string
          sub_business_number?: string | null
          tax_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          bank_aliases: string | null
          billing_email: string | null
          business_address: string | null
          business_category: string | null
          business_id: string | null
          business_registration_number: string | null
          business_type: string | null
          ceo_name: string | null
          company_id: string
          contact1: string | null
          contact2: string | null
          created_at: string
          deleted_at: string | null
          delivery_address: string | null
          email: string | null
          grade: string | null
          group_id: string | null
          id: string
          is_active: boolean
          login_id: string | null
          login_password: string | null
          match_type: string
          name: string
          settlement_cycle: string | null
          tax_email: string | null
          updated_at: string
        }
        Insert: {
          bank_aliases?: string | null
          billing_email?: string | null
          business_address?: string | null
          business_category?: string | null
          business_id?: string | null
          business_registration_number?: string | null
          business_type?: string | null
          ceo_name?: string | null
          company_id: string
          contact1?: string | null
          contact2?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_address?: string | null
          email?: string | null
          grade?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          login_id?: string | null
          login_password?: string | null
          match_type?: string
          name: string
          settlement_cycle?: string | null
          tax_email?: string | null
          updated_at?: string
        }
        Update: {
          bank_aliases?: string | null
          billing_email?: string | null
          business_address?: string | null
          business_category?: string | null
          business_id?: string | null
          business_registration_number?: string | null
          business_type?: string | null
          ceo_name?: string | null
          company_id?: string
          contact1?: string | null
          contact2?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_address?: string | null
          email?: string | null
          grade?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          login_id?: string | null
          login_password?: string | null
          match_type?: string
          name?: string
          settlement_cycle?: string | null
          tax_email?: string | null
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
          {
            foreignKeyName: "customers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_id: string | null
          deduction_applied: number
          group_id: string | null
          id: string
          note: string | null
          paid_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          customer_id?: string | null
          deduction_applied?: number
          group_id?: string | null
          id?: string
          note?: string | null
          paid_at: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          customer_id?: string | null
          deduction_applied?: number
          group_id?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_payments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
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
          grade_a: number | null
          grade_b: number | null
          grade_c: number | null
          grade_d: number | null
          grade_e: number | null
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          reorder_point: number | null
          safety_stock: number | null
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
          grade_a?: number | null
          grade_b?: number | null
          grade_c?: number | null
          grade_d?: number | null
          grade_e?: number | null
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          reorder_point?: number | null
          safety_stock?: number | null
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
          grade_a?: number | null
          grade_b?: number | null
          grade_c?: number | null
          grade_d?: number | null
          grade_e?: number | null
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          reorder_point?: number | null
          safety_stock?: number | null
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
      purchase_order_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          unit_price_usd: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity?: number
          unit_price_usd?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          unit_price_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          company_id: string
          created_at: string
          customer_group_id: string | null
          customer_id: string | null
          deleted_at: string | null
          id: string
          invoice_month: number
          invoice_type: string
          invoice_year: number
          issued_at: string | null
          memo: string | null
          payment_type: string
          status: string
          supply_amount: number
          total_amount: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_group_id?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          invoice_month: number
          invoice_type?: string
          invoice_year: number
          issued_at?: string | null
          memo?: string | null
          payment_type?: string
          status?: string
          supply_amount: number
          total_amount: number
          updated_at?: string
          vat_amount: number
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_group_id?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          invoice_month?: number
          invoice_type?: string
          invoice_year?: number
          issued_at?: string | null
          memo?: string | null
          payment_type?: string
          status?: string
          supply_amount?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_invoices_customer_group_id_fkey"
            columns: ["customer_group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      document_files: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          memo: string | null
          mime_type: string | null
          uploaded_at: string | null
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          memo?: string | null
          mime_type?: string | null
          uploaded_at?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          memo?: string | null
          mime_type?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_certificates: {
        Row: {
          company_id: string
          created_at: string | null
          hs_no: string | null
          id: string
          import_req_no: string | null
          import_valid_until: string | null
          inspection_no: string | null
          inspection_valid_until: string | null
          product_name: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          hs_no?: string | null
          id?: string
          import_req_no?: string | null
          import_valid_until?: string | null
          inspection_no?: string | null
          inspection_valid_until?: string | null
          product_name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          hs_no?: string | null
          id?: string
          import_req_no?: string | null
          import_valid_until?: string | null
          inspection_no?: string | null
          inspection_valid_until?: string | null
          product_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_certificates_company_id_fkey"
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
      receivables_summary: {
        Row: {
          billing_name: string
          company_id: string
          deduction_note: string | null
          display_name: string
          entity_key: string
          group_id: string | null
          is_group: boolean
          monthly_deduction: number
          outstanding: number
          total_billed: number
          total_paid: number
        }
        Relationships: []
      }
    }
    Functions: {
      current_company_ids: { Args: never; Returns: string[] }
      my_role: { Args: { p_company_id: string }; Returns: string }
      create_stock_adjustment: {
        Args: {
          p_company_id: string
          p_product_id: string
          p_quantity: number
          p_memo: string | null
          p_date: string
        }
        Returns: undefined
      }
      insert_order: {
        Args: {
          p_company_id: string
          p_customer_id: string
          p_order_date: string
          p_source: string
          p_status: string
          p_memo: string | null
          p_items: Json
        }
        Returns: string
      }
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

// ── 은행거래 / 미수금 ──────────────────────────────

export interface BankTransaction {
  id: string;
  company_id: string;
  customer_id: string | null;
  transaction_date: string;         // 'YYYY-MM-DD'
  amount: number;
  type: 'deposit' | 'withdraw';
  depositor_name: string | null;
  description: string | null;
  match_status: 'matched' | 'unmatched' | 'excluded';
  is_excluded: boolean;
  exclude_reason: string | null;
  match_type: '자동' | '수동' | '매핑' | null;
  moved_to_monthly: boolean;
  target_sales_month: string | null;   // 'YYYY-MM' 수동 지정 매출월, null이면 자동 매칭
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // 쿼리 시 JOIN 확장
  customer?: {
    id: string;
    name: string;
    payment_cycle: '당월' | '익월' | '2개월';
    match_type: 'monthly' | 'daily';
  };
}

export interface BankMapping {
  id: string;
  company_id: string;
  bank_name: string;
  customer_id: string | null;
  customer_name: string;
  created_at: string;
  updated_at: string;
}

export interface BankExcludeKeyword {
  id: string;
  company_id: string;
  keyword: string;
  created_at: string;
}

export interface BankTransactionSplit {
  id: string;
  company_id: string;
  bank_transaction_id: string;
  target_sales_month: string;       // 'YYYY-MM'
  amount: number;                   // 귀속 금액
  memo: string | null;
  created_at: string;
}

export interface MonthlyReconciliation {
  customer_id: string;
  customer_name: string;
  payment_cycle: '당월' | '익월' | '2개월';
  month: string;                    // 'YYYY-MM' — 매출월
  due_date: string;                 // 정산 마감일
  sales_total: number;
  deposit_total: number;
  deposit_dates: string[];          // 해당 매출월에 매칭된 입금일 목록 ('YYYY-MM-DD', 오름차순)
  difference: number;               // sales_total - deposit_total
  is_overdue: boolean;
  status: '정산완료' | '정산대기' | '연체';
}

export interface ReceivableCard {
  customer_id: string;
  customer_name: string;
  payment_cycle: '당월' | '익월' | '2개월';
  total_sales: number;
  total_deposit: number;
  pending_amount: number;           // due_date 안 된 미수
  overdue_amount: number;           // due_date 지난 연체
  last_deposit_date: string | null;
  badge: '위험' | '경고' | '정상';
  monthly_detail: MonthlyReconciliation[];
}
