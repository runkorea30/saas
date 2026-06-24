/**
 * 거래처 자체 로그인 훅 (Supabase Auth 와 무관).
 *
 * 🟠 Dev/dogfooding 전용: customers.login_id / login_password (평문) 매칭.
 *    Phase 2 Auth 도입 시 `customer_users` 의 해시 비교로 교체할 것.
 *
 * 세션은 localStorage 에 단일 키 `customer_session` 으로 보관.
 * 인증 상태는 React state 로 관리 (TanStack Query 미사용).
 */
import { useCallback, useEffect, useState } from 'react';
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
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setCustomer(readSession());
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (loginId: string, password: string): Promise<CustomerSession> => {
      const trimmedId = loginId.trim();
      if (!trimmedId || !password) {
        throw new Error('아이디와 비밀번호를 입력하세요.');
      }
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, company_id, grade, login_id, login_password, is_active')
        .eq('login_id', trimmedId)
        .eq('login_password', password)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();
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
      setCustomer(session);
      return session;
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setCustomer(null);
  }, []);

  return { customer, isLoading, login, logout };
}
