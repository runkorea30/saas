/**
 * 유효기간 임박 경고 티커 — TopNav 인라인 표시용 순수 프레젠테이션 컴포넌트.
 *
 * 🟠 데이터 페칭은 부모(TopNav)에서 처리, 이 컴포넌트는 문구 배열만 받음.
 * 🟠 alerts.length === 0 → 렌더 스킵.
 * 🟠 alerts.length === 1 → 회전 없이 고정.
 * 🟠 alerts.length >= 2 → 3.5초 간격 위→아래 slide + fade.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const ROTATE_MS = 3500;
const ANIM_MS = 400;

interface Props {
  alerts: string[];
}

export function ExpiryAlertTicker({ alerts }: Props) {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [alerts.length]);

  useEffect(() => {
    if (alerts.length < 2) return;
    const timer = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % alerts.length);
        setAnimating(false);
      }, ANIM_MS);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  const current = alerts[Math.min(index, alerts.length - 1)] ?? '';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: 320,
        height: 28,
        padding: '0 10px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--surface)',
        color: 'var(--danger)',
        fontSize: 12,
        fontFamily: 'var(--font-kr)',
        overflow: 'hidden',
      }}
      title={alerts.join('\n')}
    >
      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          height: 18,
        }}
      >
        <span
          key={`${index}-${current}`}
          style={{
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transform: animating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: animating ? 0 : 1,
            transition: `transform ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease`,
            lineHeight: '18px',
          }}
        >
          {current}
        </span>
      </div>
      {alerts.length > 1 && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            color: 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.min(index, alerts.length - 1) + 1}/{alerts.length}
        </span>
      )}
    </div>
  );
}
