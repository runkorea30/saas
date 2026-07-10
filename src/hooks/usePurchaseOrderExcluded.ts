/**
 * 발주 예상에서 제외할 카테고리 목록 — 공용 훅.
 *
 * 🔴 (2026-07-11 §50) Zustand 전역 스토어로 교체 — 이유는 `useLeadTimeSettings.ts`
 *    상단 주석과 동일(TopNav ↔ 발주서 페이지 형제 컴포넌트 간 실시간 미동기화 문제).
 *    기존 localStorage 키(`purchaseOrderExcludedCategories`)의 값은 스토어 최초 생성 시
 *    1회 마이그레이션해서 그대로 이어받는다.
 * 🟢 훅의 공개 시그니처(`usePurchaseOrderExcluded()`)와 반환 타입은 기존과 동일 —
 *    호출부(TopNav/PurchaseOrderPage 등) 수정 불필요.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const LEGACY_KEY = 'purchaseOrderExcludedCategories';
const STORE_KEY = 'purchaseOrderExcludedCategories-store';

/** 초기값 — 해상(선박) 수입 카테고리 3종. */
export const DEFAULT_EXCLUDED: readonly string[] = [
  '2-1.레더다이',
  '2-2.스웨이드다이',
  '3-1.디글레이저',
];

/** 기존(비-Zustand) 저장 방식으로 남아있던 값을 1회성으로 읽어온다. */
function migrateLegacy(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_EXCLUDED];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw == null) return [...DEFAULT_EXCLUDED];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_EXCLUDED];
    return arr.filter((v): v is string => typeof v === 'string');
  } catch {
    return [...DEFAULT_EXCLUDED];
  }
}

interface ExcludedStore {
  excludedArr: string[];
  toggle: (cat: string) => void;
  includeAll: () => void;
  restoreDefault: () => void;
}

const useExcludedStore = create<ExcludedStore>()(
  persist(
    (set, get) => ({
      excludedArr: migrateLegacy(),
      toggle: (cat) => {
        const cur = new Set(get().excludedArr);
        if (cur.has(cat)) cur.delete(cat);
        else cur.add(cat);
        set({ excludedArr: Array.from(cur) });
      },
      includeAll: () => set({ excludedArr: [] }),
      restoreDefault: () => set({ excludedArr: [...DEFAULT_EXCLUDED] }),
    }),
    { name: STORE_KEY },
  ),
);

export interface UsePurchaseOrderExcludedResult {
  excluded: Set<string>;
  toggle: (cat: string) => void;
  includeAll: () => void;
  restoreDefault: () => void;
}

export function usePurchaseOrderExcluded(): UsePurchaseOrderExcludedResult {
  const excludedArr = useExcludedStore((s) => s.excludedArr);
  const toggle = useExcludedStore((s) => s.toggle);
  const includeAll = useExcludedStore((s) => s.includeAll);
  const restoreDefault = useExcludedStore((s) => s.restoreDefault);

  // excludedArr 참조가 실제로 바뀔 때만 새 Set 생성 — 불필요한 리렌더 방지.
  const excluded = useMemo(() => new Set(excludedArr), [excludedArr]);

  return { excluded, toggle, includeAll, restoreDefault };
}
