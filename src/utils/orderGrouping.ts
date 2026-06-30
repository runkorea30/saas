/**
 * 주문 거래명세서 출력 단위 — 같은 거래처(customer_id) + 같은 날짜(order_date 의
 * 날짜 부분, 시간 무관) 주문은 항상 하나의 묶음.
 *
 * 호출처:
 * - 체크박스 토글: 한 행 클릭 시 같은 그룹의 모든 id 동시 체크/해제
 * - 우클릭 컨텍스트 메뉴: "거래명세서 출력" 시 같은 그룹 전체 포함
 *
 * customer 가 null 인 행은 어떤 다른 행과도 묶이지 않음(자기 자신만) — 거래처
 * 미지정 주문이 우연히 같은 날짜라는 이유만으로 합쳐지지 않도록 fake unique 키 사용.
 */

interface GroupableOrder {
  id: string;
  order_date: string; // ISO timestamp 또는 'YYYY-MM-DD' 형식
  customer: { id: string } | null;
}

interface GroupableWithCreatedAt extends GroupableOrder {
  created_at: string; // 그룹 내 정렬용
}

function groupKeyOf(order: GroupableOrder): string {
  const dateKey = order.order_date.slice(0, 10);
  const customerKey = order.customer?.id ?? `__no_customer_${order.id}`;
  return `${dateKey}__${customerKey}`;
}

/**
 * `orders` 안에서 `targetOrderId` 와 같은 거래처+같은 날짜인 모든 주문 id 를
 * 반환. 매칭 행이 없으면 `[targetOrderId]` 폴백.
 */
export function getSameDayCustomerOrderIds(
  orders: readonly GroupableOrder[],
  targetOrderId: string,
): string[] {
  const target = orders.find((o) => o.id === targetOrderId);
  if (!target) return [targetOrderId];
  const targetKey = groupKeyOf(target);
  const ids: string[] = [];
  for (const o of orders) {
    if (groupKeyOf(o) === targetKey) ids.push(o.id);
  }
  return ids.length > 0 ? ids : [targetOrderId];
}

/**
 * `orders` 를 (customer_id, order_date 의 날짜부분) 키로 그룹핑해 nested 배열 반환.
 * 각 그룹 내부는 created_at 오름차순(본주문 → 추가주문 순). 그룹 자체의 정렬은
 * 호출자가 결정 — 시간순/최신순 등 용도에 따라 다름.
 */
export function groupOrdersByCustomerAndDate<T extends GroupableWithCreatedAt>(
  orders: readonly T[],
): T[][] {
  const map = new Map<string, T[]>();
  for (const o of orders) {
    const k = groupKeyOf(o);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }
  return groups;
}
