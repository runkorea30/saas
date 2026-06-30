/**
 * OPS 운영자 로그인 페이지.
 * 세션이 없을 때 App.tsx 의 라우트 게이트에서 렌더.
 */
import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { UseOpsAuthResult } from '@/hooks/useOpsAuth';
import { useForceLightTheme } from '@/hooks/useForceLightTheme';

export function OpsLoginPage({ onLogin }: { onLogin: UseOpsAuthResult['login'] }) {
  // 🟠 로그인 페이지는 inline hex 톤이 다수 — 4종 테마 토큰화 비용 크고
  //    첫 진입 화면이라 라이트 고정이 UX 표준. 로그인 성공 후 OPS Shell 에서
  //    저장된 테마가 즉시 적용됨.
  useForceLightTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F4',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#FFFFFF',
          border: '1px solid #E7E5E4',
          borderRadius: 12,
          padding: '40px 32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: '#1C1917',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <span style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700 }}>
              M
            </span>
          </div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              marginBottom: 4,
              color: '#1C1917',
            }}
          >
            MochiCraft OPS
          </h1>
          <p style={{ fontSize: 13, color: '#78716C', margin: 0 }}>
            운영자 로그인
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#44403C' }}>
              이메일
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              disabled={busy}
              required
              style={inputStyle}
              placeholder="이메일 주소"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#44403C' }}>
              비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
              required
              style={inputStyle}
              placeholder="비밀번호"
            />
          </label>

          {error && (
            <div
              style={{
                fontSize: 12.5,
                padding: '10px 12px',
                background: '#FEF2F2',
                color: '#B91C1C',
                border: '1px solid #FECACA',
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
              marginTop: 4,
              height: 42,
              borderRadius: 8,
              background: busy ? '#A8A29E' : '#1C1917',
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
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: '0 12px',
  fontSize: 14,
  border: '1px solid #D6D3D1',
  borderRadius: 8,
  outline: 'none',
  background: '#FFFFFF',
  color: '#1C1917',
};
