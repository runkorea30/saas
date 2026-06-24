/**
 * 미수금 페이지 — 재무 > 미수금.
 *
 * 카드 그리드 (위험 → 경고 → 정상 정렬) + 상세 Modal.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §2: calcMonthlyReconciliation + calcReceivableCards 사용.
 */
import { useMemo, useState } from 'react';
import {
  useBankTransactions,
  useOrdersForReconciliation,
} from '@/hooks/useBanking';
import {
  calcMonthlyReconciliation,
  calcReceivableCards,
} from '@/utils/calculations';
import { Modal } from '@/components/ui/Modal';
import { fmtWon } from '@/components/feature/orders/primitives';
import type { ReceivableCard, MonthlyReconciliation } from '@/types/database';

type BadgeFilter = 'all' | '위험' | '경고' | '정상';

export function ReceivablesPage() {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>('all');
  const [activeCard, setActiveCard] = useState<ReceivableCard | null>(null);

  const ordersQuery = useOrdersForReconciliation();
  const txQuery = useBankTransactions(year, null);

  const orders = ordersQuery.data ?? [];
  const transactions = txQuery.data ?? [];

  // 거래처별 최근 입금일 (전체 거래에서 max(transaction_date))
  const lastDepositDates = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of transactions) {
      if (!t.customer_id) continue;
      const d = t.transaction_date.slice(0, 10);
      const prev = map.get(t.customer_id);
      if (!prev || d > prev) map.set(t.customer_id, d);
    }
    return map;
  }, [transactions]);

  const cards = useMemo(() => {
    if (orders.length === 0) return [];
    const recon = calcMonthlyReconciliation(
      orders.filter((o) => o.order_date.startsWith(`${year}-`)),
      transactions.map((t) => ({
        customer_id: t.customer_id,
        transaction_date: t.transaction_date.slice(0, 10),
        amount: t.amount,
        match_status: t.match_status,
      })),
    );
    return calcReceivableCards(recon, lastDepositDates);
  }, [orders, transactions, lastDepositDates, year]);

  const filteredCards = useMemo(() => {
    if (badgeFilter === 'all') return cards;
    return cards.filter((c) => c.badge === badgeFilter);
  }, [cards, badgeFilter]);

  const yearOptions: number[] = [];
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y);

  const isLoading = ordersQuery.isLoading || txQuery.isLoading;

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
              재무 › 미수금
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
              미수금 관리
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
              value={badgeFilter}
              onChange={(e) => setBadgeFilter(e.target.value as BadgeFilter)}
              className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
              style={{ height: 32, padding: '0 8px' }}
            >
              <option value="all">전체</option>
              <option value="위험">위험만</option>
              <option value="경고">경고만</option>
              <option value="정상">정상만</option>
            </select>
          </div>
        </header>

        {/* 에러 배너 */}
        {(ordersQuery.error || txQuery.error) && (
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
            {(ordersQuery.error ?? txQuery.error)?.message}
          </div>
        )}

        {/* 카드 그리드 */}
        {isLoading ? (
          <div className="text-center py-16 text-[var(--ink-3)] text-[13px]">
            불러오는 중…
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-16 text-[var(--ink-3)] text-[13px]">
            표시할 미수금 카드가 없습니다.
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            }}
          >
            {filteredCards.map((card) => (
              <Card key={card.customer_id} card={card} onClick={setActiveCard} />
            ))}
          </div>
        )}

        {/* 상세 모달 */}
        <DetailModal
          card={activeCard}
          year={year}
          onClose={() => setActiveCard(null)}
        />
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function Card({
  card,
  onClick,
}: {
  card: ReceivableCard;
  onClick: (c: ReceivableCard) => void;
}) {
  const borderCls =
    card.badge === '위험'
      ? 'border-red-200 bg-red-50'
      : card.badge === '경고'
        ? 'border-yellow-200 bg-yellow-50'
        : 'border-gray-200 bg-white';

  const amountColor =
    card.badge === '위험'
      ? 'text-red-600'
      : card.badge === '경고'
        ? 'text-yellow-700'
        : 'text-gray-400';

  return (
    <button
      type="button"
      onClick={() => onClick(card)}
      className={`text-left rounded-lg border ${borderCls} p-4 hover:shadow-md transition-shadow cursor-pointer`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[13px] font-semibold text-[var(--ink)] truncate">
          {card.customer_name}
        </span>
        <Badge badge={card.badge} />
      </div>

      <div className={`num font-bold text-[18px] mb-3 ${amountColor}`}>
        {card.overdue_amount > 0 ? `₩${fmtWon(card.overdue_amount)}` : '잔액 없음'}
      </div>

      <div className="grid grid-cols-2 gap-y-1 text-[11.5px]">
        <span className="text-gray-500">총매출</span>
        <span className="num text-right text-[var(--ink-2)]">
          ₩{fmtWon(card.total_sales)}
        </span>
        <span className="text-gray-500">정산대기</span>
        <span className="num text-right text-blue-600">
          ₩{fmtWon(card.pending_amount)}
        </span>
        <span className="text-gray-500">최근입금</span>
        <span className="num text-right text-[var(--ink-2)]">
          {card.last_deposit_date ? card.last_deposit_date.slice(5) : '-'}
        </span>
      </div>
    </button>
  );
}

function Badge({ badge }: { badge: '위험' | '경고' | '정상' }) {
  const cls =
    badge === '위험'
      ? 'bg-red-100 text-red-600 border-red-200'
      : badge === '경고'
        ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
        : 'bg-green-100 text-green-700 border-green-200';
  return (
    <span className={`inline-block rounded-md border text-[11px] px-2 py-0.5 ${cls}`}>
      {badge}
    </span>
  );
}

// ───────────────────────────────────────────────────────────

interface DetailProps {
  card: ReceivableCard | null;
  year: number;
  onClose: () => void;
}

function DetailModal({ card, year, onClose }: DetailProps) {
  const detail = useMemo(() => {
    if (!card) return null;
    const sorted = [...card.monthly_detail].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    // 누적 미수금 (음수는 0 클램프)
    const today = new Date();
    let cumul = 0;
    const rows = sorted.map((r) => {
      cumul = Math.max(0, cumul + r.difference);
      const overdueDays = r.is_overdue
        ? Math.floor(
            (today.getTime() - new Date(r.due_date).getTime()) / 86_400_000,
          )
        : null;
      return { r, cumul, overdueDays };
    });
    const totals = sorted.reduce(
      (acc, r) => ({
        sales: acc.sales + r.sales_total,
        deposit: acc.deposit + r.deposit_total,
        diff: acc.diff + r.difference,
      }),
      { sales: 0, deposit: 0, diff: 0 },
    );
    return { rows, totals };
  }, [card]);

  return (
    <Modal
      open={card !== null}
      onClose={onClose}
      title={card ? `${card.customer_name} — ${year}년 상세 내역` : ''}
      width={920}
    >
      {detail && (
        <div
          className="rounded-md border border-[var(--line)] overflow-auto"
          style={{ maxHeight: '60vh' }}
        >
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] text-[11px] uppercase sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium">매출월</th>
                <th className="text-right px-3 py-2 font-medium">매출합계</th>
                <th className="text-center px-3 py-2 font-medium">정산마감일</th>
                <th className="text-right px-3 py-2 font-medium">입금합계</th>
                <th className="text-right px-3 py-2 font-medium">잔액</th>
                <th className="text-right px-3 py-2 font-medium">누적미수금</th>
                <th className="text-center px-3 py-2 font-medium">상태</th>
                <th className="text-right px-3 py-2 font-medium">연체일수</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.map(({ r, cumul, overdueDays }) => (
                <DetailRow
                  key={r.month}
                  r={r}
                  cumul={cumul}
                  overdueDays={overdueDays}
                />
              ))}
            </tbody>
            <tfoot>
              <tr
                className="border-t-2 border-[var(--ink-2)] font-bold bg-[var(--surface-2)]"
                style={{ fontSize: 12.5 }}
              >
                <td className="px-3 py-2 text-[var(--ink)]">합계</td>
                <td className="px-3 py-2 num text-right text-[var(--ink)]">
                  ₩{fmtWon(detail.totals.sales)}
                </td>
                <td />
                <td className="px-3 py-2 num text-right text-[var(--ink)]">
                  ₩{fmtWon(detail.totals.deposit)}
                </td>
                <td
                  className={`px-3 py-2 num text-right ${diffColor(detail.totals.diff)}`}
                >
                  ₩{fmtWon(detail.totals.diff)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}

function DetailRow({
  r,
  cumul,
  overdueDays,
}: {
  r: MonthlyReconciliation;
  cumul: number;
  overdueDays: number | null;
}) {
  const statusCls =
    r.status === '연체'
      ? 'bg-red-100 text-red-700'
      : r.status === '정산대기'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-green-100 text-green-700';
  const statusLabel = r.status === '정산완료' ? '입금완료' : r.status;
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-3 py-2 num text-[var(--ink-2)]">{r.month}</td>
      <td className="px-3 py-2 num text-right text-[var(--ink)]">
        ₩{fmtWon(r.sales_total)}
      </td>
      <td className="px-3 py-2 num text-center text-[var(--ink-2)]">{r.due_date}</td>
      <td className="px-3 py-2 num text-right text-[var(--ink)]">
        ₩{fmtWon(r.deposit_total)}
      </td>
      <td className={`px-3 py-2 num text-right ${diffColor(r.difference)}`}>
        ₩{fmtWon(r.difference)}
      </td>
      <td className="px-3 py-2 num text-right text-[var(--ink-2)]">
        ₩{fmtWon(cumul)}
      </td>
      <td className="px-3 py-2 text-center">
        <span
          className={`inline-block rounded-md text-[11px] px-2 py-0.5 ${statusCls}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2 num text-right text-[var(--ink-2)]">
        {overdueDays !== null ? `${overdueDays}일` : '-'}
      </td>
    </tr>
  );
}

function diffColor(d: number): string {
  if (d > 0) return 'text-red-600';
  if (d < 0) return 'text-blue-600';
  return 'text-green-600';
}

export default ReceivablesPage;
