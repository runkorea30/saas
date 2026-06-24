/**
 * 거래처 자체 로그인 훅 (Supabase Auth 와 무관).
 *
 * 🟠 Dev/dogfooding 전용: customers.login_id / login_password (평문) 매칭.
 *    Phase 2 Auth 도입 시 `customer_users.password_hash` 비교로 교체할 것.
 *
 * 🔴 세션 state 는 모듈 레벨로 공유 (useSyncExternalStore).
 *    이전 구현은 컴포넌트마다 별도 `useState` 인스턴스를 생성해
 *    로그인 화면의 setState 가 부모 페이지에 반영되지 않는 버그가 있었다.
 *
 * 🟡 supabase 클라이언트는 `src/lib/supabase.ts` 에서
 *    `schema: 'mochicraft_demo'` 로 전역 고정 — 쿼리마다 `.schema()` 호출 불필요.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'customer_session';

export interface CustomerSession {
  customerId: string;
  customerName: string;
  companyId: string;
  /** A~E. NULL 가능 (등급 미설정 거래처) */
  grade: string | null;
}

function readSession(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (
      typeof obj?.customerId === 'string' &&
      typeof obj?.customerName === 'string' &&
      typeof obj?.companyId === 'string'
    ) {
      return {
        customerId: obj.customerId,
        customerName: obj.customerName,
        companyId: obj.companyId,
        grade: typeof obj.grade === 'string' ? obj.grade : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────
// 모듈 레벨 공유 store
// ───────────────────────────────────────────────────────────

let cachedSession: CustomerSession | null =
  typeof window !== 'undefined' ? readSession() : null;
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

function getSnapshot(): CustomerSession | null {
  return cachedSession;
}

// ───────────────────────────────────────────────────────────
// 훅
// ───────────────────────────────────────────────────────────

export interface UseCustomerAuthResult {
  customer: CustomerSession | null;
  isLoading: boolean;
  /**
   * loginId/password 와 일치하는 활성 거래처를 찾아 세션을 만든다.
   * 실패 시 Error throw.
   */
  login: (loginId: string, password: string) => Promise<CustomerSession>;
  logout: () => void;
}

export function useCustomerAuth(): UseCustomerAuthResult {
  const customer = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const login = useCallback(
    async (loginId: string, password: string): Promise<CustomerSession> => {
      const trimmedId = loginId.trim();
      if (!trimmedId || !password) {
        throw new Error('아이디와 비밀번호를 입력하세요.');
      }
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, company_id, grade, login_id, is_active')
        .eq('login_id', trimmedId)
        .eq('login_password', password)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();

      // 🟡 dogfooding 단계 디버깅 — 외부 노출 전 제거 권장.
      // eslint-disable-next-line no-console
      console.log('[customer-auth.login]', {
        loginId: trimmedId,
        passwordLen: password.length,
        data,
        error,
      });

      if (error) {
        throw new Error(error.message || '로그인에 실패했습니다.');
      }
      if (!data) {
        throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      }

      const session: CustomerSession = {
        customerId: data.id,
        customerName: data.name,
        companyId: data.company_id,
        grade: data.grade ?? null,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      cachedSession = session;
      emit();
      return session;
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    cachedSession = null;
    emit();
  }, []);

  return {
    customer,
    // 모듈 init 시 동기 readSession 완료 → 로딩 상태 불필요.
    isLoading: false,
    login,
    logout,
  };
}
