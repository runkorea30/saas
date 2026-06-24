/**
 * 청구서 페이지 — 판매 > 청구서.
 *
 * 거래처 + 연/월 선택 후 해당 월 거래내역을 날짜별로 그룹핑한 청구서(혹은 거래명세서)를 미리보고
 * 인쇄/PDF 출력한다. 이메일 발송은 UI만(추후 구현).
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만 획득.
 * 🔴 CLAUDE.md §2: 공급가는 calcSupplyPriceByCustomerGrade (단일 진입점) — BillingPrintView 내부에서 호출.
 * 🔴 CLAUDE.md §5: 서버 조회는 fetchAllRows() 경유. 날짜는 .gte(start).lt(nextMonthStart) 형식.
 * 🟠 알파문구 계열 거래처 → 문서 제목 '거래명세서', 그 외 → '청구서'.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Printer } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useCustomers } from '@/hooks/queries/useCustomers';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import {
  BillingPrintView,
  type BillingDateGroup,
  type BillingItem,
} from '@/components/feature/billing/BillingPrintView';

// ── 데이터 ─────────────────────────────────────────────────────────────

interface OrderItemRow {
  id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  products: {
    code: string;
    name: string;
    sell_price: number | null;
    grade_a: number | null;
    grade_b: number | null;
    grade_c: number | null;
    grade_d: number | null;
    grade_e: number | null;
  } | null;
}

interface OrderRow {
  id: string;
  order_date: string;
  memo: string | null;
  order_items: OrderItemRow[];
}

const ORDER_SELECT = `
  id, order_date, memo,
  order_items (
    id, product_id, quantity, unit_price, amount, is_return,
    products (
      code, name, sell_price,
      grade_a, grade_b, grade_c, grade_d, grade_e
    )
  )
`;

/** 다음달 1일 ISO 시작 — month: 1~12. */
function nextMonthStartIso(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function useBillingOrders(params: {
  companyId: string | null;
  customerId: string | null;
  year: number;
  month: number;
}) {
  const { companyId, customerId, year, month } = params;
  const paddedMonth = String(month).padStart(2, '0');
  const startDate = `${year}-${paddedMonth}-01`;
  const endDate = nextMonthStartIso(year, month);

  return useQuery<OrderRow[]>({
    queryKey: ['billing-orders', companyId, customerId, year, month],
    enabled: Boolean(companyId && customerId),
    queryFn: async () => {
      const rows = await fetchAllRows<OrderRow>(() =>
        supabase
          .from('orders')
          .select(ORDER_SELECT)
          .eq('company_id', companyId!)
          .eq('customer_id', customerId!)
          .eq('status', 'confirmed')
          .is('deleted_at', null)
          .gte('order_date', startDate)
          .lt('order_date', endDate)
          .order('order_date', { ascending: true }),
      );
      return rows;
    },
    staleTime: 30_000,
  });
}

// ── 유틸 ─────────────────────────────────────────────────────────────────

/** order_date(timestamptz) → KST 'YYYY-MM-DD'. */
function toKstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const ALPHA_KEYWORD = '알파문구';

// ── 페이지 ───────────────────────────────────────────────────────────────

export function BillingPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // 거래처 목록
  const { data: customers = [], isLoading: customersLoading } = useCustomers(companyId);

  // 주문 데이터
  const { data: orders = [], isLoading: ordersLoading } = useBillingOrders({
    companyId,
    customerId: selectedCustomerId,
    year: selectedYear,
    month: selectedMonth,
  });

  // 날짜별 그룹핑
  const dateGroups = useMemo<BillingDateGroup[]>(() => {
    const map = new Map<string, BillingItem[]>();
    for (const o of orders) {
      const key = toKstDateKey(o.order_date);
      const bucket = map.get(key) ?? [];
      for (const it of o.order_items) {
        if (!it.products) continue;
        bucket.push({
          id: it.id,
          product: {
            code: it.products.code,
            name: it.products.name,
            sell_price: it.products.sell_price,
            grade_a: it.products.grade_a,
            grade_b: it.products.grade_b,
            grade_c: it.products.grade_c,
            grade_d: it.products.grade_d,
            grade_e: it.products.grade_e,
          },
          quantity: it.quantity,
          unit_price: it.unit_price,
          amount: it.amount,
          is_return: it.is_return,
        });
      }
      map.set(key, bucket);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, items]) => ({ date, items }));
  }, [orders]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;
  const isAlpha = selectedCustomer?.name?.includes(ALPHA_KEYWORD) ?? false;
  const documentTitle: '청구서' | '거래명세서' = isAlpha ? '거래명세서' : '청구서';

  const hasData = selectedCustomer && dateGroups.length > 0;

  // 연도 옵션: 2023 ~ 올해+1
  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = now.getFullYear() + 1; y >= 2023; y -= 1) list.push(y);
    return list;
  }, [now]);

  const handlePrint = () => {
    if (!hasData) return;
    setIsPrinting(true);
    // 다음 페인트 사이클에 인쇄 → 직후 portal 정리.
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 300);
  };

  const handleEmail = () => {
    showToast({ kind: 'info', text: '이메일 발송 기능은 준비 중입니다.' });
  };

  // ── 렌더 ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      {/* 상단 필터 바 */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
          청구서
        </div>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          style={selectStyle}
          disabled={companyLoading}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>

        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          style={selectStyle}
          disabled={companyLoading}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}월
            </option>
          ))}
        </select>

        <select
          value={selectedCustomerId ?? ''}
          onChange={(e) => setSelectedCustomerId(e.target.value || null)}
          style={{ ...selectStyle, minWidth: 220 }}
          disabled={customersLoading || companyLoading}
        >
          <option value="">거래처 선택…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={handleEmail}
          className="btn-base"
          disabled={!hasData}
          title="이메일 발송"
        >
          <Mail className="ico-sm" />
          <span>이메일 발송</span>
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="btn-base primary"
          disabled={!hasData}
          title="인쇄 / PDF 저장"
        >
          <Printer className="ico-sm" />
          <span>인쇄 / PDF</span>
        </button>
      </div>

      {/* 청구서 미리보기 영역 */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          minHeight: 400,
        }}
      >
        {!selectedCustomerId ? (
          <EmptyState text="거래처와 기간을 선택하세요." />
        ) : ordersLoading ? (
          <EmptyState text="불러오는 중…" />
        ) : !selectedCustomer ? (
          <EmptyState text="거래처 정보를 찾을 수 없습니다." />
        ) : dateGroups.length === 0 ? (
          <EmptyState
            text={`${selectedYear}년 ${String(selectedMonth).padStart(2, '0')}월에 해당하는 확정 주문이 없습니다.`}
          />
        ) : (
          <BillingPrintView
            customer={{
              id: selectedCustomer.id,
              name: selectedCustomer.name,
              grade: selectedCustomer.grade,
            }}
            year={selectedYear}
            month={selectedMonth}
            groups={dateGroups}
            documentTitle={documentTitle}
          />
        )}
      </div>

      {/* 인쇄용 포털 — @media print 에서만 표시. */}
      {isPrinting &&
        hasData &&
        selectedCustomer &&
        createPortal(
          <div className="invoice-print-portal">
            <BillingPrintView
              customer={{
                id: selectedCustomer.id,
                name: selectedCustomer.name,
                grade: selectedCustomer.grade,
              }}
              year={selectedYear}
              month={selectedMonth}
              groups={dateGroups}
              documentTitle={documentTitle}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── 보조 컴포넌트 / 스타일 ───────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 360,
        color: 'var(--ink-3)',
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--line-strong)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 13,
  fontFamily: 'var(--font-kr)',
  cursor: 'pointer',
};
