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
import { Plus, Trash2 } from 'lucide-react';
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
          .is('deleted_at', null)
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

  const [drilldownEntity, setDrilldownEntity] =
    useState<ReceivableSummary | null>(null);
  const [paymentTarget, setPaymentTarget] =
    useState<ReceivableSummary | null>(null);

  // 필터: 미수금 양수만 / 0 또는 음수까지 / 그룹만
  const [filter, setFilter] = useState<'positive' | 'all' | 'group'>('positive');

  const filtered = useMemo(() => {
    if (filter === 'all') return summaries;
    if (filter === 'group') return summaries.filter((s) => s.is_group);
    return summaries.filter((s) => s.outstanding > 0);
  }, [summaries, filter]);

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => ({
        billed: acc.billed + s.total_billed,
        paid: acc.paid + s.total_paid,
        outstanding: acc.outstanding + s.outstanding,
      }),
      { billed: 0, paid: 0, outstanding: 0 },
    );
  }, [summaries]);

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

          <div style={{ display: 'flex', gap: 6 }}>
            <FilterPill
              active={filter === 'positive'}
              onClick={() => setFilter('positive')}
            >
              미수금 있음
            </FilterPill>
            <FilterPill
              active={filter === 'group'}
              onClick={() => setFilter('group')}
            >
              그룹만
            </FilterPill>
            <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
              전체
            </FilterPill>
          </div>
        </header>

        {/* 요약 카드 3개 */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <SummaryCard label="총 청구액" value={totals.billed} />
          <SummaryCard label="총 입금액" value={totals.paid} tone="info" />
          <SummaryCard
            label="총 미수금"
            value={totals.outstanding}
            tone="danger"
            emphasis
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

        {/* 미수금 목록 */}
        {companyLoading || isLoading ? (
          <EmptyBox label="불러오는 중…" />
        ) : filtered.length === 0 ? (
          <EmptyBox label="표시할 미수금이 없습니다." />
        ) : (
          <ReceivablesTable
            rows={filtered}
            onRowClick={setDrilldownEntity}
            onPaymentClick={setPaymentTarget}
          />
        )}
      </main>

      {/* 드릴다운 모달 */}
      {drilldownEntity && (
        <DrilldownModal
          entity={drilldownEntity}
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
}: {
  label: string;
  value: number;
  tone?: 'info' | 'danger';
  emphasis?: boolean;
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'info'
        ? 'var(--info, #2563eb)'
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
  onRowClick,
  onPaymentClick,
}: {
  rows: ReceivableSummary[];
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
            <th style={thStyle('right')}>월차감</th>
            <th style={thStyle('center')}>액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ReceivableRow
              key={r.entity_key}
              row={r}
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
  onRowClick,
  onPaymentClick,
}: {
  row: ReceivableSummary;
  onRowClick: (e: ReceivableSummary) => void;
  onPaymentClick: (e: ReceivableSummary) => void;
}) {
  const outstandingColor =
    row.outstanding > 0
      ? 'var(--danger)'
      : row.outstanding < 0
        ? 'var(--info, #2563eb)'
        : 'var(--success, #16a34a)';

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
          color: outstandingColor,
          fontWeight: 600,
        }}
      >
        ₩{fmtWon(row.outstanding)}
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
// 드릴다운 모달 (탭 3개)
// ───────────────────────────────────────────────────────────

type DrillTab = 'orders' | 'payments' | 'reconciliation';

function DrilldownModal({
  entity,
  onClose,
  onOpenPayment,
}: {
  entity: ReceivableSummary;
  onClose: () => void;
  onOpenPayment: () => void;
}) {
  const [tab, setTab] = useState<DrillTab>('orders');
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
          value={entity.outstanding}
          color={
            entity.outstanding > 0
              ? 'var(--danger)'
              : 'var(--success, #16a34a)'
          }
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
    confirmed: { label: '확정', bg: '#dbeafe', color: '#1d4ed8' },
    shipped: { label: '배송', bg: '#fef3c7', color: '#a16207' },
    done: { label: '완료', bg: '#dcfce7', color: '#166534' },
  };
  const m = map[status] ?? { label: status, bg: '#f3f4f6', color: '#4b5563' };
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
      연체: { label: '연체', bg: '#fee2e2', color: '#b91c1c' },
      정산대기: { label: '정산대기', bg: '#dbeafe', color: '#1d4ed8' },
      정산완료: { label: '입금완료', bg: '#dcfce7', color: '#166534' },
    };
  const s = statusMap[r.status] ?? {
    label: r.status,
    bg: '#f3f4f6',
    color: '#4b5563',
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
  companyId,
  onClose,
}: {
  target: ReceivableSummary;
  companyId: string | null;
  onClose: () => void;
}) {
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

        <Field label="현재 미수금">
          <div
            className="num"
            style={{
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              fontSize: 13,
              fontWeight: 600,
              color:
                target.outstanding > 0
                  ? 'var(--danger)'
                  : 'var(--success, #16a34a)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ₩{fmtWon(target.outstanding)}
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
                  totalApplied >= target.outstanding
                    ? 'var(--success, #16a34a)'
                    : 'var(--ink-3)',
                fontWeight: 500,
              }}
            >
              {totalApplied >= target.outstanding
                ? `미수금 완전 정산 (잔여 ₩${fmtWon(totalApplied - target.outstanding)} 초과 입금)`
                : `미수금 잔여 ₩${fmtWon(target.outstanding - totalApplied)}`}
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
