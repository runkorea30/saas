/**
 * 홈 대시보드 상단 그리팅 블록.
 * Phase 2 Auth 전까지 회사명 + 오늘 할 일 건수 + 월 매출 목표 달성률 표기.
 */

interface Props {
  companyName: string | null;
  tasksCount: number;
  targetPct: number | null; // 월 매출 목표 달성률 (null이면 미표시)
  loading: boolean;
}

function todayLabelKst(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${y}.${m}.${dd} · ${weekdays[d.getDay()]}`;
}

export function HomeHeader({ companyName, tasksCount, targetPct, loading }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--ink-3)',
            fontSize: 11,
            fontFamily: 'var(--font-num)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          <span>홈 대시보드</span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span>{todayLabelKst()}</span>
        </div>
        <h1
          className="disp"
          style={{
            fontSize: 26,
            fontWeight: 400,
            margin: '6px 0 4px',
            letterSpacing: '-0.015em',
          }}
        >
          안녕하세요,{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--brand)' }}>
            {loading ? '…' : (companyName ?? '사용자')}
          </em>{' '}
          님
        </h1>
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          {loading ? (
            '데이터를 불러오는 중입니다.'
          ) : (
            <>
              오늘 처리할 일이{' '}
              <span
                style={{
                  fontWeight: 600,
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-num)',
                }}
              >
                {tasksCount}
              </span>
              건 있습니다.
              {targetPct !== null && (
                <>
                  {' '}이번 달 매출은 전월의{' '}
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--brand)',
                      fontFamily: 'var(--font-num)',
                    }}
                  >
                    {Math.round(targetPct)}%
                  </span>
                  에 도달했어요.
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
