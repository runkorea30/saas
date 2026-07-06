/**
 * 송장대장 이관용 행 생성 유틸.
 *
 * 규칙(런코리아 승인):
 * - 선택된 주문들을 customer_id + order_date(KST 날짜만) 기준으로 그룹핑
 *   (`groupOrdersByCustomerAndDate` 재사용)
 * - 그룹 안에서 `is_direct_shipping === true` 인 주문은 건별 개별행 (shipping_info[0] 사용)
 * - 나머지는 그룹당 1행으로 합쳐서 customers 정보(name/delivery_address/contact1)로 채움
 * - `product`(물품명) 는 항상 공란, `brand` 는 항상 '엔젤러스' (규칙 3,5)
 * - `credit`(결제유형) 은 직송/일반 상관없이 항상 '신용' (상수 취급 — brand 와 동일 원칙)
 *
 * 순수함수 — DB 접근 없음. useSaveShippingInvoices() 가 이 결과를 받아 INSERT.
 */
import { groupOrdersByCustomerAndDate } from '@/utils/orderGrouping';
import type { Order, OrderShippingEntry } from '@/types/orders';

export const BRAND_CONST = '엔젤러스';
export const CREDIT_CONST = '신용';

export interface ShippingInvoiceRow {
  customerId: string | null;
  sourceOrderIds: string[];
  isDirect: boolean;
  orderDate: string; // YYYY-MM-DD (KST)
  recipientName: string;
  phone: string;
  phone2: string;
  address: string;
  zipcode: string;
  customerName: string;
  credit: string;
  brand: string; // 항상 BRAND_CONST
  product: string; // 항상 '' (규칙 3)
}

interface CustomerLite {
  id: string;
  name: string;
  delivery_address: string | null;
  contact1: string | null;
}

/** ISO/`YYYY-MM-DD` 를 KST 날짜 문자열로 통일. `orderGrouping` 과 동일 규칙. */
function toKstDateKey(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input.slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * shipping_info 배열 첫 원소에서 배송 필드 안전 추출.
 * credit 은 상수(CREDIT_CONST)로 고정하므로 shipping_info.credit 은 무시.
 */
function pickDirectShipping(entry: OrderShippingEntry | undefined) {
  return {
    recipientName: entry?.name?.trim() ?? '',
    phone: entry?.phone1?.trim() ?? '',
    phone2: entry?.phone2?.trim() ?? '',
    address: entry?.address?.trim() ?? '',
    zipcode: entry?.zipcode?.trim() ?? '',
    customerName: entry?.customer?.trim() ?? '',
  };
}

// ────────────────────────────────────────────────────────────
// 매핑 서브함수 — 그룹 경로 / 단일 경로가 모두 재사용.
// ────────────────────────────────────────────────────────────

/**
 * 직송 주문 → shipping_info 원소 하나당 송장 행 하나 매핑.
 * `groupCustomerId` / `groupCustomerName` 은 소속 그룹 컨텍스트(단일 경로에서는
 * 그 주문 자기 자신의 customer). shipping_info 에 customer 값이 있으면 그것을 우선.
 */
function mapDirectOrderRows(
  order: Order,
  dateKey: string,
  groupCustomerId: string | null,
  groupCustomerName: string,
): ShippingInvoiceRow[] {
  const entries: OrderShippingEntry[] = Array.isArray(order.shipping_info)
    ? order.shipping_info
    : [];
  const list = entries.length > 0 ? entries : [undefined];
  const out: ShippingInvoiceRow[] = [];
  for (const entry of list) {
    const s = pickDirectShipping(entry ?? undefined);
    out.push({
      customerId: groupCustomerId,
      sourceOrderIds: [order.id],
      isDirect: true,
      orderDate: dateKey,
      recipientName: s.recipientName,
      phone: s.phone,
      phone2: s.phone2,
      address: s.address,
      zipcode: s.zipcode,
      customerName: s.customerName || groupCustomerName,
      credit: CREDIT_CONST,
      brand: BRAND_CONST,
      product: '',
    });
  }
  return out;
}

/**
 * 일반(비직송) 주문들 → 하나의 묶음 송장 행 매핑.
 * 여러 주문을 하나로 합칠 때(그룹 경로) 는 sourceOrderIds 가 여러 개, 단일 경로에서는 한 개.
 * 배송정보는 customers 마스터(delivery_address/contact1) 만 사용 — 주문 자체의
 * shipping_info 는 참조하지 않음(비직송에는 대개 없음).
 */
function mapNormalGroupRow(
  orderIds: readonly string[],
  dateKey: string,
  groupCustomerId: string | null,
  groupCustomerName: string,
  customer: CustomerLite | null,
): ShippingInvoiceRow {
  const custName = customer?.name ?? groupCustomerName;
  return {
    customerId: groupCustomerId,
    sourceOrderIds: [...orderIds],
    isDirect: false,
    orderDate: dateKey,
    recipientName: custName,
    phone: customer?.contact1?.trim() ?? '',
    phone2: '',
    address: customer?.delivery_address?.trim() ?? '',
    zipcode: '',
    customerName: custName,
    credit: CREDIT_CONST,
    brand: BRAND_CONST,
    product: '',
  };
}

/**
 * 선택된 주문 id 목록에서 송장 행을 계산.
 *
 * @param orders 전체(또는 필터된) 주문 목록. customer + order_date + created_at
 *   + is_direct_shipping + shipping_info 필드 필요.
 * @param customers 회사 전체 거래처. 일반 묶음 배송정보 소스.
 * @param selectedOrderIds 사용자가 체크/우클릭으로 선택한 주문 id.
 */
export function buildShippingInvoiceRows(
  orders: readonly Order[],
  customers: readonly CustomerLite[],
  selectedOrderIds: readonly string[],
): ShippingInvoiceRow[] {
  const idSet = new Set(selectedOrderIds);
  const selected = orders.filter((o) => idSet.has(o.id));
  if (selected.length === 0) return [];

  // customer_id 로 접근 편의 위해 map 화.
  const customerById = new Map<string, CustomerLite>();
  for (const c of customers) customerById.set(c.id, c);

  const groups = groupOrdersByCustomerAndDate(selected as Order[]);
  const rows: ShippingInvoiceRow[] = [];

  for (const group of groups) {
    if (group.length === 0) continue;
    const first = group[0];
    const dateKey = toKstDateKey(first.order_date);
    const groupCustomerId = first.customer?.id ?? null;
    const groupCustomerName = first.customer?.name ?? '';

    const directOrders = group.filter((o) => o.is_direct_shipping === true);
    const normalOrders = group.filter((o) => o.is_direct_shipping !== true);

    // 직송: 건별 개별행 (shipping_info 원소 개수만큼).
    for (const o of directOrders) {
      rows.push(...mapDirectOrderRows(o, dateKey, groupCustomerId, groupCustomerName));
    }

    // 일반: 그룹당 1행. 거래처 마스터에서 주소/연락처.
    if (normalOrders.length > 0) {
      const cust = groupCustomerId ? (customerById.get(groupCustomerId) ?? null) : null;
      rows.push(
        mapNormalGroupRow(
          normalOrders.map((o) => o.id),
          dateKey,
          groupCustomerId,
          groupCustomerName,
          cust,
        ),
      );
    }
  }

  return rows;
}

/**
 * 그룹핑을 건너뛰고 주문 1건만으로 송장 행을 계산 — "이 주문만 송장대장 이관" 경로.
 *
 * - 우클릭한 그 주문 하나만 대상. 같은 거래처+같은 날짜의 다른 주문(체크된 것 포함)
 *   은 완전히 무시.
 * - 직송이면 그 주문의 shipping_info 로 1행 (원소가 여러 개면 그 수만큼 개별행 —
 *   그룹 경로와 동일 규칙).
 * - 일반이면 customer 마스터 기준으로 1행. sourceOrderIds 는 [order.id] 하나만.
 *
 * 매핑 로직은 `mapDirectOrderRows` / `mapNormalGroupRow` 재사용.
 */
export function buildSingleOrderShippingInvoiceRows(
  order: Order,
  customers: readonly CustomerLite[],
): ShippingInvoiceRow[] {
  const dateKey = toKstDateKey(order.order_date);
  const groupCustomerId = order.customer?.id ?? null;
  const groupCustomerName = order.customer?.name ?? '';

  if (order.is_direct_shipping === true) {
    return mapDirectOrderRows(order, dateKey, groupCustomerId, groupCustomerName);
  }

  const cust = groupCustomerId
    ? (customers.find((c) => c.id === groupCustomerId) ?? null)
    : null;
  return [mapNormalGroupRow([order.id], dateKey, groupCustomerId, groupCustomerName, cust)];
}
