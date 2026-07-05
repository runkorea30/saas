/**
 * 리드타임(해상/FedEx) 설정 단일 진입점.
 *
 * localStorage 에 회사별로 저장 (`leadTimeDaysOverride_{companyId}`). 기본값은
 * `constants/leadTimes.ts` 의 상수 (`SEA_LEAD_TIME_DAYS`=90, `FEDEX_LEAD_TIME_DAYS`=15).
 *
 * 🔴 프로젝트 내 리드타임 참조는 모두 이 훅을 거칠 것. 기존 `getLeadTimeDays`
 *    카테고리 헬퍼는 "기본값 상수" 역할로만 남기고 실계산은 여기서 나온 값으로 대체.
 * 🟠 값 범위: [1, 365]. 0 이하 입력은 1 로 clamp 해 divide-by-zero 계산 사고 방지.
 * 🟡 cross-tab 실시간 동기화는 하지 않음 — 새로고침 시 반영 정도로 충분.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  SEA_LEAD_TIME_DAYS,
  FEDEX_LEAD_TIME_DAYS,
  SEA_IMPORT_CATEGORIES,
} from '@/constants/leadTimes';

const STORAGE_KEY_PREFIX = 'leadTimeDaysOverride_';

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

function readFromStorage(companyId: string | null): LeadTimeSettings {
  if (!companyId || typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + companyId);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      sea: clamp(Number(parsed?.sea ?? DEFAULT_SETTINGS.sea)),
      fedex: clamp(Number(parsed?.fedex ?? DEFAULT_SETTINGS.fedex)),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeToStorage(companyId: string, s: LeadTimeSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + companyId, JSON.stringify(s));
  } catch {
    /* 저장 실패는 조용히 무시 — 사용자 입력값만 세션 유지, 다음 진입 시 기본값 */
  }
}

export interface UseLeadTimeSettingsResult extends LeadTimeSettings {
  setSea: (n: number) => void;
  setFedex: (n: number) => void;
  reset: () => void;
  isDefault: boolean;
}

export function useLeadTimeSettings(
  companyId: string | null,
): UseLeadTimeSettingsResult {
  const [settings, setSettings] = useState<LeadTimeSettings>(() =>
    readFromStorage(companyId),
  );

  // companyId 가 나중에 로드되는 케이스 (useCompany 는 초기 null 반환) 를 위해
  // companyId 변화 시 다시 로드. 저장은 companyId 확정 후에만.
  useEffect(() => {
    setSettings(readFromStorage(companyId));
  }, [companyId]);

  const setSea = useCallback(
    (n: number) => {
      const next = { ...settings, sea: clamp(n) };
      setSettings(next);
      if (companyId) writeToStorage(companyId, next);
    },
    [companyId, settings],
  );

  const setFedex = useCallback(
    (n: number) => {
      const next = { ...settings, fedex: clamp(n) };
      setSettings(next);
      if (companyId) writeToStorage(companyId, next);
    },
    [companyId, settings],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    if (companyId) writeToStorage(companyId, DEFAULT_SETTINGS);
  }, [companyId]);

  const isDefault =
    settings.sea === DEFAULT_SETTINGS.sea &&
    settings.fedex === DEFAULT_SETTINGS.fedex;

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
