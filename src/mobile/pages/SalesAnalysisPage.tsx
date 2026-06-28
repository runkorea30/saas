/**
 * 모바일 매출분석 — 데스크톱 OPS 페이지와 동일 구조 (3탭 + 동일 훅·피벗).
 *
 * 3탭:
 *  1) 월별매출내역 — 거래처 × 월 (금액)
 *  2) 일별매출내역 — 날짜 × 거래처 (금액)
 *  3) 제품별판매  — 제품 × 월 (수량)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 * 🔴 CLAUDE.md §5: useSalesAnalysis (fetchAllRows 경유) — 연도 1회 fetch.
 * 🟠 데스크톱과 동일 피벗 헬퍼(pivotMonthly/Daily/ByProduct) 재사용.
 *
 * 모바일 적응:
 *  - 디자인 토큰 var(--m-*) 사용 (OPS 토큰과 격리)
 *  - 폰트 크기 축소(11~12px), 패딩 축소
 *  - 헤더·필터바 컴팩트, 테이블 가로 스크롤 + 좌측 첫 컬럼 sticky
 */
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useCompany } from '@/hooks/useCompany';
import {
  useSalesAnalysis,
  pivotMonthly,
  pivotDaily,
  pivotByProduct,
  getCustomerList,
  getCategoryList,
  type MonthlySalesRow,
  type DailySalesRow,
  type ProductSalesRow,
  type CustomerColumn,
} from '@/hooks/queries/useSalesAnalysis';
import { useProfitLoss } from '@/hooks/queries/useProfitLoss';
import { getCategoryLabel } from '@/constants/categories';
import { RefreshButton } from '../components/RefreshButton';

type TabKey = 'monthly' | 'daily' | 'product';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function fmtNum(v: number): string {
  return v.toLocaleString('ko-KR');
}

export function SalesAnalysisPage() {
  const { companyId } = useCompany();
  const now = new Date();

  const [tab, setTab] = useState<TabKey>('monthly');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [monthFilter, setMonthFilter] = useState<number[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const salesQuery = useSalesAnalysis(companyId, year);
  const { data: rawRows = [], isLoading, error } = salesQuery;
  const refreshing = salesQuery.isFetching;
  const handleRefresh = () => {
    void salesQuery.refetch();
  };

  const customers = useMemo(() => getCustomerList(rawRows), [rawRows]);
  const categories = useMemo(() => getCategoryList(rawRows), [rawRows]);

  const monthlyData = useMemo(
    () => pivotMonthly(rawRows, customerFilter || null),
    [rawRows, customerFilter],
  );
  const dailyData = useMemo(
    () => pivotDaily(rawRows, monthFilter, customerFilter || null),
    [rawRows, monthFilter, customerFilter],
  );
  const productData = useMemo(
    () =>
      pivotByProduct(
        rawRows,
        monthFilter,
        customerFilter || null,
        categoryFilter || null,
        searchQuery,
      ),
    [rawRows, monthFilter, customerFilter, categoryFilter, searchQuery],
  );

  const itemCount =
    tab === 'monthly'
      ? monthlyData.length
      : tab === 'daily'
        ? dailyData.rows.length
        : productData.length;
  const itemLabel = tab === 'product' ? '제품' : '업체';

  const handleExcel = () => {
    if (tab === 'monthly') downloadMonthlyExcel(year, monthlyData);
    else if (tab === 'daily') downloadDailyExcel(year, monthFilter, dailyData);
    else downloadProductExcel(year, productData);
  };

  return (
    <div>
      {/* 페이지 헤더 */}
      <header className="m-page-header" style={{ paddingBottom: 4 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <h1 className="m-page-title">매출분석</h1>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}>
            {itemCount.toLocaleString('ko-KR')}개 {itemLabel}
          </span>
          <button
            type="button"
            onClick={handleExcel}
            disabled={itemCount === 0 || isLoading}
            style={excelBtnStyle(itemCount === 0 || isLoading)}
          >
            엑셀
          </button>
          <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
        </div>
        <div className="m-tab-row">
          <button
            type="button"
            className="m-tab"
            aria-pressed={tab === 'monthly'}
            onClick={() => setTab('monthly')}
          >
            월별매출
          </button>
          <button
            type="button"
            className="m-tab"
            aria-pressed={tab === 'daily'}
            onClick={() => setTab('daily')}
          >
            일별매출
          </button>
          <button
            type="button"
            className="m-tab"
            aria-pressed={tab === 'product'}
            onClick={() => setTab('product')}
          >
            제품별판매
          </button>
        </div>
      </header>

      {/* 이번달 손익 요약 카드 — 데스크탑 손익계산서 페이지의 당월 발췌 */}
      <ProfitLossSummaryCard
        companyId={companyId}
        year={now.getFullYear()}
        month={now.getMonth() + 1}
      />

      {/* 필터 바 */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--m-surface-2)',
          borderBottom: '1px solid var(--m-border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={selectStyle}
        >
          {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()].map(
            (y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ),
          )}
        </select>

        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          style={{ ...selectStyle, minWidth: 100 }}
        >
          <option value="">전체 거래처</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {tab === 'product' && (
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ ...selectStyle, minWidth: 90 }}
            >
              <option value="">전체 분류</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {getCategoryLabel(c)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="제품·코드 검색"
              style={{ ...selectStyle, flex: 1, minWidth: 100 }}
            />
          </>
        )}

        {/* 월 필터 — 탭2/3 만 */}
        {(tab === 'daily' || tab === 'product') && (
          <MonthMultiSelect value={monthFilter} onChange={setMonthFilter} />
        )}
      </div>

      {error && (
        <div
          style={{
            margin: '10px 16px',
            padding: '10px 12px',
            background: 'var(--m-danger)' + '11',
            color: 'var(--m-danger)',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          데이터 로딩 실패: {(error as Error).message}
        </div>
      )}

      {/* 테이블 */}
      <div style={{ padding: '10px 16px 16px' }}>
        {isLoading ? (
          <div className="m-empty">불러오는 중…</div>
        ) : tab === 'monthly' ? (
          <MonthlyTable data={monthlyData} />
        ) : tab === 'daily' ? (
          <DailyTable data={dailyData} />
        ) : (
          <ProductTable data={productData} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 탭 1: 월별매출
// ───────────────────────────────────────────────────────────

function MonthlyTable({ data }: { data: MonthlySalesRow[] }) {
  if (data.length === 0) {
    return <EmptyMessage text="해당 기간의 매출 데이터가 없습니다." />;
  }
  const totals = aggregateMonthly(data);
  return (
    <TableContainer>
      <table style={tableStyle}>
        <thead>
          <tr style={theadRowStyle}>
            <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 110 }}>
              업체명
            </th>
            <th style={{ ...thStyle, textAlign: 'right', minWidth: 88 }}>
              합계
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                style={{ ...thStyle, textAlign: 'right', minWidth: 72 }}
              >
                {m}월
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr style={totalRowStyle}>
            <td
              style={{
                ...tdStyle,
                ...stickyLeftStyle,
                background: 'var(--m-surface-2)',
              }}
            >
              합계
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {fmtNum(totals.grand)}
            </td>
            {MONTHS.map((m) => (
              <td key={m} style={{ ...tdStyle, textAlign: 'right' }}>
                {totals.byMonth[m] ? fmtNum(totals.byMonth[m]) : ''}
              </td>
            ))}
          </tr>
          {data.map((row) => (
            <tr key={row.customer_id} style={rowStyle}>
              <td
                style={{
                  ...tdStyle,
                  ...stickyLeftStyle,
                  textAlign: 'left',
                  background: 'var(--m-surface)',
                }}
                title={row.customer_name}
              >
                {row.customer_name}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                {fmtNum(row.total)}
              </td>
              {MONTHS.map((m) => (
                <td key={m} style={{ ...tdStyle, textAlign: 'right' }}>
                  {row.monthly[m] ? fmtNum(row.monthly[m]) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableContainer>
  );
}

function aggregateMonthly(data: MonthlySalesRow[]) {
  const byMonth: Record<number, number> = {};
  let grand = 0;
  for (const r of data) {
    grand += r.total;
    for (const k of Object.keys(r.monthly)) {
      const m = Number(k);
      byMonth[m] = (byMonth[m] ?? 0) + r.monthly[m];
    }
  }
  return { grand, byMonth };
}

// ───────────────────────────────────────────────────────────
// 탭 2: 일별매출
// ───────────────────────────────────────────────────────────

function DailyTable({
  data,
}: {
  data: { rows: DailySalesRow[]; customers: CustomerColumn[] };
}) {
  if (data.rows.length === 0) {
    return <EmptyMessage text="해당 기간의 매출 데이터가 없습니다." />;
  }
  const { rows, customers } = data;
  const totals = aggregateDaily(rows, customers);
  return (
    <TableContainer>
      <table style={tableStyle}>
        <thead>
          <tr style={theadRowStyle}>
            <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 84 }}>
              날짜
            </th>
            <th style={{ ...thStyle, textAlign: 'right', minWidth: 88 }}>
              합계
            </th>
            {customers.map((c) => (
              <th
                key={c.id}
                style={{ ...thStyle, textAlign: 'right', minWidth: 80 }}
                title={c.name}
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} style={rowStyle}>
              <td
                style={{
                  ...tdStyle,
                  ...stickyLeftStyle,
                  textAlign: 'left',
                  background: 'var(--m-surface)',
                  fontFamily: 'Inter Tight, system-ui, sans-serif',
                }}
              >
                {r.date}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                {fmtNum(r.total)}
              </td>
              {customers.map((c) => (
                <td key={c.id} style={{ ...tdStyle, textAlign: 'right' }}>
                  {r.byCustomer[c.id] ? fmtNum(r.byCustomer[c.id]) : ''}
                </td>
              ))}
            </tr>
          ))}
          <tr style={totalRowStyle}>
            <td
              style={{
                ...tdStyle,
                ...stickyLeftStyle,
                background: 'var(--m-surface-2)',
              }}
            >
              합계
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {fmtNum(totals.grand)}
            </td>
            {customers.map((c) => (
              <td key={c.id} style={{ ...tdStyle, textAlign: 'right' }}>
                {totals.byCustomer[c.id]
                  ? fmtNum(totals.byCustomer[c.id])
                  : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </TableContainer>
  );
}

function aggregateDaily(rows: DailySalesRow[], customers: CustomerColumn[]) {
  const byCustomer: Record<string, number> = {};
  let grand = 0;
  for (const r of rows) {
    grand += r.total;
    for (const c of customers) {
      if (r.byCustomer[c.id]) {
        byCustomer[c.id] = (byCustomer[c.id] ?? 0) + r.byCustomer[c.id];
      }
    }
  }
  return { grand, byCustomer };
}

// ───────────────────────────────────────────────────────────
// 탭 3: 제품별판매
// ───────────────────────────────────────────────────────────

function ProductTable({ data }: { data: ProductSalesRow[] }) {
  if (data.length === 0) {
    return <EmptyMessage text="해당 조건의 판매 데이터가 없습니다." />;
  }
  const totals = aggregateProduct(data);
  return (
    <TableContainer>
      <table style={tableStyle}>
        <thead>
          <tr style={theadRowStyle}>
            <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 100 }}>
              코드
            </th>
            <th style={{ ...thStyle, minWidth: 180, textAlign: 'left' }}>
              제품명
            </th>
            <th style={{ ...thStyle, minWidth: 88 }}>분류</th>
            <th style={{ ...thStyle, textAlign: 'right', minWidth: 72 }}>
              합계
            </th>
            {MONTHS.map((m) => (
              <th
                key={m}
                style={{ ...thStyle, textAlign: 'right', minWidth: 64 }}
              >
                {m}월
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.product_id} style={rowStyle}>
              <td
                style={{
                  ...tdStyle,
                  ...stickyLeftStyle,
                  textAlign: 'left',
                  background: 'var(--m-surface)',
                  fontFamily: 'Inter Tight, system-ui, sans-serif',
                }}
                title={p.product_code}
              >
                {p.product_code}
              </td>
              <td
                style={{ ...tdStyle, textAlign: 'left' }}
                title={p.product_name}
              >
                {p.product_name}
              </td>
              <td style={{ ...tdStyle, color: 'var(--m-text-secondary)' }}>
                {getCategoryLabel(p.category)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                {fmtNum(p.total)}
              </td>
              {MONTHS.map((m) => (
                <td key={m} style={{ ...tdStyle, textAlign: 'right' }}>
                  {p.monthly[m] ? fmtNum(p.monthly[m]) : ''}
                </td>
              ))}
            </tr>
          ))}
          <tr style={totalRowStyle}>
            <td
              style={{
                ...tdStyle,
                ...stickyLeftStyle,
                background: 'var(--m-surface-2)',
                textAlign: 'left',
              }}
              colSpan={3}
            >
              합계
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {fmtNum(totals.grand)}
            </td>
            {MONTHS.map((m) => (
              <td key={m} style={{ ...tdStyle, textAlign: 'right' }}>
                {totals.byMonth[m] ? fmtNum(totals.byMonth[m]) : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </TableContainer>
  );
}

function aggregateProduct(data: ProductSalesRow[]) {
  const byMonth: Record<number, number> = {};
  let grand = 0;
  for (const r of data) {
    grand += r.total;
    for (const k of Object.keys(r.monthly)) {
      const m = Number(k);
      byMonth[m] = (byMonth[m] ?? 0) + r.monthly[m];
    }
  }
  return { grand, byMonth };
}

// ───────────────────────────────────────────────────────────
// 엑셀 다운로드 (데스크톱과 동일 양식)
// ───────────────────────────────────────────────────────────

function downloadMonthlyExcel(year: number, rows: MonthlySalesRow[]) {
  const header = ['업체명', '합계', ...MONTHS.map((m) => `${m}월`)];
  const totals = aggregateMonthly(rows);
  const totalRow: (string | number)[] = [
    '합계',
    totals.grand,
    ...MONTHS.map((m) => totals.byMonth[m] ?? 0),
  ];
  const body: (string | number)[][] = rows.map((r) => [
    r.customer_name,
    r.total,
    ...MONTHS.map((m) => r.monthly[m] ?? 0),
  ]);
  const aoa = [header, totalRow, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, ...Array(12).fill({ wch: 11 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '월별매출');
  XLSX.writeFile(wb, `월별매출내역_${year}년.xlsx`);
}

function downloadDailyExcel(
  year: number,
  monthFilter: number[],
  daily: { rows: DailySalesRow[]; customers: CustomerColumn[] },
) {
  const { rows, customers } = daily;
  const header = ['날짜', '합계', ...customers.map((c) => c.name)];
  const body: (string | number)[][] = rows.map((r) => [
    r.date,
    r.total,
    ...customers.map((c) => r.byCustomer[c.id] ?? 0),
  ]);
  const totals = aggregateDaily(rows, customers);
  const totalRow: (string | number)[] = [
    '합계',
    totals.grand,
    ...customers.map((c) => totals.byCustomer[c.id] ?? 0),
  ];
  const aoa = [header, ...body, totalRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 14 },
    ...customers.map(() => ({ wch: 12 })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '일별매출');
  const suffix =
    monthFilter.length > 0
      ? `_${monthFilter.sort((a, b) => a - b).join('_')}월`
      : '';
  XLSX.writeFile(wb, `일별매출내역_${year}년${suffix}.xlsx`);
}

function downloadProductExcel(year: number, rows: ProductSalesRow[]) {
  const header = [
    '코드',
    '제품명',
    '분류',
    '합계',
    ...MONTHS.map((m) => `${m}월`),
  ];
  const body: (string | number)[][] = rows.map((p) => [
    p.product_code,
    p.product_name,
    getCategoryLabel(p.category),
    p.total,
    ...MONTHS.map((m) => p.monthly[m] ?? 0),
  ]);
  const totals = aggregateProduct(rows);
  const totalRow: (string | number)[] = [
    '',
    '합계',
    '',
    totals.grand,
    ...MONTHS.map((m) => totals.byMonth[m] ?? 0),
  ];
  const aoa = [header, ...body, totalRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 32 },
    { wch: 12 },
    { wch: 10 },
    ...Array(12).fill({ wch: 8 }),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '제품별판매');
  XLSX.writeFile(wb, `제품별판매_${year}년.xlsx`);
}

// ───────────────────────────────────────────────────────────
// 하위 컴포넌트
// ───────────────────────────────────────────────────────────

function MonthMultiSelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const toggle = (m: number) => {
    if (value.includes(m)) onChange(value.filter((x) => x !== m));
    else onChange([...value, m].sort((a, b) => a - b));
  };
  return (
    <div style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => onChange([])}
        style={monthBtnStyle(value.length === 0)}
      >
        전체
      </button>
      {MONTHS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => toggle(m)}
          style={monthBtnStyle(value.includes(m))}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function TableContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--m-surface)',
        border: '1px solid var(--m-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 280px)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        color: 'var(--m-text-secondary)',
        background: 'var(--m-surface)',
        border: '1px solid var(--m-border)',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 손익 요약 카드 (당월) — 데스크탑 손익계산서 발췌
// ───────────────────────────────────────────────────────────

function ProfitLossSummaryCard({
  companyId,
  year,
  month,
}: {
  companyId: string | null;
  year: number;
  month: number;
}) {
  const pl = useProfitLoss({
    companyId,
    mode: 'monthly',
    year,
    month,
    includeVat: true,
  });

  const fmt = (n: number) =>
    Math.round(n).toLocaleString('ko-KR');

  return (
    <div style={{ padding: '8px 16px 0' }}>
      <div
        style={{
          background: 'var(--m-surface)',
          border: '1px solid var(--m-border)',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--m-text)',
            }}
          >
            이번달 손익
          </span>
          <span
            style={{ fontSize: 10.5, color: 'var(--m-text-secondary)' }}
          >
            {year}년 {month}월 · 부가세 포함
          </span>
        </div>
        {pl.isLoading ? (
          <div
            style={{
              fontSize: 11,
              color: 'var(--m-text-secondary)',
              padding: '4px 0',
            }}
          >
            계산 중…
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 4, fontSize: 11.5 }}>
            <PLLine label="매출액" value={pl.displayRevenue} fmt={fmt} />
            <PLLine
              label="매출원가"
              value={-pl.cogs}
              negative
              fmt={fmt}
            />
            <PLLine
              label="매출총이익"
              value={pl.grossProfit}
              bold
              border
              fmt={fmt}
            />
            <PLLine
              label="판관비"
              value={-pl.totalSellingExpenses}
              negative
              fmt={fmt}
            />
            <PLLine
              label="영업이익"
              value={pl.operatingProfit}
              bold
              highlight
              border
              fmt={fmt}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PLLine({
  label,
  value,
  negative,
  bold,
  highlight,
  border,
  fmt,
}: {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
  highlight?: boolean;
  border?: boolean;
  fmt: (n: number) => string;
}) {
  const valueColor = highlight
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
        paddingTop: border ? 4 : 0,
        borderTop: border ? '1px solid var(--m-border)' : undefined,
      }}
    >
      <span style={{ color: 'var(--m-text-secondary)' }}>{label}</span>
      <span
        style={{
          color: valueColor,
          fontWeight: bold ? 700 : 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ₩{fmt(value)}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 스타일
// ───────────────────────────────────────────────────────────

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

function monthBtnStyle(active: boolean): React.CSSProperties {
  return {
    height: 24,
    minWidth: 26,
    padding: '0 6px',
    border: `1px solid ${active ? 'var(--m-primary)' : 'var(--m-border-strong)'}`,
    borderRadius: 4,
    fontSize: 10.5,
    background: active ? 'var(--m-primary)' : 'var(--m-surface)',
    color: active ? '#ffffff' : 'var(--m-text)',
    cursor: 'pointer',
    fontFamily: 'Inter Tight, system-ui, sans-serif',
  };
}

function excelBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--m-primary)',
    background: disabled ? 'var(--m-surface-2)' : 'var(--m-primary)',
    color: disabled ? 'var(--m-text-secondary)' : '#ffffff',
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11.5,
};

const theadRowStyle: React.CSSProperties = {
  background: 'var(--m-surface-2)',
  borderBottom: '1px solid var(--m-border)',
};

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--m-border)',
};

const totalRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--m-border)',
  background: 'var(--m-surface-2)',
  fontWeight: 600,
};

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--m-text-secondary)',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  borderRight: '1px solid var(--m-border)',
  position: 'sticky',
  top: 0,
  background: 'var(--m-surface-2)',
  zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  whiteSpace: 'nowrap',
  borderRight: '1px solid var(--m-border)',
  color: 'var(--m-text)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
};

/** 첫 컬럼 sticky 좌측 고정 — 가로 스크롤 시에도 노출. */
const stickyLeftStyle: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
};
