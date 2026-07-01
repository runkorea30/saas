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
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, Download, FileText, Flag, Plus, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { useOrders } from '@/hooks/queries/useOrders';
import { getSameDayCustomerOrderIds } from '@/utils/orderGrouping';
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
import type { Order, OrderWithGroupInfo, PeriodKey } from '@/types/orders';

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

/**
 * ISO 문자열(UTC) → KST 기준 yyyy-mm-dd. 주문 묶음 키 용도.
 *
 * 🔴 .slice(0, 10) 만 쓰면 KST 자정~09시 등록 건이 UTC 기준 전날로 매핑되어
 *    "어제 주문서에 추가" 증상이 발생한다. UTC ms 에 +9h 후 getUTC* 컴포넌트
 *    조합으로 브라우저 타임존과 무관하게 KST 날짜 추출.
 */
function kstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function OrdersPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const incomingOrderId = (location.state as { selectedOrderId?: string } | null)
    ?.selectedOrderId;

  // ───── 필터 상태 ─────
  const [period, setPeriod] = useState<PeriodKey>('today');
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

  // ───── 그룹핑 (같은 날짜+거래처) ─────
  // 같은 날짜·같은 거래처 주문이 2건 이상이면 묶음으로 표시.
  // 묶음 내부: created_at 오름차순 → 첫 번째가 본주문(isAdditional=false), 나머지가 추가주문.
  // 묶음 자체의 정렬: 묶음에서 가장 늦은(=최신) 주문의 order_date+created_at 기준 내림차순
  //   → 서버의 (order_date DESC, created_at DESC) 정렬과 자연스럽게 일관됨.
  const groupedOrders: OrderWithGroupInfo[] = useMemo(() => {
    const groupMap = new Map<string, Order[]>();
    for (const o of filtered) {
      const dateKey = kstDateKey(o.order_date);
      const customerKey = o.customer?.id ?? `__no_customer_${o.id}`;
      const key = `${dateKey}__${customerKey}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(o);
    }
    const groups = Array.from(groupMap.values());
    for (const g of groups) {
      g.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    groups.sort((a, b) => {
      // 묶음의 마지막(가장 늦은) 주문 기준 — order_date DESC, then created_at DESC.
      const aLast = a[a.length - 1];
      const bLast = b[b.length - 1];
      if (aLast.order_date !== bLast.order_date) {
        return aLast.order_date < bLast.order_date ? 1 : -1;
      }
      return aLast.created_at < bLast.created_at ? 1 : -1;
    });
    const flat: OrderWithGroupInfo[] = [];
    for (const g of groups) {
      g.forEach((o, idx) =>
        flat.push({ ...o, isAdditional: idx > 0, groupSize: g.length }),
      );
    }
    return flat;
  }, [filtered]);

  // ───── 페이지네이션 ─────
  const totalPages = Math.max(1, Math.ceil(groupedOrders.length / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const pageRows = groupedOrders.slice(
    (curPage - 1) * PER_PAGE,
    curPage * PER_PAGE,
  );

  useEffect(() => {
    setPage(1);
  }, [period, custom, statusSel, customerSel]);

  useEffect(() => {
    if (!selectedId || !groupedOrders.find((o) => o.id === selectedId)) {
      setSelectedId(groupedOrders[0]?.id ?? null);
    }
  }, [groupedOrders, selectedId]);

  // OrderEntryPage 저장 후 라우터 state 로 전달된 신규 주문을 우선 선택.
  useEffect(() => {
    if (incomingOrderId && orders.find((o) => o.id === incomingOrderId)) {
      setSelectedId(incomingOrderId);
    }
  }, [incomingOrderId, orders]);

  const selectedOrder: OrderWithGroupInfo | null =
    groupedOrders.find((o) => o.id === selectedId) ?? null;

  // ───── 체크박스 일괄 ─────
  // 같은 거래처 + 같은 날짜(시간 무관) 묶음 처리는 utils/orderGrouping 의 공용
  // 유틸 사용. 체크박스 경로와 우클릭 경로가 동일 함수를 호출해 정의가 한 곳에만 존재.
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
    const ids = getSameDayCustomerOrderIds(groupedOrders, id);
    setChecked((c) => {
      const willCheck = !c[id];
      const next = { ...c };
      if (willCheck) ids.forEach((i) => (next[i] = true));
      else ids.forEach((i) => delete next[i]);
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

  const handlePrintInvoice = async (overrideIds?: string[]) => {
    // 체크된 주문만 추출 — filtered 전체에서 가져와야 페이지네이션을 넘어선 선택도 포함.
    //   거래처 → created_at 오름차순으로 미리 정렬해두면 아래 push 가 그대로 본주문→추가주문 순서가 됨.
    //   overrideIds 가 있으면(우클릭 메뉴 진입) 그 id 만, 없으면 체크박스 기반.
    const idSet = overrideIds ? new Set(overrideIds) : null;
    const selected = filtered
      .filter((o) => (idSet ? idSet.has(o.id) : checked[o.id]))
      .slice()
      .sort((a, b) => {
        const ac = a.customer?.id ?? '';
        const bc = b.customer?.id ?? '';
        if (ac !== bc) return ac.localeCompare(bc);
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
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
            grade: o.customer.grade,
          },
          orders: [],
        };
        map.set(key, group);
      }
      group.orders.push({
        id: o.id,
        order_date: o.order_date,
        memo: o.memo,
        is_direct_shipping: o.is_direct_shipping ?? null,
        shipping_info: (o.shipping_info ?? null) as InvoiceCustomerGroup['orders'][number]['shipping_info'],
        items: o.items.map((it) => ({
          id: it.id,
          product: {
            code: it.product?.code ?? '',
            name: it.product?.name ?? '',
            category: it.product?.category ?? null,
            sell_price: it.product?.sell_price,
            grade_a: it.product?.grade_a ?? null,
            grade_b: it.product?.grade_b ?? null,
            grade_c: it.product?.grade_c ?? null,
            grade_d: it.product?.grade_d ?? null,
            grade_e: it.product?.grade_e ?? null,
          },
          quantity: it.quantity,
          original_quantity: it.original_quantity ?? null,
          unit_price: it.unit_price,
          amount: it.amount,
          is_return: it.is_return,
        })),
      });
    }
    // selected 가 이미 customer_id+created_at 으로 정렬되어 있어 각 그룹의 orders 는 본주문→추가주문 순.
    // 거래처도 이름순 정렬.
    const groups = Array.from(map.values());
    groups.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'ko'));

    // 🔴 신규 4단계 상태 체계: 거래명세서 출력 = 처리중(processing) 진입.
    //    조건부 전환 — received/confirmed 인 주문만 processing 으로.
    //    shipped 이후는 그대로 유지 (배송 완료 상태를 되돌리지 않음).
    //    레거시 draft/done/canceled 는 건드리지 않음.
    const processingIds = selected
      .filter((o) => o.status === 'received' || o.status === 'confirmed')
      .map((o) => o.id);
    if (companyId && processingIds.length > 0) {
      const processingAtIso = new Date().toISOString();
      await supabase
        .from('orders')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'processing', processing_at: processingAtIso } as any)
        .in('id', processingIds)
        .eq('company_id', companyId);
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    }

    setPrintGroups(groups);
    // 다음 페인트 사이클에 인쇄 → afterprint 시점에 state 초기화.
    setTimeout(() => {
      window.print();
      setPrintGroups(null);
    }, 300);
  };

  // ───── 우클릭 컨텍스트 메뉴 ─────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    orderId: string;
  } | null>(null);

  /**
   * 우클릭 메뉴에서 거래명세서 출력 — 같은 거래처+같은 날짜 묶음 전체를 포함해
   * handlePrintInvoice 에 전달. (체크박스 경로와 동일한 그룹 규칙.)
   */
  const handlePrintSingleInvoice = (orderId: string) => {
    setContextMenu(null);
    const ids = getSameDayCustomerOrderIds(groupedOrders, orderId);
    void handlePrintInvoice(ids);
  };

  /** 우클릭 메뉴에서 상태 직접 변경. */
  const handleChangeStatus = async (orderId: string, status: string) => {
    setContextMenu(null);
    if (!companyId) return;
    await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('company_id', companyId);
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
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
              onClick={() => void handlePrintInvoice()}
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
            onSelect={(id: string) => {
              const target = pageRows.find((o) => o.id === id);
              const isImagePending =
                !!target?.attachment_url && (target?.items?.length ?? 0) === 0;
              if (isImagePending && target?.customer?.id) {
                navigate(
                  `/sales/order-entry?customerId=${target.customer.id}` +
                    `&attachmentUrl=${encodeURIComponent(target.attachment_url!)}` +
                    `&sourceOrderId=${target.id}`,
                );
                return;
              }
              setSelectedId(id);
              // 🔴 신규 4단계 상태 체계: received → confirmed 자동 전환.
              //    이미 confirmed 이상(processing/shipped)인 경우는 그대로 유지.
              if (target?.status === 'received' && companyId) {
                const confirmedAtIso = new Date().toISOString();
                void supabase
                  .from('orders')
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .update({ status: 'confirmed', confirmed_at: confirmedAtIso } as any)
                  .eq('id', id)
                  .eq('company_id', companyId)
                  .then(({ error }) => {
                    if (error) {
                      // eslint-disable-next-line no-console
                      console.error('[order.autoConfirm] 실패', error);
                      return;
                    }
                    void queryClient.invalidateQueries({ queryKey: ['orders'] });
                  });
              }
            }}
            onContextMenu={(e, orderId) =>
              setContextMenu({ x: e.clientX, y: e.clientY, orderId })
            }
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

          <OrderDetailPane
            order={selectedOrder}
            isAdditional={selectedOrder?.isAdditional ?? false}
          />
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

      {contextMenu && (
        <OrderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onChangeStatus={(status) =>
            handleChangeStatus(contextMenu.orderId, status)
          }
          onPrintInvoice={() => handlePrintSingleInvoice(contextMenu.orderId)}
        />
      )}
    </div>
  );
}

function OrderContextMenu({
  x,
  y,
  onClose,
  onChangeStatus,
  onPrintInvoice,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onChangeStatus: (status: string) => void;
  onPrintInvoice: () => void;
}) {
  useEffect(() => {
    const handleClick = () => onClose();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const menuWidth = 180;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: y,
        left: adjustedX,
        width: menuWidth,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 1000,
        padding: 4,
        fontSize: 12.5,
      }}
    >
      <button
        type="button"
        onClick={onPrintInvoice}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '7px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: 4,
          color: 'var(--ink)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        거래명세서 출력
      </button>
      <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
      <div style={{ padding: '4px 10px 2px', fontSize: 10.5, color: 'var(--ink-3)' }}>
        상태 변경
      </div>
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChangeStatus(opt.id)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '7px 10px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: 4,
            color: 'var(--ink)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {opt.label}
        </button>
      ))}
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
