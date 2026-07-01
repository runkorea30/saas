/**
 * 파트너 모바일 주문 로그인 화면.
 *
 * OPS/거래처 포털과 완전히 분리된 자체 로그인.
 *
 * 인증 우선순위:
 *  1) customer_users.password_hash 매칭 (SHA-256) — 정식 경로
 *  2) 위 조회 실패/불일치 시: customers.login_password (평문) 폴백 →
 *     성공 시 customer_users 자동 provisioning(SHA-256 저장) → 이후 로그인은 1) 경로
 *
 * 성공 시:
 *  - mobile_order_sessions INSERT (session_token = uuid, expires_at = now + 30d)
 *  - customer_users.last_login_at UPDATE (best effort, 실패 무시)
 *  - saveMobileSession 호출 → 컨테이너 자동 리렌더
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { hashPassword, saveMobileSession, type MobileSession } from '@/lib/mobileOrderAuth';

/** 세션 유효기간 (30일). */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Props {
  /** 로그인 성공 시 부모에게 알림용 (컨테이너는 useMobileSession 구독으로도 알 수 있음). */
  onLoggedIn?: (session: MobileSession) => void;
  /** 헤더 우측 슬롯(예: 테마 토글) — 로그인 화면에는 로그아웃 버튼이 없으므로 컨테이너가 주입. */
  headerActions?: ReactNode;
}

interface CustomerUserRow {
  id: string;
  customer_id: string;
  company_id: string;
  password_hash: string;
  is_active: boolean;
}

interface CustomerRow {
  id: string;
  name: string;
  company_id: string;
  grade: string | null;
  is_active: boolean;
  login_password: string | null;
}

export function MobileOrderLogin({ onLoggedIn, headerActions }: Props) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setErrMsg(null);

    const trimmedId = loginId.trim();
    if (!trimmedId || !password) {
      setErrMsg('아이디와 비밀번호를 입력하세요.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await authenticate(trimmedId, password);
      saveMobileSession(session);
      onLoggedIn?.(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="mo-header">
        <div className="mo-header__brand">Angelus 파트너 주문</div>
        <div className="mo-header__title" />
        <div className="mo-header__actions">{headerActions}</div>
      </header>

      <main className="mo-main">
        <div className="mo-card" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>로그인</div>
          <div style={{ color: 'var(--mo-text-secondary)', fontSize: 12, marginBottom: 20 }}>
            거래처 아이디로 주문을 시작하세요.
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: 14 }}>
              <label className="mo-label" htmlFor="mo-login-id">
                아이디
              </label>
              <input
                id="mo-login-id"
                className="mo-input"
                type="text"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="예: 칠성"
                disabled={submitting}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="mo-label" htmlFor="mo-login-pw">
                비밀번호
              </label>
              <input
                id="mo-login-pw"
                className="mo-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                disabled={submitting}
              />
            </div>

            {errMsg ? <div className="mo-error" role="alert">{errMsg}</div> : null}

            <button
              type="submit"
              className="mo-btn-primary"
              disabled={submitting}
              style={{ marginTop: 8 }}
            >
              {submitting ? <Loader2 size={16} className="mo-spin" /> : null}
              {submitting ? '로그인 중…' : '로그인'}
            </button>
          </form>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '12px 16px',
            fontSize: 12,
            color: 'var(--mo-text-secondary)',
            textAlign: 'center',
          }}
        >
          아이디/비밀번호가 없으신가요? 담당자에게 문의하세요.
        </div>
      </main>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 인증 파이프라인
// ───────────────────────────────────────────────────────────

async function authenticate(loginId: string, password: string): Promise<MobileSession> {
  // 1) customer_users 우선 조회.
  const cuRes = await supabase
    .from('customer_users')
    .select('id, customer_id, company_id, password_hash, is_active')
    .eq('login_id', loginId)
    .is('deleted_at', null)
    .maybeSingle();

  if (cuRes.error) {
    // eslint-disable-next-line no-console
    console.error('[mo.auth.customer_users]', cuRes.error);
    throw new Error('로그인 중 오류가 발생했습니다.');
  }

  const cuRow = cuRes.data as CustomerUserRow | null;

  if (cuRow) {
    if (!cuRow.is_active) {
      throw new Error('비활성 계정입니다. 담당자에게 문의하세요.');
    }
    const hashed = await hashPassword(password);
    if (hashed !== cuRow.password_hash) {
      throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    // 정식 경로: customers 로 name/grade 가져와 세션 생성.
    const customer = await fetchCustomer(cuRow.customer_id);
    if (!customer || !customer.is_active) {
      throw new Error('비활성 거래처입니다.');
    }
    return await createSession({
      customerUserId: cuRow.id,
      customer,
      companyId: cuRow.company_id,
    });
  }

  // 2) 폴백: customers.login_password (평문) 매칭.
  const custRes = await supabase
    .from('customers')
    .select('id, name, company_id, grade, is_active, login_password')
    .eq('login_id', loginId)
    .is('deleted_at', null)
    .maybeSingle();

  if (custRes.error) {
    // eslint-disable-next-line no-console
    console.error('[mo.auth.customers]', custRes.error);
    throw new Error('로그인 중 오류가 발생했습니다.');
  }

  const custRow = custRes.data as CustomerRow | null;
  if (!custRow) {
    throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  if (!custRow.is_active) {
    throw new Error('비활성 거래처입니다.');
  }
  if (!custRow.login_password || custRow.login_password !== password) {
    throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  // 성공: customer_users 자동 provisioning (SHA-256 저장).
  const hashed = await hashPassword(password);
  const provRes = await supabase
    .from('customer_users')
    .insert({
      company_id: custRow.company_id,
      customer_id: custRow.id,
      login_id: loginId,
      password_hash: hashed,
      is_active: true,
    })
    .select('id')
    .single();

  if (provRes.error || !provRes.data) {
    // eslint-disable-next-line no-console
    console.error('[mo.auth.provision]', provRes.error);
    throw new Error('계정 초기화에 실패했습니다.');
  }

  return await createSession({
    customerUserId: provRes.data.id,
    customer: custRow,
    companyId: custRow.company_id,
  });
}

async function fetchCustomer(customerId: string): Promise<CustomerRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, company_id, grade, is_active, login_password')
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[mo.auth.fetchCustomer]', error);
    return null;
  }
  return (data as CustomerRow | null) ?? null;
}

interface CreateSessionArgs {
  customerUserId: string;
  customer: CustomerRow;
  companyId: string;
}

/** mobile_order_sessions INSERT + last_login_at UPDATE(best-effort) + MobileSession 반환. */
async function createSession(args: CreateSessionArgs): Promise<MobileSession> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error: sessErr } = await supabase.from('mobile_order_sessions').insert({
    company_id: args.companyId,
    customer_id: args.customer.id,
    customer_user_id: args.customerUserId,
    session_token: token,
    expires_at: expiresAt,
  });
  if (sessErr) {
    // eslint-disable-next-line no-console
    console.error('[mo.auth.createSession]', sessErr);
    throw new Error('세션 생성에 실패했습니다.');
  }

  // last_login_at 갱신은 실패해도 로그인 자체는 성공 처리.
  await supabase
    .from('customer_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', args.customerUserId)
    .then(
      () => undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[mo.auth.last_login_at]', err);
      },
    );

  return {
    token,
    customerId: args.customer.id,
    customerName: args.customer.name,
    companyId: args.companyId,
    grade: args.customer.grade ?? null,
    expiresAt,
  };
}
