/**
 * 송장대장 내 주문 직접 추가 다이얼로그 (§48-v2 항목 2, v3 개선).
 *
 * 배경:
 *  - 이미 이관/출력 완료된 주문의 송장을 재발행해야 하는 경우가 있음
 *  - 주문내역 화면에서는 정상적으로 중복 이관이 차단되므로,
 *    송장대장 화면에서 직접 주문을 검색·선택해 새 shipping_invoices 행을 추가한다.
 *
 * 격리:
 *  - 여기서는 `findPendingTransferConflicts` 를 호출하지 않고
 *    `useSaveShippingInvoices` INSERT 만 사용 → 사용자의 명시적 재발행 의도 존중.
 *  - 주문내역 경로의 중복 검증 로직은 그대로 유지 (Do Not Touch).
 *
 * UX (v3):
 *  - 기본 기간 '오늘', 거래처명 검색(디바운스 300ms)
 *  - 직송 주문은 거래처명 옆에 "→ 수취인명" (shipping_info[0].name) 표시,
 *    여러 shipping_info 원소면 "→ 수취인명 외 N명"
 *  - 체크박스 다중 선택 + 헤더 전체 선택 토글
 *  - "선택한 N건 추가" 클릭 시 각 주문에 대해 buildSingleOrderShippingInvoiceRows
 *    반복 호출 → flat 병합 → 한 번의 INSERT (원자 처리)
 *  - 이관 상태 배지로 이미 이관된 주문 인지
 *  - 성공 후 다이얼로그 자동 닫힘 + shipping-invoices 캐시 자동 invalidate
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useOrders } from '@/hooks/queries/useOrders';
import { useCustomers } from '@/hooks/queries/useCustomers';
import {
  useSaveShippingInvoices,
  useTransferredOrderIds,
} from '@/hooks/useShippingInvoices';
import { useToast } from '@/components/ui/Toast';
import { Segmented, periodRange } from '@/components/feature/orders/primitives';
import {
  buildSingleOrderShippingInvoiceRows,
  type ShippingInvoiceRow,
} from '@/utils/shippingInvoiceBuilder';
import type { PeriodKey } from '@/types/orders';

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
}

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'lastmonth', label: '지난 달' },
  { id: '90d', label: '90일' },
  { id: 'custom', label: '사용자 지정' },
];

/** Date → 'YYYY-MM-DD' (KST 기준). */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO 문자열 → KST 'YYYY-MM-DD'. */
function toKstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 입력값 debounce. */
function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const searchInputStyle: React.CSSProperties = {
  padding: '6px 10px 6px 28px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'var(--font-kr)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  width: 200,
  outline: 'none',
};

const dateInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'var(--font-num)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  colorScheme: 'light dark',
};

export function AddOrderToInvoiceDialog({ open, onClose, companyId }: Props) {
  const { showToast } = useToast();
  const saveInvoicesMutation = useSaveShippingInvoices();

  const [period, setPeriod] = useState<PeriodKey>('today');
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({
    from: toDateKey(new Date()),
    to: toDateKey(new Date()),
  }));
  const [customerInput, setCustomerInput] = useState('');
  const customerQuery = useDebounced(customerInput, 300).trim().toLowerCase();
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // 다이얼로그가 닫힐 때마다 상태 초기화 (재열림 시 이전 검색어/선택 남지 않도록).
  useEffect(() => {
    if (!open) {
      setCustomerInput('');
      setSelectedIds({});
      setPeriod('today');
    }
  }, [open]);

  // 기간 범위 계산 (KST 자정 기준 ISO).
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (period === 'custom') {
      return [
        new Date(custom.from + 'T00:00:00'),
        new Date(custom.to + 'T23:59:59'),
      ];
    }
    return periodRange(period, new Date());
  }, [period, custom]);

  const { data: orders = [], isLoading } = useOrders({
    companyId,
    range: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
  });
  const { data: customersList = [] } = useCustomers(companyId);

  // 검색 필터 (거래처명 부분일치).
  const filtered = useMemo(() => {
    if (!customerQuery) return orders;
    return orders.filter((o) => {
      const name = (o.customer?.name ?? '').toLowerCase();
      return name.includes(customerQuery);
    });
  }, [orders, customerQuery]);

  // 이관 상태 배지용 조회.
  const orderIdsForBadge = useMemo(
    () => filtered.map((o) => o.id),
    [filtered],
  );
  const { data: transferredSet } = useTransferredOrderIds(
    companyId,
    orderIdsForBadge,
  );

  const selectedCount = useMemo(
    () => filtered.reduce((n, o) => n + (selectedIds[o.id] ? 1 : 0), 0),
    [filtered, selectedIds],
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedIds[o.id]);

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = { ...prev };
        filtered.forEach((o) => delete next[o.id]);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = { ...prev };
        filtered.forEach((o) => (next[o.id] = true));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const handleAdd = async () => {
    if (!companyId || selectedCount === 0) return;
    const selectedOrders = orders.filter((o) => selectedIds[o.id]);
    if (selectedOrders.length === 0) {
      showToast({ kind: 'error', text: '선택한 주문을 찾을 수 없습니다.' });
      return;
    }
    // 각 주문별로 rows 생성 후 flat 병합 (직송 shipping_info N원소는 N행으로 확장).
    const rows: ShippingInvoiceRow[] = selectedOrders.flatMap((o) =>
      buildSingleOrderShippingInvoiceRows(o, customersList),
    );
    if (rows.length === 0) {
      showToast({ kind: 'error', text: '추가할 송장 행을 생성하지 못했습니다.' });
      return;
    }
    try {
      const dbRows = await saveInvoicesMutation.mutateAsync({ companyId, rows });
      showToast({
        kind: 'success',
        text: `송장대장에 ${dbRows.length}건 추가되었습니다.`,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패';
      showToast({ kind: 'error', text: `추가 실패: ${msg}` });
    }
  };

  const busy = saveInvoicesMutation.isPending;
  const canSubmit = !busy && selectedCount > 0;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="송장대장에 주문 추가"
      width={720}
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
            style={{
              height: 32,
              fontSize: 12.5,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid var(--brand)',
              background: 'var(--brand)',
              color: '#FDFAF4',
              fontWeight: 500,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.6,
              fontFamily: 'var(--font-kr)',
            }}
            disabled={!canSubmit}
            onClick={() => void handleAdd()}
          >
            {busy ? '추가 중…' : `선택한 ${selectedCount}건 추가`}
          </button>
        </>
      }
    >
      {/* 검색/기간 도구모음 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink-3)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            value={customerInput}
            onChange={(e) => setCustomerInput(e.target.value)}
            placeholder="거래처명 검색"
            style={searchInputStyle}
          />
        </div>
        <Segmented<PeriodKey>
          options={PERIOD_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          value={period}
          onChange={setPeriod}
          compact
        />
        {period === 'custom' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              style={dateInputStyle}
            />
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>~</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              style={dateInputStyle}
            />
          </div>
        )}
      </div>

      {/* 결과 목록 */}
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          overflow: 'hidden',
          maxHeight: 380,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '32px 1fr 100px 120px 100px',
            gap: 0,
            padding: '10px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-3)',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAll}
              disabled={filtered.length === 0}
              aria-label="전체 선택"
            />
          </div>
          <div>거래처명 → 수취인명</div>
          <div>주문일</div>
          <div style={{ textAlign: 'right' }}>총액</div>
          <div style={{ textAlign: 'center' }}>이관 상태</div>
        </div>
        {isLoading ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 12.5,
            }}
          >
            불러오는 중…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 12.5,
            }}
          >
            조건에 맞는 주문이 없습니다.
          </div>
        ) : (
          filtered.map((o) => {
            const transferred = transferredSet?.has(o.id) ?? false;
            const isSelected = !!selectedIds[o.id];
            // 직송 주문이면 shipping_info[0].name 을 수취인명으로 표시.
            const shippingEntries = Array.isArray(o.shipping_info)
              ? o.shipping_info
              : [];
            const firstRecipient =
              shippingEntries[0]?.name?.trim() || null;
            const extraRecipients = Math.max(0, shippingEntries.length - 1);
            return (
              <label
                key={o.id}
                htmlFor={`add-order-${o.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 100px 120px 100px',
                  gap: 0,
                  padding: '10px 12px',
                  fontSize: 12.5,
                  color: 'var(--ink)',
                  borderBottom: '1px solid var(--line)',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--surface-2)' : 'transparent',
                }}
              >
                <div>
                  <input
                    id={`add-order-${o.id}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(o.id)}
                  />
                </div>
                <div>
                  {o.customer?.name ?? (
                    <span style={{ color: 'var(--ink-3)' }}>(미지정)</span>
                  )}
                  {o.is_direct_shipping && firstRecipient && (
                    <span style={{ color: 'var(--ink-2)' }}>
                      {' → '}
                      {firstRecipient}
                      {extraRecipients > 0 && (
                        <span style={{ color: 'var(--ink-3)' }}>
                          {' '}외 {extraRecipients}명
                        </span>
                      )}
                    </span>
                  )}
                  {o.is_direct_shipping && (
                    <span
                      style={{
                        marginLeft: 6,
                        padding: '1px 6px',
                        background: 'var(--warning-soft, #fef3c7)',
                        color: 'var(--warning-ink, #92400e)',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      직송
                    </span>
                  )}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-num)', color: 'var(--ink-2)' }}
                >
                  {toKstDateKey(o.order_date)}
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontFamily: 'var(--font-num)',
                    color: 'var(--ink-2)',
                  }}
                >
                  {o.total_amount.toLocaleString('ko-KR')}
                </div>
                <div style={{ textAlign: 'center' }}>
                  {transferred ? (
                    <span
                      style={{
                        padding: '2px 6px',
                        background: 'var(--success-soft, #dcfce7)',
                        color: 'var(--success-ink, #14532d)',
                        borderRadius: 4,
                        fontSize: 10.5,
                        fontWeight: 600,
                      }}
                    >
                      이관됨
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>
                      미이관
                    </span>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>

      <p
        style={{
          margin: '10px 0 0',
          fontSize: 11.5,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
        }}
      >
        · 재발행 목적입니다. 이미 이관된 주문이라도 다시 추가할 수 있습니다.
        <br />· 여러 건을 한 번에 선택할 수 있으며, 직송의 경우 수취인 원소 수만큼 송장 행이 생성됩니다.
      </p>
    </Modal>
  );
}
