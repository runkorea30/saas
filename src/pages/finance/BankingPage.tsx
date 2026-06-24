/**
 * 은행거래 페이지 — 재무 > 은행거래.
 *
 * 3탭 구조: 입출금 장부 · 월별 입금 현황 · 매칭 설정
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §5: 모든 조회 fetchAllRows 경유 (useBanking 훅 내부에서 처리).
 */
import { useMemo, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import {
  useBankTransactions,
  useBankMappings,
  useBankExcludeKeywords,
  useOrdersForReconciliation,
} from '@/hooks/useBanking';
import { useCustomers } from '@/hooks/queries/useCustomers';
import {
  calcMonthlyReconciliation,
  calcReceivableCards,
} from '@/utils/calculations';
import { fmtWon } from '@/components/feature/orders/primitives';
import { LedgerTab } from '@/components/feature/banking/LedgerTab';
import { MonthlyTab } from '@/components/feature/banking/MonthlyTab';
import { SettingsTab } from '@/components/feature/banking/SettingsTab';

type TabKey = 'ledger' | 'monthly' | 'settings';

export function BankingPage() {
  const now = new Date();
  const { companyId } = useCompany();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [tab, setTab] = useState<TabKey>('ledger');

  const txQuery = useBankTransactions(year, month);
  const txAllQuery = useBankTransactions(year, null);
  const mappingsQuery = useBankMappings();
  const keywordsQuery = useBankExcludeKeywords();
  const ordersQuery = useOrdersForReconciliation();
  const customersQuery = useCustomers(companyId);

  const transactions = txQuery.data ?? [];
  const txAll = txAllQuery.data ?? [];
  const mappings = mappingsQuery.data ?? [];
  const excludeKeywords = keywordsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const customers = useMemo(
    () =>
      (customersQuery.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      })),
    [customersQuery.data],
  );

  // ───── KPI ─────
  const monthDeposit = useMemo(() => {
    let sum = 0;
    for (const t of transactions) {
      if (!t.is_excluded) sum += t.amount;
    }
    return sum;
  }, [transactions]);

  const unmatchedCount = useMemo(
    () =>
      transactions.filter((t) => t.match_status === 'unmatched' && !t.is_excluded)
        .length,
    [transactions],
  );

  const overdueTotal = useMemo(() => {
    if (orders.length === 0) return 0;
    const recon = calcMonthlyReconciliation(
      orders.filter((o) => o.order_date.startsWith(`${year}-`)),
      txAll.map((t) => ({
        customer_id: t.customer_id,
        transaction_date: t.transaction_date.slice(0, 10),
        amount: t.amount,
        match_status: t.match_status,
      })),
    );
    const cards = calcReceivableCards(recon, new Map());
    return cards.reduce((s, c) => s + c.overdue_amount, 0);
  }, [orders, txAll, year]);

  const yearOptions: number[] = [];
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y);

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
        <header className="flex items-end justify-between flex-wrap gap-3 mb-3">
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
              재무 › 은행거래
            </div>
            <h1
              className="disp"
              style={{
                fontSize: 26,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              은행거래
            </h1>
          </div>

          <div className="flex items-center gap-2">
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
            <select
              value={month ?? ''}
              onChange={(e) =>
                setMonth(e.target.value === '' ? null : Number(e.target.value))
              }
              className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
              style={{ height: 32, padding: '0 8px' }}
            >
              <option value="">전체</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* KPI */}
        <div
          className="grid gap-3 mb-4"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          <Kpi label="이번 기간 입금" value={`₩${fmtWon(monthDeposit)}`} />
          <Kpi
            label="미매칭 건수"
            value={`${unmatchedCount}건`}
            tone={unmatchedCount > 0 ? 'danger' : undefined}
          />
          <Kpi
            label="전체 미수 잔액 (연체)"
            value={`₩${fmtWon(overdueTotal)}`}
            tone={overdueTotal > 0 ? 'danger' : undefined}
          />
        </div>

        {/* 탭 */}
        <div
          className="flex items-center gap-1 border-b border-[var(--line)] mb-4"
          role="tablist"
        >
          <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>
            입출금 장부
          </TabButton>
          <TabButton active={tab === 'monthly'} onClick={() => setTab('monthly')}>
            월별 입금 현황
          </TabButton>
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
            매칭 설정
          </TabButton>
        </div>

        {/* 에러 배너 */}
        {(txQuery.error || mappingsQuery.error || keywordsQuery.error) && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--danger-wash)',
              color: 'var(--danger)',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 12,
            }}
          >
            데이터 로딩 실패:{' '}
            {(txQuery.error ?? mappingsQuery.error ?? keywordsQuery.error)?.message}
          </div>
        )}

        {/* 탭 콘텐츠 */}
        {tab === 'ledger' && (
          <LedgerTab
            transactions={transactions}
            mappings={mappings}
            excludeKeywords={excludeKeywords}
            customers={customers}
          />
        )}
        {tab === 'monthly' && (
          <MonthlyTab orders={orders} transactions={txAll} year={year} />
        )}
        {tab === 'settings' && (
          <SettingsTab
            mappings={mappings}
            excludeKeywords={excludeKeywords}
            customers={customers}
          />
        )}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  const valueColor = tone === 'danger' ? 'var(--danger)' : 'var(--ink)';
  return (
    <div
      className="rounded-lg border border-[var(--line)]"
      style={{ background: 'var(--surface)', padding: '14px 16px' }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: valueColor,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

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
      role="tab"
      aria-selected={active}
      className="text-[13px] font-medium"
      style={{
        padding: '8px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
        color: active ? 'var(--brand)' : 'var(--ink-3)',
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

export default BankingPage;
