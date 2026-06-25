/**
 * 청구서 이메일 발송 탭.
 *
 * 선택한 연/월에 대해 거래처별 청구금액을 표시하고, 체크된 거래처에 한해
 * Vercel API Route (Gmail SMTP, nodemailer) 로 청구서(PDF)
 * + (알파문구 한정) 종합청구서 엑셀을 첨부 발송.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만 획득.
 * 🔴 CLAUDE.md §5: fetchAllRows() 경유.
 * 🟠 발송은 `/api/send-billing-email` 백엔드 프록시 — 한글 MIME 인코딩 / OAuth 만료 부담 없음.
 *    로컬 `npm run dev` 에서는 동작하지 않음 (Vite). 테스트는 `npx vercel dev` 또는 배포 후.
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import {
  sendBillingEmail,
  type BillingEmailAttachment,
} from '@/utils/sendBillingEmail';
import { generateBillingPdfBase64 } from '@/utils/generateBillingPdf';
import { generateAlphaBillingExcelBase64 } from '@/utils/generateAlphaBillingExcel';
import type { Customer } from '@/hooks/queries/useCustomers';
import {
  BillingPrintView,
  type BillingDateGroup,
  type BillingItem,
} from './BillingPrintView';

// ── 상수 ──────────────────────────────────────────────────────────────

const ALPHA_KEYWORD = '알파문구';
const PDF_MIME = 'application/pdf';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── 데이터 ────────────────────────────────────────────────────────────

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
  customer_id: string;
  order_date: string;
  order_items: OrderItemRow[];
}

const ORDER_SELECT = `
  id, customer_id, order_date,
  order_items (
    id, product_id, quantity, unit_price, amount, is_return,
    products (
      code, name, sell_price,
      grade_a, grade_b, grade_c, grade_d, grade_e
    )
  )
`;

function nextMonthStartIso(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** 해당 월의 모든 confirmed orders — 거래처별 그룹핑은 컴포넌트에서. */
function useMonthlyAllOrders(params: {
  companyId: string | null;
  year: number;
  month: number;
}) {
  const { companyId, year, month } = params;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = nextMonthStartIso(year, month);

  return useQuery<OrderRow[]>({
    queryKey: ['billing-email-monthly-orders', companyId, year, month],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const rows = await fetchAllRows<OrderRow>(() =>
        supabase
          .from('orders')
          .select(ORDER_SELECT)
          .eq('company_id', companyId!)
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

// ── 유틸 ──────────────────────────────────────────────────────────────

function toKstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtKrw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** OrderRow[] → 날짜별 그룹 (BillingPrintView 형식). */
function buildDateGroups(orders: OrderRow[]): BillingDateGroup[] {
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
}

// 카톡 발송용 메시지 템플릿 — localStorage 저장. 플레이스홀더 치환식.
const KAKAO_TEMPLATE_KEY = 'kakao_message_template';

const DEFAULT_TEMPLATE = [
  '안녕하세요, 런코리아입니다.',
  '{year}년 {month}월 청구서를 보내드립니다.',
  '',
  '거래처: {customerName}',
  '청구금액: {totalAmount}원',
  '',
  '확인 부탁드립니다.',
  '감사합니다.',
].join('\n');

function loadTemplate(): string {
  return localStorage.getItem(KAKAO_TEMPLATE_KEY) ?? DEFAULT_TEMPLATE;
}

function saveTemplate(template: string): void {
  localStorage.setItem(KAKAO_TEMPLATE_KEY, template);
}

/** 플레이스홀더 치환 — {year} {month} {customerName} {totalAmount} {returnAmount} {netAmount}. */
function applyTemplate(
  template: string,
  params: {
    customerName: string;
    year: number;
    month: number;
    totalAmount: number;
    returnAmount: number;
  },
): string {
  const { customerName, year, month, totalAmount, returnAmount } = params;
  const netAmount = totalAmount - returnAmount;
  return template
    .replace(/\{year\}/g, String(year))
    .replace(/\{month\}/g, String(month))
    .replace(/\{customerName\}/g, customerName)
    .replace(/\{totalAmount\}/g, totalAmount.toLocaleString('ko-KR'))
    .replace(/\{returnAmount\}/g, returnAmount.toLocaleString('ko-KR'))
    .replace(/\{netAmount\}/g, netAmount.toLocaleString('ko-KR'));
}

/** 거래처 한 명의 청구금액(반품 제외) / 반품금액 / 주문건수 산출. */
interface CustomerTotals {
  totalAmount: number;
  returnAmount: number;
  orderCount: number;
}
function calcTotals(orders: OrderRow[]): CustomerTotals {
  let totalAmount = 0;
  let returnAmount = 0;
  for (const o of orders) {
    for (const it of o.order_items) {
      if (it.is_return) returnAmount += Math.abs(it.amount);
      else totalAmount += it.amount;
    }
  }
  return { totalAmount, returnAmount, orderCount: orders.length };
}

/**
 * BillingPrintView 를 off-screen 컨테이너에 렌더링하고 element 를 반환.
 * caller 는 반환된 cleanup() 을 반드시 호출해야 메모리 누수 없음.
 */
async function renderPrintViewOffscreen(props: {
  customer: { id: string; name: string; grade: string | null };
  year: number;
  month: number;
  groups: BillingDateGroup[];
  documentTitle: '청구서' | '거래명세서';
}): Promise<{ element: HTMLDivElement; cleanup: () => void }> {
  const container = document.createElement('div');
  // A4 폭(210mm) 고정, 화면 밖, 색깔 보존.
  container.style.cssText =
    'position:absolute;left:-99999px;top:0;width:210mm;background:#ffffff;padding:8mm;';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<BillingPrintView {...props} />);

  // 렌더 완료 + 폰트/이미지 안정화 대기.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await new Promise((r) => setTimeout(r, 200));

  return {
    element: container,
    cleanup: () => {
      root.unmount();
      container.remove();
    },
  };
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────

interface BillingEmailTabProps {
  companyId: string | null;
  customers: Customer[];
  customersLoading: boolean;
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

export function BillingEmailTab({
  companyId,
  customers,
  customersLoading,
}: BillingEmailTabProps) {
  const { showToast } = useToast();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(
    now.getMonth() + 1,
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [sendStatus, setSendStatus] = useState<Record<string, SendStatus>>({});
  const [sendError, setSendError] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  // 카톡 발송용 메시지 모달 상태
  const [kakaoModal, setKakaoModal] = useState<{
    open: boolean;
    customer: { id: string; name: string; grade: string | null } | null;
    totals: CustomerTotals | null;
    isAlpha: boolean;
  }>({ open: false, customer: null, totals: null, isAlpha: false });
  const [kakaoMessage, setKakaoMessage] = useState('');
  const [kakaoTemplate, setKakaoTemplate] = useState<string>(loadTemplate);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const { data: monthlyOrders = [], isLoading: ordersLoading } =
    useMonthlyAllOrders({ companyId, year: selectedYear, month: selectedMonth });

  // customer_id → OrderRow[]
  const ordersByCustomer = useMemo(() => {
    const m = new Map<string, OrderRow[]>();
    for (const o of monthlyOrders) {
      const arr = m.get(o.customer_id) ?? [];
      arr.push(o);
      m.set(o.customer_id, arr);
    }
    return m;
  }, [monthlyOrders]);

  // 거래처 행 데이터 — 해당 월 청구금액 0 초과인 거래처만 표시
  // (반품금액 표시를 위해 totalAmount > 0 기준; 매출 없이 반품만 있는 케이스는 제외).
  const customerRows = useMemo(() => {
    return customers
      .map((c) => {
        const orders = ordersByCustomer.get(c.id) ?? [];
        const totals = calcTotals(orders);
        return {
          customer: c,
          totals,
          isAlpha: c.name.includes(ALPHA_KEYWORD),
        };
      })
      .filter((r) => r.totals.totalAmount > 0);
  }, [customers, ordersByCustomer]);

  // 발송 가능한 거래처 (billing_email 있음 — totalAmount > 0 은 customerRows 에서 이미 보장).
  const eligibleRows = useMemo(
    () => customerRows.filter((r) => Boolean(r.customer.billing_email)),
    [customerRows],
  );

  const allEligibleChecked =
    eligibleRows.length > 0 &&
    eligibleRows.every((r) => checkedIds.has(r.customer.id));

  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = now.getFullYear() + 1; y >= 2023; y -= 1) list.push(y);
    return list;
  }, [now]);

  // ── 핸들러 ──────────────────────────────────────────────────────────

  const toggleAll = () => {
    if (allEligibleChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(eligibleRows.map((r) => r.customer.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  };

  const openKakaoModal = (row: (typeof customerRows)[number]) => {
    const message = applyTemplate(kakaoTemplate, {
      customerName: row.customer.name,
      year: selectedYear,
      month: selectedMonth,
      totalAmount: row.totals.totalAmount,
      returnAmount: row.totals.returnAmount,
    });
    setKakaoMessage(message);
    setKakaoModal({
      open: true,
      customer: {
        id: row.customer.id,
        name: row.customer.name,
        grade: row.customer.grade,
      },
      totals: row.totals,
      isAlpha: row.isAlpha,
    });
    setCopySuccess(false);
    setShowTemplateEditor(false);
  };

  const closeKakaoModal = () => {
    setKakaoModal({ open: false, customer: null, totals: null, isAlpha: false });
    setCopySuccess(false);
    setShowTemplateEditor(false);
  };

  const openTemplateEditor = () => {
    setTemplateDraft(kakaoTemplate);
    setShowTemplateEditor(true);
  };

  const saveTemplateDraft = () => {
    saveTemplate(templateDraft);
    setKakaoTemplate(templateDraft);
    setShowTemplateEditor(false);
    // 현재 열린 거래처가 있으면 즉시 메시지 반영.
    if (kakaoModal.customer && kakaoModal.totals) {
      setKakaoMessage(
        applyTemplate(templateDraft, {
          customerName: kakaoModal.customer.name,
          year: selectedYear,
          month: selectedMonth,
          totalAmount: kakaoModal.totals.totalAmount,
          returnAmount: kakaoModal.totals.returnAmount,
        }),
      );
    }
  };

  const handleKakaoCopy = async () => {
    try {
      await navigator.clipboard.writeText(kakaoMessage);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // 클립보드 API 미지원 환경 폴백.
      const ta = document.createElement('textarea');
      ta.value = kakaoMessage;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleKakaoPdfDownload = async () => {
    if (!kakaoModal.customer || !kakaoModal.totals) return;
    setPdfDownloading(true);

    const orders = ordersByCustomer.get(kakaoModal.customer.id) ?? [];
    const groups = buildDateGroups(orders);
    const documentTitle: '청구서' | '거래명세서' = kakaoModal.isAlpha
      ? '거래명세서'
      : '청구서';

    let cleanupFn: (() => void) | null = null;
    try {
      const { element, cleanup } = await renderPrintViewOffscreen({
        customer: kakaoModal.customer,
        year: selectedYear,
        month: selectedMonth,
        groups,
        documentTitle,
      });
      cleanupFn = cleanup;

      const pdfBase64 = await generateBillingPdfBase64(element);

      const binary = atob(pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: PDF_MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kakaoModal.customer.name}_${selectedYear}년${selectedMonth}월_${documentTitle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDF 생성 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      cleanupFn?.();
      setPdfDownloading(false);
    }
  };

  const handleSend = async () => {
    if (checkedIds.size === 0) {
      showToast({ kind: 'info', text: '발송할 거래처를 선택하세요.' });
      return;
    }

    setIsSending(true);
    setSendStatus({});
    setSendError({});

    const targets = customerRows.filter((r) => checkedIds.has(r.customer.id));

    for (const row of targets) {
      const { customer, totals, isAlpha } = row;
      if (!customer.billing_email) {
        setSendStatus((prev) => ({ ...prev, [customer.id]: 'error' }));
        setSendError((prev) => ({
          ...prev,
          [customer.id]: '청구서 발송 이메일 없음',
        }));
        continue;
      }

      setSendStatus((prev) => ({ ...prev, [customer.id]: 'sending' }));

      const orders = ordersByCustomer.get(customer.id) ?? [];
      const groups = buildDateGroups(orders);

      let cleanupFn: (() => void) | null = null;
      try {
        const documentTitle: '청구서' | '거래명세서' = isAlpha
          ? '거래명세서'
          : '청구서';

        // 1) PDF 캡처
        const { element, cleanup } = await renderPrintViewOffscreen({
          customer: {
            id: customer.id,
            name: customer.name,
            grade: customer.grade,
          },
          year: selectedYear,
          month: selectedMonth,
          groups,
          documentTitle,
        });
        cleanupFn = cleanup;
        const pdfBase64 = await generateBillingPdfBase64(element);

        // 2) 첨부 구성
        const attachments: BillingEmailAttachment[] = [
          {
            filename: `${customer.name}_${selectedYear}년${selectedMonth}월_${documentTitle}.pdf`,
            mimeType: PDF_MIME,
            base64Data: pdfBase64,
          },
        ];

        // 3) 알파문구면 엑셀도 첨부
        if (isAlpha) {
          const excelBase64 = generateAlphaBillingExcelBase64({
            year: selectedYear,
            month: selectedMonth,
            branches: [
              {
                branchName: customer.name,
                count: totals.orderCount,
                totalAmount: totals.totalAmount,
                returnAmount: totals.returnAmount,
                settlementAmount: totals.totalAmount - totals.returnAmount,
              },
            ],
          });
          attachments.push({
            filename: `알파문구_종합청구서_${selectedYear}년${selectedMonth}월.xlsx`,
            mimeType: XLSX_MIME,
            base64Data: excelBase64,
          });
        }

        // 4) 백엔드 (Vercel API Route → Gmail SMTP) 로 발송
        const subject = `[런코리아] ${selectedYear}년 ${selectedMonth}월 ${documentTitle}`;
        const body = [
          `${customer.name} 귀중`,
          ``,
          `${selectedYear}년 ${selectedMonth}월 ${documentTitle}를 첨부드립니다.`,
          `금액 확인 부탁드립니다.`,
          ``,
          `런코리아 드림`,
          `운영문의: runkorea30@gmail.com`,
        ].join('\n');

        await sendBillingEmail({
          toEmail: customer.billing_email,
          subject,
          body,
          attachments,
        });

        setSendStatus((prev) => ({ ...prev, [customer.id]: 'success' }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        setSendStatus((prev) => ({ ...prev, [customer.id]: 'error' }));
        setSendError((prev) => ({ ...prev, [customer.id]: msg }));
      } finally {
        cleanupFn?.();
      }

      // 연속 발송 딜레이 (Gmail rate limit 회피).
      await new Promise((r) => setTimeout(r, 500));
    }

    setIsSending(false);
    showToast({ kind: 'success', text: '발송 완료' });
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────

  const eligibleCheckedCount = customerRows.filter(
    (r) => checkedIds.has(r.customer.id) && Boolean(r.customer.billing_email),
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 상단 컨트롤 바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          style={selectStyle}
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
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}월
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={handleSend}
          className="btn-base primary"
          disabled={isSending || eligibleCheckedCount === 0}
        >
          {isSending ? (
            <Loader2 className="ico-sm animate-spin" />
          ) : (
            <Send className="ico-sm" />
          )}
          <span>{eligibleCheckedCount}건 발송</span>
        </button>
      </div>

      {/* 거래처 목록 */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {customersLoading || ordersLoading ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            불러오는 중…
          </div>
        ) : customerRows.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            해당 월에 청구할 거래처가 없습니다.
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <th style={thStyle('center', 44)}>
                  <input
                    type="checkbox"
                    checked={allEligibleChecked}
                    onChange={toggleAll}
                    disabled={eligibleRows.length === 0 || isSending}
                  />
                </th>
                <th style={thStyle('left')}>거래처명</th>
                <th style={thStyle('left', 240)}>청구서 이메일</th>
                <th style={thStyle('right', 140)}>청구금액</th>
                <th style={thStyle('right', 120)}>반품금액</th>
                <th style={thStyle('center', 120)}>상태</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.map((row) => {
                const { customer, totals, isAlpha } = row;
                const hasBillingEmail = Boolean(customer.billing_email);
                const hasAmount = totals.totalAmount > 0;
                const eligible = hasBillingEmail && hasAmount;
                const status = sendStatus[customer.id] ?? 'idle';
                const err = sendError[customer.id];
                const checked = checkedIds.has(customer.id);

                return (
                  <tr
                    key={customer.id}
                    style={{
                      borderBottom: '1px solid var(--line)',
                      opacity: eligible ? 1 : 0.55,
                    }}
                  >
                    <td style={tdStyle('center')}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(customer.id)}
                        disabled={!eligible || isSending}
                      />
                    </td>
                    <td style={tdStyle('left')}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{customer.name}</span>
                        {isAlpha && (
                          <span
                            title="알파문구: PDF + 종합청구서 엑셀 2개 첨부"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              padding: '1px 6px',
                              background: 'var(--info-wash)',
                              color: 'var(--info)',
                              border: '1px solid var(--info)',
                              borderRadius: 4,
                              fontSize: 10.5,
                              fontWeight: 600,
                            }}
                          >
                            <Paperclip size={9} strokeWidth={2} />
                            PDF+XLSX
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openKakaoModal(row)}
                          title="카톡 발송용 메시지 복사"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '2px 8px',
                            borderRadius: 5,
                            border: '1px solid var(--line-strong)',
                            background: 'var(--surface-2)',
                            color: 'var(--ink-2)',
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: 'pointer',
                            letterSpacing: '-0.01em',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <MessageCircle size={11} strokeWidth={2} />
                          카톡
                        </button>
                      </div>
                    </td>
                    <td
                      style={{
                        ...tdStyle('left'),
                        color: hasBillingEmail
                          ? 'var(--ink)'
                          : 'var(--ink-3)',
                        fontFamily: hasBillingEmail
                          ? 'var(--font-en), var(--font-kr)'
                          : 'var(--font-kr)',
                      }}
                    >
                      {customer.billing_email ?? '(미설정)'}
                    </td>
                    <td
                      style={{
                        ...tdStyle('right'),
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: hasAmount ? 600 : 400,
                      }}
                    >
                      {fmtKrw(totals.totalAmount)}
                    </td>
                    <td
                      style={{
                        ...tdStyle('right'),
                        fontVariantNumeric: 'tabular-nums',
                        color:
                          totals.returnAmount > 0
                            ? 'var(--danger)'
                            : 'var(--ink-3)',
                      }}
                    >
                      {totals.returnAmount > 0
                        ? `-${fmtKrw(totals.returnAmount)}`
                        : '—'}
                    </td>
                    <td style={tdStyle('center')}>
                      <StatusBadge status={status} error={err} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 안내 */}
      <div
        style={{
          padding: 12,
          background: 'var(--info-wash)',
          border: '1px solid var(--info)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--ink-2)',
          lineHeight: 1.6,
        }}
      >
        ✓ 발송 계정: <strong>runkorea30@gmail.com</strong> (Gmail SMTP)<br />
        ✓ 수신처: 거래처별 <strong>청구서 발송 이메일</strong> (설정 → 거래처 편집에서 입력)<br />
        ✓ 일반 거래처: 청구서 PDF 1개 첨부<br />
        ✓ 알파문구 계열: 거래명세서 PDF + 종합청구서 엑셀 2개 첨부
      </div>

      {/* 카톡 발송용 메시지 모달 */}
      {kakaoModal.open && kakaoModal.customer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={closeKakaoModal}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              width: 480,
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  <MessageCircle size={16} />
                  카톡 발송용 메시지
                </span>
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: 13,
                    color: 'var(--ink-2)',
                  }}
                >
                  {kakaoModal.customer.name} · {selectedYear}년 {selectedMonth}월
                </span>
              </div>
              <button
                type="button"
                onClick={closeKakaoModal}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink-3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {!showTemplateEditor && (
              <>
                <textarea
                  value={kakaoMessage}
                  onChange={(e) => setKakaoMessage(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid var(--line-strong)',
                    background: 'var(--surface-2)',
                    color: 'var(--ink)',
                    fontSize: 13,
                    fontFamily: 'var(--font-kr)',
                    lineHeight: 1.7,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />

                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    margin: '6px 0 16px',
                  }}
                >
                  ✏️ 이 메시지는 임시 수정만 가능합니다. 문구를 영구 저장하려면{' '}
                  <button
                    type="button"
                    onClick={openTemplateEditor}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--info)',
                      fontSize: 11,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    템플릿 수정
                  </button>
                  을 클릭하세요.
                </p>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleKakaoCopy}
                    className="btn-base primary"
                    style={{ flex: 1 }}
                  >
                    {copySuccess ? '✅ 복사됨!' : '📋 메시지 복사'}
                  </button>
                  <button
                    type="button"
                    onClick={handleKakaoPdfDownload}
                    className="btn-base"
                    disabled={pdfDownloading}
                    style={{ flex: 1 }}
                  >
                    {pdfDownloading ? '생성 중…' : '📄 PDF 다운로드'}
                  </button>
                </div>
              </>
            )}

            {showTemplateEditor && (
              <>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    marginBottom: 6,
                  }}
                >
                  📝 플레이스홀더: {'{year}'} {'{month}'} {'{customerName}'}{' '}
                  {'{totalAmount}'} {'{returnAmount}'} {'{netAmount}'}
                </p>
                <textarea
                  value={templateDraft}
                  onChange={(e) => setTemplateDraft(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid var(--info)',
                    background: 'var(--surface-2)',
                    color: 'var(--ink)',
                    fontSize: 13,
                    fontFamily: 'var(--font-kr)',
                    lineHeight: 1.7,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={saveTemplateDraft}
                    className="btn-base primary"
                    style={{ flex: 1 }}
                  >
                    💾 템플릿 저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTemplateEditor(false)}
                    className="btn-base"
                    style={{ flex: 1 }}
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 보조 ──────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  error,
}: {
  status: SendStatus;
  error?: string;
}) {
  if (status === 'idle') {
    return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  }
  if (status === 'sending') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--ink-2)',
          fontSize: 12,
        }}
      >
        <Loader2 size={12} className="animate-spin" />
        발송 중
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--success)',
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        <CheckCircle2 size={12} />
        성공
      </span>
    );
  }
  return (
    <span
      title={error ?? ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: 'var(--danger)',
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      <XCircle size={12} />
      실패
    </span>
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

function thStyle(
  align: 'left' | 'center' | 'right',
  width?: number,
): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--ink-2)',
    width,
  };
}

function tdStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    color: 'var(--ink)',
  };
}
