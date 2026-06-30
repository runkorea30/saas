/**
 * 거래처 주문서 업로드 로그인 화면.
 *
 * 🟠 OPS 레이아웃과 완전히 분리된 독립 페이지.
 *    `/customer-order` 진입 시 세션이 없으면 이 화면이 노출된다.
 */
import { useState, type FormEvent } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { PortalThemeToggle } from '@/components/feature/customer-order/PortalThemeToggle';

interface CustomerOrderLoginProps {
  onLoginSuccess?: () => void;
}

export function CustomerOrderLogin({ onLoginSuccess }: CustomerOrderLoginProps) {
  const { login } = useCustomerAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(loginId, password);
      onLoginSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--p-bg)',
        padding: 20,
      }}
    >
      {/* 🟠 후속 단계: 페이지 본문 토큰화 전까지는 카드만 라이트로 보임.
          토글은 로그인 전부터 localStorage 캐시 + DOM 적용은 동작. */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <PortalThemeToggle />
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--p-card-bg)',
          border: '1px solid var(--p-line)',
          borderRadius: 12,
          padding: '40px 32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'var(--p-info-wash)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <FileText size={28} strokeWidth={1.75} color="var(--p-info)" />
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              marginBottom: 6,
              color: 'var(--p-ink)',
            }}
          >
            주문서 업로드
          </h1>
          <p style={{ fontSize: 13, color: 'var(--p-ink-3)', margin: 0 }}>
            거래처 로그인
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--p-ink-2)' }}>
              아이디
            </span>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              disabled={busy}
              style={inputStyle}
              placeholder="아이디"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--p-ink-2)' }}>
              비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
              style={inputStyle}
              placeholder="비밀번호"
            />
          </label>

          {error && (
            <div
              role="alert"
              style={{
                fontSize: 12.5,
                padding: '10px 12px',
                background: 'var(--p-danger-soft-bg)',
                color: 'var(--p-danger)',
                border: '1px solid var(--p-danger-soft-border)',
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 6,
              height: 42,
              borderRadius: 6,
              background: busy ? 'var(--p-info-strong-border)' : 'var(--p-info)',
              color: '#FFFFFF',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <div
          style={{
            marginTop: 28,
            paddingTop: 16,
            borderTop: '1px solid var(--p-bg)',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--p-ink-3)',
          }}
        >
          문의사항은 담당자에게 연락 바랍니다
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: '0 12px',
  fontSize: 14,
  border: '1px solid var(--p-line-strong)',
  borderRadius: 6,
  outline: 'none',
  background: 'var(--p-card-bg)',
  color: 'var(--p-ink)',
};
