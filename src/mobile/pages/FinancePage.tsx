/**
 * 모바일 재무(손익계산서) — 데스크탑 IncomeStatementPage 의 핵심 발췌.
 *
 * 노출 영역:
 *   - 연도/월 선택 + 부가세 포함/제외 토글
 *   - 손익 요약 (매출 / 매출원가 분해 / 매출총이익 / 판관비 / 영업이익)
 *   - 매출원가 세부 (기초재고 / 수입입고 / 기말재고 / 합계)
 *   - 판관비 카테고리별 합계
 *
 * 비노출(데스크탑 전용):
 *   - 은행거래내역 업로드/자동분류
 *   - 판관비 수동 입력 폼
 *   → 입력/업로드는 데스크탑에서, 모바일은 결과 조회 중심.
 *
 * 🔴 CLAUDE.md §1 : company_id = useCompany().
 * 🔴 CLAUDE.md §2 : 모든 계산은 useProfitLoss 에서 수행 — 페이지는 표시만.
 */
import { useMemo, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import {
  useProfitLoss,
  type CogsDetail,
  type PlExpenseLine,
} from '@/hooks/queries/useProfitLoss';
import { RefreshButton } from '../components/RefreshButton';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function fmtWon(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  const sign = r < 0 ? '-' : '';
  return sign + Math.abs(r).toLocaleString('ko-KR');
}

export function FinancePage() {
  const { companyId } = useCompany();
  const now = new Date();

  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [includeVat, setIncludeVat] = useState(true);

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  const pl = useProfitLoss({
    companyId,
    mode: 'monthly',
    year,
    month,
    includeVat,
  });

  return (
    <div>
      {/* 페이지 헤더 */}
      <header className="m-page-header" style={{ paddingBottom: 4 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <h1 className="m-page-title">재무 · 손익계산서</h1>
          <div style={{ flex: 1 }} />
          <RefreshButton
            onClick={() => {
              /* useProfitLoss 내부 다중 query 직접 invalidate 는 컴포넌트 노출 X.
                 새로고침이 필요하면 풀-투-리프레시 또는 데스크탑 사용. */
            }}
            refreshing={pl.isLoading}
          />
        </div>

        {/* 컨트롤: 연도/월/부가세 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={selectStyle}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={selectStyle}
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>

          <div style={{ flex: 1 }} />

          <div
            style={{
              display: 'flex',
              border: '1px solid var(--m-border-strong)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setIncludeVat(v)}
                style={{
                  height: 28,
                  padding: '0 10px',
                  fontSize: 11,
                  border: 'none',
                  background:
                    includeVat === v
                      ? 'var(--m-primary)'
                      : 'var(--m-surface)',
                  color:
                    includeVat === v
                      ? '#fff'
                      : 'var(--m-text-secondary)',
                  cursor: 'pointer',
                  fontWeight: includeVat === v ? 600 : 400,
                }}
              >
                {v ? '부가세 포함' : '부가세 제외'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ padding: '10px 16px 24px', display: 'grid', gap: 12 }}>
        {/* 손익 요약 카드 */}
        <section style={cardStyle}>
          <h2 style={cardTitleStyle}>손익 요약</h2>
          {pl.isLoading ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--m-text-secondary)',
                padding: '4px 0',
              }}
            >
              계산 중…
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              <PLRow
                label={
                  includeVat
                    ? '매출액 (부가세 포함)'
                    : '매출액 (부가세 제외)'
                }
                value={pl.displayRevenue}
                bold
              />
              <CogsBlock detail={pl.cogsDetail} includeVat={includeVat} />
              <Divider />
              <PLRow
                label="매출총이익"
                value={pl.grossProfit}
                bold
                badge={`${pl.grossMargin.toFixed(1)}%`}
              />
              <PLRow
                label="판매관리비"
                value={-pl.totalSellingExpenses}
                negative
              />
              <Divider />
              <PLRow
                label="영업이익"
                value={pl.operatingProfit}
                bold
                highlight
                badge={`${pl.operatingMargin.toFixed(1)}%`}
              />
              {!includeVat && (
                <PLRow label="부가세" value={-pl.vatAmount} negative />
              )}
            </div>
          )}
        </section>

        {/* 판관비 카테고리별 합계 */}
        {!pl.isLoading && pl.sellingExpenses.length > 0 && (
          <section style={cardStyle}>
            <h2 style={cardTitleStyle}>판매관리비 상세</h2>
            <div style={{ display: 'grid', gap: 4 }}>
              {pl.sellingExpenses
                .filter((e: PlExpenseLine) => e.amount > 0)
                .map((e) => (
                  <div
                    key={e.categoryId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 4px',
                      borderBottom: '1px solid var(--m-border)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: 'var(--m-text-secondary)' }}>
                      {e.categoryName}
                    </span>
                    <span
                      style={{
                        color: 'var(--m-text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ₩{fmtWon(e.amount)}
                    </span>
                  </div>
                ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 4px 2px',
                  marginTop: 2,
                  borderTop: '2px solid var(--m-border-strong)',
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: 'var(--m-text)' }}>합계</span>
                <span
                  style={{
                    color: 'var(--m-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ₩{fmtWon(pl.totalSellingExpenses)}
                </span>
              </div>
            </div>
            <p
              style={{
                marginTop: 8,
                fontSize: 10.5,
                color: 'var(--m-text-secondary)',
              }}
            >
              항목별 직접 입력·은행거래내역 업로드는 데스크탑 화면에서 가능합니다.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 하위 컴포넌트

function CogsBlock({
  detail,
  includeVat,
}: {
  detail: CogsDetail;
  includeVat: boolean;
}) {
  return (
    <div style={{ padding: '4px 6px 6px 24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: 12.5,
          color: 'var(--m-text)',
          marginBottom: 4,
        }}
      >
        <span style={{ marginRight: 4, color: 'var(--m-text-secondary)' }}>└</span>
        매출원가
        {includeVat && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10,
              color: 'var(--m-text-secondary)',
            }}
          >
            ※ 부가세(10%) 포함
          </span>
        )}
      </div>
      <div
        style={{
          marginLeft: 12,
          paddingLeft: 8,
          borderLeft: '2px solid var(--m-border)',
        }}
      >
        <CogsLine label="기초재고" value={detail.beginningInventory} />
        <CogsLine label="수입입고" value={detail.importPurchase} />
        <CogsLine
          label="기말재고"
          value={-detail.endingInventory}
          negative
        />
        <div
          style={{
            borderTop: '1px solid var(--m-border)',
            marginTop: 3,
            paddingTop: 3,
          }}
        >
          <CogsLine
            label="매출원가 합계"
            value={-detail.total}
            negative
            bold
          />
        </div>
      </div>
    </div>
  );
}

function CogsLine({
  label,
  value,
  negative,
  bold,
}: {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '2px 2px',
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          color: bold ? 'var(--m-text)' : 'var(--m-text-secondary)',
          fontWeight: bold ? 600 : 400,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: negative ? 'var(--m-danger, #ef4444)' : 'var(--m-text)',
          fontWeight: bold ? 700 : 400,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ₩{fmtWon(value)}
      </span>
    </div>
  );
}

function PLRow({
  label,
  value,
  bold,
  negative,
  highlight,
  badge,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  highlight?: boolean;
  badge?: string;
}) {
  const valColor = highlight
    ? value >= 0
      ? 'var(--m-primary)'
      : 'var(--m-danger, #ef4444)'
    : negative
      ? 'var(--m-danger, #ef4444)'
      : 'var(--m-text)';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 6,
        background: highlight
          ? 'color-mix(in srgb, var(--m-primary) 8%, transparent)'
          : 'transparent',
      }}
    >
      <span
        style={{
          fontSize: bold ? 13 : 12.5,
          fontWeight: bold ? 600 : 400,
          color: 'var(--m-text)',
        }}
      >
        {label}
      </span>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {badge && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 999,
              background:
                value >= 0
                  ? 'color-mix(in srgb, var(--m-primary) 12%, transparent)'
                  : 'color-mix(in srgb, var(--m-danger, #ef4444) 12%, transparent)',
              color:
                value >= 0
                  ? 'var(--m-primary)'
                  : 'var(--m-danger, #ef4444)',
              fontFamily: 'Inter Tight, system-ui, sans-serif',
            }}
          >
            {badge}
          </span>
        )}
        <span
          style={{
            fontSize: highlight ? 14.5 : bold ? 13.5 : 12.5,
            fontWeight: bold || highlight ? 700 : 400,
            color: valColor,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ₩{fmtWon(value)}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: 'var(--m-border)',
        margin: '4px 8px',
      }}
    />
  );
}

// ───────────────────────────────────────────────────────────
// 스타일

const cardStyle: React.CSSProperties = {
  background: 'var(--m-surface)',
  border: '1px solid var(--m-border)',
  borderRadius: 10,
  padding: 12,
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 10,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--m-text)',
};

const selectStyle: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--m-border-strong)',
  borderRadius: 6,
  fontSize: 12,
  background: 'var(--m-surface)',
  color: 'var(--m-text)',
  outline: 'none',
};
