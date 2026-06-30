/**
 * 택배사 / 배송방법 매핑.
 *
 * - `orders.tracking_numbers` 의 각 항목은 `{ carrier: CarrierCode, number: string }`.
 * - `trackingUrl` 이 null 인 항목(퀵서비스, 직접전달)은 조회 링크 없음 — 클릭해도 동작 없음.
 * - 라벨/URL 변경은 이 파일에서만 — UI 측은 헬퍼만 호출.
 */

export type CarrierCode =
  | 'logen'
  | 'cj'
  | 'hanjin'
  | 'epost'
  | 'quick'
  | 'direct';

export interface ShippingCarrier {
  code: CarrierCode;
  label: string;
  /** 송장번호로 외부 조회 URL 생성. null 이면 조회 불가(퀵/직접전달). */
  trackingUrl: ((no: string) => string) | null;
}

export const CARRIERS: readonly ShippingCarrier[] = [
  {
    code: 'logen',
    label: '로젠택배',
    trackingUrl: (no) =>
      `https://www.ilogen.com/web/personal/trace/${encodeURIComponent(no)}`,
  },
  {
    code: 'cj',
    label: 'CJ대한통운',
    trackingUrl: (no) =>
      `https://trace.cjlogistics.com/next/tracking.html?wblNo=${encodeURIComponent(no)}`,
  },
  {
    code: 'hanjin',
    label: '한진택배',
    trackingUrl: (no) =>
      `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${encodeURIComponent(no)}`,
  },
  {
    code: 'epost',
    label: '우체국택배',
    trackingUrl: (no) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?displayHeader=N&sid1=${encodeURIComponent(no)}`,
  },
  { code: 'quick', label: '퀵서비스', trackingUrl: null },
  { code: 'direct', label: '직접전달', trackingUrl: null },
] as const;

export const DEFAULT_CARRIER: CarrierCode = 'logen';

const CARRIER_BY_CODE = new Map(CARRIERS.map((c) => [c.code, c]));

export function getCarrier(code: string | null | undefined): ShippingCarrier {
  if (code && CARRIER_BY_CODE.has(code as CarrierCode)) {
    return CARRIER_BY_CODE.get(code as CarrierCode)!;
  }
  // 알 수 없는 값 → 안전한 기본값(로젠) 폴백.
  return CARRIER_BY_CODE.get(DEFAULT_CARRIER)!;
}

export function getCarrierLabel(code: string | null | undefined): string {
  return getCarrier(code).label;
}

export function getTrackingUrl(
  code: string | null | undefined,
  number: string,
): string | null {
  const carrier = getCarrier(code);
  return carrier.trackingUrl ? carrier.trackingUrl(number) : null;
}

/** orders.tracking_numbers 의 정규화된 항목 형식. */
export interface TrackingEntry {
  carrier: CarrierCode;
  number: string;
}

/**
 * legacy 문자열 또는 신규 객체 어느 쪽이든 안전하게 TrackingEntry 로 정규화.
 * DB 마이그레이션 누락분 방어용.
 */
export function normalizeTrackingEntry(raw: unknown): TrackingEntry | null {
  if (typeof raw === 'string') {
    const number = raw.trim();
    if (!number) return null;
    return { carrier: DEFAULT_CARRIER, number };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { carrier?: unknown; number?: unknown };
    const number =
      typeof obj.number === 'string' ? obj.number.trim() : '';
    if (!number) return null;
    const code =
      typeof obj.carrier === 'string' && CARRIER_BY_CODE.has(obj.carrier as CarrierCode)
        ? (obj.carrier as CarrierCode)
        : DEFAULT_CARRIER;
    return { carrier: code, number };
  }
  return null;
}

export function normalizeTrackingNumbers(raw: unknown): TrackingEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackingEntry[] = [];
  for (const item of raw) {
    const norm = normalizeTrackingEntry(item);
    if (norm) out.push(norm);
  }
  return out;
}
