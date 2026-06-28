/**
 * 은행 거래 한 건을 분류 규칙에 매칭해 카테고리/제외 결정.
 *
 * 규칙은 sort_order 오름차순으로 평가하며, 먼저 매칭된 규칙이 채택.
 * 매칭이 없고 입금만 있는 행은 'deposit' 사유로 자동 제외.
 * 매칭 없는 출금 행은 미분류(pl_category_id=null, is_excluded=false) — 사용자가 리뷰에서 처리.
 */
import type { ParsedBankRow } from './parseBankXls';

export interface ClassifyRule {
  id: string;
  keyword: string;
  /** 'counterpart' | 'description' | 'both' */
  match_field: string;
  /** 'categorize' | 'exclude' */
  action: string;
  pl_category_id: string | null;
  exclude_reason: string | null;
  sort_order: number;
}

export interface ClassifyResult {
  pl_category_id: string | null;
  is_excluded: boolean;
  exclude_reason: string | null;
}

export function classifyRow(
  row: ParsedBankRow,
  rules: ReadonlyArray<ClassifyRule>,
): ClassifyResult {
  const sorted = [...rules].sort((a, b) => a.sort_order - b.sort_order);

  const counterpart = row.counterpart.toLowerCase();
  const description = row.description.toLowerCase();

  for (const rule of sorted) {
    const kw = rule.keyword.toLowerCase();
    if (!kw) continue;

    let matched = false;
    if (rule.match_field === 'counterpart') {
      matched = counterpart.includes(kw);
    } else if (rule.match_field === 'description') {
      matched = description.includes(kw);
    } else {
      matched = counterpart.includes(kw) || description.includes(kw);
    }

    if (!matched) continue;

    if (rule.action === 'exclude') {
      return {
        pl_category_id: null,
        is_excluded: true,
        exclude_reason: rule.exclude_reason,
      };
    }
    return {
      pl_category_id: rule.pl_category_id,
      is_excluded: false,
      exclude_reason: null,
    };
  }

  // 매칭 규칙 없음 — 입금-only 는 자동 제외, 출금은 미분류로 사용자 처리.
  if (row.deposit > 0 && row.withdrawal === 0) {
    return {
      pl_category_id: null,
      is_excluded: true,
      exclude_reason: 'deposit',
    };
  }
  return {
    pl_category_id: null,
    is_excluded: false,
    exclude_reason: null,
  };
}
