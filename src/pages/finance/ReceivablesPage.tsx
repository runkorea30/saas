/**
 * 미수금 페이지 — 재무 > 미수금.
 *
 * 옵션 B 아키텍처:
 *   total_paid = bank_transactions(matched) + group_payments 합산
 *   그룹 거래처는 1행 통합, 독립 거래처는 개별 행.
 *
 * 구조:
 *   - 상단 요약 카드 3개 (총청구·총입금·총미수금)
 *   - 미수금 목록 테이블 (행 클릭 → 드릴다운, [입금 등록] 버튼 → 입금 모달)
 *   - 드릴다운 모달: 탭 3개 (주문내역 / 입금내역 / 월별정산)
 *   - 입금 등록 모달: group_payments INSERT
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §5: fetchAllRows 경유.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, List, Plus, Trash2 } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  useBankTransactions,
  useOrdersForReconciliation,
  useBankTransactionSplits,
} from '@/hooks/useBanking';
import {
  calcMonthlyReconciliation,
  calcReceivableCards,
} from '@/utils/calculations';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { fmtWon } from '@/components/feature/orders/primitives';
import { PAYMENT_TOLERANCE_AMOUNT } from '@/constants/banking';
import type { ReceivableSummary, GroupPayment } from '@/types/customers';
import type { MonthlyReconciliation } from '@/types/database';

// ───────────────────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────────────────

function parseEntityKey(key: string): { isGroup: boolean; id: string } {
  const [type, id] = key.split(':');
  return { isGroup: type === 'group', id };
}

// ───────────────────────────────────────────────────────────
// 쿼리 훅
// ───────────────────────────────────────────────────────────

function useReceivablesSummary(companyId: string | null) {
  return useQuery<ReceivableSummary[]>({
    queryKey: ['receivables-summary', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<ReceivableSummary>(() =>
        supabase
          .from('receivables_summary')
          .select('*')
          .eq('company_id', companyId!)
          .order('outstanding', { ascending: false }),
      );
      return rows;
    },
    staleTime: 30_000,
  });
}

interface DrilldownOrder {
  id: string;
  order_date: string;
  total_amount: number;
  status: string;
  customer_id: string;
  customer_name: string;
}

function useDrilldownOrders(
  companyId: string | null,
  entity: ReceivableSummary | null,
) {
  return useQuery<DrilldownOrder[]>({
    queryKey: [
      'drilldown-orders',
      companyId,
      entity?.entity_key,
    ],
    enabled: Boolean(companyId && entity),
    queryFn: async () => {
      const { isGroup, id } = parseEntityKey(entity!.entity_key);

      let customerIds: string[];
      if (isGroup) {
        const members = await fetchAllRows<{ id: string }>(() =>
          supabase
            .from('customers')
            .select('id')
            .eq('company_id', companyId!)
            .eq('group_id', id)
            .is('deleted_at', null),
        );
        customerIds = members.map((m) => m.id);
        if (customerIds.length === 0) return [];
      } else {
        customerIds = [id];
      }

      const rows = await fetchAllRows<Record<string, unknown>>(() =>
        supabase
          .from('orders')
          .select(
            'id, order_date, total_amount, status, customer_id, customer:customers(name)',
          )
          .eq('company_id', companyId!)
          .in('customer_id', customerIds)
          .not('status', 'in', '("draft","canceled")')
          .order('order_date', { ascending: false }),
      );

      return rows.map((r) => {
        const cust = r.customer as { name: string } | null;
        return {
          id: r.id as string,
          order_date: String(r.order_date).slice(0, 10),
          total_amount: r.total_amount as number,
          status: r.status as string,
          customer_id: r.customer_id as string,
          customer_name: cust?.name ?? '',
        };
      });
    },
    staleTime: 30_000,
  });
}

function useDrilldownPayments(
  companyId: string | null,
  entity: ReceivableSummary | null,
) {
  return useQuery<GroupPayment[]>({
    queryKey: [
      'drilldown-payments',
      companyId,
      entity?.entity_key,
    ],
    enabled: Boolean(companyId && entity),
    queryFn: async () => {
      const { isGroup, id } = parseEntityKey(entity!.entity_key);
      const filterCol = isGroup ? 'group_id' : 'customer_id';

      const rows = await fetchAllRows<GroupPayment>(() =>
        supabase
          .from('group_payments')
          .select('*')
          .eq('company_id', companyId!)
          .eq(filterCol, id)
          .order('paid_at', { ascending: false }),
      );
      return rows;
    },
    staleTime: 30_000,
  });
}

// ───────────────────────────────────────────────────────────
// 메인 페이지
// ───────────────────────────────────────────────────────────

export function ReceivablesPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const { data: summaries = [], isLoading, error } =
    useReceivablesSummary(companyId);

  const now = new Date();
  const [drilldownEntity, setDrilldownEntity] =
    useState<ReceivableSummary | null>(null);
  const [paymentTarget, setPaymentTarget] =
    useState<ReceivableSummary | null>(null);

  // 필터: 미수금 있음 / 정산대기만 / 그룹만 / 전체. 기본은 '전체'.
  const [filter, setFilter] = useState<'positive' | 'pending' | 'group' | 'all'>('all');

  // 뷰 모드: 테이블 / 카드 (localStorage 유지). 기본은 '카드'.
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
    if (typeof window === 'undefined') return 'card';
    const saved = window.localStorage.getItem('receivables-view');
    return saved === 'table' ? 'table' : 'card';
  });

  const changeViewMode = (mode: 'table' | 'card') => {
    setViewMode(mode);
    try {
      window.localStorage.setItem('receivables-view', mode);
    } catch {
      // localStorage 접근 실패 (Private mode 등) — 메모리에만 보관.
    }
  };

  // ───── 카드 상태(정산대기/연체) 계산용 데이터 ─────
  const ordersForReconQuery = useOrdersForReconciliation();
  const txForReconQuery = useBankTransactions(now.getFullYear(), null);
  const splitsForReconQuery = useBankTransactionSplits();

  const customerGroupMapQuery = useQuery<Array<{ id: string; group_id: string | null }>>({
    queryKey: ['receivables-customer-group-map', companyId],
    enabled: Boolean(companyId),
    queryFn: async () =>
      fetchAllRows<{ id: string; group_id: string | null }>(() =>
        supabase
          .from('customers')
          .select('id, group_id')
          .eq('company_id', companyId!)
          .is('deleted_at', null),
      ),
    staleTime: 60_000,
  });

  // entity_key → 정산대기/연체 합계. ReconciliationTab 과 동일 로직 (현재 연도 기준).
  // 미수금/정산대기는 calcMonthlyReconciliation 의 status 분기 사용:
  //   '연체'   = balance > tolerance AND due_date < today   → 미수금
  //   '정산대기' = balance > tolerance AND due_date >= today  → 정산대기
  const {
    pendingByEntity,
    overdueByEntity,
    thisMonthPendingByEntity,
    nextMonthPendingByEntity,
  } = useMemo(() => {
    const pending = new Map<string, number>();
    const overdue = new Map<string, number>();
    const thisMonthPending = new Map<string, number>();
    const nextMonthPending = new Map<string, number>();
    const customers = customerGroupMapQuery.data ?? [];
    const orders = ordersForReconQuery.data ?? [];
    const transactions = txForReconQuery.data ?? [];
    const splits = splitsForReconQuery.data ?? [];

    if (customers.length === 0 || orders.length === 0) {
      return {
        pendingByEntity: pending,
        overdueByEntity: overdue,
        thisMonthPendingByEntity: thisMonthPending,
        nextMonthPendingByEntity: nextMonthPending,
      };
    }

    // customer_id → entity_key (group_id 있으면 'group:...', 없으면 'customer:...')
    const entityKeyByCustomer = new Map<string, string>();
    for (const c of customers) {
      entityKeyByCustomer.set(
        c.id,
        c.group_id ? `group:${c.group_id}` : `customer:${c.id}`,
      );
    }

    // 현재 연도 주문만 (txQuery 가 현재 연도 한정이라 일관성 유지).
    const yearPrefix = `${now.getFullYear()}-`;
    const filteredOrders = orders.filter((o) => o.order_date.startsWith(yearPrefix));

    const recon = calcMonthlyReconciliation(
      filteredOrders,
      transactions.map((t) => ({
        id: t.id,
        customer_id: t.customer_id,
        transaction_date: t.transaction_date.slice(0, 10),
        amount: t.amount,
        match_status: t.match_status,
        target_sales_month: t.target_sales_month,
      })),
      splits,
      new Date(),
      PAYMENT_TOLERANCE_AMOUNT,
    );

    // 이번달/다음달 'YYYY-MM' (useMemo 단위로 1회만 계산)
    const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextYM = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

    for (const r of recon) {
      const key = entityKeyByCustomer.get(r.customer_id);
      if (!key) continue;
      if (r.status === '정산대기') {
        pending.set(key, (pending.get(key) ?? 0) + r.difference);
        const dueYM = r.due_date.slice(0, 7);
        if (dueYM === thisYM) {
          thisMonthPending.set(key, (thisMonthPending.get(key) ?? 0) + r.difference);
        } else if (dueYM === nextYM) {
          nextMonthPending.set(key, (nextMonthPending.get(key) ?? 0) + r.difference);
        }
      } else if (r.status === '연체') {
        overdue.set(key, (overdue.get(key) ?? 0) + r.difference);
      }
    }

    return {
      pendingByEntity: pending,
      overdueByEntity: overdue,
      thisMonthPendingByEntity: thisMonthPending,
      nextMonthPendingByEntity: nextMonthPending,
    };
  }, [
    customerGroupMapQuery.data,
    ordersForReconQuery.data,
    txForReconQuery.data,
    splitsForReconQuery.data,
    now,
  ]);

  // 필터링 기준은 outstanding(DB) 아닌 월별 계산 결과(overdue/pending) 사용.
  const filtered = useMemo(() => {
    if (filter === 'all') return summaries;
    if (filter === 'group') return summaries.filter((s) => s.is_group);
    return summaries.filter((s) => {
      const overdue = overdueByEntity.get(s.entity_key) ?? 0;
      const pending = pendingByEntity.get(s.entity_key) ?? 0;
      if (filter === 'positive') return overdue > 0;
      if (filter === 'pending') return pending > 0 && overdue === 0;
      return true;
    });
  }, [summaries, filter, overdueByEntity, pendingByEntity]);

  // 총 미수금/정산대기: outstanding 원본이 아닌 월별 계산 기준 합계 사용.
  //   - 미수금(연체)  = sum of overdueByEntity values
  //   - 정산대기       = sum of pendingByEntity values
  //   - 청구/입금     = DB summaries 합계 그대로
  const totals = useMemo(() => {
    let billed = 0;
    let paid = 0;
    for (const s of summaries) {
      billed += s.total_billed;
      paid += s.total_paid;
    }
    let overdue = 0;
    let pending = 0;
    let thisMonthPending = 0;
    let nextMonthPending = 0;
    for (const v of overdueByEntity.values()) overdue += v;
    for (const v of pendingByEntity.values()) pending += v;
    for (const v of thisMonthPendingByEntity.values()) thisMonthPending += v;
    for (const v of nextMonthPendingByEntity.values()) nextMonthPending += v;
    return { billed, paid, overdue, pending, thisMonthPending, nextMonthPending };
  }, [
    summaries,
    overdueByEntity,
    pendingByEntity,
    thisMonthPendingByEntity,
    nextMonthPendingByEntity,
  ]);

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
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ViewToggle mode={viewMode} onChange={changeViewMode} />
            <div style={{ display: 'flex', gap: 6 }}>
              <FilterPill
                active={filter === 'positive'}
                onClick={() => setFilter('positive')}
              >
                미수금 있음
              </FilterPill>
              <FilterPill
                active={filter === 'pending'}
                onClick={() => setFilter('pending')}
              >
                정산대기
              </FilterPill>
              <FilterPill
                active={filter === 'group'}
                onClick={() => setFilter('group')}
              >
                그룹만
              </FilterPill>
              <FilterPill
                active={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                전체
              </FilterPill>
            </div>
          </div>
        </header>

        {/* 요약 카드 5개 */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <SummaryCard label="총 청구액" value={totals.billed} />
          <SummaryCard label="총 입금액" value={totals.paid} tone="info" />
          <SummaryCard
            label="총 미수금"
            value={totals.overdue}
            tone="danger"
            emphasis
            sub={
              totals.pending > 0
                ? `정산대기 ₩${fmtWon(totals.pending)}`
                : undefined
            }
          />
          <SummaryCard
            label="이번달 입금예정"
            value={totals.thisMonthPending}
            tone="warning"
            sub={`${now.getFullYear()}년 ${now.getMonth() + 1}월말 마감`}
          />
          <SummaryCard
            label="다음달 입금예정"
            value={totals.nextMonthPending}
            sub={(() => {
              const nd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
              return `${nd.getFullYear()}년 ${nd.getMonth() + 1}월말 마감`;
            })()}
          />
        </section>

        {/* 에러 */}
        {error && (
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
            데이터 로딩 실패: {(error as Error).message}
          </div>
        )}

        {/* 미수금 목록 — 목록 또는 카드 */}
        {companyLoading || isLoading ? (
          <EmptyBox label="불러오는 중…" />
        ) : filtered.length === 0 ? (
          <EmptyBox label="표시할 미수금이 없습니다." />
        ) : viewMode === 'card' ? (
          <ReceivablesCardGrid
            rows={filtered}
            pendingByEntity={pendingByEntity}
            overdueByEntity={overdueByEntity}
            onCardClick={setDrilldownEntity}
            onPaymentClick={setPaymentTarget}
            grouped={filter === 'all'}
          />
        ) : (
          <ReceivablesTable
            rows={filtered}
            pendingByEntity={pendingByEntity}
            overdueByEntity={overdueByEntity}
            onRowClick={setDrilldownEntity}
            onPaymentClick={setPaymentTarget}
          />
        )}
      </main>

      {/* 드릴다운 모달 */}
      {drilldownEntity && (
        <DrilldownModal
          entity={drilldownEntity}
          pendingAmount={pendingByEntity.get(drilldownEntity.entity_key) ?? 0}
          overdueAmount={overdueByEntity.get(drilldownEntity.entity_key) ?? 0}
          onClose={() => setDrilldownEntity(null)}
          onOpenPayment={() => {
            setPaymentTarget(drilldownEntity);
          }}
        />
      )}

      {/* 입금 등록 모달 */}
      {paymentTarget && (
        <PaymentModal
          target={paymentTarget}
          overdueAmount={overdueByEntity.get(paymentTarget.entity_key) ?? 0}
          pendingAmount={pendingByEntity.get(paymentTarget.entity_key) ?? 0}
          companyId={companyId}
          onClose={() => setPaymentTarget(null)}
        />
      )}
    </div>
  );
}

export default ReceivablesPage;

// ───────────────────────────────────────────────────────────
// 요약 카드
// ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone,
  emphasis,
  sub,
}: {
  label: string;
  value: number;
  tone?: 'info' | 'danger' | 'warning';
  emphasis?: boolean;
  sub?: string;
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'info'
        ? 'var(--info, #2563eb)'
        : tone === 'warning'
          ? 'var(--warning)'
          : 'var(--ink)';
  return (
    <div
      style={{
        background: emphasis ? 'var(--danger-wash)' : 'var(--surface)',
        border: `1px solid ${emphasis ? 'var(--danger)' : 'var(--line)'}`,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: emphasis ? 22 : 18,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ₩{fmtWon(value)}
      </span>
      {sub && (
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--warning, #d97706)',
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'var(--font-num)',
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function FilterPill({
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
        height: 32,
        padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
        background: active ? 'var(--brand-wash)' : 'var(--surface)',
        color: active ? 'var(--brand)' : 'var(--ink-2)',
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'var(--font-kr)',
      }}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// 미수금 목록 테이블
// ───────────────────────────────────────────────────────────

function ReceivablesTable({
  rows,
  pendingByEntity,
  overdueByEntity,
  onRowClick,
  onPaymentClick,
}: {
  rows: ReceivableSummary[];
  pendingByEntity: Map<string, number>;
  overdueByEntity: Map<string, number>;
  onRowClick: (e: ReceivableSummary) => void;
  onPaymentClick: (e: ReceivableSummary) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          fontFamily: 'var(--font-kr)',
        }}
      >
        <thead
          style={{
            background: 'var(--surface-2)',
            fontSize: 11,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <tr>
            <th style={thStyle('left')}>거래처명</th>
            <th style={thStyle('right')}>청구액</th>
            <th style={thStyle('right')}>입금액</th>
            <th style={thStyle('right')}>미수금</th>
            <th style={thStyle('right')}>정산대기</th>
            <th style={thStyle('right')}>월차감</th>
            <th style={thStyle('center')}>액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ReceivableRow
              key={r.entity_key}
              row={r}
              pendingAmount={pendingByEntity.get(r.entity_key) ?? 0}
              overdueAmount={overdueByEntity.get(r.entity_key) ?? 0}
              onRowClick={onRowClick}
              onPaymentClick={onPaymentClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceivableRow({
  row,
  pendingAmount,
  overdueAmount,
  onRowClick,
  onPaymentClick,
}: {
  row: ReceivableSummary;
  pendingAmount: number;
  overdueAmount: number;
  onRowClick: (e: ReceivableSummary) => void;
  onPaymentClick: (e: ReceivableSummary) => void;
}) {
  // 미수금/정산대기는 월별 계산 기준 (outstanding 사용 금지)
  const overdueColor = overdueAmount > 0 ? 'var(--danger)' : 'var(--ink-3)';
  const pendingColor = pendingAmount > 0 ? 'var(--warning, #d97706)' : 'var(--ink-3)';

  return (
    <tr
      onClick={() => onRowClick(row)}
      style={{
        borderTop: '1px solid var(--line)',
        cursor: 'pointer',
        background: row.is_group ? 'var(--surface-2)' : 'transparent',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = 'var(--brand-wash)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = row.is_group
          ? 'var(--surface-2)'
          : 'transparent')
      }
    >
      <td style={tdStyle('left')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
            {row.display_name}
          </span>
          {row.is_group && <GroupBadge />}
        </div>
        {row.is_group && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginTop: 2,
            }}
          >
            발행: {row.billing_name}
          </div>
        )}
      </td>
      <td style={{ ...tdStyle('right'), ...numStyle }}>
        ₩{fmtWon(row.total_billed)}
      </td>
      <td style={{ ...tdStyle('right'), ...numStyle }}>
        ₩{fmtWon(row.total_paid)}
      </td>
      <td
        style={{
          ...tdStyle('right'),
          ...numStyle,
          color: overdueColor,
          fontWeight: 600,
        }}
      >
        ₩{fmtWon(overdueAmount)}
      </td>
      <td
        style={{
          ...tdStyle('right'),
          ...numStyle,
          color: pendingColor,
          fontWeight: pendingAmount > 0 ? 500 : 400,
        }}
      >
        ₩{fmtWon(pendingAmount)}
      </td>
      <td style={{ ...tdStyle('right'), ...numStyle }}>
        {row.monthly_deduction > 0 ? (
          <span style={{ color: 'var(--brand)' }}>
            ₩{fmtWon(row.monthly_deduction)}/월
          </span>
        ) : (
          <span style={{ color: 'var(--ink-3)' }}>—</span>
        )}
      </td>
      <td style={tdStyle('center')}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPaymentClick(row);
          }}
          className="btn-base primary"
          style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
        >
          <Plus size={12} /> 입금 등록
        </button>
      </td>
    </tr>
  );
}

function GroupBadge() {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        background: 'var(--brand-wash)',
        color: 'var(--brand)',
        border: '1px solid var(--brand)',
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 500,
      }}
    >
      그룹
    </span>
  );
}

const thStyle = (
  align: 'left' | 'right' | 'center',
): React.CSSProperties => ({
  padding: '10px 14px',
  textAlign: align,
  fontWeight: 500,
  whiteSpace: 'nowrap',
});

const tdStyle = (
  align: 'left' | 'right' | 'center',
): React.CSSProperties => ({
  padding: '12px 14px',
  textAlign: align,
  verticalAlign: 'middle',
  color: 'var(--ink-2)',
});

const numStyle: React.CSSProperties = {
  fontFamily: 'var(--font-num)',
  fontVariantNumeric: 'tabular-nums',
};

// ───────────────────────────────────────────────────────────
// 뷰 토글 (목록 ↔ 카드)
// ───────────────────────────────────────────────────────────

function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'table' | 'card';
  onChange: (mode: 'table' | 'card') => void;
}) {
  return (
    <div
      role="group"
      aria-label="뷰 모드"
      style={{
        display: 'inline-flex',
        border: '1px solid var(--line)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    >
      <ToggleBtn
        active={mode === 'table'}
        onClick={() => onChange('table')}
        label="목록"
      >
        <List size={14} strokeWidth={1.8} />
      </ToggleBtn>
      <div style={{ width: 1, background: 'var(--line)' }} />
      <ToggleBtn
        active={mode === 'card'}
        onClick={() => onChange('card')}
        label="카드"
      >
        <LayoutGrid size={14} strokeWidth={1.8} />
      </ToggleBtn>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 32,
        padding: '0 12px',
        background: active ? 'var(--brand-wash)' : 'transparent',
        border: 'none',
        color: active ? 'var(--brand)' : 'var(--ink-3)',
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'var(--font-kr)',
      }}
    >
      {children}
      {label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// 카드 그리드 + 카드
// ───────────────────────────────────────────────────────────

function ReceivablesCardGrid({
  rows,
  pendingByEntity,
  overdueByEntity,
  onCardClick,
  onPaymentClick,
  grouped = false,
}: {
  rows: ReceivableSummary[];
  pendingByEntity: Map<string, number>;
  overdueByEntity: Map<string, number>;
  onCardClick: (e: ReceivableSummary) => void;
  onPaymentClick: (e: ReceivableSummary) => void;
  /** true: 미수금있음/정산대기/정산완료 3그룹 분리. false: 평면 그리드 (필터 적용 시). */
  grouped?: boolean;
}) {
  // 🟠 3그룹 분류 기준은 ReceivableCard 우상단 점 색상 로직과 동일.
  //   - hasReceivable: overdueAmount > 0           (붉은 점, 미수금 있음)
  //   - hasPending   : pending > 0 && overdue = 0  (호박색 점, 정산대기)
  //   - clean        : 둘 다 0                     (녹색 점, 정산완료)
  const groups = useMemo(() => {
    if (!grouped) return null;
    const hasReceivable: ReceivableSummary[] = [];
    const hasPending: ReceivableSummary[] = [];
    const clean: ReceivableSummary[] = [];
    for (const r of rows) {
      const overdue = overdueByEntity.get(r.entity_key) ?? 0;
      const pending = pendingByEntity.get(r.entity_key) ?? 0;
      if (overdue > 0) hasReceivable.push(r);
      else if (pending > 0) hasPending.push(r);
      else clean.push(r);
    }
    return { hasReceivable, hasPending, clean };
  }, [grouped, rows, overdueByEntity, pendingByEntity]);

  const renderCard = (r: ReceivableSummary) => (
    <ReceivableCard
      key={r.entity_key}
      item={r}
      pendingAmount={pendingByEntity.get(r.entity_key) ?? 0}
      overdueAmount={overdueByEntity.get(r.entity_key) ?? 0}
      onClick={() => onCardClick(r)}
      onPayment={(e) => {
        e.stopPropagation();
        onPaymentClick(r);
      }}
    />
  );

  if (!groups) {
    return <div style={CARD_GRID_STYLE}>{rows.map(renderCard)}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {groups.hasReceivable.length > 0 && (
        <GroupSection
          title="미수금 있음"
          count={groups.hasReceivable.length}
          color={COLOR_DANGER}
        >
          {groups.hasReceivable.map(renderCard)}
        </GroupSection>
      )}
      {groups.hasPending.length > 0 && (
        <GroupSection
          title="정산대기"
          count={groups.hasPending.length}
          color={COLOR_AMBER}
        >
          {groups.hasPending.map(renderCard)}
        </GroupSection>
      )}
      {groups.clean.length > 0 && (
        <GroupSection
          title="정산완료"
          count={groups.clean.length}
          color={COLOR_SUCCESS}
        >
          {groups.clean.map(renderCard)}
        </GroupSection>
      )}
    </div>
  );
}

const CARD_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 12,
};

function GroupSection({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color,
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </h3>
        <span
          className="num"
          style={{
            fontSize: 11.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
          }}
        >
          {count}곳
        </span>
      </div>
      <div style={CARD_GRID_STYLE}>{children}</div>
    </section>
  );
}

// 카드 상태 색상 토큰 (var() 우선, 미정의 시 hex fallback)
const COLOR_DANGER = 'var(--danger, #dc2626)';
const COLOR_AMBER = 'var(--warning, #d97706)';
const COLOR_SUCCESS = 'var(--success, #16a34a)';

function ReceivableCard({
  item,
  pendingAmount,
  overdueAmount,
  onClick,
  onPayment,
}: {
  item: ReceivableSummary;
  pendingAmount: number;
  overdueAmount: number;
  onClick: () => void;
  onPayment: (e: React.MouseEvent) => void;
}) {
  // 🔴 미수금/정산대기는 outstanding(DB) 아닌 월별 정산마감일 기준 계산값 사용.
  //   - 미수금(연체) = overdueAmount (정산마감일 경과 + 잔액 > tolerance)
  //   - 정산대기     = pendingAmount (정산마감일 미도래 + 잔액 > tolerance)
  const hasReceivable = overdueAmount > 0;
  const hasPending = pendingAmount > 0;

  // 카드 상태 표시: 테두리 대신 배경색 사용 (red-50 / amber-50 / surface)
  let bgColor = 'var(--surface)';
  let dotColor: string = COLOR_SUCCESS;
  let dotLabel = '정산완료';
  if (hasReceivable) {
    bgColor = 'var(--danger-wash, #fef2f2)';
    dotColor = COLOR_DANGER;
    dotLabel = '미수금 발생';
  } else if (hasPending) {
    bgColor = 'var(--warning-wash, #fffbeb)';
    dotColor = COLOR_AMBER;
    dotLabel = '정산대기';
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: bgColor,
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 14,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md, 0 4px 12px rgba(0,0,0,.06))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* 헤더: 이름/배지 + 상태 dot */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span
              className="disp"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--ink)',
                lineHeight: 1.3,
              }}
            >
              {item.display_name}
            </span>
            {item.is_group && <GroupBadge />}
          </div>
          {item.is_group && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 3,
              }}
            >
              발행: {item.billing_name}
            </div>
          )}
        </div>
        <span
          aria-label={dotLabel}
          title={dotLabel}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: dotColor,
            flexShrink: 0,
            marginTop: 4,
          }}
        />
      </div>

      {/* 금액 영역 — 상태별 표시 항목 분기 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 12.5,
        }}
      >
        <CardRow label="청구액" value={item.total_billed} muted />
        <CardRow label="입금액" value={item.total_paid} muted />
        {(hasReceivable || hasPending) && (
          <div
            style={{
              height: 1,
              background: 'var(--line)',
              margin: '2px 0',
            }}
          />
        )}
        {hasReceivable && (
          <CardRow
            label="미수금"
            value={overdueAmount}
            emphasis
            color={COLOR_DANGER}
          />
        )}
        {hasPending && (
          <CardRow
            label="정산대기"
            value={pendingAmount}
            emphasis={!hasReceivable}
            color={COLOR_AMBER}
          />
        )}
        {!hasReceivable && !hasPending && (
          <div
            style={{
              fontSize: 11.5,
              color: COLOR_SUCCESS,
              fontWeight: 500,
              textAlign: 'right',
              paddingTop: 2,
            }}
          >
            ✓ 정산 완료
          </div>
        )}
      </div>

      {/* 푸터: 월차감 + 입금 등록 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: item.monthly_deduction > 0 ? 'var(--brand)' : 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {item.monthly_deduction > 0
            ? `₩${fmtWon(item.monthly_deduction)}/월 차감`
            : ''}
        </span>
        <button
          type="button"
          onClick={onPayment}
          className="btn-base primary"
          style={{
            height: 28,
            fontSize: 11.5,
            padding: '0 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Plus size={12} /> 입금 등록
        </button>
      </div>
    </div>
  );
}

function CardRow({
  label,
  value,
  muted,
  emphasis,
  color,
  subValue,
}: {
  label: string;
  value: number;
  muted?: boolean;
  emphasis?: boolean;
  color?: string;
  subValue?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}
    >
      <span
        style={{
          color: muted ? 'var(--ink-3)' : 'var(--ink-2)',
          fontWeight: emphasis ? 600 : 400,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span
          className="num"
          style={{
            color: color ?? (muted ? 'var(--ink-2)' : 'var(--ink)'),
            fontWeight: emphasis ? 700 : 500,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'var(--font-num)',
          }}
        >
          ₩{fmtWon(value)}
        </span>
        {subValue && (
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'var(--font-num)',
              marginTop: 1,
            }}
          >
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 드릴다운 모달 (탭 3개)
// ───────────────────────────────────────────────────────────

type DrillTab = 'orders' | 'payments' | 'reconciliation';

function DrilldownModal({
  entity,
  pendingAmount,
  overdueAmount,
  onClose,
  onOpenPayment,
}: {
  entity: ReceivableSummary;
  pendingAmount: number;
  overdueAmount: number;
  onClose: () => void;
  onOpenPayment: () => void;
}) {
  // 기본 탭: 월별 정산 (사용 빈도가 가장 높음)
  const [tab, setTab] = useState<DrillTab>('reconciliation');
  const { companyId } = useCompany();

  return (
    <Modal
      open
      onClose={onClose}
      title={`${entity.display_name} — 미수금 상세`}
      width={920}
      footer={
        <>
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={onClose}
          >
            닫기
          </button>
          <button
            type="button"
            className="btn-base primary"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={onOpenPayment}
          >
            <Plus size={12} /> 입금 등록
          </button>
        </>
      }
    >
      {/* 요약 한 줄 */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          padding: '10px 12px',
          background: 'var(--surface-2)',
          borderRadius: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <SummaryInline label="청구액" value={entity.total_billed} />
        <SummaryInline label="입금액" value={entity.total_paid} />
        <SummaryInline
          label="미수금"
          value={overdueAmount}
          color={overdueAmount > 0 ? 'var(--danger)' : 'var(--ink-3)'}
        />
        <SummaryInline
          label="정산대기"
          value={pendingAmount}
          color={pendingAmount > 0 ? 'var(--warning, #d97706)' : 'var(--ink-3)'}
        />
        {entity.monthly_deduction > 0 && (
          <SummaryInline
            label="월차감"
            value={entity.monthly_deduction}
            suffix="/월"
            color="var(--brand)"
          />
        )}
      </div>

      {/* 탭 */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--line)',
          marginBottom: 14,
        }}
      >
        <TabBtn active={tab === 'orders'} onClick={() => setTab('orders')}>
          주문 내역
        </TabBtn>
        <TabBtn active={tab === 'payments'} onClick={() => setTab('payments')}>
          입금 내역
        </TabBtn>
        <TabBtn
          active={tab === 'reconciliation'}
          onClick={() => setTab('reconciliation')}
        >
          월별 정산
        </TabBtn>
      </div>

      {tab === 'orders' && (
        <OrdersTab companyId={companyId} entity={entity} />
      )}
      {tab === 'payments' && (
        <PaymentsTab companyId={companyId} entity={entity} />
      )}
      {tab === 'reconciliation' && (
        <ReconciliationTab entity={entity} />
      )}
    </Modal>
  );
}

function TabBtn({
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
        borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`,
        color: active ? 'var(--brand)' : 'var(--ink-3)',
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'var(--font-kr)',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function SummaryInline({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: color ?? 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ₩{fmtWon(value)}
        {suffix}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 탭1: 주문 내역
// ───────────────────────────────────────────────────────────

function OrdersTab({
  companyId,
  entity,
}: {
  companyId: string | null;
  entity: ReceivableSummary;
}) {
  const { data: orders = [], isLoading, error } = useDrilldownOrders(
    companyId,
    entity,
  );

  if (isLoading) return <EmptyBox label="불러오는 중…" />;
  if (error)
    return <EmptyBox label={`로딩 실패: ${(error as Error).message}`} />;
  if (orders.length === 0) return <EmptyBox label="주문이 없습니다." />;

  return (
    <div
      style={{
        maxHeight: '50vh',
        overflowY: 'auto',
        border: '1px solid var(--line)',
        borderRadius: 8,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead
          style={{
            background: 'var(--surface-2)',
            position: 'sticky',
            top: 0,
            fontSize: 11,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <tr>
            <th style={thStyle('left')}>주문일</th>
            {entity.is_group && <th style={thStyle('left')}>거래처</th>}
            <th style={thStyle('right')}>금액</th>
            <th style={thStyle('center')}>상태</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ ...tdStyle('left'), ...numStyle }}>{o.order_date}</td>
              {entity.is_group && (
                <td style={tdStyle('left')}>{o.customer_name}</td>
              )}
              <td style={{ ...tdStyle('right'), ...numStyle }}>
                ₩{fmtWon(o.total_amount)}
              </td>
              <td style={tdStyle('center')}>
                <StatusTag status={o.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    confirmed: { label: '확정', bg: 'var(--info-wash)', color: 'var(--info)' },
    shipped:   { label: '배송', bg: 'var(--warning-wash)', color: 'var(--warning)' },
    done:      { label: '완료', bg: 'var(--success-wash)', color: 'var(--success)' },
  };
  const m = map[status] ?? { label: status, bg: 'var(--surface-2)', color: 'var(--ink-3)' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        background: m.bg,
        color: m.color,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {m.label}
    </span>
  );
}

// ───────────────────────────────────────────────────────────
// 탭2: 입금 내역 (group_payments)
// ───────────────────────────────────────────────────────────

function PaymentsTab({
  companyId,
  entity,
}: {
  companyId: string | null;
  entity: ReceivableSummary;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: payments = [], isLoading, error } = useDrilldownPayments(
    companyId,
    entity,
  );

  const [deleteTarget, setDeleteTarget] = useState<GroupPayment | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (p: GroupPayment) => {
      const { error: delErr } = await supabase
        .from('group_payments')
        .delete()
        .eq('id', p.id)
        .eq('company_id', companyId!);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drilldown-payments'] });
      queryClient.invalidateQueries({ queryKey: ['receivables-summary'] });
      showToast({ kind: 'success', text: '입금 기록을 삭제했습니다.' });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.';
      showToast({ kind: 'error', text: msg });
    },
  });

  if (isLoading) return <EmptyBox label="불러오는 중…" />;
  if (error)
    return <EmptyBox label={`로딩 실패: ${(error as Error).message}`} />;
  if (payments.length === 0)
    return (
      <EmptyBox label="등록된 입금 기록이 없습니다. (은행거래 자동매칭은 ‘월별 정산’ 탭 참고)" />
    );

  return (
    <>
      <div
        style={{
          maxHeight: '50vh',
          overflowY: 'auto',
          border: '1px solid var(--line)',
          borderRadius: 8,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead
            style={{
              background: 'var(--surface-2)',
              position: 'sticky',
              top: 0,
              fontSize: 11,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <tr>
              <th style={thStyle('left')}>입금일</th>
              <th style={thStyle('right')}>실입금액</th>
              <th style={thStyle('right')}>차감액</th>
              <th style={thStyle('right')}>합계</th>
              <th style={thStyle('left')}>메모</th>
              <th style={thStyle('center')}>액션</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ ...tdStyle('left'), ...numStyle }}>{p.paid_at}</td>
                <td style={{ ...tdStyle('right'), ...numStyle }}>
                  ₩{fmtWon(p.amount)}
                </td>
                <td
                  style={{
                    ...tdStyle('right'),
                    ...numStyle,
                    color:
                      p.deduction_applied > 0 ? 'var(--brand)' : 'var(--ink-3)',
                  }}
                >
                  {p.deduction_applied > 0
                    ? `₩${fmtWon(p.deduction_applied)}`
                    : '—'}
                </td>
                <td
                  style={{
                    ...tdStyle('right'),
                    ...numStyle,
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  ₩{fmtWon(p.amount + p.deduction_applied)}
                </td>
                <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                  {p.note ?? '—'}
                </td>
                <td style={tdStyle('center')}>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(p)}
                    aria-label="삭제"
                    title="삭제"
                    style={{
                      width: 26,
                      height: 26,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: 'var(--danger)',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          busy={deleteMutation.isPending}
          title="입금 기록 삭제"
          confirmLabel="삭제"
          confirmVariant="danger"
          body={`${deleteTarget.paid_at} · ₩${fmtWon(
            deleteTarget.amount + deleteTarget.deduction_applied,
          )} 입금 기록을 삭제합니다.`}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────
// 탭3: 월별 정산 (기존 calcMonthlyReconciliation 재활용)
// ───────────────────────────────────────────────────────────

function ReconciliationTab({ entity }: { entity: ReceivableSummary }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  const ordersQuery = useOrdersForReconciliation();
  const txQuery = useBankTransactions(year, null);
  const splitsQuery = useBankTransactionSplits();

  const memberIdsQuery = useQuery<string[]>({
    queryKey: ['reconciliation-member-ids', entity.entity_key],
    queryFn: async () => {
      const { isGroup, id } = parseEntityKey(entity.entity_key);
      if (!isGroup) return [id];
      const members = await fetchAllRows<{ id: string }>(() =>
        supabase
          .from('customers')
          .select('id')
          .eq('group_id', id)
          .is('deleted_at', null),
      );
      return members.map((m) => m.id);
    },
    staleTime: 60_000,
  });

  const memberIds = memberIdsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const transactions = txQuery.data ?? [];
  const splits = splitsQuery.data ?? [];

  const reconciliations = useMemo(() => {
    if (memberIds.length === 0) return [];
    const memberSet = new Set(memberIds);
    const filteredOrders = orders.filter(
      (o) => memberSet.has(o.customer_id) && o.order_date.startsWith(`${year}-`),
    );
    if (filteredOrders.length === 0) return [];
    return calcMonthlyReconciliation(
      filteredOrders,
      transactions
        .filter((t) => t.customer_id && memberSet.has(t.customer_id))
        .map((t) => ({
          id: t.id,
          customer_id: t.customer_id,
          transaction_date: t.transaction_date.slice(0, 10),
          amount: t.amount,
          match_status: t.match_status,
          target_sales_month: t.target_sales_month,
        })),
      splits,
      new Date(),
      PAYMENT_TOLERANCE_AMOUNT,
    );
  }, [memberIds, orders, transactions, splits, year]);

  // 그룹: 멤버 합산을 위해 calcReceivableCards 결과를 모두 합치는 방식 대신 행 단위 표시
  const sortedRows = useMemo(() => {
    const sorted = [...reconciliations].sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.customer_name.localeCompare(b.customer_name),
    );
    return sorted;
  }, [reconciliations]);

  // 카드 단위 미수금/위험 합산 (그룹: 멤버 카드 합산)
  const aggregated = useMemo(() => {
    if (reconciliations.length === 0)
      return { totalSales: 0, totalDeposit: 0, overdue: 0, pending: 0 };
    const cards = calcReceivableCards(reconciliations, new Map());
    return cards.reduce(
      (acc, c) => ({
        totalSales: acc.totalSales + c.total_sales,
        totalDeposit: acc.totalDeposit + c.total_deposit,
        overdue: acc.overdue + c.overdue_amount,
        pending: acc.pending + c.pending_amount,
      }),
      { totalSales: 0, totalDeposit: 0, overdue: 0, pending: 0 },
    );
  }, [reconciliations]);

  const yearOptions: number[] = [];
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y);

  const isLoading =
    ordersQuery.isLoading || txQuery.isLoading || memberIdsQuery.isLoading;

  return (
    <div>
      {/* 연도 선택 + 합계 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{
            height: 28,
            padding: '0 8px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--surface)',
            fontSize: 12,
          }}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--ink-3)',
          }}
        >
          매출 ₩{fmtWon(aggregated.totalSales)} · 입금 ₩
          {fmtWon(aggregated.totalDeposit)} · 정산대기 ₩
          {fmtWon(aggregated.pending)} · 연체 ₩{fmtWon(aggregated.overdue)}
        </span>
      </div>

      {isLoading ? (
        <EmptyBox label="불러오는 중…" />
      ) : sortedRows.length === 0 ? (
        <EmptyBox label={`${year}년 매출/정산 기록이 없습니다.`} />
      ) : (
        <div
          style={{
            maxHeight: '46vh',
            overflowY: 'auto',
            border: '1px solid var(--line)',
            borderRadius: 8,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead
              style={{
                background: 'var(--surface-2)',
                position: 'sticky',
                top: 0,
                fontSize: 11,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <tr>
                <th style={thStyle('left')}>매출월</th>
                {entity.is_group && <th style={thStyle('left')}>거래처</th>}
                <th style={thStyle('right')}>매출합계</th>
                <th style={thStyle('center')}>정산마감</th>
                <th style={thStyle('right')}>입금합계</th>
                <th style={thStyle('right')}>잔액</th>
                <th style={thStyle('center')}>상태</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <ReconciliationRow
                  key={`${r.customer_id}__${r.month}`}
                  r={r}
                  showCustomer={entity.is_group}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReconciliationRow({
  r,
  showCustomer,
}: {
  r: MonthlyReconciliation;
  showCustomer: boolean;
}) {
  const statusMap: Record<string, { label: string; bg: string; color: string }> =
    {
      연체: { label: '연체', bg: 'var(--danger-wash)', color: 'var(--danger)' },
      정산대기: { label: '정산대기', bg: 'var(--info-wash)', color: 'var(--info)' },
      정산완료: { label: '입금완료', bg: 'var(--success-wash)', color: 'var(--success)' },
    };
  const s = statusMap[r.status] ?? {
    label: r.status,
    bg: 'var(--surface-2)',
    color: 'var(--ink-3)',
  };
  const diffColor =
    r.difference > 0
      ? 'var(--danger)'
      : r.difference < 0
        ? 'var(--info, #2563eb)'
        : 'var(--success, #16a34a)';

  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <td style={{ ...tdStyle('left'), ...numStyle }}>{r.month}</td>
      {showCustomer && <td style={tdStyle('left')}>{r.customer_name}</td>}
      <td style={{ ...tdStyle('right'), ...numStyle }}>
        ₩{fmtWon(r.sales_total)}
      </td>
      <td style={{ ...tdStyle('center'), ...numStyle }}>{r.due_date}</td>
      <td style={{ ...tdStyle('right'), ...numStyle }}>
        ₩{fmtWon(r.deposit_total)}
      </td>
      <td style={{ ...tdStyle('right'), ...numStyle, color: diffColor }}>
        ₩{fmtWon(r.difference)}
      </td>
      <td style={tdStyle('center')}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 6,
            background: s.bg,
            color: s.color,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {s.label}
        </span>
      </td>
    </tr>
  );
}

// ───────────────────────────────────────────────────────────
// 입금 등록 모달
// ───────────────────────────────────────────────────────────

function PaymentModal({
  target,
  overdueAmount,
  pendingAmount,
  companyId,
  onClose,
}: {
  target: ReceivableSummary;
  overdueAmount: number;
  pendingAmount: number;
  companyId: string | null;
  onClose: () => void;
}) {
  // 잔여 미정산 = 연체 + 정산대기 (입금시 청산되어야 할 금액)
  const totalDue = overdueAmount + pendingAmount;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [paidAt, setPaidAt] = useState(todayStr);
  const [amountStr, setAmountStr] = useState('');
  const [applyDeduction, setApplyDeduction] = useState(
    target.monthly_deduction > 0,
  );
  const [note, setNote] = useState('');

  const amount = Number(amountStr.replace(/,/g, '')) || 0;
  const deductionApplied = applyDeduction ? target.monthly_deduction : 0;
  const totalApplied = amount + deductionApplied;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      if (amount <= 0) throw new Error('실입금액을 입력해주세요.');
      const { isGroup, id } = parseEntityKey(target.entity_key);

      const { error: insErr } = await supabase.from('group_payments').insert({
        company_id: companyId,
        group_id: isGroup ? id : null,
        customer_id: isGroup ? null : id,
        paid_at: paidAt,
        amount,
        deduction_applied: deductionApplied,
        note: note.trim() || null,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables-summary'] });
      queryClient.invalidateQueries({ queryKey: ['drilldown-payments'] });
      showToast({ kind: 'success', text: '입금을 등록했습니다.' });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : '입금 등록에 실패했습니다.';
      showToast({ kind: 'error', text: msg });
    },
  });

  const busy = saveMutation.isPending;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="입금 등록"
      width={460}
      footer={
        <>
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-base primary"
            style={{ height: 32, fontSize: 12.5 }}
            disabled={busy || amount <= 0}
            onClick={() => saveMutation.mutate()}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="거래처">
          <div
            style={{
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              fontSize: 13,
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {target.display_name}
            {target.is_group && <GroupBadge />}
          </div>
        </Field>

        <Field label="현재 잔여 (연체+정산대기)">
          <div
            className="num"
            style={{
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              fontSize: 13,
              fontWeight: 600,
              color: overdueAmount > 0
                ? 'var(--danger)'
                : pendingAmount > 0
                  ? 'var(--warning, #d97706)'
                  : 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span>₩{fmtWon(totalDue)}</span>
            {(overdueAmount > 0 || pendingAmount > 0) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--ink-3)',
                }}
              >
                미수금 ₩{fmtWon(overdueAmount)} · 정산대기 ₩{fmtWon(pendingAmount)}
              </span>
            )}
          </div>
        </Field>

        <Field label="입금일" required>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        <Field label="실입금액 (원)" required>
          <input
            type="text"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              if (!raw) {
                setAmountStr('');
                return;
              }
              setAmountStr(Number(raw).toLocaleString('ko-KR'));
            }}
            placeholder="예: 100,000"
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        {target.monthly_deduction > 0 && (
          <Field label="월차감 적용">
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '10px 12px',
                border: `1px solid ${
                  applyDeduction ? 'var(--brand)' : 'var(--line)'
                }`,
                borderRadius: 8,
                background: applyDeduction
                  ? 'var(--brand-wash)'
                  : 'var(--surface)',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={applyDeduction}
                onChange={(e) => setApplyDeduction(e.target.checked)}
                disabled={busy}
                style={{ marginTop: 2 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--ink)',
                    fontWeight: 500,
                  }}
                >
                  시스템이용료 차감 적용 (₩{fmtWon(target.monthly_deduction)})
                </div>
                {target.deduction_note && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {target.deduction_note}
                  </div>
                )}
              </div>
            </label>
          </Field>
        )}

        <Field label="메모">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="선택 입력"
            rows={2}
            disabled={busy}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
          />
        </Field>

        {/* 차감 적용 안내 / 정상 입금 판정 */}
        {amount > 0 && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--ink-2)',
              lineHeight: 1.6,
            }}
          >
            <div className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>
              입금액 ₩{fmtWon(amount)}
              {deductionApplied > 0 && (
                <>
                  {' '}
                  + 차감 ₩{fmtWon(deductionApplied)} = ₩{fmtWon(totalApplied)}
                </>
              )}
            </div>
            <div
              style={{
                marginTop: 4,
                color:
                  totalApplied >= totalDue
                    ? 'var(--success, #16a34a)'
                    : 'var(--ink-3)',
                fontWeight: 500,
              }}
            >
              {(() => {
                if (totalDue === 0) return '현재 미정산 잔액이 없습니다.';
                return totalApplied >= totalDue
                  ? `잔여 완전 정산 (₩${fmtWon(totalApplied - totalDue)} 초과 입금)`
                  : `잔여 ₩${fmtWon(totalDue - totalApplied)}`;
              })()}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────
// 공용
// ───────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11.5,
          color: 'var(--ink-2)',
          fontWeight: 500,
          fontFamily: 'var(--font-kr)',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 34,
  padding: '0 10px',
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--surface)',
  fontSize: 13,
  fontFamily: 'var(--font-kr)',
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
};

function EmptyBox({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '40px 16px',
        textAlign: 'center',
        background: 'var(--surface)',
        border: '1px dashed var(--line)',
        borderRadius: 12,
        color: 'var(--ink-3)',
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}
