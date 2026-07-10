/**
 * 리드타임(해상/FedEx) 설정 단일 진입점.
 *
 * 🔴 (2026-07-11 §50) Zustand 전역 스토어로 교체. 기존엔 컴포넌트별 독립 useState +
 *    localStorage 직접 읽기/쓰기 방식이라, 같은 화면에 동시에 마운트된 형제 컴포넌트
 *    (예: TopNav ↔ PurchaseOrderPage) 끼리는 한쪽에서 값을 바꿔도 다른 쪽에 새로고침
 *    전까지 반영되지 않는 문제가 있었다. Zustand 스토어 하나를 모든 컴포넌트가 구독하는
 *    구조로 바꿔 어디서 바꾸든 즉시 전체 화면에 반영되도록 함. 영속(localStorage 저장)은
 *    zustand `persist` 미들웨어가 대신 처리.
 * 🔴 회사별 설정 유지: 기존 키 `leadTimeDaysOverride_{companyId}` 데이터는 스토어
 *    최초 생성 시 1회 마이그레이션(아래 `migrateLegacy()`)해서 그대로 이어받음.
 * 🟠 값 범위: [1, 365]. 0 이하 입력은 1 로 clamp 해 divide-by-zero 계산 사고 방지.
 * 🟢 훅의 공개 시그니처(`useLeadTimeSettings(companyId)`)와 반환 타입은 기존과 동일 —
 *    호출부(usePurchaseForecast/useAutoRecalcReorderPoints/PurchaseOrderPage/TopNav 등)
 *    수정 불필요.
 */
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  SEA_LEAD_TIME_DAYS,
  FEDEX_LEAD_TIME_DAYS,
  SEA_IMPORT_CATEGORIES,
} from '@/constants/leadTimes';

const LEGACY_KEY_PREFIX = 'leadTimeDaysOverride_';
const STORE_KEY = 'leadTimeDaysOverride-store';

export interface LeadTimeSettings {
  sea: number;
  fedex: number;
}

const DEFAULT_SETTINGS: LeadTimeSettings = {
  sea: SEA_LEAD_TIME_DAYS,
  fedex: FEDEX_LEAD_TIME_DAYS,
};

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.round(n)));
}

/** 기존(비-Zustand) 저장 방식으로 남아있던 회사별 설정을 1회성으로 읽어온다. */
function migrateLegacy(): Record<string, LeadTimeSettings> {
  if (typeof window === 'undefined') return {};
  const result: Record<string, LeadTimeSettings> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_KEY_PREFIX)) continue;
      const companyId = key.slice(LEGACY_KEY_PREFIX.length);
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      result[companyId] = {
        sea: clamp(Number(parsed?.sea ?? DEFAULT_SETTINGS.sea)),
        fedex: clamp(Number(parsed?.fedex ?? DEFAULT_SETTINGS.fedex)),
      };
    }
  } catch {
    /* 마이그레이션 실패 시 빈 값 — 기본값으로 폴백됨 */
  }
  return result;
}

interface LeadTimeStore {
  byCompany: Record<string, LeadTimeSettings>;
  setSea: (companyId: string, n: number) => void;
  setFedex: (companyId: string, n: number) => void;
  reset: (companyId: string) => void;
}

const useLeadTimeStore = create<LeadTimeStore>()(
  persist(
    (set) => ({
      byCompany: migrateLegacy(),
      setSea: (companyId, n) =>
        set((state) => ({
          byCompany: {
            ...state.byCompany,
            [companyId]: {
              ...(state.byCompany[companyId] ?? DEFAULT_SETTINGS),
              sea: clamp(n),
            },
          },
        })),
      setFedex: (companyId, n) =>
        set((state) => ({
          byCompany: {
            ...state.byCompany,
            [companyId]: {
              ...(state.byCompany[companyId] ?? DEFAULT_SETTINGS),
              fedex: clamp(n),
            },
          },
        })),
      reset: (companyId) =>
        set((state) => ({
          byCompany: { ...state.byCompany, [companyId]: DEFAULT_SETTINGS },
        })),
    }),
    { name: STORE_KEY },
  ),
);

export interface UseLeadTimeSettingsResult extends LeadTimeSettings {
  setSea: (n: number) => void;
  setFedex: (n: number) => void;
  reset: () => void;
  isDefault: boolean;
}

export function useLeadTimeSettings(
  companyId: string | null,
): UseLeadTimeSettingsResult {
  const settings = useLeadTimeStore((s) =>
    companyId ? (s.byCompany[companyId] ?? DEFAULT_SETTINGS) : DEFAULT_SETTINGS,
  );
  const storeSetSea = useLeadTimeStore((s) => s.setSea);
  const storeSetFedex = useLeadTimeStore((s) => s.setFedex);
  const storeReset = useLeadTimeStore((s) => s.reset);

  const setSea = useCallback(
    (n: number) => {
      if (companyId) storeSetSea(companyId, n);
    },
    [companyId, storeSetSea],
  );

  const setFedex = useCallback(
    (n: number) => {
      if (companyId) storeSetFedex(companyId, n);
    },
    [companyId, storeSetFedex],
  );

  const reset = useCallback(() => {
    if (companyId) storeReset(companyId);
  }, [companyId, storeReset]);

  const isDefault =
    settings.sea === DEFAULT_SETTINGS.sea && settings.fedex === DEFAULT_SETTINGS.fedex;

  return { ...settings, setSea, setFedex, reset, isDefault };
}

/**
 * 카테고리 → 사용자 설정 리드타임(일).
 * 해상 3종 카테고리는 `settings.sea`, 그 외는 `settings.fedex`.
 *
 * `constants/leadTimes.ts` 의 `getLeadTimeDays` 는 기본값 상수로만 fallback,
 * 실 계산은 이 함수를 통해서만 이뤄지도록 통일.
 */
export function resolveLeadTimeDays(
  category: string | null | undefined,
  settings: LeadTimeSettings,
): number {
  if (!category) return settings.fedex;
  return (SEA_IMPORT_CATEGORIES as readonly string[]).includes(category)
    ? settings.sea
    : settings.fedex;
}
