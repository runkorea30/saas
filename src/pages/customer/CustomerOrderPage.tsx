/**
 * 거래처 주문서 업로드 메인 페이지.
 *
 * OPS Shell 과 무관한 독립 페이지. 로그인 세션이 없으면 CustomerOrderLogin 렌더.
 * 로그인 후에는 메인(파일/메시지/직송) 또는 직접 입력 모드 노출.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, LogOut, Trash2, X } from 'lucide-react';
import { useOrderPhotosByOrders, type OrderPhoto } from '@/hooks/queries/useOrderPhotos';
// xlsx-js-style 은 SheetJS xlsx 의 fork — 동일 API + 셀 스타일(s) 지원.
// parseOrderExcel(read) 과 handleDownloadOrderForm(write+style) 모두 한 import 로 처리.
import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { useCustomerAuth, type CustomerSession } from '@/hooks/useCustomerAuth';
import { CustomerOrderLogin } from './CustomerOrderLogin';
import { CustomerOrderInput } from './CustomerOrderInput';
import {
  DELIVERY_FEE_PRODUCT_ID,
  DELIVERY_FEE_AMOUNT,
  calcDeliveryFee,
  removeDeliveryFeeFromOrder,
} from '@/utils/deliveryFee';
import { FileUploadSection } from '@/components/feature/customer-order/FileUploadSection';
import { MessageSection } from '@/components/feature/customer-order/MessageSection';
import { DirectOrderEntryCard } from '@/components/feature/customer-order/DirectOrderEntryCard';
import { DirectShippingSection } from '@/components/feature/customer-order/DirectShippingSection';
import { SubmitSuccessDialog } from '@/components/feature/customer-order/SubmitSuccessDialog';
import {
  calcCurrentStockByProduct,
  calcSupplyPriceByCustomerGrade,
} from '@/utils/calculations';
import { syncOrderTotal } from '@/utils/orderTotal';
// calcCurrentStockByProduct 는 stockByProduct 맵 반환 — OPS 의 useInventoryStock 과 동일 소스.
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
 * 주문 소계 = orders.total_amount (단일 진실 원본).
 * 🔴 DB 정합화 완료 후: orders.total_amount = SUM(order_items.amount) 가 보장됨.
 *    이전에는 unit_price 재계산으로 합산했으나 레거시 데이터의 판매가/공급가 혼재로 부풀려지는 버그가 있었음.
 */
function calcOrderTotal(order: OrderDetail): number {
  return order.total_amount;
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
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f7f5] text-[#312b27]">
      <Header
        customer={customer}
        fontScale={fontScale}
        onFontScaleChange={setFontScale}
        onLogout={() => {
          onLogout();
          showToast({ kind: 'info', text: '로그아웃되었습니다.' });
        }}
      />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-[18px] p-[18px]">
        {/* ── 좌측 67%: 입력 폼 그리드 + 오늘/월별 ── */}
        <div className="flex min-w-0 flex-[0_0_67%] flex-col gap-3">
          <LeftPanel
            customer={customer}
            onOpenInput={() => setMode('input')}
          />
          {/* 오늘 (좌) + 월별 (우) */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
            <TodayOrders customer={customer} fontScale={fontScale} />
            <MonthlyOrders customer={customer} fontScale={fontScale} />
          </div>
        </div>

        {/* ── 우측 33%: 공지사항 + 수입예정 ── */}
        <aside className="flex min-w-0 flex-1 flex-col gap-3">
          <NoticePanel companyId={customer.companyId} fontScale={fontScale} />
          <ImportNoticeCard
            companyId={customer.companyId}
            fontScale={fontScale}
          />
        </aside>
      </div>
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
            fontSize: 15,
            fontWeight: 700,
            color: '#1C1917',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          엔젤러스 파트너 주문시스템
        </span>
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
  onOpenInput,
}: {
  customer: CustomerSession;
  onOpenInput: () => void;
}) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [shipping, setShipping] = useState<ShippingRow[]>([emptyShipping()]);
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // 전송 완료 다이얼로그 — hasChanges=true 면 호박색 안내 문구 추가.
  const [submitResult, setSubmitResult] = useState<{
    show: boolean;
    hasChanges: boolean;
  } | null>(null);

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

  /**
   * 현재 거래처 grade 가 반영된 주문서 양식 xlsx 다운로드.
   * - products 활성행 전체를 (category, name) 오름차순 SELECT.
   * - 행1: 수량합계 / 주문금액 SUM 수식. 행2: 은행계좌. 행3: 빈줄. 행4: 컬럼헤더. 행5+: 데이터.
   * - 카테고리 변경 시 회색 배경 6칸 헤더 행 → 제품 행(노란 입력셀 + F열 합계수식) 반복.
   * - 4행까지 freeze panes 로 헤더 스크롤 고정.
   * - 공급가 = calcSupplyPriceByCustomerGrade(sell_price, grade, gradeRates).
   */
  const handleDownloadOrderForm = async () => {
    setDownloading(true);
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select(
          'id, code, name, category, unit, sell_price, grade_a, grade_b, grade_c, grade_d, grade_e',
        )
        .eq('company_id', customer.companyId)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      if (!products || products.length === 0) {
        showToast({ kind: 'error', text: '활성 제품이 없습니다.' });
        return;
      }

      // ───── 스타일 상수 ─────
      const thinBorder = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      } as const;

      const categoryStyle = {
        fill: { patternType: 'solid', fgColor: { rgb: 'FFBFBFBF' } },
        font: { sz: 14 },
        alignment: { vertical: 'center' },
        border: thinBorder,
      };
      const headerStyle = {
        font: { bold: true, sz: 11 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder,
      };
      const headerYellowStyle = {
        ...headerStyle,
        fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF00' } },
      };
      const productNameStyle = {
        font: { sz: 9 },
        alignment: { vertical: 'center' },
        border: thinBorder,
      };
      const codeStyle = {
        font: { sz: 10, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder,
      };
      const yellowInputStyle = {
        fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF00' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: thinBorder,
        numFmt: '#,##0',
      };
      const formulaStyle = {
        alignment: { horizontal: 'right', vertical: 'center' },
        border: thinBorder,
        numFmt: '#,##0',
      };

      // ───── 셀 객체 헬퍼 ─────
      type CellObj = {
        v?: string | number;
        f?: string;
        t: 's' | 'n';
        s?: Record<string, unknown>;
      };
      const blank = (s?: Record<string, unknown>): CellObj => ({
        v: '',
        t: 's',
        ...(s ? { s } : {}),
      });
      const txt = (v: string, s?: Record<string, unknown>): CellObj => ({
        v,
        t: 's',
        ...(s ? { s } : {}),
      });
      const num = (v: number, s?: Record<string, unknown>): CellObj => ({
        v,
        t: 'n',
        ...(s ? { s } : {}),
      });
      const formula = (f: string, s?: Record<string, unknown>): CellObj => ({
        f,
        t: 'n',
        ...(s ? { s } : {}),
      });

      // ───── 시트 데이터 구성 ─────
      const wsData: CellObj[][] = [];

      // 행1: 수량합계 / 주문금액 요약 (수식 자동 계산)
      const labelBold = {
        font: { bold: true, sz: 11 },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
      const sumQty = {
        font: { bold: true, sz: 12 },
        alignment: { horizontal: 'right', vertical: 'center' },
        numFmt: '#,##0',
      };
      const sumAmount = {
        font: { bold: true, sz: 12, color: { rgb: 'FFFF0000' } },
        alignment: { horizontal: 'right', vertical: 'center' },
        numFmt: '#,##0',
      };
      wsData.push([
        blank(),
        txt('수량합계', labelBold),
        formula('SUM(C5:C9999)', sumQty),
        blank(),
        txt('주문금액', labelBold),
        formula('SUM(F5:F9999)', sumAmount),
      ]);

      // 행2: 은행계좌 안내 (병합 없이 A2 에만 출력)
      wsData.push([
        txt('국민은행 024801-04-301418 예금주 양시혁', {
          font: { bold: true, sz: 11 },
          alignment: { vertical: 'center' },
        }),
        blank(),
        blank(),
        blank(),
        blank(),
        blank(),
      ]);

      // 행3: 빈 줄 (헤더 영역 패딩)
      wsData.push([blank(), blank(), blank(), blank(), blank(), blank()]);

      // 행4: 컬럼 헤더 — 수량/판매가/공급가는 노랑 강조
      wsData.push([
        txt('제품명', headerStyle),
        txt('코드', headerStyle),
        txt('수량', headerYellowStyle),
        txt('판매가', headerYellowStyle),
        txt('공급가', headerYellowStyle),
        txt('합계', headerStyle),
      ]);

      // 행5+: 카테고리 헤더 + 제품 행
      let currentCategory = '';
      let rowNum = 5; // 1-based Excel row number for next data row

      for (const p of products) {
        const category = p.category || '기타';
        if (category !== currentCategory) {
          currentCategory = category;
          // 카테고리 행 — 6칸 모두 회색 배경
          wsData.push([
            txt(category, categoryStyle),
            blank(categoryStyle),
            blank(categoryStyle),
            blank(categoryStyle),
            blank(categoryStyle),
            blank(categoryStyle),
          ]);
          rowNum++;
        }
        const supplyPrice = calcSupplyPriceByCustomerGrade(
          p.sell_price,
          customer.grade,
          {
            grade_a: p.grade_a ?? null,
            grade_b: p.grade_b ?? null,
            grade_c: p.grade_c ?? null,
            grade_d: p.grade_d ?? null,
            grade_e: p.grade_e ?? null,
          },
        );
        wsData.push([
          txt(p.name, productNameStyle),
          txt(p.code, codeStyle),
          // 수량은 빈 칸으로 거래처가 입력 — 입력 후 F열 수식 = C×E 자동 계산
          blank(yellowInputStyle),
          num(p.sell_price ?? 0, yellowInputStyle),
          num(supplyPrice, yellowInputStyle),
          // 🟠 수량 빈칸일 때 #VALUE! 방지: IF 로 빈칸 처리. SUM(F5:F9999) 는 빈 문자열 무시.
          formula(`IF(C${rowNum}="","",C${rowNum}*E${rowNum})`, formulaStyle),
        ]);
        rowNum++;
      }

      // ───── 워크시트 + 워크북 ─────
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // 컬럼 너비 (원본 샘플 기준)
      ws['!cols'] = [
        { wch: 34.25 }, // A 제품명
        { wch: 18.625 }, // B 코드
        { wch: 9.0 }, // C 수량
        { wch: 10.75 }, // D 판매가
        { wch: 15.625 }, // E 공급가
        { wch: 13.25 }, // F 합계
      ];

      // 4행까지 freeze panes (행5부터 스크롤)
      ws['!sheetViews'] = [
        { state: 'frozen', xSplit: 0, ySplit: 4, topLeftCell: 'A5' },
      ] as never;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '주문서');

      const today = new Date();
      const dateStr = `${today.getFullYear()}년_${String(today.getMonth() + 1).padStart(2, '0')}월${String(today.getDate()).padStart(2, '0')}일`;
      XLSX.writeFile(wb, `런코리아_주문서_${dateStr}.xlsx`);
      showToast({ kind: 'success', text: '주문서를 다운로드했습니다.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '주문서 생성 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setDownloading(false);
    }
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
      // 직송 행 — 사용자가 입력한 행만 추출. 1개 이상이면 직송 주문 으로 간주.
      const filledShipping = shipping
        .filter((s) => s.name || s.address || s.phone1 || s.product)
        .map((s) => ({
          ...s,
          customer: customer.customerName,
          credit: CREDIT_LABEL,
        }));
      const isDirect = filledShipping.length > 0;

      let createdOrderId: string | null = null;
      let adjustedCount = 0;
      if (matched.length > 0) {
        // 🔴 재고 인식 자동조정 — OPS 와 동일한 calcCurrentStockByProduct 결과 사용.
        //    finalQty = max(0, min(요청 qty, 현재 재고)). 품절(stock<=0) → 0.
        //    adjusted=true 인 행에만 original_quantity 저장(원본 추적), 그 외 null.
        const stockByProduct = await calcCurrentStockByProduct(
          customer.companyId,
        );
        type Adjusted = MatchedItem & {
          finalQty: number;
          originalQtyParsed: number;
          adjusted: boolean;
        };
        const adjustedMatched: Adjusted[] = matched.map((it) => {
          const stock = stockByProduct.get(it.product_id)?.current ?? 0;
          const originalQty = it.qty;
          const finalQty = Math.max(0, Math.min(originalQty, stock));
          return {
            ...it,
            finalQty,
            originalQtyParsed: originalQty,
            adjusted: finalQty !== originalQty,
          };
        });
        adjustedCount = adjustedMatched.filter((it) => it.adjusted).length;

        const subtotal = adjustedMatched.reduce(
          (s, it) => s + it.finalQty * it.unit_price_resolved,
          0,
        );
        // 🔴 택배비 4규칙 — 직송/오늘 합산/기존 택배비 유무를 종합 판단.
        //    매수에 이미 택배비 코드가 들어 있으면 사용자의 명시적 입력이므로 추가 판단 생략.
        const hasDeliveryAlready = matched.some(
          (it) => it.product_id === DELIVERY_FEE_PRODUCT_ID,
        );
        const decision = hasDeliveryAlready
          ? { addDeliveryFee: false, removeDeliveryFeeFromOrderId: null }
          : await calcDeliveryFee({
              companyId: customer.companyId,
              customerId: customer.customerId,
              newOrderAmount: subtotal,
              isDirectShipping: isDirect,
            });
        if (decision.removeDeliveryFeeFromOrderId) {
          await removeDeliveryFeeFromOrder({
            companyId: customer.companyId,
            orderId: decision.removeDeliveryFeeFromOrderId,
          });
        }
        const totalAmount = decision.addDeliveryFee
          ? subtotal + DELIVERY_FEE_AMOUNT
          : subtotal;

        // 🟠 orders 의 shipping_info/is_direct_shipping 컬럼은 자동생성 타입에 아직 미반영
        //    → as unknown as ... 캐스팅으로 INSERT.
        const orderPayload = {
          company_id: customer.companyId,
          customer_id: customer.customerId,
          order_date: new Date().toISOString(),
          status: 'draft',
          source: 'portal',
          memo: message || null,
          shipping_info: isDirect ? (filledShipping as unknown as Json) : null,
          is_direct_shipping: isDirect,
          total_amount: totalAmount,
        } as unknown as {
          company_id: string;
          customer_id: string;
          order_date: string;
          status: string;
          source: string;
          memo: string | null;
          total_amount: number;
        };
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .insert(orderPayload)
          .select('id')
          .single();
        // eslint-disable-next-line no-console
        console.log('[customer-file.order]', {
          order,
          orderErr,
          subtotal,
          totalAmount,
          decision,
          isDirect,
        });
        if (orderErr || !order) throw orderErr ?? new Error('주문 생성 실패');
        createdOrderId = order.id;

        // 🟠 order_items.original_quantity 컬럼은 자동생성 타입 미반영 → as unknown as 캐스팅.
        //    OrderDetailPane.handleSave 와 동일 패턴.
        type ItemInsert = {
          order_id: string;
          company_id: string;
          product_id: string;
          quantity: number;
          original_quantity: number | null;
          unit_price: number;
          amount: number;
          is_return: boolean;
        };
        const orderItemsPayload: ItemInsert[] = adjustedMatched.map((it) => ({
          order_id: order.id,
          company_id: customer.companyId,
          product_id: it.product_id,
          quantity: it.finalQty,
          original_quantity: it.adjusted ? it.originalQtyParsed : null,
          unit_price: it.unit_price_resolved,
          amount: it.finalQty * it.unit_price_resolved,
          is_return: false,
        }));
        if (decision.addDeliveryFee) {
          orderItemsPayload.push({
            order_id: order.id,
            company_id: customer.companyId,
            product_id: DELIVERY_FEE_PRODUCT_ID,
            quantity: 1,
            original_quantity: null,
            unit_price: DELIVERY_FEE_AMOUNT,
            amount: DELIVERY_FEE_AMOUNT,
            is_return: false,
          });
        }
        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItemsPayload as unknown as Array<{
            order_id: string;
            company_id: string;
            product_id: string;
            quantity: number;
            unit_price: number;
            amount: number;
            is_return: boolean;
          }>);
        // eslint-disable-next-line no-console
        console.log('[customer-file.items]', {
          itemsErr,
          count: orderItemsPayload.length,
          adjustedCount,
        });
        if (itemsErr) throw itemsErr;

        // 🔴 orders.total_amount 안전망 — items INSERT 후 DB SUM 으로 재동기화.
        //    초기 INSERT 의 클라이언트 산술과 items SUM 이 어긋날 가능성 차단.
        await syncOrderTotal({
          companyId: customer.companyId,
          orderId: order.id,
        });
      }

      // 4) customer_order_uploads — 모든 경우(엑셀/이미지/PDF) 기록
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

      // 5) 다이얼로그 — 변경사항이 1건 이상이면 호박색 안내:
      //    · 코드 미매칭으로 누락 (unmatchedCount > 0)
      //    · 재고 인식 자동조정 발생 (adjustedCount > 0)
      void createdOrderId;
      const hasChanges = unmatchedCount > 0 || adjustedCount > 0;
      setSubmitResult({ show: true, hasChanges });

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

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);

  return (
    <div
      className="grid grid-rows-[auto_auto] gap-3"
      style={{ gridTemplateColumns: '1.3fr 0.85fr 0.85fr' }}
    >
      {/* 1열, 2행 span — 파일 업로드 */}
      <div className="col-start-1 row-span-2">
        <FileUploadSection
          file={file}
          onFileChange={handleFile}
          onSubmit={handleSubmitFile}
          onDownload={handleDownloadOrderForm}
          sending={sending}
          downloading={downloading}
          onDrop={onDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          dragOver={dragOver}
        />
      </div>

      {/* 2행1열 — 전달 메시지 */}
      <div className="col-start-2 row-start-1">
        <MessageSection value={message} onChange={setMessage} />
      </div>

      {/* 1행3열 — 주문서 직접 입력 */}
      <div className="col-start-3 row-start-1">
        <DirectOrderEntryCard onClick={onOpenInput} />
      </div>

      {/* 2행 2~3열 span — 직송 정보 */}
      <div className="col-span-2 col-start-2 row-start-2">
        <DirectShippingSection onAdd={addShippingRow}>
          <div className="mb-2 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium text-[#991B1B]">
            ⚠ 절대주의: 직송은 직송정보부터 입력하세요. 일반주문시와 구분해주세요
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#FAFAF9]">
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
                  <tr key={i} className="border-t border-[#F5F5F4]">
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
                        className="cursor-pointer border-none bg-transparent p-1 text-[#78716C] hover:text-[#dc2626]"
                      >
                        <Trash2 size={13} />
                      </button>
                    </ShipTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DirectShippingSection>
      </div>

      <SubmitSuccessDialog
        open={!!submitResult?.show}
        hasChanges={submitResult?.hasChanges ?? false}
        onClose={() => setSubmitResult(null)}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function NoticePanel({
  companyId,
  fontScale,
}: {
  companyId: string;
  fontScale: number;
}) {
  const baseFont = 12 * fontScale;

  const { data } = useQuery<{ title: string | null; body: string | null } | null>({
    queryKey: ['portal-notice', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('notice_title, notice_body')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { title: data.notice_title ?? null, body: data.notice_body ?? null }
        : null;
    },
    staleTime: 60_000,
  });

  const title = data?.title || '공지사항';
  const body =
    data?.body ||
    '평일 오후 4시 이후 접수된 주문은 다음 영업일에 출고됩니다.\n긴급 건은 담당자에게 연락 바랍니다.';

  return (
    <Card title={title}>
      <div
        style={{
          fontSize: baseFont,
          color: '#44403C',
          lineHeight: 1.65,
          whiteSpace: 'pre-line',
        }}
      >
        {body}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────

const IMPORT_NOTICE_STEPS = ['주문완료', '운송중', '통관진행중', '도착예정'] as const;
type ImportNoticeStep = (typeof IMPORT_NOTICE_STEPS)[number];

interface ImportNoticeProduct {
  code: string;
  name: string;
  category: string | null;
  /** 수량(개) — 재고부족 탭에서만 표시. */
  qty?: number;
}

interface ImportNoticeShipment {
  status: ImportNoticeStep | null;
  products: ImportNoticeProduct[];
  orderDate: string | null;
  shipDate: string | null;
  customsDate: string | null;
  arrivalText: string | null;
}

interface ImportNoticeData {
  fedex: ImportNoticeShipment;
  sea: ImportNoticeShipment;
}

type ImportNoticeTab = 'fedex' | 'sea' | 'soldout' | 'low';

/** 카테고리 → 코드 오름차순 정렬. */
function sortByCategoryThenCode<T extends { code: string; category: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const catA = a.category ?? '기타';
    const catB = b.category ?? '기타';
    const catCmp = catA.localeCompare(catB, 'ko');
    if (catCmp !== 0) return catCmp;
    return a.code.localeCompare(b.code);
  });
}

function ImportNoticeCard({
  companyId,
  fontScale,
}: {
  companyId: string;
  fontScale: number;
}) {
  const [tab, setTab] = useState<ImportNoticeTab>('fedex');

  // ① 수입 안내 (페덱스 + 해상운송) — companies + 코드 카테고리 보강
  const { data: notice } = useQuery<ImportNoticeData | null>({
    queryKey: ['customer-import-notice', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(
          'import_notice_status, import_notice_products, import_notice_order_date, import_notice_ship_date, import_notice_customs_date, import_notice_arrival_text, import_notice_sea_status, import_notice_sea_products, import_notice_sea_order_date, import_notice_sea_ship_date, import_notice_sea_customs_date, import_notice_sea_arrival_text',
        )
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const fedexBase = pickNoticeProducts(data.import_notice_products);
      const seaBase = pickNoticeProducts(data.import_notice_sea_products);
      const allCodes = Array.from(
        new Set([...fedexBase.map((p) => p.code), ...seaBase.map((p) => p.code)]),
      );

      const catByCode = new Map<string, string | null>();
      if (allCodes.length > 0) {
        const { data: prodRows } = await supabase
          .from('products')
          .select('code, category')
          .eq('company_id', companyId)
          .in('code', allCodes);
        for (const row of prodRows ?? []) {
          catByCode.set(row.code, row.category ?? null);
        }
      }

      const enrich = (
        rows: { code: string; name: string }[],
      ): ImportNoticeProduct[] =>
        rows.map((p) => ({
          code: p.code,
          name: p.name,
          category: catByCode.get(p.code) ?? null,
        }));

      const normalizeStatus = (
        s: unknown,
      ): ImportNoticeStep | null =>
        IMPORT_NOTICE_STEPS.includes(s as ImportNoticeStep)
          ? (s as ImportNoticeStep)
          : null;

      return {
        fedex: {
          status: normalizeStatus(data.import_notice_status),
          products: enrich(fedexBase),
          orderDate: data.import_notice_order_date ?? null,
          shipDate: data.import_notice_ship_date ?? null,
          customsDate: data.import_notice_customs_date ?? null,
          arrivalText: data.import_notice_arrival_text ?? null,
        },
        sea: {
          status: normalizeStatus(data.import_notice_sea_status),
          products: enrich(seaBase),
          orderDate: data.import_notice_sea_order_date ?? null,
          shipDate: data.import_notice_sea_ship_date ?? null,
          customsDate: data.import_notice_sea_customs_date ?? null,
          arrivalText: data.import_notice_sea_arrival_text ?? null,
        },
      };
    },
    staleTime: 60_000,
  });

  // ② 재고 스냅샷 — 페덱스/해상운송의 품절 뱃지 + 품절/재고부족 탭 데이터에 공통 사용.
  //    4탭 모두 stockItems 가 필요하므로 항상 fetch (5분 캐시로 중복 fetch 회피).
  const { data: stockItems } = useQuery<ImportNoticeProduct[]>({
    queryKey: ['customer-stock-snapshot', companyId],
    queryFn: async () => {
      const [stockMap, prodRes] = await Promise.all([
        calcCurrentStockByProduct(companyId),
        supabase
          .from('products')
          .select('id, code, name, category, is_active')
          .eq('company_id', companyId)
          .eq('is_active', true),
      ]);
      if (prodRes.error) throw prodRes.error;
      const items: ImportNoticeProduct[] = [];
      for (const p of prodRes.data ?? []) {
        const info = stockMap.get(p.id);
        const qty = info?.current ?? 0;
        items.push({
          code: p.code,
          name: p.name,
          category: p.category ?? null,
          qty,
        });
      }
      return items;
    },
    staleTime: 60_000,
  });

  /** code → 현재 재고 수량. 페덱스/해상운송 탭의 품절(≤0) 뱃지 판정에 사용. */
  const stockByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of stockItems ?? []) map.set(it.code, it.qty ?? 0);
    return map;
  }, [stockItems]);

  const activeShipment: ImportNoticeShipment | null =
    tab === 'fedex' ? (notice?.fedex ?? null)
    : tab === 'sea' ? (notice?.sea ?? null)
    : null;

  let productList: ImportNoticeProduct[] = [];
  if (tab === 'fedex' || tab === 'sea') {
    productList = sortByCategoryThenCode(activeShipment?.products ?? []);
  } else if (tab === 'soldout') {
    productList = sortByCategoryThenCode(
      (stockItems ?? []).filter((p) => (p.qty ?? 0) <= 0),
    );
  } else if (tab === 'low') {
    productList = sortByCategoryThenCode(
      (stockItems ?? []).filter((p) => {
        const q = p.qty ?? 0;
        return q > 0 && q <= 5;
      }),
    );
  }

  const baseFont = 11 * fontScale;

  return (
    <section
      style={{
        background: '#FFFFFF',
        border: '1px solid #E7E5E4',
        borderRadius: 10,
        padding: 16,
      }}
    >
      {/* 탭 (4탭) — 최상단, pill 뱃지 스타일 (탭별 색상 구분) */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        {/* 페덱스 탭 */}
        <button
          type="button"
          onClick={() => setTab('fedex')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            border: '1.5px solid',
            cursor: 'pointer',
            backgroundColor: tab === 'fedex' ? '#6B1F2A' : 'white',
            color: tab === 'fedex' ? 'white' : '#6B1F2A',
            borderColor: '#6B1F2A',
          }}
        >
          ✈️ 페덱스
        </button>

        {/* 해상운송 탭 */}
        <button
          type="button"
          onClick={() => setTab('sea')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            border: '1.5px solid',
            cursor: 'pointer',
            backgroundColor: tab === 'sea' ? '#6B1F2A' : 'white',
            color: tab === 'sea' ? 'white' : '#6B1F2A',
            borderColor: '#6B1F2A',
          }}
        >
          🚢 해상운송
        </button>

        {/* 품절 탭 */}
        <button
          type="button"
          onClick={() => setTab('soldout')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            border: '1.5px solid',
            cursor: 'pointer',
            backgroundColor: tab === 'soldout' ? '#ef4444' : 'white',
            color: tab === 'soldout' ? 'white' : '#ef4444',
            borderColor: '#ef4444',
          }}
        >
          🚫 품절
        </button>

        {/* 재고부족 탭 */}
        <button
          type="button"
          onClick={() => setTab('low')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            border: '1.5px solid',
            cursor: 'pointer',
            backgroundColor: tab === 'low' ? '#f59e0b' : 'white',
            color: tab === 'low' ? 'white' : '#f59e0b',
            borderColor: '#f59e0b',
          }}
        >
          ⚠️ 재고부족
        </button>
      </div>

      {/* 헤더 — 페덱스/해상운송 탭일 때만 (제목 + 도착예정 자유 텍스트) */}
      {(tab === 'fedex' || tab === 'sea') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#1C1917',
              flexShrink: 0,
            }}
          >
            🚢 수입 입고 예정일
          </span>
          {activeShipment?.arrivalText && (
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#2563EB',
              }}
            >
              {activeShipment.arrivalText}
            </span>
          )}
        </div>
      )}

      {/* 스텝퍼 — 페덱스/해상운송 탭에서만 노출 */}
      {(tab === 'fedex' || tab === 'sea') && activeShipment?.status && (
        <ImportStepper shipment={activeShipment} />
      )}

      {/* 제품 목록 (모든 탭 공통) */}
      <ProductList
        items={productList}
        baseFont={baseFont}
        emptyText={tab === 'soldout' ? '품절 제품 없음' : tab === 'low' ? '재고부족 제품 없음' : '입고 예정 제품 없음'}
        showQty={tab === 'low'}
        soldOutCodes={
          tab === 'fedex' || tab === 'sea' ? stockByCode : null
        }
      />
    </section>
  );
}

/** companies.import_notice_products / sea_products jsonb → {code,name} 배열로 안전 추출. */
function pickNoticeProducts(raw: unknown): { code: string; name: string }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown as { code?: unknown; name?: unknown }[])
    .filter(
      (p): p is { code: string; name: string } =>
        !!p &&
        typeof p === 'object' &&
        typeof p.code === 'string' &&
        typeof p.name === 'string',
    )
    .map((p) => ({ code: p.code, name: p.name }));
}

function ImportStepper({ shipment }: { shipment: ImportNoticeShipment }) {
  const currentIdx = shipment.status
    ? IMPORT_NOTICE_STEPS.indexOf(shipment.status)
    : -1;
  const stepDates: Array<string | null> = [
    shipment.orderDate,
    shipment.shipDate,
    shipment.customsDate,
    null,
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        width: '100%',
        marginBottom: 12,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {IMPORT_NOTICE_STEPS.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isDone = i <= currentIdx;
        const reached = isDone;
        const bg = reached ? '#2563EB' : '#F5F5F4';
        const fg = reached ? '#FFFFFF' : '#9CA3AF';
        const border = reached ? '#2563EB' : '#D6D3D1';
        const dateText = isDone ? stepDates[i] : null;
        return (
          <div
            key={s}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: bg,
                  color: fg,
                  border: `1px solid ${border}`,
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isDone && !isCurrent ? 0.55 : 1,
                  flexShrink: 0,
                }}
              >
                {isDone && !isCurrent ? '✓' : i + 1}
              </div>
              <span
                style={{
                  fontSize: 9,
                  marginTop: 4,
                  color: isCurrent ? '#2563EB' : '#6B7280',
                  fontWeight: isCurrent ? 600 : 400,
                  textAlign: 'center',
                  lineHeight: 1.2,
                  wordBreak: 'keep-all',
                }}
              >
                {s}
              </span>
              {dateText && (
                <span
                  style={{
                    fontSize: 8,
                    marginTop: 2,
                    color: '#9CA3AF',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    wordBreak: 'keep-all',
                  }}
                >
                  {dateText}
                </span>
              )}
            </div>
            {i < IMPORT_NOTICE_STEPS.length - 1 && (
              <div
                style={{
                  width: 12,
                  height: 2,
                  marginTop: 10,
                  marginLeft: 2,
                  marginRight: 2,
                  background: i < currentIdx ? '#2563EB' : '#E5E7EB',
                  opacity: i < currentIdx ? 0.55 : 1,
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductList({
  items,
  baseFont,
  emptyText,
  showQty,
  soldOutCodes,
}: {
  items: ImportNoticeProduct[];
  baseFont: number;
  emptyText: string;
  showQty: boolean;
  /**
   * code → 현재 재고 맵. null 이면 품절 뱃지 미노출.
   * 페덱스/해상운송 탭에서만 전달 — 입고 예정 제품 중 현재 재고가 0 이하면 "품절" 뱃지 표시.
   */
  soldOutCodes: Map<string, number> | null;
}) {
  // 카테고리 그룹핑 (items 는 이미 카테고리→코드 정렬됨)
  const grouped = new Map<string, ImportNoticeProduct[]>();
  for (const p of items) {
    const cat = p.category ?? '기타';
    const arr = grouped.get(cat) ?? [];
    arr.push(p);
    grouped.set(cat, arr);
  }
  return (
    <div>
      <div
        style={{
          height: 400,
          overflowY: 'auto',
          border: '1px solid #F3F4F6',
          borderRadius: 6,
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              fontSize: 11,
              color: '#9CA3AF',
            }}
          >
            {emptyText}
          </div>
        ) : (
          Array.from(grouped.entries()).map(([cat, list]) => (
            <div key={cat}>
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  background: '#FAFAF9',
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#6B7280',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid #E5E7EB',
                }}
              >
                {cat}
              </div>
              {list.map((p, idx) => (
                <div
                  key={p.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: baseFont,
                    padding: '5px 8px',
                    borderTop: idx === 0 ? 'none' : '1px solid #F3F4F6',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-num)',
                      color: '#6B7280',
                      width: 84,
                      flexShrink: 0,
                    }}
                  >
                    {p.code}
                  </span>
                  <span
                    style={{
                      color: '#1F2937',
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </span>
                    {soldOutCodes && (soldOutCodes.get(p.code) ?? 1) <= 0 && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '1px 6px',
                          borderRadius: 999,
                          fontSize: 9,
                          fontWeight: 600,
                          background: '#FEE2E2',
                          color: '#B91C1C',
                          border: '1px solid #FECACA',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                          fontFamily:
                            'var(--font-sans, -apple-system, system-ui)',
                          letterSpacing: 0,
                        }}
                      >
                        품절
                      </span>
                    )}
                  </span>
                  {showQty && (
                    <span
                      style={{
                        fontFamily: 'var(--font-num)',
                        color: '#B45309',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {(p.qty ?? 0).toLocaleString('ko-KR')}개
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
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
  const orderIds = orders.map((o) => o.id);
  const { data: photosByOrder } = useOrderPhotosByOrders(orderIds, customer.companyId);

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
              photos={photosByOrder?.get(o.id) ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────

/**
 * 날짜별 거래명세서를 새 창(탭)에 HTML로 렌더.
 * 거래처 포털 전용 — 브라우저 인쇄 기능으로 PDF 저장도 가능.
 */
function openStatementInNewWindow(
  date: string,
  orders: OrderDetail[],
  customer: CustomerSession,
): void {
  let rowNo = 1;
  let grandTotal = 0;
  let grandQty = 0;

  const rowsHtml = orders
    .flatMap((order) =>
      order.items
        .filter((item) => item.product)
        .map((item) => {
          const supplyPrice = calcSupplyPriceByCustomerGrade(
            item.product!.sell_price,
            customer.grade,
            item.product!,
          );
          const amount = item.quantity * supplyPrice;
          grandTotal += amount;
          grandQty += item.quantity;
          return `
            <tr>
              <td class="num">${rowNo++}</td>
              <td class="center">${escapeHtml(item.product!.code)}</td>
              <td>${escapeHtml(item.product!.name)}</td>
              <td class="num">${item.quantity.toLocaleString()}</td>
              <td class="num">${supplyPrice.toLocaleString()}</td>
              <td class="num">${amount.toLocaleString()}</td>
            </tr>`;
        }),
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>거래명세서 - ${escapeHtml(customer.customerName)} (${date})</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1C1917;
    padding: 40px;
    max-width: 760px;
    margin: 0 auto;
    background: #fff;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 4px;
    text-align: center;
  }
  .sub {
    text-align: center;
    color: #78716C;
    font-size: 13px;
    margin-bottom: 28px;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #E7E5E4;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #D6D3D1;
    padding: 7px 10px;
  }
  th {
    background: #F5F5F4;
    font-weight: 600;
    text-align: center;
  }
  td.num { text-align: right; }
  td.center { text-align: center; }
  tfoot td {
    background: #FFFBEB;
    font-weight: 700;
  }
  .print-btn {
    display: block;
    margin: 24px auto 0;
    padding: 10px 24px;
    background: #1C1917;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <h1>거래명세서</h1>
  <div class="sub">엔젤러스 파트너 주문시스템</div>
  <div class="meta">
    <span>거래처: <strong>${escapeHtml(customer.customerName)}</strong></span>
    <span>거래일자: <strong>${date}</strong></span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:6%">No.</th>
        <th style="width:18%">제품코드</th>
        <th style="width:34%">제품명</th>
        <th style="width:10%">수량</th>
        <th style="width:14%">공급단가</th>
        <th style="width:18%">공급금액</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:center">합계</td>
        <td class="num">${grandQty.toLocaleString()}</td>
        <td></td>
        <td class="num">${grandTotal.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>
  <button class="print-btn" onclick="window.print()">인쇄 / PDF로 저장</button>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

/** HTML 인젝션 방지용 간단 escape. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const orderIds = orders.map((o) => o.id);
  const { data: photosByOrder } = useOrderPhotosByOrders(orderIds, customer.companyId);

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
              onStatement={(date, orders) =>
                openStatementInNewWindow(date, orders, customer)
              }
              baseFont={baseFont}
              customer={customer}
              photosByOrder={photosByOrder}
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
  photosByOrder,
}: {
  date: string;
  orders: OrderDetail[];
  expanded: boolean;
  onToggle: () => void;
  onStatement: (date: string, orders: OrderDetail[]) => void;
  baseFont: number;
  customer: CustomerSession;
  photosByOrder?: Map<string, OrderPhoto[]>;
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
            onStatement(date, orders);
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
              photosByOrder={photosByOrder}
            />
          )}
          {extra.length > 0 && (
            <OrderGroupSection
              title="추가주문"
              orders={extra}
              baseFont={baseFont}
              customer={customer}
              photosByOrder={photosByOrder}
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
  photosByOrder,
}: {
  title: '주문' | '추가주문';
  orders: OrderDetail[];
  baseFont: number;
  customer: CustomerSession;
  photosByOrder?: Map<string, OrderPhoto[]>;
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
            photos={photosByOrder?.get(o.id) ?? []}
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
  photos = [],
}: {
  order: OrderDetail;
  baseFont: number;
  showTime?: boolean;
  customer: CustomerSession;
  photos?: OrderPhoto[];
}) {
  const subtotal = calcOrderTotal(order);
  const extra = isExtraOrder(order.memo);
  const direct = isDirectShipping(order.memo);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
                // 공급가 = grade 기반 재계산 (단가 표시 일관성 유지)
                // 합계 = quantity × 공급가 (it.amount 는 저장값 시점 의존성이 있어 신뢰 불가)
                const supplyPrice = it.product
                  ? calcSupplyPriceByCustomerGrade(
                      it.product.sell_price,
                      customer.grade,
                      it.product,
                    )
                  : 0;
                const lineSum = it.quantity * supplyPrice;
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
      {photos.length > 0 && (
        <div
          style={{
            padding: '8px 10px',
            borderTop: '1px solid #F3F4F6',
            background: '#FAFAF9',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>
            출고 사진
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreviewUrl(p.storage_url)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: '1px solid #E5E7EB',
                  padding: 0,
                  cursor: 'pointer',
                  background: '#FFFFFF',
                }}
                aria-label="출고 사진 크게 보기"
              >
                <img
                  src={p.storage_url}
                  alt="출고사진"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            aria-label="닫기"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'transparent',
              border: 0,
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            <X size={28} />
          </button>
          <img
            src={previewUrl}
            alt="출고사진 원본"
            style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }}
          />
        </div>
      )}
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

