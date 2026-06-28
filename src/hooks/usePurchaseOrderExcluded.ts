/**
 * 발주 예상에서 제외할 카테고리 목록 — 공용 훅.
 *
 * TopNav 헤더 위젯과 발주서 페이지가 동일 localStorage key 를 공유하여
 * 어디서 토글하든 새로고침 후 양쪽에 일관 반영된다.
 *
 * 🟠 cross-tab/cross-component 실시간 동기화는 하지 않음 — 페이지 진입(마운트)
 *    시점에 localStorage 를 읽는 것으로 충분.
 */
import { useState } from 'react';

const STORAGE_KEY = 'purchaseOrderExcludedCategories';

/** 초기값 — 해상(선박) 수입 카테고리 3종. */
export const DEFAULT_EXCLUDED: readonly string[] = [
  '2-1.레더다이',
  '2-2.스웨이드다이',
  '3-1.디글레이저',
];

function load(): Set<string> {
  if (typeof window === 'undefined') return new Set(DEFAULT_EXCLUDED);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return new Set(DEFAULT_EXCLUDED);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(DEFAULT_EXCLUDED);
    return new Set(arr.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set(DEFAULT_EXCLUDED);
  }
}

function save(set: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* localStorage 사용 불가 환경 — 무시. */
  }
}

export interface UsePurchaseOrderExcludedResult {
  excluded: Set<string>;
  toggle: (cat: string) => void;
  includeAll: () => void;
  restoreDefault: () => void;
}

export function usePurchaseOrderExcluded(): UsePurchaseOrderExcludedResult {
  const [excluded, setExcluded] = useState<Set<string>>(load);

  const toggle = (cat: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      save(next);
      return next;
    });
  };

  const includeAll = () => {
    const next = new Set<string>();
    save(next);
    setExcluded(next);
  };

  const restoreDefault = () => {
    const next = new Set(DEFAULT_EXCLUDED);
    save(next);
    setExcluded(next);
  };

  return { excluded, toggle, includeAll, restoreDefault };
}
