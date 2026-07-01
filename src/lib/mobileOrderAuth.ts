/**
 * 파트너 모바일 주문(/mobile-order) 전용 세션 유틸.
 *
 * OPS(useOpsAuth) / 거래처 포털(useCustomerAuth) 과 완전히 분리된 독립 세션.
 * mobile_order_sessions 테이블 + localStorage(mo_session_token) 조합으로 구성.
 *
 * 🟠 세션 만료(expiresAt) 는 서버(mobile_order_sessions.expires_at) 기준으로 저장.
 *    로드 시 만료된 세션은 자동 제거 후 null 반환.
 * 🟠 useSyncExternalStore 로 모듈 레벨 상태 공유 — 로그인/로그아웃이
 *    루트 컨테이너에 즉시 반영되도록 함(useCustomerAuth 와 동일 패턴).
 */
import { useSyncExternalStore } from 'react';

const SESSION_KEY = 'mo_session_token';

export interface MobileSession {
  /** mobile_order_sessions.session_token */
  token: string;
  /** customers.id (== customer_users.customer_id) */
  customerId: string;
  /** customers.name (헤더 표시용) */
  customerName: string;
  /** 회사 (멀티테넌시 필터에 사용) */
  companyId: string;
  /** 거래처 등급 A~E (공급가 계산). null 가능. */
  grade: string | null;
  /** ISO 문자열 */
  expiresAt: string;
}

// ───────────────────────────────────────────────────────────
// low-level storage
// ───────────────────────────────────────────────────────────

function readFromStorage(): MobileSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (
      typeof obj?.token !== 'string' ||
      typeof obj?.customerId !== 'string' ||
      typeof obj?.customerName !== 'string' ||
      typeof obj?.companyId !== 'string' ||
      typeof obj?.expiresAt !== 'string'
    ) {
      return null;
    }
    // 만료 확인
    const expMs = Date.parse(obj.expiresAt);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      token: obj.token,
      customerId: obj.customerId,
      customerName: obj.customerName,
      companyId: obj.companyId,
      grade: typeof obj.grade === 'string' ? obj.grade : null,
      expiresAt: obj.expiresAt,
    };
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────
// 모듈 레벨 shared store
// ───────────────────────────────────────────────────────────

let cached: MobileSession | null =
  typeof window !== 'undefined' ? readFromStorage() : null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): MobileSession | null {
  return cached;
}

// ───────────────────────────────────────────────────────────
// public api
// ───────────────────────────────────────────────────────────

/** 로그인 성공 시 호출. localStorage + 모듈 상태 동시 갱신 후 구독자에게 브로드캐스트. */
export function saveMobileSession(session: MobileSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  cached = session;
  emit();
}

/** 만료된 경우 자동 삭제 후 null. 그 외에는 캐시된 값을 그대로 반환. */
export function loadMobileSession(): MobileSession | null {
  // 캐시된 세션이 있어도 만료 시각 재확인 (탭 백그라운드에서 오래 머문 경우).
  if (cached) {
    const expMs = Date.parse(cached.expiresAt);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      clearMobileSession();
      return null;
    }
    return cached;
  }
  // 캐시가 비어있는 경우 storage 재읽기 (다른 탭에서 로그인한 케이스).
  cached = readFromStorage();
  return cached;
}

/** 로그아웃. 세션 토큰 서버 만료 처리는 호출부에서 별도 수행. */
export function clearMobileSession(): void {
  localStorage.removeItem(SESSION_KEY);
  cached = null;
  emit();
}

// ───────────────────────────────────────────────────────────
// hook
// ───────────────────────────────────────────────────────────

/** 모바일 주문 세션을 반응형으로 구독. saveMobileSession/clearMobileSession 호출 시 자동 재렌더. */
export function useMobileSession(): MobileSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ───────────────────────────────────────────────────────────
// 비밀번호 해시 (SHA-256 lowercase hex)
// ───────────────────────────────────────────────────────────

/**
 * customer_users.password_hash 비교용 SHA-256 해시.
 * 소문자 hex 문자열 반환.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
