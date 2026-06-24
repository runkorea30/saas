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
  /** 제품 카테고리 — 거래명세서에서 sub-header 그룹핑 키. */
  category?: string | null;
  /** 카탈로그 판매가 — 거래명세서 "판매가" 컬럼 출력용. */
  sell_price?: number;
  /** 거래처 등급별 공급율 (A~E). 거래명세서에서 unit_price × grade_X 로 공급가 계산. */
  grade_a?: number | null;
  grade_b?: number | null;
  grade_c?: number | null;
  grade_d?: number | null;
  grade_e?: number | null;
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
  /** 계산된 공급가(원). 거래처 등급 × 제품 공급율 × unit_price 결과. 0 이면 미설정. */
  supply_price?: number;
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

/**
 * 상세 패널 편집 모드의 임시 행 모델.
 * useOrderItems 결과를 평탄화한 형태 + `_dirty`/`_isNew` 트래킹 필드 추가.
 */
export interface OrderItemDraft {
  id: string;
  company_id: string;
  order_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  deleted_at: string | null;
  product_code: string;
  product_name: string;
  /** products.sell_price (카탈로그 판매가). */
  sell_price: number;
  /** 계산된 공급가(원). 거래처 등급 × 제품 공급율 × unit_price 결과. */
  supply_price: number;
  /** 제품의 등급별 공급율 (A~E). useOrderItems JOIN에서 채워짐. */
  grade_a: number;
  grade_b: number;
  grade_c: number;
  grade_d: number;
  grade_e: number;
  _dirty: boolean;
  _isNew: boolean;
}
