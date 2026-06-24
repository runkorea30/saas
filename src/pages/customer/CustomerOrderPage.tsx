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
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { useCustomerAuth, type CustomerSession } from '@/hooks/useCustomerAuth';
import { CustomerOrderLogin } from './CustomerOrderLogin';
import { CustomerOrderInput } from './CustomerOrderInput';
import type { Json } from '@/types/database';

const ACCEPT_EXT = '.xlsx,.xls,.csv,.jpg,.jpeg,.png,.pdf';

interface ShippingRow {
  name: string;
  zipcode: string;
  address: string;
  phone1: string;
  phone2: string;
  memo: string;
}

const emptyShipping = (): ShippingRow => ({
  name: '',
  zipcode: '',
  address: '',
  phone1: '',
  phone2: '',
  memo: '',
});

/** orders + item count 조합 — 우측 패널 표시 행. */
interface OrderRowWithCount {
  id: string;
  order_date: string;
  total_amount: number;
  status: string;
  itemCount: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 주어진 기간 [start, end) 의 거래처 주문을 orders + order_items 조합으로 반환.
 * item count 는 별도 select 로 집계(중첩 count select 의 형변환 복잡도 회피).
 */
async function fetchOrdersWithItemCount(
  companyId: string,
  customerId: string,
  start: Date,
  end: Date,
): Promise<OrderRowWithCount[]> {
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_date, total_amount, status')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .gte('order_date', start.toISOString())
    .lt('order_date', end.toISOString())
    .is('deleted_at', null)
    .order('order_date', { ascending: false });
  if (oErr) throw oErr;
  const rows = orders ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((o) => o.id);
  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select('order_id')
    .in('order_id', ids)
    .is('deleted_at', null);
  if (iErr) throw iErr;
  const countMap = new Map<string, number>();
  for (const it of items ?? []) {
    countMap.set(it.order_id, (countMap.get(it.order_id) ?? 0) + 1);
  }
  return rows.map((o) => ({ ...o, itemCount: countMap.get(o.id) ?? 0 }));
}

const STATUS_LABEL: Record<string, string> = {
  draft: '대기',
  confirmed: '확정',
  shipped: '출고',
  done: '완료',
  canceled: '취소',
};

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
        <RightPanel customer={customer} fontScale={fontScale} />
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
   */
  const SHIPPING_KEYS: ReadonlyArray<keyof ShippingRow> = [
    'name',
    'zipcode',
    'address',
    'phone1',
    'phone2',
    'memo',
  ];
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
            if (keyIdx < SHIPPING_KEYS.length) {
              target[SHIPPING_KEYS[keyIdx]] = val.trim();
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
      const filledShipping = shipping.filter(
        (s) => s.name || s.address || s.phone1,
      );
      const { error } = await supabase.from('customer_order_uploads').insert({
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
        status: 'pending',
      });
      if (error) throw error;
      showToast({
        kind: 'success',
        text: '주문서가 전송되었습니다. 담당자가 확인 후 처리합니다.',
      });
      setFile(null);
      setMessage('');
      setShipping([emptyShipping()]);
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '전송 실패',
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
                <ShipTh>비고</ShipTh>
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
                      value={row.memo}
                      onChange={(v) => updateShipping(i, 'memo', v)}
                      onPaste={handleShippingPaste(i, 5)}
                    />
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

function RightPanel({
  customer,
  fontScale,
}: {
  customer: CustomerSession;
  fontScale: number;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const todayQuery = useQuery<OrderRowWithCount[]>({
    queryKey: ['customer-orders-today', customer.customerId],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return fetchOrdersWithItemCount(
        customer.companyId,
        customer.customerId,
        start,
        end,
      );
    },
    staleTime: 15_000,
  });

  const monthlyQuery = useQuery<OrderRowWithCount[]>({
    queryKey: ['customer-orders-monthly', customer.customerId, year, month],
    queryFn: async () => {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      return fetchOrdersWithItemCount(
        customer.companyId,
        customer.customerId,
        start,
        end,
      );
    },
    staleTime: 30_000,
  });

  const baseFont = 12 * fontScale;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="공지사항">
        <div style={{ fontSize: baseFont, color: '#44403C', lineHeight: 1.55 }}>
          평일 오후 4시 이후 접수된 주문은 다음 영업일에 출고됩니다.<br />
          긴급 건은 담당자에게 연락 바랍니다.
        </div>
      </Card>

      <Card title="오늘 주문 내역">
        <OrderList
          rows={todayQuery.data ?? []}
          isLoading={todayQuery.isLoading}
          baseFont={baseFont}
          emptyText="오늘 등록한 주문이 없습니다."
          showTime
        />
      </Card>

      <Card title="월별 주문 내역">
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
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
        <OrderList
          rows={monthlyQuery.data ?? []}
          isLoading={monthlyQuery.isLoading}
          baseFont={baseFont}
          emptyText="등록된 주문이 없습니다."
        />
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function OrderList({
  rows,
  isLoading,
  baseFont,
  emptyText,
  showTime,
}: {
  rows: OrderRowWithCount[];
  isLoading: boolean;
  baseFont: number;
  emptyText: string;
  showTime?: boolean;
}) {
  if (isLoading) {
    return <div style={{ fontSize: baseFont, color: '#78716C' }}>불러오는 중…</div>;
  }
  if (rows.length === 0) {
    return <div style={{ fontSize: baseFont, color: '#78716C' }}>{emptyText}</div>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rows.map((r) => {
        const d = new Date(r.order_date);
        const datePart = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const timePart = showTime
          ? d.toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : null;
        return (
          <li
            key={r.id}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid #F5F5F4',
              fontSize: baseFont,
              color: '#1C1917',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span>
                {datePart}
                {timePart && (
                  <span style={{ color: '#78716C', marginLeft: 6 }}>
                    {timePart}
                  </span>
                )}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.total_amount.toLocaleString('ko-KR')}원
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#78716C',
                marginTop: 2,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>품목 {r.itemCount}건</span>
              <span>{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
          </li>
        );
      })}
    </ul>
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

