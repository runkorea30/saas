/**
 * 수동주문입력 페이지 — 판매 > 수동주문입력.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만 조달.
 * 🔴 CLAUDE.md §2: 공급가 계산은 calcSupplyPriceByGrade (utils/calculations).
 * 🔴 CLAUDE.md §5: 저장은 RPC mochicraft_demo.insert_order (orders+items 트랜잭션 보장).
 *
 * 레이아웃: 상단(파일업로드 + 폼) / 하단 분할(좌: 행 입력 테이블, 우: 미리보기).
 * 단축키: Tab/Enter 셀 이동, Ctrl+S 저장.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Settings, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useCustomers, type Customer } from '@/hooks/queries/useCustomers';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { calcSupplyPriceByGrade } from '@/utils/calculations';

type OrderType = '일반주문' | '반품(정상)' | '반품(파손)';

interface EntryRow {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  supply_price: number;
  amount: number;
  is_return: boolean;
  codeError: boolean;
}

const RECENT_CUSTOMERS_KEY = 'mc.order-entry.recent-customers';
const RECENT_LIMIT = 10;

function createEmptyRow(isReturn: boolean): EntryRow {
  return {
    id: crypto.randomUUID(),
    product_id: '',
    product_code: '',
    product_name: '',
    quantity: 1,
    unit_price: 0,
    supply_price: 0,
    amount: 0,
    is_return: isReturn,
    codeError: false,
  };
}

function todayKstDateString(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function readRecentCustomerIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CUSTOMERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecentCustomerId(id: string): void {
  try {
    const prev = readRecentCustomerIds().filter((x) => x !== id);
    const next = [id, ...prev].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_CUSTOMERS_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

function gradeRateOf(product: Product, grade: string | null | undefined): number {
  const gradeKey = `grade_${(grade ?? '').toLowerCase()}` as
    | 'grade_a'
    | 'grade_b'
    | 'grade_c'
    | 'grade_d'
    | 'grade_e';
  return gradeKey in product ? ((product[gradeKey] as number | undefined) ?? 0) : 0;
}

export function OrderEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyId } = useCompany();

  const { data: customers = [] } = useCustomers(companyId);
  const { data: products = [] } = useProducts(companyId);

  // ───── 헤더 폼 상태 ─────
  const [orderType, setOrderType] = useState<OrderType>('일반주문');
  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [orderDate, setOrderDate] = useState<string>(todayKstDateString());
  const [memo, setMemo] = useState('');

  // ───── 행 입력 ─────
  const [rows, setRows] = useState<EntryRow[]>(() => [createEmptyRow(false)]);
  const [isSaving, setIsSaving] = useState(false);

  // ───── 파일 업로드 ─────
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ───── 최근 거래처 ─────
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentCustomerIds());

  // ───── refs ─────
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const codeRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const customerWrapRef = useRef<HTMLDivElement>(null);

  // ───── 좌우 스플릿 ─────
  const {
    leftPercent,
    onDragStart: startSplitDrag,
    containerRef: splitRef,
  } = useResizableSplit({ pageKey: 'order-entry', defaultLeftPercent: 55 });

  const selectedCustomer: Customer | null =
    customers.find((c) => c.id === customerId) ?? null;

  const isReturnMode = orderType !== '일반주문';

  // ───── 미리보기 URL cleanup ─────
  useEffect(() => {
    if (!uploadedFile || !uploadedFile.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile]);

  // ───── 거래처 dropdown outside click 닫기 ─────
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!customerWrapRef.current?.contains(e.target as Node)) {
        setCustomerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // ───── 핸들러: 초기화 ─────
  const handleReset = useCallback(() => {
    setCustomerId('');
    setCustomerQuery('');
    setOrderDate(todayKstDateString());
    setMemo('');
    setOrderType('일반주문');
    setRows([createEmptyRow(false)]);
    setUploadedFile(null);
  }, []);

  // ───── 핸들러: 주문구분 변경 → 모든 행 is_return 일괄 토글 ─────
  const handleOrderTypeChange = (next: OrderType) => {
    setOrderType(next);
    const isRet = next !== '일반주문';
    setRows((prev) => prev.map((r) => ({ ...r, is_return: isRet })));
  };

  // ───── 핸들러: 거래처 선택 → 행 공급가 일괄 재계산 ─────
  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    setCustomerOpen(false);
    const next = customers.find((c) => c.id === id) ?? null;
    setCustomerQuery(next?.name ?? '');
    setRows((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        const p = products.find((x) => x.id === r.product_id);
        if (!p) return r;
        const rate = gradeRateOf(p, next?.grade);
        return { ...r, supply_price: calcSupplyPriceByGrade(p.sell_price, rate) };
      }),
    );
  };

  // 검색 결과: customerQuery 와 selectedCustomer.name 이 일치하면 검색이 아닌 단순 표시.
  const customerSearchHits = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 30);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.business?.business_number ?? '').includes(q),
      )
      .slice(0, 30);
  }, [customerQuery, customers]);

  const recentCustomers = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c]));
    return recentIds.map((id) => map.get(id)).filter((c): c is Customer => !!c);
  }, [recentIds, customers]);

  // ───── 핸들러: 코드 매칭 ─────
  const handleCodeInput = (rowId: string, code: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, product_code: code, codeError: false } : r,
      ),
    );
  };

  const matchProduct = useCallback(
    (code: string): Product | null => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return null;
      const exact = products.find((p) => p.code.toUpperCase() === trimmed);
      if (exact) return exact;
      return products.find((p) => p.code.toUpperCase().startsWith(trimmed)) ?? null;
    },
    [products],
  );

  const handleCodeCommit = (rowId: string, code: string, nextFocus: 'qty' | 'next') => {
    const product = matchProduct(code);
    if (!product) {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, codeError: true } : r)),
      );
      return;
    }

    const rate = gradeRateOf(product, selectedCustomer?.grade);
    const supplyPrice = calcSupplyPriceByGrade(product.sell_price, rate);

    let createdNextRow: EntryRow | null = null;
    setRows((prev) => {
      const next = prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              unit_price: product.sell_price,
              supply_price: supplyPrice,
              amount: r.quantity * product.sell_price,
              is_return: isReturnMode,
              codeError: false,
            }
          : r,
      );
      const hasEmpty = next.some((r) => !r.product_id);
      if (!hasEmpty) {
        const empty = createEmptyRow(isReturnMode);
        createdNextRow = empty;
        next.push(empty);
      }
      return next;
    });

    setTimeout(() => {
      if (nextFocus === 'qty') {
        qtyRefs.current[rowId]?.focus();
        qtyRefs.current[rowId]?.select();
      } else {
        // 다음 행의 코드 input 으로 포커스 (없으면 방금 추가된 행).
        const targetId = createdNextRow?.id ?? findNextEmptyRowId(rowId);
        if (targetId) codeRefs.current[targetId]?.focus();
      }
    }, 30);
  };

  const findNextEmptyRowId = (currentId: string): string | null => {
    const idx = rows.findIndex((r) => r.id === currentId);
    for (let i = idx + 1; i < rows.length; i++) {
      if (!rows[i].product_id) return rows[i].id;
    }
    return null;
  };

  const handleQtyChange = (rowId: string, qty: number) => {
    const safe = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, quantity: safe, amount: safe * r.unit_price }
          : r,
      ),
    );
  };

  const handleQtyKeyDown = (
    rowId: string,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      // 다음 행이 없으면 빈 행 추가.
      let targetId = rows.find(
        (r, i) => i > rows.findIndex((x) => x.id === rowId) && !r.product_id,
      )?.id;
      if (!targetId) {
        const empty = createEmptyRow(isReturnMode);
        setRows((prev) => [...prev, empty]);
        targetId = empty.id;
      }
      setTimeout(() => codeRefs.current[targetId!]?.focus(), 30);
    }
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== rowId);
      if (filtered.length === 0 || filtered.every((r) => r.product_id)) {
        filtered.push(createEmptyRow(isReturnMode));
      }
      return filtered;
    });
  };

  // ───── 파일 업로드 ─────
  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    // 엑셀 파싱은 별도 PR — 패키지(xlsx) 추가 후 활성화 예정.
    if (
      file.name.match(/\.(xlsx|xls|csv)$/i) ||
      file.type.includes('spreadsheet')
    ) {
      alert(
        '엑셀 파싱 기능은 준비 중입니다. 파일은 업로드되지만 자동 입력은 다음 업데이트에서 지원됩니다.',
      );
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ───── 합계 ─────
  const validRows = useMemo(
    () => rows.filter((r) => r.product_id && r.quantity > 0),
    [rows],
  );
  const totalQty = validRows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0);

  // ───── 저장 ─────
  const handleSave = useCallback(async () => {
    if (!companyId) {
      alert('회사 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (!customerId) {
      alert('거래처를 선택해주세요.');
      return;
    }
    if (!orderDate) {
      alert('날짜를 선택해주세요.');
      return;
    }
    const valid = rows.filter((r) => r.product_id && r.quantity > 0);
    if (valid.length === 0) {
      alert('주문 항목을 1개 이상 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.rpc('insert_order', {
        p_company_id: companyId,
        p_customer_id: customerId,
        p_order_date: orderDate,
        p_source: 'manual',
        p_status: 'confirmed',
        p_memo: memo || null,
        p_items: valid.map((r) => ({
          product_id: r.product_id,
          quantity: r.is_return ? -Math.abs(r.quantity) : r.quantity,
          unit_price: r.unit_price,
          amount: r.is_return ? -Math.abs(r.amount) : r.amount,
          is_return: r.is_return,
        })),
      });
      if (error) throw error;

      pushRecentCustomerId(customerId);
      setRecentIds(readRecentCustomerIds());

      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate('/sales/orders', { state: { selectedOrderId: data } });
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [companyId, customerId, orderDate, memo, rows, queryClient, navigate]);

  // ───── 단축키 Ctrl+S ─────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

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
            판매 › 수동주문입력
          </div>
          <h1
            className="disp"
            style={{ fontSize: 26, fontWeight: 500, margin: 0, color: 'var(--ink)' }}
          >
            수동주문입력
          </h1>
        </header>

        {/* 상단 영역: 파일 업로드 + 폼 */}
        <div className="card-surface" style={{ padding: 16, marginBottom: 12 }}>
          {/* 파일 업로드 */}
          <div style={{ marginBottom: 14 }}>
            <div className="text-xs text-[var(--ink-3)] mb-2">사진 / PDF / 엑셀</div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() =>
                document.getElementById('order-entry-file-input')?.click()
              }
              className={`relative cursor-pointer rounded border-2 border-dashed transition-colors ${
                isDragOver
                  ? 'border-[var(--brand)] bg-[var(--brand-wash)]'
                  : 'border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
              }`}
              style={{ padding: '14px 16px', maxWidth: 480 }}
            >
              <input
                id="order-entry-file-input"
                type="file"
                accept="image/*,.pdf,.xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
              {uploadedFile ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Upload size={14} className="text-[var(--ink-3)] shrink-0" />
                    <span className="text-xs text-[var(--ink-2)] truncate">
                      {uploadedFile.name}
                    </span>
                    <span className="text-[10px] text-[var(--ink-3)] font-num shrink-0">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedFile(null);
                    }}
                    className="text-[var(--ink-3)] hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
                  <Upload size={14} />
                  <span>클릭 또는 드래그 (사진/PDF/엑셀)</span>
                </div>
              )}
            </div>
          </div>

          {/* 폼 행 */}
          <div className="flex flex-wrap gap-4 items-end">
            {/* 주문구분 */}
            <div>
              <label className="text-xs text-[var(--ink-3)] mb-1 block">주문구분</label>
              <div className="flex gap-1">
                {(['일반주문', '반품(정상)', '반품(파손)'] as OrderType[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => handleOrderTypeChange(t)}
                    className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                      orderType === t
                        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                        : 'border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 업체명 검색 */}
            <div ref={customerWrapRef} className="relative flex-1 min-w-48">
              <label className="text-xs text-[var(--ink-3)] mb-1 block">
                업체명
                {selectedCustomer?.grade && (
                  <span className="ml-1 text-[var(--ink-3)]">
                    (등급 {selectedCustomer.grade})
                  </span>
                )}
              </label>
              <input
                type="text"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setCustomerOpen(true);
                  if (e.target.value === '') setCustomerId('');
                }}
                onFocus={() => setCustomerOpen(true)}
                placeholder="거래처명 검색"
                className="w-full border border-[var(--line-strong)] rounded px-2 py-1.5 text-sm bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
              />
              {customerOpen && customerSearchHits.length > 0 && (
                <div
                  className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded border border-[var(--line-default)] bg-[var(--surface)] shadow-lg"
                >
                  {customerSearchHits.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => handleCustomerSelect(c.id)}
                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] ${
                        c.id === customerId ? 'bg-[var(--brand-wash)]' : ''
                      }`}
                    >
                      <span className="text-[var(--ink)]">{c.name}</span>
                      {c.grade && (
                        <span className="ml-2 text-[var(--ink-3)]">[{c.grade}]</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 날짜 */}
            <div>
              <label className="text-xs text-[var(--ink-3)] mb-1 block">날짜</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="border border-[var(--line-strong)] rounded px-2 py-1.5 text-sm bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>

            {/* 메모 */}
            <div className="flex-1 min-w-32">
              <label className="text-xs text-[var(--ink-3)] mb-1 block">메모</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 (선택)"
                className="w-full border border-[var(--line-strong)] rounded px-2 py-1.5 text-sm bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 text-xs border border-[var(--line-strong)] rounded text-[var(--ink-3)] hover:bg-[var(--surface-2)] transition-colors"
            >
              초기화
            </button>
            <button
              type="button"
              title="설정 (준비 중)"
              className="p-1.5 border border-[var(--line-strong)] rounded text-[var(--ink-3)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Settings size={13} />
            </button>
          </div>

          {/* 최근 거래처 */}
          {recentCustomers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-xs text-[var(--ink-3)] mr-1">최근:</span>
              {recentCustomers.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => handleCustomerSelect(c.id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    c.id === customerId
                      ? 'bg-[var(--brand-wash)] border-[var(--brand)] text-[var(--brand)]'
                      : 'border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 하단: 좌(테이블) | 핸들 | 우(미리보기) */}
        <div
          ref={splitRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `calc(${leftPercent}% - 3px) 6px calc(${100 - leftPercent}% - 3px)`,
            alignItems: 'start',
            gap: 0,
          }}
        >
          {/* 좌: 입력 테이블 */}
          <div className="card-surface" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--line-default)] text-xs text-[var(--ink-3)]">
              <span>Tab/Enter로 이동 · Ctrl+S 저장</span>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 540 }}>
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[var(--surface-2)] sticky top-0">
                  <tr className="border-b border-[var(--line-default)]">
                    <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)] w-8">
                      #
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)] w-28">
                      코드
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)]">
                      제품명
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-16">
                      수량
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">
                      판매가
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">
                      공급가
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-24">
                      합계
                    </th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-[var(--line-subtle)] ${
                        row.is_return && row.product_id ? 'text-red-500' : ''
                      }`}
                    >
                      <td className="py-1 px-2 text-[var(--ink-3)] font-num">
                        {idx + 1}
                      </td>
                      <td className="py-1 px-2">
                        <input
                          ref={(el) => {
                            codeRefs.current[row.id] = el;
                          }}
                          type="text"
                          value={row.product_code}
                          onChange={(e) => handleCodeInput(row.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCodeCommit(row.id, row.product_code, 'qty');
                            } else if (e.key === 'Tab' && !e.shiftKey) {
                              if (row.product_code && !row.product_id) {
                                e.preventDefault();
                                handleCodeCommit(row.id, row.product_code, 'qty');
                              }
                            }
                          }}
                          placeholder="코드"
                          className={`w-full border rounded px-1.5 py-1 bg-[var(--surface)] text-[var(--ink)] text-xs font-mono focus:outline-none focus:border-[var(--brand)] ${
                            row.codeError
                              ? 'border-red-500'
                              : 'border-[var(--line-strong)]'
                          }`}
                        />
                      </td>
                      <td className="py-1 px-2 truncate">{row.product_name || '—'}</td>
                      <td className="py-1 px-2 text-right">
                        <input
                          ref={(el) => {
                            qtyRefs.current[row.id] = el;
                          }}
                          type="number"
                          min={0}
                          value={row.quantity}
                          onChange={(e) =>
                            handleQtyChange(row.id, Number(e.target.value))
                          }
                          onKeyDown={(e) => handleQtyKeyDown(row.id, e)}
                          className="w-14 text-right border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                        />
                      </td>
                      <td className="py-1 px-2 text-right font-num">
                        {row.unit_price ? row.unit_price.toLocaleString() : '—'}
                      </td>
                      <td className="py-1 px-2 text-right font-num">
                        {row.supply_price ? row.supply_price.toLocaleString() : '—'}
                      </td>
                      <td className="py-1 px-2 text-right font-num font-medium">
                        {row.amount ? row.amount.toLocaleString() : '—'}
                      </td>
                      <td className="py-1 px-2 text-center">
                        {row.product_id && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-[var(--ink-3)] hover:text-red-500"
                            title="행 삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--line-strong)] bg-[var(--surface-2)]">
                    <td
                      colSpan={6}
                      className="py-2 px-2 text-right text-xs font-medium text-[var(--ink-2)]"
                    >
                      합계
                    </td>
                    <td className="py-2 px-2 text-right text-xs font-medium font-num">
                      {totalAmount.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* 좌측 하단 합계 + 저장 */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--line-default)]">
              <div className="text-xs text-[var(--ink-3)]">
                총{' '}
                <span className="font-num font-medium text-[var(--ink)]">
                  {totalQty.toLocaleString()}
                </span>
                개 · 합계{' '}
                <span className="font-num font-medium text-[var(--ink)]">
                  {totalAmount.toLocaleString()}
                </span>
                원
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || validRows.length === 0}
                className="px-4 py-1.5 text-xs rounded bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
              >
                {isSaving ? '저장 중...' : `저장 (${validRows.length}건)`}
              </button>
            </div>
          </div>

          {/* 핸들 */}
          <div
            onMouseDown={startSplitDrag}
            style={{
              alignSelf: 'stretch',
              cursor: 'col-resize',
              position: 'relative',
              userSelect: 'none',
              minHeight: 240,
            }}
            title="드래그해서 크기 조절"
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
              }}
            />
          </div>

          {/* 우: 미리보기 */}
          <div
            className="card-surface"
            style={{
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 480,
              overflow: 'hidden',
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="미리보기"
                style={{ maxWidth: '100%', maxHeight: 600, objectFit: 'contain' }}
              />
            ) : uploadedFile ? (
              <div className="text-xs text-[var(--ink-3)] text-center px-6">
                {uploadedFile.name}
                <br />
                <span className="text-[var(--ink-4)]">
                  (이미지가 아닌 파일은 미리보기 불가)
                </span>
              </div>
            ) : (
              <div className="text-xs text-[var(--ink-3)] text-center px-6">
                이미지를 업로드하면 여기에 미리보기가 표시됩니다
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
