/**
 * 모바일 주문내역 페이지.
 * - 접힘: 주문 카드 리스트
 * - 펼침: 좌측 카드 리스트 + 우측 선택된 주문 상세
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서.
 * 🔴 CLAUDE.md §5: 기존 useOrders 재사용 → fetchAllRows 자동 적용.
 */
import { useMemo, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { useOrders } from '@/hooks/queries/useOrders';
import type { Order } from '@/types/orders';
import { useMediaQuery } from '../hooks/useMediaQuery';

type PeriodKey = 'today' | 'week' | 'month' | 'all';

interface PeriodRange {
  key: PeriodKey;
  label: string;
}

const PERIODS: PeriodRange[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'all', label: '전체' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getRange(p: PeriodKey): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (p === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: ymd(start), end: ymd(end) };
  }
  if (p === 'week') {
    const day = now.getDay(); // 일=0
    const monOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + monOffset,
    );
    return { start: ymd(start), end: ymd(end) };
  }
  if (p === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: ymd(start), end: ymd(end) };
  }
  // all: 충분히 넓은 범위
  const start = new Date(2020, 0, 1);
  return { start: ymd(start), end: ymd(end) };
}

function fmtWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

function gradeBadgeColor(grade: string | null | undefined): string {
  switch ((grade || '').toLowerCase()) {
    case 'a':
      return 'var(--m-primary)';
    case 'b':
      return 'var(--m-warning)';
    case 'c':
      return '#3b82f6';
    case 'd':
      return '#6b7280';
    default:
      return '#9ca3af';
  }
}

function statusBadge(status: Order['status']) {
  if (status === 'confirmed' || status === 'shipped' || status === 'done') {
    return { label: '확정', color: 'var(--m-success)' };
  }
  if (status === 'canceled') {
    return { label: '취소', color: 'var(--m-danger)' };
  }
  return { label: '대기', color: 'var(--m-warning)' };
}

export function OrderListPage() {
  const { companyId } = useCompany();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isUnfolded = useMediaQuery('(min-width: 601px)');

  const range = useMemo(() => getRange(period), [period]);
  const { data: orders = [], isLoading } = useOrders({ companyId, range });

  const selected = orders.find((o) => o.id === selectedId) ?? orders[0] ?? null;
  const showDetail = isUnfolded && selected !== null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUnfolded ? 'row' : 'column',
        minHeight: '100%',
      }}
    >
      {/* 좌측(또는 단일) 리스트 */}
      <div
        style={{
          flex: isUnfolded ? '0 0 360px' : '1 1 auto',
          borderRight: isUnfolded ? '1px solid var(--m-border)' : 'none',
          minHeight: 0,
        }}
      >
        <header className="m-page-header">
          <h1 className="m-page-title">주문내역</h1>
          <div className="m-tab-row">
            {PERIODS.map((p) => (
              <button
                type="button"
                key={p.key}
                className="m-tab"
                aria-pressed={period === p.key}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="m-empty">불러오는 중…</div>
        ) : orders.length === 0 ? (
          <div className="m-empty">해당 기간에 주문이 없습니다.</div>
        ) : (
          <div className="m-list">
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                selected={isUnfolded && selected?.id === o.id}
                onClick={() => setSelectedId(o.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 우측 상세 (펼침 한정) */}
      {showDetail && (
        <div style={{ flex: 1, minWidth: 0, padding: '12px 16px' }}>
          <OrderDetail order={selected!} />
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  selected,
  onClick,
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
}) {
  const qty = order.items.reduce((s, it) => s + (it.quantity ?? 0), 0);
  const grade = order.customer?.grade ?? null;
  const status = statusBadge(order.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className="m-card"
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: selected ? 'var(--m-primary)' : 'var(--m-border)',
        background: selected ? 'var(--m-primary-wash)' : 'var(--m-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--m-text)' }}>
          {order.customer?.name ?? '거래처 미상'}
        </span>
        {grade && (
          <span
            className="m-badge"
            style={{ background: gradeBadgeColor(grade), color: '#ffffff' }}
          >
            {grade.toUpperCase()}
          </span>
        )}
        <span
          className="m-badge"
          style={{
            background: `${status.color}22`,
            color: status.color,
            border: `1px solid ${status.color}`,
          }}
        >
          {status.label}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--m-text-secondary)',
        }}
      >
        <span className="m-num">{order.order_date?.slice(0, 10)}</span>
        <span className="m-num">{fmtWon(qty)}개</span>
      </div>
      <div
        className="m-num"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--m-text)',
          textAlign: 'right',
        }}
      >
        ₩{fmtWon(order.total_amount)}
      </div>
    </button>
  );
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {order.customer?.name ?? '거래처 미상'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--m-text-secondary)',
            marginTop: 4,
          }}
        >
          <span className="m-num">{order.order_date?.slice(0, 10)}</span>
          {order.memo && <span> · {order.memo}</span>}
        </div>
      </div>
      <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
        {order.items.length === 0 ? (
          <div className="m-empty">제품이 없습니다.</div>
        ) : (
          order.items.map((it, idx) => (
            <div
              key={it.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom:
                  idx < order.items.length - 1
                    ? '1px solid var(--m-border)'
                    : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--m-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={it.product?.name ?? ''}
                >
                  {it.product?.name ?? '—'}
                </div>
                <div
                  className="m-num"
                  style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}
                >
                  {it.product?.code}
                </div>
              </div>
              <div
                className="m-num"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  minWidth: 56,
                  textAlign: 'right',
                }}
              >
                {fmtWon(it.quantity)}
              </div>
              <div
                className="m-num"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  minWidth: 88,
                  textAlign: 'right',
                }}
              >
                ₩{fmtWon(it.amount)}
              </div>
            </div>
          ))
        )}
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 14,
        }}
      >
        <span style={{ color: 'var(--m-text-secondary)' }}>합계</span>
        <span
          className="m-num"
          style={{ fontWeight: 700, color: 'var(--m-primary)' }}
        >
          ₩{fmtWon(order.total_amount)}
        </span>
      </div>
    </div>
  );
}
