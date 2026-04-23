/**
 * 주문내역 페이지 — 판매 > 주문내역.
 *
 * 구조: PageHeader · FilterBar · SplitLayout(List | 드래그핸들 | Detail) · BulkBar
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany() 훅에서만 획득.
 * 🔴 CLAUDE.md §2: 계산 로직은 utils/calculations (여기서는 직접 호출 X, Detail 내부에서 calcSupplyAmount 사용).
 * 🔴 CLAUDE.md §5: 서버 조회는 useOrders(TanStack + fetchAllRows). 기간만 서버, 나머지는 useMemo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Download, Plus } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useOrders } from '@/hooks/queries/useOrders';
import { OrderFilterBar } from '@/components/feature/orders/OrderFilterBar';
import { OrderListTable } from '@/components/feature/orders/OrderListTable';
import { OrderDetailPane } from '@/components/feature/orders/OrderDetailPane';
import { OrderBulkBar } from '@/components/feature/orders/OrderBulkBar';
import { fmtWon, periodRange } from '@/components/feature/orders/primitives';
import type { OrderStatus } from '@/types/common';
import type { Order, PeriodKey, SourceFilter } from '@/types/orders';

const PER_PAGE = 14;
const SPLIT_KEY = 'mc.orders.split';

function loadSplit(): number {
  try {
    const s = localStorage.getItem(SPLIT_KEY);
    if (!s) return 55;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 55;
  } catch {
    return 55;
  }
}

/** 연월일 yyyy-mm-dd → ISO 문자열(Asia/Seoul KST 가정 단순화). */
function toIso(d: Date): string {
  return d.toISOString();
}

export default function OrdersPage() {
  const { companyId, isLoading: companyLoading } = useCompany();

  // ───── 필터 상태 ─────
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState<{ from: string; to: string }>({
    from: '2026-03-01',
    to: '2026-04-19',
  });
  const [query, setQuery] = useState('');
  const [statusSel, setStatusSel] = useState<OrderStatus[]>([]);
  const [customerSel, setCustomerSel] = useState<string[]>([]);
  const [source, setSource] = useState<SourceFilter>('all');

  // ───── 선택 상태 ─────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  // ───── 스플릿 드래그 ─────
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState<number>(loadSplit);

  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_KEY, String(splitPct));
    } catch {
      /* noop */
    }
  }, [splitPct]);

  const startSplitDrag = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (!splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(30, Math.min(75, pct)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

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
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusSel.length && !statusSel.includes(o.status)) return false;
      if (customerSel.length && (!o.customer || !customerSel.includes(o.customer.id)))
        return false;
      if (source !== 'all' && o.source !== source) return false;
      if (q) {
        const inId = o.id.toLowerCase().includes(q);
        const inCust = o.customer?.name.toLowerCase().includes(q) ?? false;
        const inItem = o.items.some(
          (it) =>
            (it.product?.name.toLowerCase().includes(q) ?? false) ||
            (it.product?.code.toLowerCase().includes(q) ?? false),
        );
        if (!inId && !inCust && !inItem) return false;
      }
      return true;
    });
  }, [orders, statusSel, customerSel, source, query]);

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
  }, [period, custom, statusSel, customerSel, source, query]);

  useEffect(() => {
    if (!selectedId || !filtered.find((o) => o.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

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
    setSource('all');
    setQuery('');
    setPeriod('90d');
  };

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
        {/* 페이지 헤더 — 다음 태스크에서 공용 PageHeader로 추출 */}
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
            판매 › 주문내역
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
              주문내역
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
              <SummaryItem label="건수" value={`${summary.count.toLocaleString('ko-KR')}건`} />
              <SummaryItem label="총액" value={`${fmtWon(summary.gross)}원`} />
              <SummaryItem
                label="순액"
                value={`${fmtWon(summary.net)}원`}
                tone={summary.returns < 0 ? 'danger' : undefined}
              />
              <SummaryItem label="평균" value={`${fmtWon(summary.avg)}원`} muted />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Download size={13} /> 엑셀
              </button>
              <button
                type="button"
                className="btn-base primary"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Plus size={13} /> 주문 추가
              </button>
            </div>
          </div>
        </header>

        <OrderFilterBar
          period={period}
          onPeriodChange={setPeriod}
          custom={custom}
          onCustomChange={setCustom}
          query={query}
          onQueryChange={setQuery}
          statusSel={statusSel}
          onStatusChange={setStatusSel}
          customerSel={customerSel}
          onCustomerChange={setCustomerSel}
          source={source}
          onSourceChange={setSource}
          customers={customerOptions}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          count={filtered.length}
        />

        {/* 마스터-디테일 분할 */}
        <div
          ref={splitRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `${splitPct}% 6px minmax(0, 1fr)`,
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
