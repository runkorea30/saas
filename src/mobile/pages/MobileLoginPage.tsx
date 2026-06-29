/**
 * 모바일 PWA 로그인 페이지.
 * OPS와 동일한 Supabase Auth 계정 사용.
 * 모바일 디자인 토큰(--m-*) 적용 — MobileLayout 바깥에서 렌더되므로 폴백값 포함.
 */
import { useState, type FormEvent } from 'react';
import type { UseOpsAuthResult } from '@/hooks/useOpsAuth';

export function MobileLoginPage({
  onLogin,
}: {
  onLogin: UseOpsAuthResult['login'];
}) {
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
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--m-bg, #fafaf8)',
        padding: '24px 20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--m-surface, #ffffff)',
          border: '1px solid var(--m-border, #e5e7eb)',
          borderRadius: 16,
          padding: '36px 24px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--m-primary, #6b1f2a)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>M</span>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--m-text, #1a1a1a)',
              marginBottom: 4,
            }}
          >
            MochiCraft OPS
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--m-text-secondary, #6b7280)',
            }}
          >
            모바일 운영자 로그인
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--m-text, #1a1a1a)',
              }}
            >
              이메일
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              disabled={busy}
              required
              placeholder="이메일 주소"
              style={{
                height: 46,
                padding: '0 14px',
                fontSize: 15,
                border: '1.5px solid var(--m-border-strong, #d1d5db)',
                borderRadius: 10,
                outline: 'none',
                background: 'var(--m-surface, #fff)',
                color: 'var(--m-text, #1a1a1a)',
                WebkitAppearance: 'none',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--m-text, #1a1a1a)',
              }}
            >
              비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
              required
              placeholder="비밀번호"
              style={{
                height: 46,
                padding: '0 14px',
                fontSize: 15,
                border: '1.5px solid var(--m-border-strong, #d1d5db)',
                borderRadius: 10,
                outline: 'none',
                background: 'var(--m-surface, #fff)',
                color: 'var(--m-text, #1a1a1a)',
                WebkitAppearance: 'none',
              }}
            />
          </label>

          {error && (
            <div
              style={{
                fontSize: 13,
                padding: '10px 14px',
                background: '#FEF2F2',
                color: '#B91C1C',
                border: '1px solid #FECACA',
                borderRadius: 8,
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
              height: 48,
              borderRadius: 10,
              background: busy
                ? 'var(--m-text-secondary, #9ca3af)'
                : 'var(--m-primary, #6b1f2a)',
              color: '#ffffff',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
