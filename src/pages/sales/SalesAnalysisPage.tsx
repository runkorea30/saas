/**
 * 매출분석 페이지 — 판매 > 매출분석.
 *
 * 3탭 피벗 분석:
 *  1) 월별매출내역 — 거래처 × 월 (금액)
 *  2) 일별매출내역 — 날짜 × 거래처 (금액)
 *  3) 제품별판매  — 제품 × 월 (수량)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 useSalesAnalysis (fetchAllRows 경유).
 * 🟠 연도 1회 fetch 후 클라이언트 피벗 — 탭/필터 전환 시 재요청 없음.
 *
 * 🟡 매출 금액 기준: order_items.amount 그대로 사용.
 *    현재 INSERT 정책상 amount = quantity × 공급가 (거래처 포털·OPS 양쪽).
 */
import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
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
import { getCategoryLabel } from '@/constants/categories';

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
  const [monthFilter, setMonthFilter] = useState<number[]>([]); // 빈 배열 = 전체
  const [customerFilter, setCustomerFilter] = useState<string>(''); // 빈 문자열 = 전체
  const [categoryFilter, setCategoryFilter] = useState<string>(''); // 탭3 전용
  const [searchQuery, setSearchQuery] = useState(''); // 탭3 전용

  const {
    data: rawRows = [],
    isLoading,
    error,
  } = useSalesAnalysis(companyId, year);

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

  // ───── 엑셀 다운로드 ─────
  const handleExcel = () => {
    if (tab === 'monthly') downloadMonthlyExcel(year, monthlyData);
    else if (tab === 'daily') downloadDailyExcel(year, monthFilter, dailyData);
    else downloadProductExcel(year, productData);
  };

  // ───── 렌더 ─────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '12px 32px 80px',
          maxWidth: 1720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 페이지 헤더 */}
        <header style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            판매 › 매출분석
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="disp"
              style={{
                fontSize: 20,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
                lineHeight: 1.1,
              }}
            >
              매출분석
            </h1>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {itemCount.toLocaleString('ko-KR')}개 {itemLabel}
            </span>
            <button
              type="button"
              onClick={handleExcel}
              disabled={itemCount === 0 || isLoading}
              className="btn-base"
              style={{ height: 30, fontSize: 12 }}
            >
              <Download size={13} /> 엑셀
            </button>
          </div>
        </header>

        {/* 탭 */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            borderBottom: '1px solid var(--line)',
            marginBottom: 10,
          }}
        >
          <TabButton active={tab === 'monthly'} onClick={() => setTab('monthly')}>
            월별매출내역
          </TabButton>
          <TabButton active={tab === 'daily'} onClick={() => setTab('daily')}>
            일별매출내역
          </TabButton>
          <TabButton active={tab === 'product'} onClick={() => setTab('product')}>
            제품별판매
          </TabButton>
        </div>

        {/* 필터 바 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '8px 12px',
            background: 'var(--surface-2, #fafafa)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          <FilterLabel>연도</FilterLabel>
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

          <FilterLabel>월</FilterLabel>
          <MonthMultiSelect value={monthFilter} onChange={setMonthFilter} />

          <FilterLabel>거래처</FilterLabel>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            style={{ ...selectStyle, minWidth: 140 }}
          >
            <option value="">전체</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {tab === 'product' && (
            <>
              <FilterLabel>분류</FilterLabel>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ ...selectStyle, minWidth: 130 }}
              >
                <option value="">전체</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {getCategoryLabel(c)}
                  </option>
                ))}
              </select>
              <div style={{ position: 'relative' }}>
                <Search
                  size={12}
                  color="var(--ink-3)"
                  strokeWidth={1.6}
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: 9,
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="제품명 · 코드"
                  style={{
                    height: 28,
                    padding: '0 8px 0 24px',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    fontSize: 12,
                    outline: 'none',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    width: 180,
                  }}
                />
              </div>
            </>
          )}

          <div style={{ flex: 1 }} />
        </div>

        {/* 에러 */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--danger-wash)',
              color: 'var(--danger)',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 10,
            }}
          >
            데이터 로딩 실패: {(error as Error).message}
          </div>
        )}

        {/* 테이블 */}
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
            불러오는 중…
          </div>
        ) : tab === 'monthly' ? (
          <MonthlyTable data={monthlyData} />
        ) : tab === 'daily' ? (
          <DailyTable data={dailyData} />
        ) : (
          <ProductTable data={productData} />
        )}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 탭 1: 월별매출내역
// ───────────────────────────────────────────────────────────

function MonthlyTable({ data }: { data: MonthlySalesRow[] }) {
  if (data.length === 0) {
    return <EmptyMessage text="해당 기간의 매출 데이터가 없습니다." />;
  }
  // 합계 행 계산
  const totals = aggregateMonthly(data);
  return (
    <TableContainer>
      <table style={tableStyle}>
        <thead>
          <tr style={theadRowStyle}>
            <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 160 }}>업체명</th>
            <th style={{ ...thStyle, textAlign: 'right', minWidth: 120 }}>합계</th>
            {MONTHS.map((m) => (
              <th
                key={m}
                style={{ ...thStyle, textAlign: 'right', minWidth: 100 }}
              >
                {m}월
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 합계 행 — 첫 행 */}
          <tr style={{ ...rowStyle, background: 'var(--surface-2, #fafafa)', fontWeight: 600 }}>
            <td style={{ ...tdStyle, ...stickyLeftStyle, background: 'var(--surface-2, #fafafa)' }}>
              합계
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(totals.grand)}</td>
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
                  background: 'var(--surface)',
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
// 탭 2: 일별매출내역
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
  // 합계 행 계산
  const totals = aggregateDaily(rows, customers);
  return (
    <TableContainer>
      <table style={tableStyle}>
        <thead>
          <tr style={theadRowStyle}>
            <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 100 }}>날짜</th>
            <th style={{ ...thStyle, textAlign: 'right', minWidth: 120 }}>합계</th>
            {customers.map((c) => (
              <th
                key={c.id}
                style={{ ...thStyle, textAlign: 'right', minWidth: 110 }}
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
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-num)',
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
          {/* 합계 행 — 마지막 */}
          <tr
            style={{
              ...rowStyle,
              background: 'var(--surface-2, #fafafa)',
              fontWeight: 600,
            }}
          >
            <td
              style={{
                ...tdStyle,
                ...stickyLeftStyle,
                background: 'var(--surface-2, #fafafa)',
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
            <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 120 }}>코드</th>
            <th style={{ ...thStyle, minWidth: 240, textAlign: 'left' }}>
              제품명
            </th>
            <th style={{ ...thStyle, minWidth: 100 }}>분류</th>
            <th style={{ ...thStyle, textAlign: 'right', minWidth: 90 }}>합계</th>
            {MONTHS.map((m) => (
              <th
                key={m}
                style={{ ...thStyle, textAlign: 'right', minWidth: 80 }}
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
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-num)',
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
              <td style={{ ...tdStyle, color: 'var(--ink-3)' }}>
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
          {/* 합계 행 — 마지막 */}
          <tr
            style={{
              ...rowStyle,
              background: 'var(--surface-2, #fafafa)',
              fontWeight: 600,
            }}
          >
            <td
              style={{
                ...tdStyle,
                ...stickyLeftStyle,
                background: 'var(--surface-2, #fafafa)',
                textAlign: 'left',
              }}
              colSpan={3}
            >
              합계
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(totals.grand)}</td>
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
// 엑셀 다운로드
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
// 하위 컴포넌트 / 스타일
// ───────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--brand)'
          : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--ink)' : 'var(--ink-3)',
      }}
    >
      {children}
    </button>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
      {children}
    </span>
  );
}

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
        style={{
          ...monthBtnStyle,
          background: value.length === 0 ? 'var(--brand)' : 'transparent',
          color: value.length === 0 ? '#fff' : 'var(--ink)',
          borderColor: value.length === 0 ? 'var(--brand)' : 'var(--line)',
        }}
      >
        전체
      </button>
      {MONTHS.map((m) => {
        const on = value.includes(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            style={{
              ...monthBtnStyle,
              background: on ? 'var(--brand)' : 'transparent',
              color: on ? '#fff' : 'var(--ink)',
              borderColor: on ? 'var(--brand)' : 'var(--line)',
            }}
          >
            {m}월
          </button>
        );
      })}
    </div>
  );
}

function TableContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
        {children}
      </div>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 60,
        textAlign: 'center',
        color: 'var(--ink-3)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

// ───── 스타일 ─────

const selectStyle: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12,
  background: 'var(--surface)',
  color: 'var(--ink)',
  outline: 'none',
};

const monthBtnStyle: React.CSSProperties = {
  height: 26,
  padding: '0 8px',
  border: '1px solid var(--line)',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'var(--font-num)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const theadRowStyle: React.CSSProperties = {
  background: 'var(--surface-2, #fafafa)',
  borderBottom: '1px solid var(--line)',
};

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--line)',
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ink-2)',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  borderRight: '1px solid var(--line)',
  position: 'sticky',
  top: 0,
  background: 'var(--surface-2, #fafafa)',
  zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  whiteSpace: 'nowrap',
  borderRight: '1px solid var(--line)',
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
};

/** 첫 컬럼 sticky 좌측 고정 — 가로 스크롤 시에도 노출. */
const stickyLeftStyle: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
};
