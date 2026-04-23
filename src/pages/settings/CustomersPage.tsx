/**
 * 거래처 페이지 — 설정 > 거래처.
 *
 * 구조: PageHeader · FilterBar · SplitLayout(List | divider | Detail)
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany() 훅에서만.
 * 🔴 CLAUDE.md §2: 집계는 utils/calculations + 훅 경유.
 * 🔴 CLAUDE.md §5: 서버 조회는 useCustomers/useCustomerAggregates/useCustomerOrders.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import {
  useCustomers,
  useCustomerAggregates,
  useCustomerOrders,
} from '@/hooks/queries/useCustomers';
import {
  CustomerFilterBar,
  type ActiveFilter,
} from '@/components/feature/customers/CustomerFilterBar';
import { CustomerListTable } from '@/components/feature/customers/CustomerListTable';
import { CustomerDetailPane } from '@/components/feature/customers/CustomerDetailPane';

export function CustomersPage() {
  const { companyId, isLoading: companyLoading } = useCompany();

  const customersQuery = useCustomers(companyId);
  const aggregatesQuery = useCustomerAggregates(companyId);

  // ───── 필터 상태 ─────
  const [query, setQuery] = useState('');
  const [gradeSel, setGradeSel] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [receivableOnly, setReceivableOnly] = useState(false);

  // ───── 선택/체크 상태 ─────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // ───── 스플릿 (공용 훅) ─────
  const {
    leftPercent,
    onDragStart: startSplitDrag,
    containerRef: splitRef,
  } = useResizableSplit({ pageKey: 'customers', defaultLeftPercent: 58 });

  // ───── 필터링 ─────
  const customers = customersQuery.data ?? [];
  const aggregates = aggregatesQuery.data;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (activeFilter === 'active' && !c.is_active) return false;
      if (activeFilter === 'inactive' && c.is_active) return false;
      if (gradeSel.length && !(c.grade && gradeSel.includes(c.grade))) return false;
      if (receivableOnly) {
        const bal = aggregates?.get(c.id)?.balance ?? 0;
        if (bal <= 0) return false;
      }
      if (q) {
        const inName = c.name.toLowerCase().includes(q);
        const inContact =
          (c.contact1?.toLowerCase().includes(q) ?? false) ||
          (c.contact2?.toLowerCase().includes(q) ?? false);
        const inBiz = c.business?.name.toLowerCase().includes(q) ?? false;
        if (!inName && !inContact && !inBiz) return false;
      }
      return true;
    });
  }, [customers, aggregates, activeFilter, gradeSel, receivableOnly, query]);

  // ───── 요약 ─────
  const summary = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.is_active).length;
    let withReceivables = 0;
    if (aggregates) {
      for (const c of customers) {
        const bal = aggregates.get(c.id)?.balance ?? 0;
        if (bal > 0) withReceivables += 1;
      }
    }
    return { total, active, withReceivables };
  }, [customers, aggregates]);

  // ───── 선택 동기화 ─────
  useEffect(() => {
    if (!selectedId || !filtered.find((c) => c.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selectedCustomer = filtered.find((c) => c.id === selectedId) ?? null;
  const ordersQuery = useCustomerOrders(companyId, selectedId);

  // ───── 체크박스 전체 ─────
  const allIds = filtered.map((c) => c.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => checked[id]);
  const someChecked = allIds.some((id) => checked[id]);
  const toggleAll = () => {
    setChecked((c) => {
      const next = { ...c };
      if (allChecked) allIds.forEach((id) => delete next[id]);
      else allIds.forEach((id) => (next[id] = true));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setChecked((c) => {
      const next = { ...c };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const resetFilters = () => {
    setQuery('');
    setGradeSel([]);
    setActiveFilter('all');
    setReceivableOnly(false);
  };

  const isLoading =
    companyLoading || customersQuery.isLoading || aggregatesQuery.isLoading;

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
        {/* 페이지 헤더 */}
        <header style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            설정 › 거래처
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="disp"
              style={{
                fontSize: 26,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              거래처
            </h1>
            <div
              style={{
                display: 'flex',
                gap: 18,
                flex: 1,
                flexWrap: 'wrap',
                paddingBottom: 4,
              }}
            >
              <SummaryItem label="총 거래처" value={`${summary.total}곳`} />
              <SummaryItem
                label="활성"
                value={`${summary.active}`}
                tone="success"
              />
              <SummaryItem
                label="미수금 발생"
                value={`${summary.withReceivables}곳`}
                tone={summary.withReceivables > 0 ? 'danger' : undefined}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled
                title="다음 라운드에서 지원 예정"
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Download size={13} /> 엑셀 내보내기
              </button>
              <button
                type="button"
                disabled
                title="다음 라운드에서 지원 예정"
                className="btn-base primary"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Plus size={13} /> 거래처 추가
              </button>
            </div>
          </div>
        </header>

        <CustomerFilterBar
          query={query}
          onQueryChange={setQuery}
          gradeSel={gradeSel}
          onGradeChange={setGradeSel}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          receivableOnly={receivableOnly}
          onReceivableOnlyChange={setReceivableOnly}
          totalFiltered={filtered.length}
          totalAll={customers.length}
        />

        {/* 에러 배너 (List/Aggregate 중 하나라도 실패 시) */}
        {(customersQuery.error || aggregatesQuery.error) && (
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
            데이터 일부 로딩 실패:{' '}
            {(customersQuery.error ?? aggregatesQuery.error)?.message}
          </div>
        )}

        <div
          ref={splitRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `calc(${leftPercent}% - 3px) 6px calc(${100 - leftPercent}% - 3px)`,
            alignItems: 'start',
            gap: 0,
          }}
        >
          <CustomerListTable
            customers={filtered}
            aggregates={aggregates}
            selectedId={selectedId}
            onSelect={setSelectedId}
            checked={checked}
            onToggleChecked={toggleOne}
            onToggleAllChecked={toggleAll}
            allChecked={allChecked}
            someChecked={someChecked}
            isLoading={isLoading}
            onResetFilters={resetFilters}
          />

          {/* 스플릿 핸들 */}
          <div
            onMouseDown={startSplitDrag}
            title="드래그해서 크기 조절"
            style={{
              alignSelf: 'stretch',
              cursor: 'col-resize',
              position: 'relative',
              userSelect: 'none',
              minHeight: 240,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--line)',
                transform: 'translateX(-0.5px)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 4,
                height: 32,
                borderRadius: 3,
                background: 'var(--line-strong)',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--brand)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'var(--line-strong)')
              }
            />
          </div>

          <CustomerDetailPane
            customer={selectedCustomer}
            aggregate={
              selectedCustomer ? aggregates?.get(selectedCustomer.id) : undefined
            }
            orders={ordersQuery.data}
            ordersLoading={ordersQuery.isLoading}
            ordersError={ordersQuery.error as Error | null}
          />
        </div>
      </main>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'success';
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'success'
        ? 'var(--success)'
        : 'var(--ink)';
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
          fontSize: 14,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}
