/**
 * 모바일 매출분석.
 * - 상단: 이번달 매출 + 전월대비 % (KPI 카드)
 * - 월별 바차트 (현재 연도 12개월, 현재월 진한 burgundy)
 * - TOP 5 제품 (수량 기준)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 * 🔴 CLAUDE.md §5: useSalesAnalysis + pivotByProduct 재사용.
 */
import { useMemo } from 'react';
import { useCompany } from '@/hooks/useCompany';
import {
  useSalesAnalysis,
  pivotByProduct,
} from '@/hooks/queries/useSalesAnalysis';

function fmtCompactWon(n: number): string {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return n.toLocaleString('ko-KR');
}

function fmtWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

function kstNow(): { year: number; month: number } {
  const utc = new Date();
  const kst = new Date(utc.getTime() + 9 * 3600_000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
}

function kstMonth(iso: string): number {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.getUTCMonth() + 1;
}

export function SalesAnalysisPage() {
  const { companyId } = useCompany();
  const { year, month: currentMonth } = useMemo(kstNow, []);
  const { data: rows = [], isLoading } = useSalesAnalysis(companyId, year);

  // 월별 합계
  const monthly = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    for (const r of rows) {
      const m = kstMonth(r.order_date);
      arr[m - 1] += r.amount;
    }
    return arr;
  }, [rows]);

  const thisMonth = monthly[currentMonth - 1] ?? 0;
  const prevMonth = currentMonth > 1 ? monthly[currentMonth - 2] : 0;
  const momPct =
    prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth) * 100 : null;

  // 6개월 바차트 (현재월 포함, 과거 5개월)
  const last6 = useMemo(() => {
    const start = Math.max(0, currentMonth - 6);
    const out: { m: number; amt: number }[] = [];
    for (let i = start; i < currentMonth; i++) {
      out.push({ m: i + 1, amt: monthly[i] });
    }
    return out;
  }, [monthly, currentMonth]);

  const max6 = last6.reduce((m, x) => Math.max(m, x.amt), 1);

  // TOP 제품 (현재월 한정, 수량 기준 상위 5)
  const topProducts = useMemo(() => {
    const filtered = pivotByProduct(rows, [currentMonth], null, null, '');
    return filtered.slice(0, 5);
  }, [rows, currentMonth]);

  const topMax = topProducts.reduce((m, p) => Math.max(m, p.total), 1);

  return (
    <div>
      <header className="m-page-header">
        <h1 className="m-page-title">매출분석</h1>
        <div
          style={{
            fontSize: 11,
            color: 'var(--m-text-secondary)',
            marginTop: 4,
          }}
        >
          {year}년 · {currentMonth}월 기준
        </div>
      </header>

      {isLoading ? (
        <div className="m-empty">불러오는 중…</div>
      ) : (
        <>
          {/* 이번달 매출 KPI */}
          <div style={{ padding: '12px 16px 8px' }}>
            <div
              className="m-card"
              style={{
                background: 'var(--m-primary)',
                borderColor: 'var(--m-primary)',
                color: '#ffffff',
                padding: 18,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.85 }}>이번 달 매출</div>
              <div
                className="m-num"
                style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}
              >
                ₩{fmtWon(thisMonth)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  marginTop: 6,
                  opacity: 0.95,
                }}
              >
                전월 대비{' '}
                {momPct === null ? (
                  '—'
                ) : (
                  <span style={{ fontWeight: 600 }}>
                    {momPct >= 0 ? '+' : ''}
                    {momPct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 월별 바차트 */}
          <section style={{ padding: '8px 16px' }}>
            <h2 style={sectionTitleStyle}>최근 6개월</h2>
            <div
              className="m-card"
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                height: 160,
                padding: '14px 12px 10px',
              }}
            >
              {last6.length === 0 ? (
                <div className="m-empty" style={{ width: '100%' }}>
                  데이터 없음
                </div>
              ) : (
                last6.map((b) => {
                  const isCurrent = b.m === currentMonth;
                  const h = Math.max(2, Math.round((b.amt / max6) * 110));
                  return (
                    <div
                      key={b.m}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <div
                        className="m-num"
                        style={{
                          fontSize: 10,
                          color: 'var(--m-text-secondary)',
                          marginBottom: 2,
                        }}
                      >
                        {fmtCompactWon(b.amt)}
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: h,
                          background: isCurrent
                            ? 'var(--m-primary)'
                            : 'var(--m-primary-wash)',
                          borderRadius: '6px 6px 0 0',
                        }}
                      />
                      <div
                        className="m-num"
                        style={{
                          fontSize: 11,
                          color: isCurrent
                            ? 'var(--m-primary)'
                            : 'var(--m-text-secondary)',
                          fontWeight: isCurrent ? 600 : 400,
                        }}
                      >
                        {b.m}월
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* TOP 5 제품 */}
          <section style={{ padding: '8px 16px 24px' }}>
            <h2 style={sectionTitleStyle}>이번 달 TOP 5 (수량)</h2>
            <div className="m-card" style={{ padding: 0 }}>
              {topProducts.length === 0 ? (
                <div className="m-empty">데이터 없음</div>
              ) : (
                topProducts.map((p, idx) => {
                  const ratio = (p.total / topMax) * 100;
                  return (
                    <div
                      key={p.product_id}
                      style={{
                        padding: '10px 14px',
                        borderBottom:
                          idx < topProducts.length - 1
                            ? '1px solid var(--m-border)'
                            : 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          className="m-num"
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            background: 'var(--m-primary)',
                            color: '#ffffff',
                            fontSize: 11,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={p.product_name}
                        >
                          {p.product_name}
                        </span>
                        <span
                          className="m-num"
                          style={{ fontSize: 13, fontWeight: 600 }}
                        >
                          {fmtWon(p.total)}
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: 4,
                          background: 'var(--m-border)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${ratio}%`,
                            height: '100%',
                            background: 'var(--m-primary)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--m-text-secondary)',
  fontWeight: 500,
  margin: '0 0 6px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};
