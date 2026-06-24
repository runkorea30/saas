/**
 * 은행거래 — 월별 입금 현황 탭.
 *
 * - 선택 연도 전체 주문 + 거래 → calcMonthlyReconciliation
 * - 거래처 필터 + 합계 행
 */
import { useMemo, useState } from 'react';
import { calcMonthlyReconciliation } from '@/utils/calculations';
import { fmtWon } from '@/components/feature/orders/primitives';
import type { BankTransaction, MonthlyReconciliation } from '@/types/database';

interface OrderRow {
  customer_id: string;
  customer_name: string;
  settlement_cycle: string;
  order_date: string;
  total_amount: number;
}

interface Props {
  orders: OrderRow[];
  transactions: BankTransaction[];
  year: number;
}

export function MonthlyTab({ orders, transactions, year }: Props) {
  const [customerFilter, setCustomerFilter] = useState<string>('');

  const yearOrders = useMemo(
    () => orders.filter((o) => o.order_date.startsWith(`${year}-`)),
    [orders, year],
  );

  const recon = useMemo(
    () =>
      calcMonthlyReconciliation(
        yearOrders,
        transactions.map((t) => ({
          customer_id: t.customer_id,
          transaction_date: t.transaction_date.slice(0, 10),
          amount: t.amount,
          match_status: t.match_status,
        })),
      ),
    [yearOrders, transactions],
  );

  const customers = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const r of recon) {
      if (!seen.has(r.customer_id)) {
        seen.add(r.customer_id);
        list.push({ id: r.customer_id, name: r.customer_name });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [recon]);

  const filtered = useMemo(
    () => (customerFilter ? recon.filter((r) => r.customer_id === customerFilter) : recon),
    [recon, customerFilter],
  );

  const totals = useMemo(() => {
    let sales = 0;
    let deposit = 0;
    for (const r of filtered) {
      sales += r.sales_total;
      deposit += r.deposit_total;
    }
    return { sales, deposit, diff: sales - deposit };
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="border border-[var(--line)] rounded-md text-[12.5px] bg-[var(--surface)]"
          style={{ height: 32, padding: '0 8px', minWidth: 180 }}
        >
          <option value="">거래처 전체</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-[var(--ink-3)] ml-auto">
          {filtered.length}행 / 전체 {recon.length}행
        </span>
      </div>

      <div
        className="rounded-lg border border-[var(--line)] overflow-hidden"
        style={{ background: 'var(--surface)' }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] text-[11px] uppercase">
            <tr>
              <th className="text-left px-3 py-2 font-medium">거래처</th>
              <th className="text-left px-3 py-2 font-medium">매출월</th>
              <th className="text-center px-3 py-2 font-medium">정산주기</th>
              <th className="text-right px-3 py-2 font-medium">매출합계</th>
              <th className="text-center px-3 py-2 font-medium">정산마감일</th>
              <th className="text-right px-3 py-2 font-medium">입금합계</th>
              <th className="text-right px-3 py-2 font-medium">차액</th>
              <th className="text-center px-3 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-10 text-[var(--ink-3)] text-[12.5px]"
                >
                  표시할 정산 내역이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r) => <ReconRow key={`${r.customer_id}_${r.month}`} r={r} />)
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr
                className="border-t-2 border-[var(--ink-2)] font-bold bg-[var(--surface-2)]"
                style={{ fontSize: 12.5 }}
              >
                <td colSpan={3} className="px-3 py-2 text-[var(--ink)]">
                  합계
                </td>
                <td className="px-3 py-2 num text-right text-[var(--ink)]">
                  ₩{fmtWon(totals.sales)}
                </td>
                <td />
                <td className="px-3 py-2 num text-right text-[var(--ink)]">
                  ₩{fmtWon(totals.deposit)}
                </td>
                <td
                  className={`px-3 py-2 num text-right ${diffColor(totals.diff)}`}
                >
                  ₩{fmtWon(totals.diff)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function ReconRow({ r }: { r: MonthlyReconciliation }) {
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-3 py-2 text-[var(--ink)]">{r.customer_name}</td>
      <td className="px-3 py-2 num text-[var(--ink-2)]">{r.month}</td>
      <td className="px-3 py-2 text-center text-[var(--ink-2)]">{r.payment_cycle}</td>
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
      <td className="px-3 py-2 text-center">
        <StatusChip status={r.status} />
      </td>
    </tr>
  );
}

function diffColor(d: number): string {
  if (d > 0) return 'text-red-600';
  if (d < 0) return 'text-blue-600';
  return 'text-green-600';
}

function StatusChip({ status }: { status: '정산완료' | '정산대기' | '연체' }) {
  const cls =
    status === '연체'
      ? 'bg-red-100 text-red-700'
      : status === '정산대기'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700';
  return (
    <span className={`inline-block rounded-md text-[11px] px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}
