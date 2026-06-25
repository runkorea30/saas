/**
 * Customers 페이지 쿼리 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수 (RLS + 프론트 이중 방어).
 * 🔴 CLAUDE.md §2: 집계는 utils/calculations 의 calcCustomerAggregates 만 사용.
 * 🔴 CLAUDE.md §5: fetchAllRows 경유.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** 거래처가 속한 그룹의 세금계산서 발행 정보 (조인 결과). */
export interface CustomerGroupRef {
  name: string;
  billing_name: string;
  business_registration_number: string | null;
  sub_business_number: string | null;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
}

export interface Customer {
  id: string;
  name: string;
  grade: string | null;
  contact1: string | null;
  contact2: string | null;
  email: string | null;
  /** 청구서/거래명세서 PDF 자동 발송 수신 이메일. tax_email(세금계산서)과 별도. */
  billing_email: string | null;
  delivery_address: string | null;
  settlement_cycle: string | null;
  bank_aliases: string | null;
  is_active: boolean;
  created_at: string;
  group_id: string | null;
  // 세금계산서 발행 정보 (거래처별 override)
  business_registration_number: string | null;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
  business: CustomerBusinessRef | null;
  /** 그룹 소속 거래처일 때만 조인 결과. group_id IS NULL 이면 null. */
  customer_groups: CustomerGroupRef | null;
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

// ───────────────────────────────────────────────────────────
// useCustomers — 거래처 + businesses LEFT JOIN
// ───────────────────────────────────────────────────────────

const CUSTOMER_SELECT = `
  id, name, grade, contact1, contact2, email, billing_email, delivery_address,
  settlement_cycle, bank_aliases, is_active, created_at, group_id,
  business_registration_number, ceo_name,
  business_address, business_type, business_category, tax_email,
  business:businesses ( id, name, business_number ),
  customer_groups (
    name, billing_name,
    business_registration_number, sub_business_number, ceo_name,
    business_address, business_type, business_category, tax_email
  )
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
          .is('deleted_at', null),
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
          .limit(10),
      );
      return rows;
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// useUpdateCustomer — 거래처 수정
// ───────────────────────────────────────────────────────────

/** 거래처 편집 모달 등에서 부분 업데이트할 때 허용되는 필드 (group_id 제외 — 그룹 모달에서만 변경). */
export type CustomerUpdateInput = Partial<{
  name: string;
  grade: string | null;
  settlement_cycle: string | null;
  contact1: string | null;
  contact2: string | null;
  email: string | null;
  billing_email: string | null;
  delivery_address: string | null;
  bank_aliases: string | null;
  is_active: boolean;
  business_registration_number: string | null;
  ceo_name: string | null;
  business_address: string | null;
  business_type: string | null;
  business_category: string | null;
  tax_email: string | null;
}>;

export function useUpdateCustomer(companyId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: CustomerUpdateInput;
    }) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const { error } = await supabase
        .from('customers')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
    },
  });
}
