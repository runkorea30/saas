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
  /** 재고부족 강제조정 전 원래 주문수량. null 이면 조정 이력 없음(정상). */
  original_quantity?: number | null;
  unit_price: number;
  amount: number;
  is_return: boolean;
  /** 계산된 공급가(원). 거래처 등급 × 제품 공급율 × unit_price 결과. 0 이면 미설정. */
  supply_price?: number;
  product: OrderProductRef | null;
}

/**
 * 주문 직송 정보 1행. orders.shipping_info JSONB 에 배열로 저장.
 * 거래처 포털의 ShippingRow + customer/credit 자동필드를 보존한 그대로.
 */
export interface OrderShippingEntry {
  name?: string | null;
  zipcode?: string | null;
  address?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  blank?: string | null;
  product?: string | null;
  customer?: string | null;
  credit?: string | null;
}

export interface Order {
  id: string;
  order_date: string; // ISO
  /** 주문 생성 시각. 같은 날짜+거래처 주문의 본주문/추가주문 판별에 사용. */
  created_at: string; // ISO
  total_amount: number;
  status: OrderStatus;
  source: OrderSource;
  /** 거래처가 포털에서 작성하는 메모 (거래처 노출). */
  memo: string | null;
  /** 내부 전용 메모 (직원↔직원). 거래처 포털 SELECT 에 절대 포함 금지. */
  internal_note: string | null;
  /**
   * 운송장 번호 배열. 거의 1건이지만 복수 등록 가능. orders.tracking_numbers (jsonb).
   * 각 항목은 `{ carrier, number }` 객체 — carrier 코드 정의는
   * `src/utils/shippingCarriers.ts` 의 CarrierCode 참조.
   */
  tracking_numbers?: import('@/utils/shippingCarriers').TrackingEntry[] | null;
  /** 거래처가 첨부한 이미지/PDF의 public URL. 품목 0건 + 값 존재 → "이미지파일 대기" 주문. */
  attachment_url?: string | null;
  /** 직송 여부 — true 이면 OPS 주문내역에서 "직송" 뱃지 표시. */
  is_direct_shipping?: boolean | null;
  /** 직송 정보 배열. JSONB 컬럼 — Supabase 가 객체로 디시리얼라이즈해서 반환. */
  shipping_info?: OrderShippingEntry[] | null;
  /** 4단계 상태 전환 타임스탬프 (2026-07 도입). null = 해당 단계 미도달. */
  received_at?: string | null;
  confirmed_at?: string | null;
  processing_at?: string | null;
  shipped_at?: string | null;
  created_by: string | null;
  customer: OrderCustomerRef | null;
  creator: OrderCreatorRef | null;
  items: OrderItem[];
}

/**
 * 그룹핑된 주문 — 같은 날짜+거래처 묶음에서의 위치 정보 포함.
 * isAdditional=true 면 같은 묶음의 본주문보다 늦게 생성된 추가주문.
 */
export interface OrderWithGroupInfo extends Order {
  isAdditional: boolean;
  groupSize: number;
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
