/**
 * Orders 페이지 전용 타입. Phase 3에서 `supabase gen types typescript --schema mochicraft_demo`
 * 로 덮어쓰기 전까지 수작업 정의.
 */
import type { OrderSource, OrderStatus } from './common';

export interface OrderCustomerRef {
  id: string;
  name: string;
  grade: string | null;
}

export interface OrderProductRef {
  id: string;
  code: string;
  name: string;
}

export interface OrderCreatorRef {
  id: string;
  name: string;
}

export interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  product: OrderProductRef | null;
}

export interface Order {
  id: string;
  order_date: string; // ISO
  total_amount: number;
  status: OrderStatus;
  source: OrderSource;
  memo: string | null;
  created_by: string | null;
  customer: OrderCustomerRef | null;
  creator: OrderCreatorRef | null;
  items: OrderItem[];
}

export type PeriodKey = 'today' | 'week' | 'month' | 'lastmonth' | '90d' | 'custom';

export interface DateRange {
  /** ISO 문자열, 포함 시작 (.gte) */
  start: string;
  /** ISO 문자열, 미포함 끝 (.lt) */
  end: string;
}

export type SourceFilter = 'all' | OrderSource;
