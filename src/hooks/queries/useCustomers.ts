/**
 * Customers 페이지 쿼리 훅 3종.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 (RLS + 프론트 이중 방어).
 * 🔴 CLAUDE.md §2: 집계는 utils/calculations 의 calcCustomerAggregates 만 사용.
 * 🔴 CLAUDE.md §5: fetchAllRows 경유.
 */
import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  calcCustomerAggregates,
  type CustomerAggregate,
} from '@/utils/calculations';
import { compareCompanyName } from '@/utils/koreanSort';

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

export interface CustomerBusinessRef {
  id: string;
  name: string;
  business_number: string;
}

export interface Customer {
  id: string;
  name: string;
  grade: string | null;
  contact1: string | null;
  contact2: string | null;
  email: string | null;
  delivery_address: string | null;
  settlement_cycle: string | null;
  bank_aliases: string | null;
  is_active: boolean;
  created_at: string;
  business: CustomerBusinessRef | null;
}

export interface CustomerOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  product: { code: string; name: string } | null;
}

export interface CustomerOrder {
  id: string;
  order_date: string;
  total_amount: number;
  status: string;
  items: CustomerOrderItem[];
}

type RangeableQuery<T> = {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
};

// ───────────────────────────────────────────────────────────
// useCustomers — 거래처 + businesses LEFT JOIN
// ───────────────────────────────────────────────────────────

const CUSTOMER_SELECT = `
  id, name, grade, contact1, contact2, email, delivery_address,
  settlement_cycle, bank_aliases, is_active, created_at,
  business:businesses ( id, name, business_number )
`;

export function useCustomers(companyId: string | null) {
  return useQuery<Customer[]>({
    queryKey: ['customers', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<Customer>(() =>
        supabase
          .from('customers')
          .select(CUSTOMER_SELECT)
          .eq('company_id', companyId!)
          .is('deleted_at', null) as unknown as RangeableQuery<Customer>,
      );
      // 서버 ORDER BY 대신 클라이언트에서 한글 상호명 기준 정렬 —
      // "(주)" 같은 접두사를 정렬 키에서 제외.
      return [...rows].sort((a, b) => compareCompanyName(a.name, b.name));
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// useCustomerAggregates — customer_id → 집계 맵
// ───────────────────────────────────────────────────────────

export function useCustomerAggregates(companyId: string | null) {
  return useQuery<Map<string, CustomerAggregate>>({
    queryKey: ['customer-aggregates', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const list = await calcCustomerAggregates(companyId!);
      return new Map(list.map((a) => [a.customer_id, a]));
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// useCustomerOrders — Detail Pane 용 최근 10건
// ───────────────────────────────────────────────────────────

const CUSTOMER_ORDERS_SELECT = `
  id, order_date, total_amount, status,
  items:order_items (
    id, product_id, quantity, unit_price, amount, is_return,
    product:products ( code, name )
  )
`;

export function useCustomerOrders(
  companyId: string | null,
  customerId: string | null,
) {
  return useQuery<CustomerOrder[]>({
    queryKey: ['customer-orders', companyId, customerId],
    enabled: Boolean(companyId && customerId),
    queryFn: async () => {
      const rows = await fetchAllRows<CustomerOrder>(() =>
        supabase
          .from('orders')
          .select(CUSTOMER_ORDERS_SELECT)
          .eq('company_id', companyId!)
          .eq('customer_id', customerId!)
          .is('deleted_at', null)
          .order('order_date', { ascending: false })
          .limit(10) as unknown as RangeableQuery<CustomerOrder>,
      );
      return rows;
    },
    staleTime: 60_000,
  });
}
