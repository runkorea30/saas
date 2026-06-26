/**
 * 제품 정렬 유틸 — 분류명 → 제품명 오름차순 (한글 locale).
 *
 * 🟠 CLAUDE.md §8: 같은 로직 여러 파일에 복사 금지 —
 *    재고현황/발주서/제품리스트/매출분석 의 제품 정렬에 공용 사용.
 */

/**
 * 분류명 → 제품명 한글 오름차순 비교자.
 * `ProductSalesRow` 처럼 필드명이 `product_name` 인 경우에 직접 사용한다.
 */
export function compareCategoryThenName(
  catA: string | null | undefined,
  nameA: string,
  catB: string | null | undefined,
  nameB: string,
): number {
  const a = (catA ?? '').toLowerCase();
  const b = (catB ?? '').toLowerCase();
  if (a !== b) return a.localeCompare(b, 'ko');
  return nameA.toLowerCase().localeCompare(nameB.toLowerCase(), 'ko');
}

/**
 * `{ category, name }` 형태 아이템 배열을 분류명 → 제품명 오름차순으로 정렬.
 * 원본 배열은 변경하지 않는다.
 */
export function sortByCategory<
  T extends { category?: string | null; name: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    compareCategoryThenName(a.category, a.name, b.category, b.name),
  );
}
