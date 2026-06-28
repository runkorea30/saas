/**
 * 손익계산서 페이지 — 재무 › 손익계산서.
 *
 * 모드: 월별 / 연간 / 기간선택(custom 다중 월)
 * 부가세 토글: 포함(총액) / 제외(공급가액 + 부가세 라인)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §2: 모든 계산은 useProfitLoss / utils 에서. 페이지는 표시만.
 * 🟠 판관비 입력 폼은 monthly 모드에서만 활성화 — yearly/custom 은 합산 읽기전용.
 */
import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from '@/components/ui/Toast';
import {
  useProfitLoss,
  DEFAULT_EXCHANGE_RATE,
  type PlMode,
} from '@/hooks/queries/useProfitLoss';
import {
  usePlExpenseCategories,
  useAddPlExpenseCategory,
  useDeletePlExpenseCategory,
} from '@/hooks/queries/usePlExpenseCategories';
import {
  usePlExpensesForMonth,
  useSavePlExpense,
} from '@/hooks/queries/usePlExpenses';
import { BankExpenseSection } from '@/components/feature/finance/BankExpenseSection';

const BRAND = '#6B1F2A';
const TARIFF_STORAGE_KEY = 'pl_tariff_rate';
const DEFAULT_TARIFF_RATE = 8;

function loadTariffRate(): number {
  if (typeof window === 'undefined') return DEFAULT_TARIFF_RATE;
  try {
    const raw = window.localStorage.getItem(TARIFF_STORAGE_KEY);
    if (raw == null) return DEFAULT_TARIFF_RATE;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TARIFF_RATE;
  } catch {
    return DEFAULT_TARIFF_RATE;
  }
}

function fmtWon(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return '0';
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toLocaleString('ko-KR');
}

export function IncomeStatementPage() {
  const now = new Date();
  const { companyId } = useCompany();
  const { showToast } = useToast();

  const [mode, setMode] = useState<PlMode>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([
    now.getMonth() + 1,
  ]);
  const [includeVat, setIncludeVat] = useState(true);
  const [tariffRate, setTariffRateState] = useState<number>(loadTariffRate);
  const setTariffRate = (n: number) => {
    setTariffRateState(n);
    try {
      window.localStorage.setItem(TARIFF_STORAGE_KEY, String(n));
    } catch {
      /* ignore */
    }
  };

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  const pl = useProfitLoss({
    companyId,
    mode,
    year,
    month: mode === 'monthly' ? month : undefined,
    months: mode === 'custom' ? selectedMonths : undefined,
    includeVat,
    tariffRate,
  });

  const categoriesQ = usePlExpenseCategories(companyId);
  const categories = categoriesQ.data ?? [];

  // 월별 입력 폼용 현재 (year, month) 의 카테고리별 금액 맵.
  const monthExpensesQ = usePlExpensesForMonth(companyId, year, month);
  const monthExpenseMap = monthExpensesQ.data ?? new Map<string, number>();

  const saveMut = useSavePlExpense();
  const addCatMut = useAddPlExpenseCategory(companyId);
  const delCatMut = useDeletePlExpenseCategory(companyId);

  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [newCategoryName, setNewCategoryName] = useState('');

  const draftValue = (categoryId: string): string => {
    if (drafts.has(categoryId)) return drafts.get(categoryId)!;
    const v = monthExpenseMap.get(categoryId);
    return v != null && v > 0 ? String(v) : '';
  };

  const onDraftChange = (categoryId: string, raw: string) => {
    const next = new Map(drafts);
    next.set(categoryId, raw);
    setDrafts(next);
  };

  const onDraftBlur = (categoryId: string) => {
    if (!companyId) return;
    const raw = drafts.get(categoryId);
    if (raw == null) return;
    const n = Math.max(0, Math.floor(Number(raw)));
    const safe = Number.isFinite(n) ? n : 0;
    saveMut.mutate(
      { companyId, categoryId, year, month, amountKrw: safe },
      {
        onSuccess: () => {
          const next = new Map(drafts);
          next.delete(categoryId);
          setDrafts(next);
        },
        onError: (e) => showToast({ kind: 'error', text: e.message }),
      },
    );
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    addCatMut.mutate(name, {
      onSuccess: () => {
        setNewCategoryName('');
        showToast({ kind: 'success', text: `"${name}" 추가됨` });
      },
      onError: (e) => showToast({ kind: 'error', text: e.message }),
    });
  };

  const handleDeleteCategory = (id: string, name: string) => {
    if (!window.confirm(`"${name}" 항목을 삭제하시겠습니까?`)) return;
    delCatMut.mutate(id, {
      onSuccess: () => showToast({ kind: 'success', text: '삭제되었습니다' }),
      onError: (e) => showToast({ kind: 'error', text: e.message }),
    });
  };

  const toggleSelectedMonth = (m: number) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  };

  // 우측: monthly 가 아니면 카테고리별 합산을 read-only 로 보여줌.
  const aggregateExpenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of pl.sellingExpenses) map.set(e.categoryId, e.amount);
    return map;
  }, [pl.sellingExpenses]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '20px 32px 80px',
          maxWidth: 1720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 헤더 */}
        <header className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              재무 › 손익계산서
            </div>
            <h1
              className="disp"
              style={{ fontSize: 26, fontWeight: 500, margin: 0, color: 'var(--ink)' }}
            >
              손익계산서
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 13,
                  fontWeight: 400,
                  color: 'var(--ink-3)',
                }}
              >
                {pl.periodLabel}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 모드 토글 */}
            <div
              className="flex rounded-md overflow-hidden text-sm"
              style={{ border: '1px solid var(--line)' }}
            >
              {(['monthly', 'yearly', 'custom'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="transition-colors"
                  style={{
                    padding: '6px 12px',
                    background: mode === m ? BRAND : 'transparent',
                    color: mode === m ? '#fff' : 'var(--ink-3)',
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  {m === 'monthly' ? '월별' : m === 'yearly' ? '연간' : '기간선택'}
                </button>
              ))}
            </div>

            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
              style={{ height: 32, padding: '0 8px' }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>

            {mode === 'monthly' && (
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
                style={{ height: 32, padding: '0 8px' }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            )}

            {/* 부가세 토글 */}
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs text-ink-3">부가세</span>
              <div
                className="flex rounded overflow-hidden text-xs"
                style={{ border: '1px solid var(--line)' }}
              >
                {[
                  { v: true, label: '포함' },
                  { v: false, label: '제외' },
                ].map(({ v, label }) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setIncludeVat(v)}
                    style={{
                      padding: '4px 10px',
                      background: includeVat === v ? BRAND : 'transparent',
                      color: includeVat === v ? '#fff' : 'var(--ink-3)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 관세율 입력 — localStorage 저장 */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-xs text-ink-3">관세율</span>
              <input
                type="number"
                value={tariffRate}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) setTariffRate(n);
                }}
                min={0}
                max={100}
                step={0.1}
                style={{
                  width: 56,
                  height: 28,
                  padding: '0 6px',
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  fontSize: 12,
                  textAlign: 'center',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  outline: 'none',
                  fontFamily: 'var(--font-num)',
                }}
              />
              <span className="text-xs text-ink-3">%</span>
            </div>
          </div>
        </header>

        {/* custom 모드 월 선택 */}
        {mode === 'custom' && (
          <div className="flex items-center gap-1 flex-wrap mb-4">
            <span className="text-xs text-ink-3 mr-2">월 선택:</span>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
              const on = selectedMonths.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleSelectedMonth(m)}
                  className="transition-colors"
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 4,
                    border: `1px solid ${on ? BRAND : 'var(--line)'}`,
                    background: on ? BRAND : 'transparent',
                    color: on ? '#fff' : 'var(--ink-3)',
                    cursor: 'pointer',
                  }}
                >
                  {m}월
                </button>
              );
            })}
            {selectedMonths.length === 0 && (
              <span className="text-xs ml-2" style={{ color: 'var(--danger)' }}>
                월을 1개 이상 선택하세요.
              </span>
            )}
          </div>
        )}

        {/* 본문 2단 */}
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}
        >
          {/* 좌측: 손익 요약 */}
          <section
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              손익 요약
            </h2>

            {pl.isLoading && <div className="text-sm text-ink-3 py-4">계산 중…</div>}
            {pl.hasNoMonths && (
              <div className="text-sm text-ink-3 py-4">
                상단에서 월을 1개 이상 선택하세요.
              </div>
            )}

            {!pl.isLoading && !pl.hasNoMonths && (
              <div className="space-y-1">
                <PLRow
                  label={includeVat ? '매출액 (부가세 포함)' : '매출액 (공급가액)'}
                  value={pl.displayRevenue}
                  bold
                />
                <PLRow
                  label="매출원가"
                  subLabel={`(수입원가 기준, 환율 ₩${DEFAULT_EXCHANGE_RATE.toLocaleString('ko-KR')}, 관세 ${tariffRate}%)`}
                  value={-pl.cogs}
                  sub
                />
                <PLDivider />
                <PLRow
                  label="매출총이익"
                  value={pl.grossProfit}
                  bold
                  badge={`${pl.grossMargin.toFixed(1)}%`}
                />
                <PLRow label="수입비용 (운임)" value={-pl.importCosts} sub />
                <PLRow
                  label="판매관리비"
                  subLabel={
                    pl.totalSellingExpensesFromBank > 0
                      ? `(수동 ₩${fmtWon(pl.totalSellingExpensesManual)} + 거래내역 ₩${fmtWon(pl.totalSellingExpensesFromBank)})`
                      : undefined
                  }
                  value={-pl.totalSellingExpenses}
                  sub
                />
                <PLDivider />
                <PLRow
                  label="영업이익"
                  value={pl.operatingProfit}
                  bold
                  badge={`${pl.operatingMargin.toFixed(1)}%`}
                />
                {!includeVat && <PLRow label="부가세" value={-pl.vatAmount} sub />}
                <PLDivider />
                <PLRow
                  label="순이익"
                  value={pl.netProfit}
                  bold
                  highlight
                  badge={`${pl.netMargin.toFixed(1)}%`}
                />
              </div>
            )}
          </section>

          {/* 우측: 판관비 */}
          <section
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                판매관리비 {mode === 'monthly' ? `(${year}년 ${month}월 입력)` : '(합산 표시)'}
              </h2>
            </div>

            {mode !== 'monthly' && (
              <p className="text-xs text-ink-3 mb-3">
                선택된 기간의 카테고리별 합산입니다. 항목별 직접 입력은 [월별] 모드에서 가능합니다.
              </p>
            )}

            {categoriesQ.isLoading && (
              <div className="text-sm text-ink-3">로딩 중…</div>
            )}
            {!categoriesQ.isLoading && categories.length === 0 && (
              <div className="text-sm text-ink-3 mb-3">
                등록된 카테고리가 없습니다. 아래에서 추가하세요.
              </div>
            )}

            <div className="space-y-1.5">
              {categories.map((cat) => {
                const value =
                  mode === 'monthly'
                    ? draftValue(cat.id)
                    : String(aggregateExpenseByCategory.get(cat.id) ?? 0);
                return (
                  <div key={cat.id} className="flex items-center gap-2">
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: 'var(--ink-2)',
                      }}
                    >
                      {cat.name}
                    </span>
                    {mode === 'monthly' ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        value={value}
                        onChange={(e) => onDraftChange(cat.id, e.target.value)}
                        onBlur={() => onDraftBlur(cat.id)}
                        placeholder="0"
                        style={{
                          width: 140,
                          height: 28,
                          padding: '0 8px',
                          border: '1px solid var(--line)',
                          borderRadius: 6,
                          fontSize: 12.5,
                          fontFamily: 'var(--font-num)',
                          textAlign: 'right',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <span
                        className="num"
                        style={{
                          width: 140,
                          fontSize: 12.5,
                          textAlign: 'right',
                          color: 'var(--ink)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtWon(Number(value) || 0)}
                      </span>
                    )}
                    <span className="text-[11px] text-ink-3 w-3">원</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      title="항목 삭제 (과거 입력값은 보존)"
                      style={{
                        height: 24,
                        width: 24,
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink-3)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={11} strokeWidth={1.8} />
                    </button>
                  </div>
                );
              })}
            </div>

            {categories.length > 0 && (
              <div
                className="flex justify-between items-center mt-3 pt-3"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <span className="text-sm font-medium text-ink-2">합계</span>
                <span
                  className="num"
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: BRAND,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtWon(pl.totalSellingExpenses)}원
                </span>
              </div>
            )}

            {/* 항목 관리 */}
            <div
              className="mt-4 pt-3"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <p className="text-[11px] text-ink-3 mb-2">항목 관리</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCategory();
                  }}
                  placeholder="새 항목명"
                  style={{
                    flex: 1,
                    height: 28,
                    padding: '0 8px',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    fontSize: 12,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim() || addCatMut.isPending}
                  className="btn-base"
                  style={{ height: 28, fontSize: 12 }}
                >
                  추가
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* 하단 — 거래내역 업로드 섹션 (year 만 받고 month 는 자체 셀렉터) */}
        <BankExpenseSection year={year} />
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function PLRow({
  label,
  subLabel,
  value,
  sub,
  bold,
  highlight,
  badge,
}: {
  label: string;
  subLabel?: string;
  value: number;
  sub?: boolean;
  bold?: boolean;
  highlight?: boolean;
  badge?: string;
}) {
  const negative = value < 0;
  const valColor = highlight
    ? BRAND
    : negative
      ? 'var(--danger)'
      : 'var(--ink)';
  const badgeColor = value >= 0 ? 'var(--success)' : 'var(--danger)';
  const badgeBg = value >= 0 ? 'var(--success-wash)' : 'var(--danger-wash)';
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        background: highlight ? `${BRAND}10` : 'transparent',
        paddingLeft: sub ? 26 : 10,
      }}
    >
      <span
        style={{
          fontSize: bold ? 13 : 12.5,
          fontWeight: bold ? 600 : 400,
          color: sub ? 'var(--ink-3)' : 'var(--ink-2)',
        }}
      >
        {sub && <span style={{ marginRight: 4, color: 'var(--ink-4)' }}>└</span>}
        {label}
        {subLabel && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10.5,
              color: 'var(--ink-3)',
              fontWeight: 400,
            }}
          >
            {subLabel}
          </span>
        )}
      </span>
      <div className="flex items-center gap-2">
        {badge && (
          <span
            style={{
              fontSize: 10.5,
              padding: '2px 6px',
              borderRadius: 999,
              color: badgeColor,
              background: badgeBg,
              fontFamily: 'var(--font-num)',
            }}
          >
            {badge}
          </span>
        )}
        <span
          className="num"
          style={{
            fontSize: highlight ? 15 : bold ? 13.5 : 12.5,
            fontWeight: bold || highlight ? 700 : 400,
            color: valColor,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtWon(value)}원
        </span>
      </div>
    </div>
  );
}

function PLDivider() {
  return (
    <div
      style={{
        height: 1,
        background: 'var(--line)',
        margin: '4px 10px',
      }}
    />
  );
}
