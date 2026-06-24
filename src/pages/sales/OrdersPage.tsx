/**
 * 주문내역 페이지 — 판매 > 주문내역.
 *
 * 구조: PageHeader · FilterBar · SplitLayout(List | 드래그핸들 | Detail) · BulkBar
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany() 훅에서만 획득.
 * 🔴 CLAUDE.md §2: 계산 로직은 utils/calculations (여기서는 직접 호출 X, Detail 내부에서 calcSupplyAmount 사용).
 * 🔴 CLAUDE.md §5: 서버 조회는 useOrders(TanStack + fetchAllRows). 기간만 서버, 나머지는 useMemo.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Calendar, Download, FileText, Flag, Plus, Users } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { useOrders } from '@/hooks/queries/useOrders';
import { OrderListTable } from '@/components/feature/orders/OrderListTable';
import { OrderDetailPane } from '@/components/feature/orders/OrderDetailPane';
import { OrderBulkBar } from '@/components/feature/orders/OrderBulkBar';
import {
  InvoicePrintView,
  type InvoiceCustomerGroup,
} from '@/components/feature/orders/InvoicePrintView';
import {
  GradeBadge,
  MultiChip,
  Segmented,
  fmtWon,
  periodRange,
} from '@/components/feature/orders/primitives';
import type { OrderStatus } from '@/types/common';
import type { Order, PeriodKey } from '@/types/orders';

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'lastmonth', label: '지난 달' },
  { id: '90d', label: '90일' },
  { id: 'custom', label: '사용자 지정' },
];

const STATUS_OPTIONS: { id: OrderStatus; label: string; dot: string }[] = [
  { id: 'draft', label: '임시', dot: 'var(--ink-4)' },
  { id: 'confirmed', label: '확정', dot: 'var(--info)' },
  { id: 'shipped', label: '출고', dot: 'var(--warning)' },
  { id: 'done', label: '완료', dot: 'var(--success)' },
  { id: 'canceled', label: '취소', dot: 'var(--danger)' },
];

const dateInputStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-num)',
  fontSize: 12,
  color: 'var(--ink-2)',
  outline: 'none',
};

const PER_PAGE = 14;

/** 연월일 yyyy-mm-dd → ISO 문자열(Asia/Seoul KST 가정 단순화). */
function toIso(d: Date): string {
  return d.toISOString();
}

export function OrdersPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const location = useLocation();
  const incomingOrderId = (location.state as { selectedOrderId?: string } | null)
    ?.selectedOrderId;

  // ───── 필터 상태 ─────
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState<{ from: string; to: string }>({
    from: '2026-03-01',
    to: '2026-04-19',
  });
  const [statusSel, setStatusSel] = useState<OrderStatus[]>([]);
  const [customerSel, setCustomerSel] = useState<string[]>([]);

  // ───── 선택 상태 ─────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  // ───── 스플릿 (공용 훅) ─────
  const {
    leftPercent,
    onDragStart: startSplitDrag,
    containerRef: splitRef,
  } = useResizableSplit({ pageKey: 'orders', defaultLeftPercent: 55 });

  // ───── 기간 계산 ─────
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (period === 'custom') {
      return [
        new Date(custom.from + 'T00:00:00'),
        new Date(custom.to + 'T23:59:59'),
      ];
    }
    return periodRange(period, new Date());
  }, [period, custom]);

  // ───── 서버 쿼리 ─────
  const { data: orders = [], isLoading } = useOrders({
    companyId,
    range: { start: toIso(rangeStart), end: toIso(rangeEnd) },
  });

  // ───── 거래처 옵션 (로드된 주문에서 추출) ─────
  const customerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; grade: string | null }>();
    orders.forEach((o) => {
      if (o.customer && !map.has(o.customer.id)) {
        map.set(o.customer.id, o.customer);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [orders]);

  // ───── 클라이언트 필터링 ─────
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusSel.length && !statusSel.includes(o.status)) return false;
      if (customerSel.length && (!o.customer || !customerSel.includes(o.customer.id)))
        return false;
      return true;
    });
  }, [orders, statusSel, customerSel]);

  // ───── 합계 KPI ─────
  const summary = useMemo(() => {
    const count = filtered.length;
    const gross = filtered.reduce((s, o) => s + o.total_amount, 0);
    const returns = filtered.reduce(
      (s, o) => s + o.items.filter((it) => it.is_return).reduce((x, it) => x + it.amount, 0),
      0,
    );
    const avg = count ? Math.round(gross / count) : 0;
    return { count, gross, net: gross, returns, avg };
  }, [filtered]);

  // ───── 페이지네이션 ─────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [period, custom, statusSel, customerSel]);

  useEffect(() => {
    if (!selectedId || !filtered.find((o) => o.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  // OrderEntryPage 저장 후 라우터 state 로 전달된 신규 주문을 우선 선택.
  useEffect(() => {
    if (incomingOrderId && orders.find((o) => o.id === incomingOrderId)) {
      setSelectedId(incomingOrderId);
    }
  }, [incomingOrderId, orders]);

  const selectedOrder: Order | null = filtered.find((o) => o.id === selectedId) ?? null;

  // ───── 체크박스 일괄 ─────
  const pageIds = pageRows.map((o) => o.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => checked[id]);
  const somePageChecked = pageIds.some((id) => checked[id]);
  const togglePage = () => {
    setChecked((c) => {
      const next = { ...c };
      if (allPageChecked) pageIds.forEach((id) => delete next[id]);
      else pageIds.forEach((id) => (next[id] = true));
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
  const selectedCount = Object.keys(checked).length;
  const clearAll = () => setChecked({});
  const resetFilters = () => {
    setStatusSel([]);
    setCustomerSel([]);
    setPeriod('90d');
  };

  // ───── 거래명세서 인쇄 ─────
  const [printGroups, setPrintGroups] = useState<InvoiceCustomerGroup[] | null>(null);

  const handlePrintInvoice = () => {
    // 체크된 주문만 추출 — filtered 전체에서 가져와야 페이지네이션을 넘어선 선택도 포함.
    const selected = filtered.filter((o) => checked[o.id]);
    if (selected.length === 0) return;

    // customer_id 기준 그룹핑.
    const map = new Map<string, InvoiceCustomerGroup>();
    for (const o of selected) {
      if (!o.customer) continue;
      const key = o.customer.id;
      let group = map.get(key);
      if (!group) {
        group = {
          customer: {
            id: o.customer.id,
            name: o.customer.name,
            address: o.customer.delivery_address ?? null,
            phone: o.customer.contact1 ?? null,
          },
          orders: [],
        };
        map.set(key, group);
      }
      group.orders.push({
        id: o.id,
        order_date: o.order_date,
        memo: o.memo,
        items: o.items.map((it) => ({
          id: it.id,
          product: {
            code: it.product?.code ?? '',
            name: it.product?.name ?? '',
            sell_price: it.product?.sell_price,
          },
          quantity: it.quantity,
          unit_price: it.unit_price,
          amount: it.amount,
          is_return: it.is_return,
        })),
      });
    }
    // 각 그룹의 주문을 날짜 오름차순 정렬 → index 0 이 "주문서", 이후 "추가주문".
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.orders.sort(
        (a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime(),
      );
    }
    // 거래처도 이름순 정렬.
    groups.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'ko'));

    setPrintGroups(groups);
    // 다음 페인트 사이클에 인쇄 → afterprint 시점에 state 초기화.
    setTimeout(() => {
      window.print();
      setPrintGroups(null);
    }, 300);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '12px 32px 80px',
          maxWidth: 1720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 페이지 헤더 — 제목 + 필터 + 액션을 한 줄에, 요약은 별도 줄 */}
        <header style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            판매 › 주문내역
          </div>
          {/* Row 1: 제목 | 기간 | 날짜 | 거래처 | 상태 | grow | 엑셀 | 주문추가 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="disp"
              style={{
                fontSize: 20,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
                lineHeight: 1.1,
                marginRight: 4,
              }}
            >
              주문내역
            </h1>
            <Segmented
              compact
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
            />
            {period === 'custom' && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-num)',
                  fontSize: 12,
                  color: 'var(--ink-2)',
                }}
              >
                <Calendar size={13} color="var(--ink-3)" strokeWidth={1.6} />
                <input
                  type="date"
                  value={custom.from}
                  onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                  style={dateInputStyle}
                />
                <span style={{ color: 'var(--ink-4)' }}>—</span>
                <input
                  type="date"
                  value={custom.to}
                  onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                  style={dateInputStyle}
                />
              </div>
            )}
            <MultiChip
              label="거래처"
              icon={<Users size={13} strokeWidth={1.6} />}
              selected={customerSel}
              onChange={setCustomerSel}
              options={customerOptions.map((c) => ({
                id: c.id,
                label: c.name,
                prefix: <GradeBadge grade={c.grade} size="sm" />,
              }))}
            />
            <MultiChip
              label="상태"
              icon={<Flag size={13} strokeWidth={1.6} />}
              selected={statusSel}
              onChange={(ids) => setStatusSel(ids as OrderStatus[])}
              options={STATUS_OPTIONS.map((s) => ({
                id: s.id,
                label: s.label,
                prefix: (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: s.dot,
                    }}
                  />
                ),
              }))}
            />
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn-base"
              style={{ height: 30, fontSize: 12 }}
            >
              <Download size={13} /> 엑셀
            </button>
            <button
              type="button"
              onClick={handlePrintInvoice}
              disabled={selectedCount === 0}
              className="btn-base"
              style={{
                height: 30,
                fontSize: 12,
                opacity: selectedCount === 0 ? 0.5 : 1,
                cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              }}
              title={
                selectedCount === 0
                  ? '왼쪽 목록에서 주문을 체크하세요'
                  : `${selectedCount}건 거래명세서 출력`
              }
            >
              <FileText size={13} /> 거래명세서
              {selectedCount > 0 && (
                <span style={{ marginLeft: 4, color: 'var(--ink-3)' }}>
                  ({selectedCount})
                </span>
              )}
            </button>
            <button
              type="button"
              className="btn-base primary"
              style={{ height: 30, fontSize: 12 }}
            >
              <Plus size={13} /> 주문 추가
            </button>
          </div>
          {/* Row 2: 요약 */}
          <div
            style={{
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              marginTop: 8,
            }}
          >
            <SummaryItem label="건수" value={`${summary.count.toLocaleString('ko-KR')}건`} />
            <SummaryItem label="총액" value={`${fmtWon(summary.gross)}원`} />
            <SummaryItem
              label="순액"
              value={`${fmtWon(summary.net)}원`}
              tone={summary.returns < 0 ? 'danger' : undefined}
            />
            <SummaryItem label="평균" value={`${fmtWon(summary.avg)}원`} muted />
          </div>
        </header>

        {/* 마스터-디테일 분할 */}
        <div
          ref={splitRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `calc(${leftPercent}% - 3px) 6px calc(${100 - leftPercent}% - 3px)`,
            alignItems: 'start',
            gap: 0,
          }}
        >
          <OrderListTable
            orders={pageRows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            checked={checked}
            onToggleChecked={toggleOne}
            onTogglePageChecked={togglePage}
            pageIds={pageIds}
            allPageChecked={allPageChecked}
            somePageChecked={somePageChecked}
            page={curPage}
            totalPages={totalPages}
            onPageChange={setPage}
            perPage={PER_PAGE}
            totalFiltered={filtered.length}
            isLoading={isLoading || companyLoading}
            onResetFilters={resetFilters}
          />

          {/* Split divider */}
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

          <OrderDetailPane order={selectedOrder} />
        </div>
      </main>

      <OrderBulkBar count={selectedCount} onClear={clearAll} />

      {/* 거래명세서 인쇄 — body 직속 포털. @media print 에서만 표시. */}
      {printGroups &&
        createPortal(
          <div className="invoice-print-portal">
            <InvoicePrintView groups={printGroups} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: 'danger';
  muted?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10,
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
          fontSize: 12.5,
          fontWeight: 600,
          color:
            tone === 'danger'
              ? 'var(--danger)'
              : muted
                ? 'var(--ink-3)'
                : 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}
