/**
 * 거래처 주문서 업로드 메인 페이지.
 *
 * OPS Shell 과 무관한 독립 페이지. 로그인 세션이 없으면 CustomerOrderLogin 렌더.
 * 로그인 후에는 메인(파일/메시지/직송) 또는 직접 입력 모드 노출.
 */
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileUp,
  Loader2,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { useCustomerAuth, type CustomerSession } from '@/hooks/useCustomerAuth';
import { CustomerOrderLogin } from './CustomerOrderLogin';
import { CustomerOrderInput } from './CustomerOrderInput';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';
import type { Json } from '@/types/database';

// ───────────────────────────────────────────────────────────
// 거래처 주문서 엑셀 파싱
// ───────────────────────────────────────────────────────────

interface ParsedExcelItem {
  /** 시트별 진단용 */
  sheet: string;
  /** 제품 코드 (products.code 매칭 키) */
  code: string;
  /** 제품명 (참고 표시) */
  name: string;
  qty: number;
  sell_price: number;
  supply_price: number;
  /** 엑셀의 합계 셀 값 또는 qty × (supply||sell) */
  amount: number;
}

/**
 * 거래처 주문서 양식(.xlsx/.xls/.csv) 을 파싱.
 *
 * 양식 가정:
 *  - 시트는 여러 개일 수 있음 (엔젤러스 / 레이스랩 ...) → 모두 순회
 *  - 1~4 행: 헤더(컬럼명 포함) → 무시
 *  - 5 행(index 4) 이후: 데이터 + 카테고리 소제목 혼재
 *    · 코드(B열, idx=1) 비어 있거나 수량(C열, idx=2) <=0 → skip
 *  - 컬럼 인덱스 (0 base): 0=제품명, 1=코드, 2=수량, 3=판매가, 4=공급가, 5=합계
 */
async function parseOrderExcel(file: File): Promise<ParsedExcelItem[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const items: ParsedExcelItem[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(ws, {
      header: 1,
      defval: null,
    });
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const codeRaw = row[1];
      const qtyRaw = row[2];
      const code =
        codeRaw == null
          ? ''
          : String(codeRaw)
              .trim()
              .replace(/\.0+$/, ''); // 엑셀이 숫자 코드를 '1234.0' 으로 변환하는 케이스 보정
      const qty = Number(qtyRaw);
      if (!code || !Number.isFinite(qty) || qty <= 0) continue;

      const name = row[0] != null ? String(row[0]).trim() : '';
      const sellPrice = Number(row[3]) || 0;
      const supplyPrice = Number(row[4]) || 0;
      const explicitAmount = Number(row[5]);
      const amount = Number.isFinite(explicitAmount) && explicitAmount > 0
        ? explicitAmount
        : qty * (supplyPrice || sellPrice);
      items.push({
        sheet: sheetName,
        code,
        name,
        qty,
        sell_price: sellPrice,
        supply_price: supplyPrice,
        amount,
      });
    }
  }
  return items;
}

const PARSABLE_EXTENSIONS = new Set(['xlsx', 'xls', 'csv']);
function isParsableExcel(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return PARSABLE_EXTENSIONS.has(ext);
}

const ACCEPT_EXT = '.xlsx,.xls,.csv,.jpg,.jpeg,.png,.pdf';

/**
 * 직송 정보 테이블의 사용자 입력 7컬럼.
 * - 표시 컬럼 9개 중 마지막 2개(거래처/신용) 는 자동값(고정) 이므로 state 미포함.
 *   · 거래처 → 로그인 거래처명 (customer.customerName)
 *   · 신용 → 항상 '신용'
 */
interface ShippingRow {
  name: string;      // 받는사람
  zipcode: string;   // 우편번호
  address: string;   // 주소
  phone1: string;    // 연락처1
  phone2: string;    // 연락처2
  blank: string;     // 빈칸 (헤더 무라벨, 사용자 자유 입력)
  product: string;   // 제품
}

/** 엑셀 붙여넣기 매핑용 컬럼 키 순서. 거래처/신용 은 자동값이라 제외. */
const SHIPPING_COLS: ReadonlyArray<keyof ShippingRow> = [
  'name',
  'zipcode',
  'address',
  'phone1',
  'phone2',
  'blank',
  'product',
];

const emptyShipping = (): ShippingRow => ({
  name: '',
  zipcode: '',
  address: '',
  phone1: '',
  phone2: '',
  blank: '',
  product: '',
});

const CREDIT_LABEL = '신용';

// ───────────────────────────────────────────────────────────
// 주문 내역 데이터 모델
// ───────────────────────────────────────────────────────────

interface OrderProduct {
  code: string;
  name: string;
  sell_price: number;
  grade_a: number | null;
  grade_b: number | null;
  grade_c: number | null;
  grade_d: number | null;
  grade_e: number | null;
}

interface OrderItemDetail {
  id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_return: boolean;
  product: OrderProduct | null;
}

interface OrderDetail {
  id: string;
  order_date: string;
  total_amount: number;
  memo: string | null;
  status: string;
  items: OrderItemDetail[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 거래처 주문 + 품목 + 제품 정보 단일 select.
 *
 * 🟡 orders 에는 shipping_info 컬럼이 없고, order_items 에는 supply_price 컬럼이 없다.
 *    → 직송/추가주문 구분은 memo 텍스트 기반, 공급가는 products.supply_price 폴백.
 */
async function fetchOrdersWithItems(
  companyId: string,
  customerId: string,
  start: Date,
  end: Date,
): Promise<OrderDetail[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, order_date, total_amount, memo, status,
       items:order_items (
         id, quantity, unit_price, amount, is_return,
         product:products ( code, name, sell_price, grade_a, grade_b, grade_c, grade_d, grade_e )
       )`,
    )
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .gte('order_date', start.toISOString())
    .lt('order_date', end.toISOString())
    .is('deleted_at', null)
    .order('order_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrderDetail[];
}

// 주문 분류 — memo 텍스트 기반 dogfooding 컨벤션
function isExtraOrder(memo: string | null): boolean {
  return !!memo && memo.includes('추가');
}

function isDirectShipping(memo: string | null): boolean {
  return !!memo && memo.includes('직송');
}

/**
 * 주문 소계 = Σ(items.amount).
 * 🟠 items.amount 는 주문 시점에 저장된 quantity × unit_price 값 → 단일 진실 원본.
 *    products.supply_price 기반 계산(이전 calcOrderTotal) 은 supply_price=0 인 제품에서
 *    소계가 0으로 표시되는 문제가 있어 폐기.
 */
function calcOrderTotal(order: OrderDetail): number {
  return order.items.reduce((s, it) => s + (it.amount ?? 0), 0);
}

function fmtWon(v: number): string {
  return `₩${v.toLocaleString('ko-KR')}`;
}

/**
 * 한국 표준시(KST = UTC+9) 기준 오늘의 [start, endExclusive) 범위.
 * 브라우저 timezone 과 무관하게 동일 결과 — Vercel 환경(UTC) 에서도 KST 기준 오늘을 가져온다.
 */
function kstTodayRange(): { start: Date; endExclusive: Date } {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);
  const start = new Date(`${todayStr}T00:00:00+09:00`);
  const endExclusive = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, endExclusive };
}

/** KST 기준 [year, month) 월의 [start, endExclusive) 범위. month 는 1~12. */
function kstMonthRange(
  year: number,
  month: number,
): { start: Date; endExclusive: Date } {
  const start = new Date(`${year}-${pad2(month)}-01T00:00:00+09:00`);
  const y2 = month === 12 ? year + 1 : year;
  const m2 = month === 12 ? 1 : month + 1;
  const endExclusive = new Date(`${y2}-${pad2(m2)}-01T00:00:00+09:00`);
  return { start, endExclusive };
}

export function CustomerOrderPage() {
  const { customer, isLoading, logout } = useCustomerAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5F5F4',
        }}
      >
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!customer) {
    return <CustomerOrderLogin />;
  }

  return <CustomerOrderShell customer={customer} onLogout={logout} />;
}

// ───────────────────────────────────────────────────────────

function CustomerOrderShell({
  customer,
  onLogout,
}: {
  customer: CustomerSession;
  onLogout: () => void;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'main' | 'input'>('main');
  const [fontScale, setFontScale] = useState(1);

  if (mode === 'input') {
    return (
      <CustomerOrderInput
        customer={customer}
        onBack={() => setMode('main')}
        fontScale={fontScale}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F4' }}>
      <Header
        customer={customer}
        fontScale={fontScale}
        onFontScaleChange={setFontScale}
        onLogout={() => {
          onLogout();
          showToast({ kind: 'info', text: '로그아웃되었습니다.' });
        }}
      />
      <main
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* 상단: 좌측 입력 폼 + 우측 공지사항 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            gap: 16,
          }}
        >
          <LeftPanel
            customer={customer}
            fontScale={fontScale}
            onOpenInput={() => setMode('input')}
          />
          <NoticePanel fontScale={fontScale} />
        </div>
        {/* 하단: 오늘 (좌) + 월별 (우) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          <TodayOrders customer={customer} fontScale={fontScale} />
          <MonthlyOrders customer={customer} fontScale={fontScale} />
        </div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function Header({
  customer,
  fontScale,
  onFontScaleChange,
  onLogout,
}: {
  customer: CustomerSession;
  fontScale: number;
  onFontScaleChange: (v: number) => void;
  onLogout: () => void;
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E7E5E4',
        padding: '12px 20px',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#EFF6FF',
            color: '#1D4ED8',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {customer.customerName}
        </span>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            background: '#F5F5F4',
            padding: 3,
            borderRadius: 6,
          }}
          aria-label="글자크기 조절"
        >
          {[
            { scale: 0.875, size: 11, title: '작게' },
            { scale: 1, size: 13, title: '보통' },
            { scale: 1.125, size: 15, title: '크게' },
          ].map(({ scale, size, title }) => {
            const active = fontScale === scale;
            return (
              <button
                key={scale}
                type="button"
                onClick={() => onFontScaleChange(scale)}
                title={title}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  border: 'none',
                  background: active ? '#FFFFFF' : 'transparent',
                  color: active ? '#1C1917' : '#78716C',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: size,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                가
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onLogout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            padding: '0 12px',
            background: '#FFFFFF',
            border: '1px solid #D6D3D1',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            color: '#44403C',
          }}
        >
          <LogOut size={13} /> 로그아웃
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function LeftPanel({
  customer,
  fontScale,
  onOpenInput,
}: {
  customer: CustomerSession;
  fontScale: number;
  onOpenInput: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [shipping, setShipping] = useState<ShippingRow[]>([emptyShipping()]);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);

  const handleFile = (f: File | null) => {
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const updateShipping = (
    index: number,
    field: keyof ShippingRow,
    value: string,
  ) => {
    setShipping((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addShippingRow = () =>
    setShipping((prev) => [...prev, emptyShipping()]);

  const removeShippingRow = (idx: number) =>
    setShipping((prev) =>
      prev.length === 1 ? [emptyShipping()] : prev.filter((_, i) => i !== idx),
    );

  /**
   * 직송 셀에 엑셀 다중 셀(또는 행) 붙여넣기를 자동 분배.
   * - 단일 셀(텍스트에 탭/줄바꿈 없음) 이면 기본 paste 허용 → preventDefault 하지 않음.
   * - 다중 셀이면 \n 으로 행, \t 으로 컬럼 분리해 (rowIndex+ri, colIndex+ci) 위치에 채움.
   * - 부족한 행은 emptyShipping 으로 자동 확장.
   * - 거래처/신용 컬럼(SHIPPING_COLS 길이 초과 인덱스) 은 자동값이라 덮어쓰지 않음.
   */
  const handleShippingPaste =
    (rowIndex: number, colIndex: number) =>
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text');
      if (!text) return;
      if (!text.includes('\t') && !text.includes('\n')) return; // 단일 셀: 기본 동작 유지
      e.preventDefault();
      const matrix = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n+$/, '')
        .split('\n')
        .map((line) => line.split('\t'));

      setShipping((prev) => {
        const next = [...prev];
        matrix.forEach((cols, ri) => {
          const ti = rowIndex + ri;
          while (next.length <= ti) next.push(emptyShipping());
          const target = { ...next[ti] };
          cols.forEach((val, ci) => {
            const keyIdx = colIndex + ci;
            if (keyIdx < SHIPPING_COLS.length) {
              target[SHIPPING_COLS[keyIdx]] = val.trim();
            }
          });
          next[ti] = target;
        });
        return next;
      });
    };

  const handleSubmitFile = async () => {
    if (!file) {
      showToast({ kind: 'error', text: '파일을 선택하세요.' });
      return;
    }
    setSending(true);
    try {
      // 1) 파일 파싱 (엑셀/CSV 만). 이미지/PDF 는 customer_order_uploads 만 기록.
      const parsable = isParsableExcel(file.name);
      let parsed: ParsedExcelItem[] = [];
      if (parsable) {
        parsed = await parseOrderExcel(file);
        // eslint-disable-next-line no-console
        console.log('[customer-file.parsed]', {
          fileName: file.name,
          sheets: parsed.length,
          first: parsed[0],
          count: parsed.length,
        });
        if (parsed.length === 0) {
          showToast({
            kind: 'error',
            text: '주문 품목이 없습니다. 파일을 확인해주세요.',
          });
          return;
        }
      }

      // 2) products 코드 매핑 — sell_price 와 grade_a~e 까지 가져온다.
      //    (엑셀의 supply_price 가 0 인 행에서 등급 기반 폴백 계산 시 사용)
      interface ProductLookup {
        id: string;
        code: string;
        sell_price: number;
        grade_a: number | null;
        grade_b: number | null;
        grade_c: number | null;
        grade_d: number | null;
        grade_e: number | null;
      }
      const codeToProduct = new Map<string, ProductLookup>();
      let unmatchedCount = 0;
      if (parsed.length > 0) {
        const codes = Array.from(new Set(parsed.map((p) => p.code)));
        const { data: productRows, error: prodErr } = await supabase
          .from('products')
          .select(
            'id, code, sell_price, grade_a, grade_b, grade_c, grade_d, grade_e',
          )
          .eq('company_id', customer.companyId)
          .in('code', codes);
        if (prodErr) throw prodErr;
        for (const p of (productRows ?? []) as ProductLookup[]) {
          codeToProduct.set(p.code, p);
        }
        unmatchedCount = parsed.filter(
          (it) => !codeToProduct.has(it.code),
        ).length;
        // eslint-disable-next-line no-console
        console.log('[customer-file.codeMap]', {
          requested: codes.length,
          matched: codeToProduct.size,
          unmatched: unmatchedCount,
        });
      }

      // 3) orders + order_items INSERT — 공급가 기준
      //    엑셀에 supply_price 가 있으면 그대로 사용, 0/누락이면 등급 기반 계산으로 폴백.
      interface MatchedItem extends ParsedExcelItem {
        product_id: string;
        unit_price_resolved: number;
      }
      const matched: MatchedItem[] = parsed
        .filter((it) => codeToProduct.has(it.code))
        .map((it) => {
          const product = codeToProduct.get(it.code)!;
          const unitPrice =
            it.supply_price > 0
              ? it.supply_price
              : calcSupplyPriceByCustomerGrade(
                  product.sell_price,
                  customer.grade,
                  product,
                );
          return {
            ...it,
            product_id: product.id,
            unit_price_resolved: unitPrice,
          };
        });
      let createdOrderId: string | null = null;
      if (matched.length > 0) {
        const totalAmount = matched.reduce(
          (s, it) => s + it.qty * it.unit_price_resolved,
          0,
        );
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert({
            company_id: customer.companyId,
            customer_id: customer.customerId,
            order_date: new Date().toISOString(),
            status: 'draft',
            source: 'portal',
            memo: `파일업로드: ${file.name}`,
            total_amount: totalAmount,
          })
          .select('id')
          .single();
        // eslint-disable-next-line no-console
        console.log('[customer-file.order]', { order, orderErr, totalAmount });
        if (orderErr || !order) throw orderErr ?? new Error('주문 생성 실패');
        createdOrderId = order.id;

        const orderItemsPayload = matched.map((it) => ({
          order_id: order.id,
          company_id: customer.companyId,
          product_id: it.product_id,
          quantity: it.qty,
          unit_price: it.unit_price_resolved,
          amount: it.qty * it.unit_price_resolved,
          is_return: false,
        }));
        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItemsPayload);
        // eslint-disable-next-line no-console
        console.log('[customer-file.items]', {
          itemsErr,
          count: orderItemsPayload.length,
        });
        if (itemsErr) throw itemsErr;
      }

      // 4) customer_order_uploads — 모든 경우(엑셀/이미지/PDF) 기록
      const filledShipping = shipping
        .filter((s) => s.name || s.address || s.phone1 || s.product)
        .map((s) => ({
          ...s,
          customer: customer.customerName,
          credit: CREDIT_LABEL,
        }));
      const { error: uploadErr } = await supabase
        .from('customer_order_uploads')
        .insert({
          company_id: customer.companyId,
          customer_id: customer.customerId,
          upload_type: 'file',
          file_name: file.name,
          file_url: null,
          message: message || null,
          shipping_info:
            filledShipping.length > 0
              ? (filledShipping as unknown as Json)
              : null,
          items: parsed.length > 0 ? (parsed as unknown as Json) : null,
          status: 'pending',
        });
      // eslint-disable-next-line no-console
      console.log('[customer-file.uploads]', { uploadErr });
      if (uploadErr) throw uploadErr;

      // 5) 토스트 — 케이스별 메시지
      if (createdOrderId) {
        const skipMsg =
          unmatchedCount > 0 ? ` (코드 미매칭 ${unmatchedCount}건 제외)` : '';
        showToast({
          kind: 'success',
          text: `주문서 ${matched.length}품목 전송 완료${skipMsg}`,
        });
      } else {
        showToast({
          kind: 'success',
          text: '주문서가 전송되었습니다. 담당자가 확인 후 처리합니다.',
        });
      }

      setFile(null);
      setMessage('');
      setShipping([emptyShipping()]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[customer-file.submit] 실패', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '전송 중 오류가 발생했습니다.',
      });
    } finally {
      setSending(false);
    }
  };

  const baseFont = 13 * fontScale;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 파일 업로드 */}
      <Card title="파일로 주문서 보내기" icon={<FileUp size={16} />}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            cursor: 'pointer',
            border: `2px dashed ${dragOver ? '#2563EB' : '#D6D3D1'}`,
            background: dragOver ? '#EFF6FF' : '#FAFAF9',
            borderRadius: 8,
            padding: 24,
            textAlign: 'center',
            fontSize: baseFont,
            color: '#44403C',
          }}
        >
          {file ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <FileUp size={16} />
              <span>{file.name}</span>
              <button
                type="button"
                onClick={() => handleFile(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#78716C',
                  padding: 4,
                }}
                title="파일 제거"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 4 }}>
                파일을 끌어다 놓거나 클릭해서 업로드
              </div>
              <div style={{ fontSize: baseFont - 2, color: '#78716C' }}>
                지원 형식: xlsx, xls, csv, jpg, png, pdf
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_EXT}
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSubmitFile}
            disabled={!file || sending}
            style={{
              ...primaryBtn,
              opacity: !file || sending ? 0.55 : 1,
              cursor: !file || sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending && (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            )}
            전송하기
          </button>
        </div>
      </Card>

      {/* 메시지 */}
      <Card title="전달 메시지" icon={<MessageSquare size={16} />}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="전달할 메시지를 입력하세요"
          rows={3}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: 10,
            fontSize: baseFont,
            border: '1px solid #D6D3D1',
            borderRadius: 6,
            outline: 'none',
            fontFamily: 'inherit',
            background: '#FFFFFF',
          }}
        />
      </Card>

      {/* 직송 정보 */}
      <Card title="직송 정보" icon={<Truck size={16} />}>
        <div
          style={{
            padding: '10px 12px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            borderRadius: 6,
            fontSize: baseFont - 1,
            marginBottom: 10,
            fontWeight: 500,
          }}
        >
          ⚠ 절대주의: 직송은 직송정보부터 입력하세요. 일반주문시와 구분해주세요
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: baseFont - 1,
            }}
          >
            <thead>
              <tr style={{ background: '#FAFAF9' }}>
                <ShipTh>받는사람</ShipTh>
                <ShipTh>우편번호</ShipTh>
                <ShipTh>주소</ShipTh>
                <ShipTh>연락처1</ShipTh>
                <ShipTh>연락처2</ShipTh>
                <ShipTh />
                <ShipTh>제품</ShipTh>
                <ShipTh>거래처</ShipTh>
                <ShipTh>신용</ShipTh>
                <ShipTh width={36} />
              </tr>
            </thead>
            <tbody>
              {shipping.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F5F5F4' }}>
                  <ShipTd>
                    <CellInput
                      value={row.name}
                      onChange={(v) => updateShipping(i, 'name', v)}
                      onPaste={handleShippingPaste(i, 0)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <CellInput
                      value={row.zipcode}
                      onChange={(v) => updateShipping(i, 'zipcode', v)}
                      onPaste={handleShippingPaste(i, 1)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <CellInput
                      value={row.address}
                      onChange={(v) => updateShipping(i, 'address', v)}
                      onPaste={handleShippingPaste(i, 2)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <CellInput
                      value={row.phone1}
                      onChange={(v) => updateShipping(i, 'phone1', v)}
                      onPaste={handleShippingPaste(i, 3)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <CellInput
                      value={row.phone2}
                      onChange={(v) => updateShipping(i, 'phone2', v)}
                      onPaste={handleShippingPaste(i, 4)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <CellInput
                      value={row.blank}
                      onChange={(v) => updateShipping(i, 'blank', v)}
                      onPaste={handleShippingPaste(i, 5)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <CellInput
                      value={row.product}
                      onChange={(v) => updateShipping(i, 'product', v)}
                      onPaste={handleShippingPaste(i, 6)}
                    />
                  </ShipTd>
                  <ShipTd>
                    <ReadOnlyCell value={customer.customerName} />
                  </ShipTd>
                  <ShipTd>
                    <ReadOnlyCell value={CREDIT_LABEL} />
                  </ShipTd>
                  <ShipTd width={36}>
                    <button
                      type="button"
                      onClick={() => removeShippingRow(i)}
                      title="행 삭제"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#78716C',
                        padding: 4,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </ShipTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={addShippingRow}
            style={{
              ...secondaryBtn,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: baseFont - 1,
            }}
          >
            <Plus size={13} /> 행 추가
          </button>
        </div>
      </Card>

      {/* 직접 입력 진입 */}
      <button
        type="button"
        onClick={onOpenInput}
        style={{
          ...primaryBtn,
          width: '100%',
          height: 48,
          fontSize: 14,
          justifyContent: 'center',
        }}
      >
        <Pencil size={14} /> 주문서 직접 입력
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function NoticePanel({ fontScale }: { fontScale: number }) {
  const baseFont = 12 * fontScale;
  return (
    <Card title="공지사항">
      <div style={{ fontSize: baseFont, color: '#44403C', lineHeight: 1.55 }}>
        평일 오후 4시 이후 접수된 주문은 다음 영업일에 출고됩니다.<br />
        긴급 건은 담당자에게 연락 바랍니다.
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────

function TodayOrders({
  customer,
  fontScale,
}: {
  customer: CustomerSession;
  fontScale: number;
}) {
  const todayQuery = useQuery<OrderDetail[]>({
    queryKey: ['customer-orders-today-v3', customer.customerId],
    queryFn: async () => {
      const { start, endExclusive } = kstTodayRange();
      return fetchOrdersWithItems(
        customer.companyId,
        customer.customerId,
        start,
        endExclusive,
      );
    },
    staleTime: 15_000,
  });

  const orders = todayQuery.data ?? [];
  const totalSum = orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const baseFont = 12 * fontScale;

  return (
    <section
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: '#1C1917',
          }}
        >
          오늘 주문 내역
        </h3>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1F2937',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          총 {fmtWon(totalSum)}
        </span>
      </div>

      {todayQuery.isLoading ? (
        <div style={{ fontSize: baseFont, color: '#6B7280', textAlign: 'center', padding: '24px 0' }}>
          불러오는 중…
        </div>
      ) : orders.length === 0 ? (
        <div style={{ fontSize: baseFont, color: '#9CA3AF', textAlign: 'center', padding: '32px 0' }}>
          오늘 주문내역이 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              baseFont={baseFont}
              showTime
              customer={customer}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────

function MonthlyOrders({
  customer,
  fontScale,
}: {
  customer: CustomerSession;
  fontScale: number;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const { showToast } = useToast();

  const monthlyQuery = useQuery<OrderDetail[]>({
    queryKey: ['customer-orders-monthly-v3', customer.customerId, year, month],
    queryFn: async () => {
      const { start, endExclusive } = kstMonthRange(year, month);
      return fetchOrdersWithItems(
        customer.companyId,
        customer.customerId,
        start,
        endExclusive,
      );
    },
    staleTime: 30_000,
  });

  const orders = monthlyQuery.data ?? [];
  const monthSum = orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const baseFont = 12 * fontScale;

  /** 날짜별로 묶고 정렬 (날짜 내림차순). */
  const dateGroups = (() => {
    const map = new Map<string, OrderDetail[]>();
    for (const o of orders) {
      const key = formatDateKey(o.order_date);
      const cur = map.get(key) ?? [];
      cur.push(o);
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  return (
    <section
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: '#1C1917',
          }}
        >
          주문 내역 총 {fmtWon(monthSum)}
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={smallSelect}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={smallSelect}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </div>
      </div>

      {monthlyQuery.isLoading ? (
        <div style={{ fontSize: baseFont, color: '#6B7280', textAlign: 'center', padding: '24px 0' }}>
          불러오는 중…
        </div>
      ) : dateGroups.length === 0 ? (
        <div style={{ fontSize: baseFont, color: '#9CA3AF', textAlign: 'center', padding: '32px 0' }}>
          등록된 주문이 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dateGroups.map(([date, group]) => (
            <MonthlyDateCard
              key={date}
              date={date}
              orders={group}
              expanded={expandedDate === date}
              onToggle={() =>
                setExpandedDate(expandedDate === date ? null : date)
              }
              onStatement={() =>
                showToast({ kind: 'info', text: '명세서 기능 준비 중입니다.' })
              }
              baseFont={baseFont}
              customer={customer}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────

function MonthlyDateCard({
  date,
  orders,
  expanded,
  onToggle,
  onStatement,
  baseFont,
  customer,
}: {
  date: string;
  orders: OrderDetail[];
  expanded: boolean;
  onToggle: () => void;
  onStatement: () => void;
  baseFont: number;
  customer: CustomerSession;
}) {
  const totalAmount = orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const itemCount = orders.reduce((s, o) => s + o.items.length, 0);
  const hasExtra = orders.some((o) => isExtraOrder(o.memo));
  const hasDirect = orders.some((o) => isDirectShipping(o.memo));

  const regular: OrderDetail[] = [];
  const extra: OrderDetail[] = [];
  for (const o of orders) {
    if (isExtraOrder(o.memo)) extra.push(o);
    else regular.push(o);
  }

  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#FFFFFF',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: expanded ? '#F9FAFB' : '#FFFFFF',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: baseFont + 1,
        }}
      >
        <span style={{ fontWeight: 600, color: '#1C1917' }}>{date}</span>
        {hasExtra && <Badge kind="extra" />}
        {hasDirect && <Badge kind="direct" />}
        <span style={{ flex: 1 }} />
        <span style={{ color: '#6B7280' }}>{orders.length}건</span>
        <span
          style={{
            fontWeight: 600,
            color: '#1F2937',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtWon(totalAmount)}
        </span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onStatement();
          }}
          style={{
            ...secondaryBtn,
            height: 26,
            padding: '0 10px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          명세서
        </span>
      </button>
      {expanded && (
        <div
          style={{
            padding: 12,
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: '#FAFAF9',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: '#6B7280',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            품목 합 {itemCount}건
          </div>
          {regular.length > 0 && (
            <OrderGroupSection
              title="주문"
              orders={regular}
              baseFont={baseFont}
              customer={customer}
            />
          )}
          {extra.length > 0 && (
            <OrderGroupSection
              title="추가주문"
              orders={extra}
              baseFont={baseFont}
              customer={customer}
            />
          )}
        </div>
      )}
    </div>
  );
}

function OrderGroupSection({
  title,
  orders,
  baseFont,
  customer,
}: {
  title: '주문' | '추가주문';
  orders: OrderDetail[];
  baseFont: number;
  customer: CustomerSession;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#374151',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            baseFont={baseFont}
            showTime
            customer={customer}
          />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function OrderCard({
  order,
  baseFont,
  showTime,
  customer,
}: {
  order: OrderDetail;
  baseFont: number;
  showTime?: boolean;
  customer: CustomerSession;
}) {
  const subtotal = calcOrderTotal(order);
  const extra = isExtraOrder(order.memo);
  const direct = isDirectShipping(order.memo);

  return (
    <div
      style={{
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        background: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          background: '#FAFAF9',
          borderBottom: '1px solid #F3F4F6',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          fontSize: baseFont,
        }}
      >
        <Badge kind={extra ? 'extra' : 'regular'} />
        {direct && <Badge kind="direct" />}
        {showTime && (
          <span style={{ color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
            {formatHM(order.order_date)}
          </span>
        )}
        <span style={{ color: '#6B7280' }}>{order.items.length}건</span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontWeight: 600,
            color: '#1F2937',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          소계 {fmtWon(subtotal)}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: baseFont,
          }}
        >
          <thead>
            <tr style={{ background: '#FFFFFF' }}>
              <ItemTh align="left">코드</ItemTh>
              <ItemTh align="left">제품명</ItemTh>
              <ItemTh align="right">수량</ItemTh>
              <ItemTh align="right">공급가</ItemTh>
              <ItemTh align="right">합계</ItemTh>
            </tr>
          </thead>
          <tbody>
            {order.items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 12,
                    textAlign: 'center',
                    color: '#9CA3AF',
                    fontSize: baseFont - 1,
                  }}
                >
                  품목이 없습니다
                </td>
              </tr>
            ) : (
              order.items.map((it) => {
                // 공급가 = grade 기반 계산 (products.supply_price 는 0 이라 사용 불가)
                // 합계 = order_items.amount (주문 시점 저장값)
                const supplyPrice = it.product
                  ? calcSupplyPriceByCustomerGrade(
                      it.product.sell_price,
                      customer.grade,
                      it.product,
                    )
                  : 0;
                const lineSum = it.amount ?? 0;
                return (
                  <tr
                    key={it.id}
                    style={{ borderTop: '1px solid #F3F4F6' }}
                  >
                    <ItemTd align="left">
                      <span style={{ fontFamily: 'var(--font-num)' }}>
                        {it.product?.code ?? '—'}
                      </span>
                    </ItemTd>
                    <ItemTd align="left">{it.product?.name ?? '(삭제됨)'}</ItemTd>
                    <ItemTd align="right">
                      {it.quantity.toLocaleString('ko-KR')}
                    </ItemTd>
                    <ItemTd align="right">
                      {supplyPrice > 0
                        ? supplyPrice.toLocaleString('ko-KR')
                        : '—'}
                    </ItemTd>
                    <ItemTd align="right">
                      {lineSum > 0 ? fmtWon(lineSum) : '—'}
                    </ItemTd>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ kind }: { kind: 'regular' | 'extra' | 'direct' }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    regular: { bg: '#DCFCE7', fg: '#15803D', label: '주문' },
    extra: { bg: '#FEF3C7', fg: '#A16207', label: '추가주문' },
    direct: { bg: '#DBEAFE', fg: '#1D4ED8', label: '직송' },
  };
  const s = styles[kind];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
}

function ItemTh({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <th
      style={{
        padding: '6px 10px',
        fontSize: 11,
        fontWeight: 600,
        color: '#6B7280',
        textAlign: align,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function ItemTd({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <td
      style={{
        padding: '6px 10px',
        color: '#1F2937',
        textAlign: align,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </td>
  );
}

// ───────────────────────────────────────────────────────────

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: '#FFFFFF',
        border: '1px solid #E7E5E4',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 12,
          fontSize: 14,
          fontWeight: 600,
          color: '#1C1917',
        }}
      >
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function ShipTh({
  children,
  width,
}: {
  children?: React.ReactNode;
  width?: number;
}) {
  return (
    <th
      style={{
        padding: '8px 6px',
        fontSize: 11,
        fontWeight: 600,
        color: '#44403C',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        width,
      }}
    >
      {children}
    </th>
  );
}

function ShipTd({
  children,
  width,
}: {
  children?: React.ReactNode;
  width?: number;
}) {
  return (
    <td style={{ padding: '4px 4px', width, verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}

function CellInput({
  value,
  onChange,
  onPaste,
}: {
  value: string;
  onChange: (v: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      style={{
        width: '100%',
        height: 28,
        padding: '0 6px',
        fontSize: 12,
        border: '1px solid #E7E5E4',
        borderRadius: 4,
        outline: 'none',
        background: '#FFFFFF',
      }}
    />
  );
}

/** 직송 테이블의 자동값 셀 (거래처 / 신용). 편집 불가, 회색 배경. */
function ReadOnlyCell({ value }: { value: string }) {
  return (
    <div
      title={value}
      style={{
        width: '100%',
        height: 28,
        padding: '0 6px',
        fontSize: 12,
        border: '1px solid #E7E5E4',
        borderRadius: 4,
        background: '#F5F5F4',
        color: '#57534E',
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 36,
  padding: '0 16px',
  background: '#2563EB',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  background: '#FFFFFF',
  color: '#1C1917',
  border: '1px solid #D6D3D1',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};

const smallSelect: React.CSSProperties = {
  flex: 1,
  height: 30,
  padding: '0 8px',
  border: '1px solid #D6D3D1',
  borderRadius: 6,
  fontSize: 12,
  background: '#FFFFFF',
};

