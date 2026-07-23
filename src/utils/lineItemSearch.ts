/**
 * 인보이스 line_items 제품코드/명 검색 공용 로직.
 * 엔젤러스인보이스 탭(직접) + 수입면장 탭(매칭 제품 인보이스 경유 간접)에서 공유.
 * - 항목 14: 제품코드 비교 시 하이픈('-') 무시 (코드 전용, 제품명은 원문 부분일치).
 * - 항목 15: 쉼표/공백으로 구분한 다중 검색어를 OR 로 매칭.
 */

/** 제품코드 비교용 정규화 — 하이픈 제거 + 소문자. */
export function normCode(s: string): string {
  return s.toLowerCase().replace(/-/g, '');
}

/** 검색어를 텀 배열로 파싱 — 쉼표/공백 구분, 소문자, 빈 텀 제외. */
export function parseSearchTerms(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 라인아이템 하나가 검색 텀 중 하나라도 매칭하는지(코드=하이픈무시, 명=부분일치, OR). */
export function lineItemMatchesTerms(
  code: string,
  name: string,
  terms: string[],
): boolean {
  if (terms.length === 0) return false;
  const codeN = normCode(code);
  const nameL = name.toLowerCase();
  return terms.some((t) => nameL.includes(t) || codeN.includes(normCode(t)));
}

/** extracted_metadata.line_items 가 검색 텀 중 하나라도 매칭하는지. */
export function metaLineItemsMatch(meta: unknown, terms: string[]): boolean {
  if (terms.length === 0 || !meta || typeof meta !== 'object') return false;
  const items = (meta as { line_items?: unknown }).line_items;
  if (!Array.isArray(items)) return false;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    if (
      lineItemMatchesTerms(String(o.code ?? ''), String(o.name ?? ''), terms)
    ) {
      return true;
    }
  }
  return false;
}
