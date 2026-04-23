/**
 * 제품 카테고리 — 영/한 매핑 단일 진입점.
 *
 * - DB 저장값은 영문 키 (`paint` / `sewing` / `finish` / `tool`).
 * - 모든 화면 표시는 이 파일의 `getCategoryLabel()` 또는 `CATEGORY_OPTIONS` 경유.
 * - DB에 4개 이외의 레거시/사용자 정의 카테고리가 있으면 `getCategoryLabel`은
 *   매핑이 없을 때 원본 키를 그대로 반환 → 안전 폴백.
 *
 * 🔴 CLAUDE.md §8: 같은 로직 여러 파일 복사 금지. 새 카테고리를 추가해야 하면
 *    반드시 이 파일만 수정할 것.
 */

export const PRODUCT_CATEGORIES = ['paint', 'sewing', 'finish', 'tool'] as const;

export type ProductCategoryKey = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ProductCategoryKey, string> = {
  paint: '페인트',
  sewing: '소잉',
  finish: '마감재',
  tool: '공구',
};

/**
 * 카테고리 키 → 한글 라벨. 매핑이 없으면 원본 키 반환.
 *
 * 사용자 커스텀 카테고리("직접 입력" 모드)나 레거시 데이터에도 안전.
 */
export function getCategoryLabel(key: string): string {
  return (CATEGORY_LABELS as Record<string, string>)[key] ?? key;
}

/**
 * `<select>` 전용 옵션 배열. value 는 DB 저장값(영문), label 은 한글.
 */
export const CATEGORY_OPTIONS: ReadonlyArray<{
  value: ProductCategoryKey;
  label: string;
}> = PRODUCT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

/**
 * 주어진 문자열이 표준 카테고리 키인지 타입 가드.
 */
export function isStandardCategory(key: string): key is ProductCategoryKey {
  return (PRODUCT_CATEGORIES as ReadonlyArray<string>).includes(key);
}
