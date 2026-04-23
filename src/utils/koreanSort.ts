/**
 * 한국 회사·거래처명 정렬 유틸.
 *
 * 🟠 CLAUDE.md §8: 같은 로직 여러 파일에 복사 금지 — 거래처/공급처/사업자명 정렬에 공용 사용.
 *
 * 정렬 키에서 접두사 "(주)", "(유)", "(재)", "(사)", "(합)", "주식회사", "유한회사",
 * "재단법인", "사단법인", "합자회사" 를 제거하여 실제 상호명 기준으로 비교한다.
 * 표시되는 이름은 건드리지 않는다 — 정렬 키로만 사용.
 */

const COMPANY_PREFIXES = [
  '주식회사',
  '유한회사',
  '재단법인',
  '사단법인',
  '합자회사',
  '(주)',
  '(유)',
  '(재)',
  '(사)',
  '(합)',
];

export function companyNameSortKey(name: string): string {
  let s = name.trim();
  for (const p of COMPANY_PREFIXES) {
    if (s.startsWith(p)) {
      return s.slice(p.length).trim();
    }
  }
  return s;
}

/** `Array.sort` 비교자. 한글 로케일 기준 오름차순. */
export function compareCompanyName(a: string, b: string): number {
  return companyNameSortKey(a).localeCompare(companyNameSortKey(b), 'ko');
}
