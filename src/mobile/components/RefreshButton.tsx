/**
 * 공통 새로고침 버튼 — 모바일 페이지 헤더 우측에 배치.
 * 터치 영역 48×48, RefreshCw 아이콘, 진행 중 animate-spin 회전.
 */
import { RefreshCw } from 'lucide-react';

interface Props {
  onClick: () => void;
  refreshing: boolean;
}

export function RefreshButton({ onClick, refreshing }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      title="새로고침"
      aria-label="새로고침"
      style={{
        flexShrink: 0,
        width: 48,
        height: 48,
        borderRadius: 10,
        border: '1px solid var(--m-border-strong)',
        background: 'var(--m-surface)',
        color: refreshing ? 'var(--m-primary)' : 'var(--m-text-secondary)',
        cursor: refreshing ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <RefreshCw
        size={18}
        strokeWidth={1.8}
        className={refreshing ? 'animate-spin' : undefined}
      />
    </button>
  );
}
