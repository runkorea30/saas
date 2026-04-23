/**
 * Customers Detail Pane.
 * 기본 정보 + KPI 4개 + 최근 주문 10건.
 */
import { GradeBadge, StatusBadge } from '@/components/feature/orders/primitives';
import type { OrderStatus } from '@/types/common';
import type { Customer, CustomerOrder } from '@/hooks/queries/useCustomers';
import type { CustomerAggregate } from '@/utils/calculations';

interface Props {
  customer: Customer | null;
  aggregate: CustomerAggregate | undefined;
  orders: CustomerOrder[] | undefined;
  ordersLoading: boolean;
  ordersError: Error | null;
}

export function CustomerDetailPane({
  customer,
  aggregate,
  orders,
  ordersLoading,
  ordersError,
}: Props) {
  if (!customer) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: 40,
          textAlign: 'center',
          color: 'var(--ink-3)',
          fontSize: 13,
        }}
      >
        좌측에서 거래처를 선택하세요.
      </div>
    );
  }

  const aliases = (customer.bank_aliases ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GradeBadge grade={customer.grade} size="md" />
          <h2
            className="disp"
            style={{
              fontSize: 20,
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {customer.name}
          </h2>
          <span
            className="chip"
            style={{
              color: customer.is_active ? 'var(--success)' : 'var(--ink-3)',
              background: customer.is_active ? 'var(--success-wash)' : 'var(--surface-2)',
            }}
          >
            <span className="dot" />
            {customer.is_active ? '활성' : '비활성'}
          </span>
        </div>
        {customer.business && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
            {customer.business.name} · 사업자번호{' '}
            <span className="num">{customer.business.business_number}</span>
          </div>
        )}
      </div>

      {/* KPI */}
      <div
        style={{
          padding: '14px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <KpiBlock label="총매출" value={aggregate ? fmtWon(aggregate.total_sales) : '—'} />
        <KpiBlock
          label="미수금"
          value={aggregate && aggregate.balance > 0 ? fmtWon(aggregate.balance) : '—'}
          tone={aggregate && aggregate.balance > 0 ? 'danger' : undefined}
        />
        <KpiBlock
          label="주문 건수"
          value={aggregate ? `${aggregate.order_count}건` : '—'}
        />
        <KpiBlock
          label="최근 주문"
          value={aggregate?.last_order_date ? fmtDate(aggregate.last_order_date) : '—'}
          sub={
            aggregate?.days_since_last !== null && aggregate?.days_since_last !== undefined
              ? `${aggregate.days_since_last}일 경과`
              : undefined
          }
        />
      </div>

      {/* 기본 정보 */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <SectionTitle>기본 정보</SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 14px',
            fontSize: 12.5,
          }}
        >
          <InfoRow label="연락처 1" value={customer.contact1} numeric />
          <InfoRow label="연락처 2" value={customer.contact2} numeric />
          <InfoRow label="이메일" value={customer.email} />
          <InfoRow label="배송지" value={customer.delivery_address} />
          <InfoRow label="정산 주기" value={customer.settlement_cycle} />
          <InfoRow
            label="은행별칭"
            value={aliases.length ? aliases.join(', ') : '등록된 별칭 없음'}
            numeric={aliases.length > 0}
            muted={aliases.length === 0}
          />
        </div>
      </div>

      {/* 최근 주문 이력 */}
      <div style={{ padding: '14px 20px' }}>
        <SectionTitle>최근 주문 이력</SectionTitle>
        {ordersError ? (
          <div style={{ fontSize: 12, color: 'var(--danger)' }}>
            주문 이력 로딩 실패: {ordersError.message}
          </div>
        ) : ordersLoading ? (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>불러오는 중…</div>
        ) : !orders || orders.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>주문 이력이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {orders.map((o) => (
              <div
                key={o.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 12.5,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--surface-2)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <div
                  className="num"
                  style={{ color: 'var(--ink-3)', fontSize: 11.5 }}
                >
                  {fmtDate(o.order_date)}
                </div>
                <div
                  style={{
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: 11.5,
                  }}
                >
                  {summarizeItems(o.items)}
                </div>
                <div className="num" style={{ fontWeight: 500, color: 'var(--ink)' }}>
                  ₩{o.total_amount.toLocaleString('ko-KR')}
                </div>
                <StatusBadge status={o.status as OrderStatus} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-num)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  numeric,
  muted,
}: {
  label: string;
  value: string | null;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <>
      <span style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        className={numeric ? 'num' : undefined}
        style={{
          color: muted ? 'var(--ink-3)' : 'var(--ink)',
          fontStyle: muted ? 'italic' : 'normal',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value ?? '—'}
      </span>
    </>
  );
}

function KpiBlock({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'danger';
}) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: tone === 'danger' ? 'var(--danger)' : 'var(--ink)',
          marginTop: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function summarizeItems(items: { quantity: number; is_return: boolean; product: { name: string } | null }[]): string {
  if (items.length === 0) return '—';
  const first = items[0];
  const firstName = first.product?.name ?? '—';
  if (items.length === 1) return firstName;
  return `${firstName} 외 ${items.length - 1}건`;
}

function fmtWon(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
