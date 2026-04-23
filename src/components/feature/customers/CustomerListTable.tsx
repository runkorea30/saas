/**
 * Customers 목록 테이블.
 * 14건 소량이므로 페이지네이션 생략, 전체 표시.
 */
import { Check, EmptyState, GradeBadge } from '@/components/feature/orders/primitives';
import type { Customer } from '@/hooks/queries/useCustomers';
import type { CustomerAggregate } from '@/utils/calculations';

interface Props {
  customers: Customer[];
  aggregates: Map<string, CustomerAggregate> | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  checked: Record<string, boolean>;
  onToggleChecked: (id: string) => void;
  onToggleAllChecked: () => void;
  allChecked: boolean;
  someChecked: boolean;
  isLoading: boolean;
  onResetFilters?: () => void;
}

const COL_TEMPLATE =
  '32px 44px minmax(220px, 1fr) 140px 72px 120px 120px 104px 56px';

export function CustomerListTable({
  customers,
  aggregates,
  selectedId,
  onSelect,
  checked,
  onToggleChecked,
  onToggleAllChecked,
  allChecked,
  someChecked,
  isLoading,
  onResetFilters,
}: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COL_TEMPLATE,
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          background: 'var(--surface-2)',
        }}
      >
        <Check on={allChecked} indet={!allChecked && someChecked} onChange={onToggleAllChecked} />
        <span>등급</span>
        <span>거래처 · 사업자</span>
        <span>연락처</span>
        <span>정산</span>
        <span style={{ textAlign: 'right' }}>총매출</span>
        <span style={{ textAlign: 'right' }}>미수금</span>
        <span>최근 주문</span>
        <span style={{ textAlign: 'center' }}>상태</span>
      </div>

      {/* 본문 */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
          거래처 데이터를 불러오는 중…
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          title="조건에 맞는 거래처가 없습니다"
          body="필터를 해제하거나 검색어를 지워 보세요."
          secondary={onResetFilters ? '필터 초기화' : undefined}
          onSecondary={onResetFilters}
        />
      ) : (
        customers.map((c) => {
          const agg = aggregates?.get(c.id);
          const balance = agg?.balance ?? 0;
          const isSelected = selectedId === c.id;
          const isChecked = Boolean(checked[c.id]);
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: COL_TEMPLATE,
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                borderBottom: '1px solid var(--line)',
                background: isSelected ? 'var(--brand-wash)' : 'var(--surface)',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
              }}
            >
              <Check on={isChecked} onChange={() => onToggleChecked(c.id)} />
              <GradeBadge grade={c.grade} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontFamily: 'var(--font-num)',
                  }}
                >
                  {c.business?.name ?? '사업자 미연결'}
                </div>
              </div>
              <div
                className="num"
                style={{
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.contact1 ?? '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                {c.settlement_cycle ?? '—'}
              </div>
              <div
                className="num"
                style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right', color: 'var(--ink)' }}
              >
                {fmtWon(agg?.total_sales ?? 0)}
              </div>
              <div
                className="num"
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  textAlign: 'right',
                  color: balance > 0 ? 'var(--danger)' : 'var(--ink-3)',
                }}
              >
                {balance > 0 ? fmtWon(balance) : '—'}
              </div>
              <div
                className="num"
                style={{ fontSize: 11.5, color: 'var(--ink-3)' }}
              >
                {fmtDateShort(agg?.last_order_date ?? null)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span
                  title={c.is_active ? '활성' : '비활성'}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: c.is_active ? 'var(--success)' : 'var(--ink-4)',
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function fmtWon(n: number): string {
  if (n === 0) return '—';
  return n.toLocaleString('ko-KR');
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
