/**
 * 수동주문입력 페이지 — 스프레드시트 UX.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만 조달.
 * 🔴 CLAUDE.md §2: 공급가 계산은 calcSupplyPriceByGrade (utils/calculations).
 * 🔴 CLAUDE.md §5: 저장은 RPC mochicraft_demo.insert_order (orders+items 트랜잭션).
 *
 * 입력 동작:
 * - 코드/제품명 셀: input 이 셀 전체를 채움 → 자동완성 드롭다운
 * - 코드: prefix 매칭, 제품명: 부분 매칭
 * - ↓/↑/Enter/Escape 키보드 탐색
 * - Enter/Tab → 자동매칭 후 수량 셀로 포커스, 수량 Enter/Tab → 다음 행 코드로
 * - 마지막 행 입력 시 빈 행 자동 추가
 * - Ctrl+S 전역 저장
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useCustomers, type Customer } from '@/hooks/queries/useCustomers';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';

/** 거래처 grade 미설정 시 공급가 계산용 기본 등급. */
const DEFAULT_CUSTOMER_GRADE = 'a';

type OrderType = '일반주문' | '반품(정상)' | '반품(파손)';
type ColKey = 'code' | 'name' | 'qty';

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
  nameError: boolean;
}

interface FocusCell {
  rowId: string;
  col: ColKey;
}

const RECENT_KEY = 'order_entry_recent_customers';
const RECENT_LIMIT = 7;
const INITIAL_ROW_COUNT = 50;

function makeEmptyRow(isReturn = false): EntryRow {
  return {
    id: crypto.randomUUID(),
    product_id: '',
    product_code: '',
    product_name: '',
    quantity: 0,
    unit_price: 0,
    supply_price: 0,
    amount: 0,
    is_return: isReturn,
    codeError: false,
    nameError: false,
  };
}

function todayKstDateString(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

/**
 * 공급가 계산 — grade 미지정 시 DEFAULT_CUSTOMER_GRADE 폴백.
 * grade rate(`products.grade_a..e`) 가 null/0 이면 sell_price 폴백 — 매출 0원 저장 방지.
 */
function computeSupply(product: Product, grade: string | null | undefined): number {
  const supply = calcSupplyPriceByCustomerGrade(
    product.sell_price,
    grade ?? DEFAULT_CUSTOMER_GRADE,
    product,
  );
  return supply > 0 ? supply : product.sell_price;
}

export function OrderEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyId } = useCompany();

  const { data: customers = [] } = useCustomers(companyId);
  const { data: products = [] } = useProducts(companyId);
  // 🟠 저장 시점 재고 자동조정용 — Map<product_id, ProductStockInfo>.
  const { data: stockSummary } = useInventoryStock(companyId);

  // ───── 헤더 ─────
  const [orderType, setOrderType] = useState<OrderType>('일반주문');
  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState<string>(todayKstDateString());
  const [memo, setMemo] = useState('');
  const [recentCustomerIds, setRecentCustomerIds] = useState<string[]>(() =>
    readRecent(),
  );

  // ───── 행/포커스 ─────
  const [rows, setRows] = useState<EntryRow[]>(() =>
    Array.from({ length: INITIAL_ROW_COUNT }, () => makeEmptyRow(false)),
  );
  const [focusCell, setFocusCell] = useState<FocusCell | null>(null);
  const [codeQuery, setCodeQuery] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [fixedCols, setFixedCols] = useState(false);

  // ───── 파일 업로드 ─────
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ───── 저장 ─────
  const [isSaving, setIsSaving] = useState(false);

  // ───── refs ─────
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const selectedCustomer: Customer | null =
    customers.find((c) => c.id === customerId) ?? null;
  const isReturnMode = orderType !== '일반주문';

  // ───── 미리보기 cleanup ─────
  useEffect(() => {
    if (!uploadedFile || !uploadedFile.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile]);

  // ───── 자동완성 ─────
  const codeSuggestions = useMemo(() => {
    if (codeQuery.length < 1) return [];
    const q = codeQuery.toUpperCase();
    return products.filter((p) => p.code.toUpperCase().startsWith(q)).slice(0, 8);
  }, [codeQuery, products]);

  const nameSuggestions = useMemo(() => {
    if (nameQuery.length < 1) return [];
    return products.filter((p) => p.name.includes(nameQuery)).slice(0, 8);
  }, [nameQuery, products]);

  const suggestions: Product[] =
    focusCell?.col === 'code' ? codeSuggestions : nameSuggestions;

  // 외부 클릭 시 드롭다운 닫기.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (suggestionsRef.current?.contains(target)) return;
      if (
        Object.values(inputRefs.current).some(
          (el) => el && el.contains && el.contains(target),
        )
      ) {
        return;
      }
      setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // ───── 드롭다운 위치 ─────
  const updateDropdownPos = useCallback((el: HTMLInputElement) => {
    const inputRect = el.getBoundingClientRect();
    const tableRect = tableRef.current?.getBoundingClientRect();
    if (!tableRect) return;
    setDropdownPos({
      top: inputRect.bottom - tableRect.top + 2,
      left: inputRect.left - tableRect.left,
    });
  }, []);

  // ───── 제품 적용 ─────
  const applyProduct = useCallback(
    (rowId: string, product: Product) => {
      // 🔴 grade 미설정 시 'a' 폴백으로 0원 출력 방지.
      const supplyPrice = computeSupply(product, selectedCustomer?.grade);

      setRows((prev) => {
        const updated = prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                product_id: product.id,
                product_code: product.code,
                product_name: product.name,
                unit_price: product.sell_price,
                supply_price: supplyPrice,
                amount: r.quantity * supplyPrice,
                is_return: isReturnMode,
                codeError: false,
                nameError: false,
              }
            : r,
        );
        // 마지막 행이 채워졌으면 빈 행 추가.
        if (updated[updated.length - 1].id === rowId) {
          updated.push(makeEmptyRow(isReturnMode));
        }
        return updated;
      });

      setShowSuggestions(false);
      setCodeQuery('');
      setNameQuery('');

      setTimeout(() => {
        const ref = inputRefs.current[`${rowId}-qty`];
        if (ref) {
          ref.focus();
          ref.select();
        }
      }, 30);
    },
    [selectedCustomer, isReturnMode],
  );

  // ───── 키다운: 코드 ─────
  const handleCodeKeyDown = (
    rowId: string,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const val = (e.target as HTMLInputElement).value.trim();

    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      suggestionRefs.current[0]?.focus();
      return;
    }

    if (e.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const exact = products.find((p) => p.code.toUpperCase() === val.toUpperCase());
      if (exact) {
        applyProduct(rowId, exact);
        return;
      }
      const matches = products.filter((p) =>
        p.code.toUpperCase().startsWith(val.toUpperCase()),
      );
      if (matches.length === 1) {
        applyProduct(rowId, matches[0]);
        return;
      }
      if (val) {
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, codeError: true } : r)),
        );
      }
      if (e.key === 'Tab') {
        setTimeout(() => inputRefs.current[`${rowId}-name`]?.focus(), 30);
      }
    }
  };

  // ───── 키다운: 제품명 ─────
  const handleNameKeyDown = (
    rowId: string,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      suggestionRefs.current[0]?.focus();
      return;
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      const exact = products.find((p) => p.name === val);
      if (exact) {
        applyProduct(rowId, exact);
        return;
      }
      const matches = products.filter((p) => p.name.includes(val));
      if (matches.length === 1) {
        applyProduct(rowId, matches[0]);
        return;
      }
      setTimeout(() => {
        const ref = inputRefs.current[`${rowId}-qty`];
        if (ref) {
          ref.focus();
          ref.select();
        }
      }, 30);
    }
  };

  // ───── 키다운: 수량 ─────
  const handleQtyKeyDown = (
    rowId: string,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const current = rowsRef.current;
      const idx = current.findIndex((r) => r.id === rowId);
      let nextRow = current[idx + 1];
      if (!nextRow) {
        const empty = makeEmptyRow(isReturnMode);
        setRows((prev) => [...prev, empty]);
        nextRow = empty;
      }
      setTimeout(() => inputRefs.current[`${nextRow.id}-code`]?.focus(), 30);
    }
  };

  // ───── 행 삭제 ─────
  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== rowId);
      if (filtered.length === 0 || filtered.every((r) => r.product_id)) {
        filtered.push(makeEmptyRow(isReturnMode));
      }
      return filtered;
    });
  };

  // ───── 초기화 ─────
  const handleReset = () => {
    setCustomerId('');
    setOrderDate(todayKstDateString());
    setOrderType('일반주문');
    setMemo('');
    setRows(Array.from({ length: INITIAL_ROW_COUNT }, () => makeEmptyRow(false)));
    setUploadedFile(null);
    setShowSuggestions(false);
    setCodeQuery('');
    setNameQuery('');
  };

  // ───── 주문구분 변경 → is_return 일괄 토글 ─────
  const handleOrderTypeChange = (next: OrderType) => {
    setOrderType(next);
    const isRet = next !== '일반주문';
    setRows((prev) => prev.map((r) => ({ ...r, is_return: isRet })));
  };

  // ───── 거래처 변경 → 공급가 일괄 재계산 ─────
  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    const next = customers.find((c) => c.id === id) ?? null;
    setRows((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        const p = products.find((x) => x.id === r.product_id);
        if (!p) return r;
        return { ...r, supply_price: computeSupply(p, next?.grade) };
      }),
    );
  };

  // ───── 파일/엑셀 ─────
  const handleFileChange = async (file: File) => {
    setUploadedFile(file);

    if (file.name.match(/\.(xlsx|xls)$/i)) {
      try {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const parsed: EntryRow[] = [];

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
          });

          let dataStart = 4;
          let codeCol = 1;
          let qtyCol = 2;
          let nameCol = 0;

          for (let i = 0; i < Math.min(8, raw.length); i++) {
            const row = raw[i] ?? [];
            if (row.some((c) => String(c ?? '').includes('코드'))) {
              dataStart = i + 1;
              row.forEach((c, ci) => {
                const s = String(c ?? '');
                if (s.includes('코드')) codeCol = ci;
                if (s.includes('수량')) qtyCol = ci;
                if (s.includes('제품명') || s.includes('품명')) nameCol = ci;
              });
              break;
            }
          }

          for (let i = dataStart; i < raw.length; i++) {
            const row = raw[i];
            if (!row) continue;
            const code = String(row[codeCol] ?? '').trim();
            const qtyRaw = row[qtyCol];
            const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw);
            if (!code || !Number.isFinite(qty) || qty <= 0) continue;

            const product =
              products.find(
                (p) => p.code.toUpperCase() === code.toUpperCase(),
              ) ?? null;

            parsed.push({
              id: crypto.randomUUID(),
              product_id: product?.id ?? '',
              product_code: product?.code ?? code,
              product_name: product?.name ?? String(row[nameCol] ?? '').trim(),
              quantity: qty,
              unit_price: product?.sell_price ?? 0,
              supply_price: product
                ? computeSupply(product, selectedCustomer?.grade)
                : 0,
              amount: product ? qty * product.sell_price : 0,
              is_return: isReturnMode,
              codeError: !product,
              nameError: false,
            });
          }
        }

        if (parsed.length > 0) {
          setRows([
            ...parsed,
            ...Array.from({ length: 5 }, () => makeEmptyRow(isReturnMode)),
          ]);
          const matched = parsed.filter((r) => r.product_id).length;
          if (parsed.length - matched > 0) {
            alert(
              `엑셀 파싱 완료: 총 ${parsed.length}건 중 ${matched}건 매칭, ${parsed.length - matched}건 미매칭(빨간 테두리).`,
            );
          }
        } else {
          alert(
            '주문 데이터를 찾을 수 없습니다. 수량이 입력된 행이 없거나 형식이 다릅니다.',
          );
        }
      } catch (err) {
        console.error('엑셀 파싱 실패:', err);
        alert('엑셀 파일을 읽을 수 없습니다.');
      }
    }
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
    const valid = rowsRef.current.filter(
      (r) => r.product_id && r.quantity > 0,
    );
    if (valid.length === 0) {
      alert('주문 항목을 1개 이상 입력해주세요.');
      return;
    }

    // 🔴 자동 재고조정 — 비반품 행에 대해 quantity > stock 이면 축소,
    //    원래 수량을 original_quantity 로 RPC 에 전달. 누적 메시지 후 알림.
    const stockByProduct = stockSummary?.stockByProduct;
    const shortageMsgs: string[] = [];
    const adjusted = valid.map((r) => {
      if (r.is_return) {
        return { row: r, finalQty: r.quantity, originalQty: null as number | null };
      }
      const stock = stockByProduct?.get(r.product_id)?.current ?? 0;
      if (r.quantity > stock) {
        const finalQty = Math.max(0, stock);
        shortageMsgs.push(
          `[${r.product_name}] ${r.quantity}개 주문 → 재고 ${stock}개 (${finalQty}개로 조정)`,
        );
        return { row: r, finalQty, originalQty: r.quantity };
      }
      return { row: r, finalQty: r.quantity, originalQty: null };
    });
    // 🔴 결품(finalQty=0) 행도 INSERT — OrderDetailPane 정책과 통일.
    //    거래명세서에 `0 ~~원본수량~~` 형태로 표시되어 거래처에 결품 통지 가능.
    const itemsForRpc = adjusted;

    // 🟠 저장 직전 방어용 공급가 재계산 — applyProduct/Excel 파싱에서 누락된 경우 대비.
    //    computeSupply 단일 진입점 사용 (grade 폴백 + sell_price 폴백 내장).
    const productById = new Map(products.map((p) => [p.id, p]));
    const finalItems = itemsForRpc.map((a) => {
      const product = productById.get(a.row.product_id);
      if (!product) return a;
      const effective = computeSupply(product, selectedCustomer?.grade);
      return { ...a, row: { ...a.row, unit_price: effective } };
    });

    setIsSaving(true);
    try {
      const { data, error } = await supabase.rpc('insert_order', {
        p_company_id: companyId,
        p_customer_id: customerId,
        p_order_date: orderDate,
        p_source: 'manual',
        p_status: 'confirmed',
        p_memo: memo || null,
        p_items: finalItems.map((a) => ({
          product_id: a.row.product_id,
          quantity: a.row.is_return ? -Math.abs(a.finalQty) : a.finalQty,
          original_quantity: a.originalQty,
          unit_price: a.row.unit_price,
          amount:
            (a.row.is_return ? -1 : 1) * Math.abs(a.finalQty) * a.row.unit_price,
          is_return: a.row.is_return,
        })),
      });
      if (error) throw error;

      setRecentCustomerIds(writeRecent(customerId));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock', companyId] }),
      ]);

      if (shortageMsgs.length > 0) {
        alert(
          '재고 부족으로 아래 품목의 수량이 자동 조정되었습니다:\n\n' +
            shortageMsgs.join('\n'),
        );
      }
      navigate('/sales/orders', { state: { selectedOrderId: data } });
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [
    companyId,
    customerId,
    orderDate,
    memo,
    queryClient,
    navigate,
    stockSummary,
    products,
    selectedCustomer,
  ]);

  // ───── Ctrl+S 전역 단축키 ─────
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ───── 렌더 ─────
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ===== 좌측: 입력 영역 ===== */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-[var(--line-default)] overflow-hidden">
        {/* 상단 안내바 */}
        <div className="px-4 py-2 border-b border-[var(--line-default)] text-xs text-[var(--ink-3)] bg-[var(--surface-2)] shrink-0">
          Tab/Enter로 이동 · Ctrl+S 저장
        </div>

      {/* 헤더 폼 */}
      <div className="px-4 py-3 border-b border-[var(--line-default)] space-y-2">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-xs text-[var(--ink-3)] mb-1">주문구분</div>
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

          <div className="flex-1 min-w-40">
            <div className="text-xs text-[var(--ink-3)] mb-1">
              거래처
              {selectedCustomer?.grade && (
                <span className="ml-1 text-[var(--ink-3)]">
                  (등급 {selectedCustomer.grade})
                </span>
              )}
            </div>
            <select
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full border border-[var(--line-strong)] rounded px-2 py-1.5 text-sm bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
            >
              <option value="">거래처 선택</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.grade ? ` [${c.grade}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-[var(--ink-3)] mb-1">날짜</div>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="border border-[var(--line-strong)] rounded px-2 py-1.5 text-sm bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          <div className="flex-1 min-w-32">
            <div className="text-xs text-[var(--ink-3)] mb-1">메모</div>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모"
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
        </div>

        {recentCustomerIds.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-xs text-[var(--ink-3)]">최근:</span>
            {recentCustomerIds.map((id) => {
              const c = customers.find((x) => x.id === id);
              if (!c) return null;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => handleCustomerChange(id)}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    customerId === id
                      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                      : 'border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 테이블 영역 */}
      <div className="flex-1 overflow-auto px-4 pt-2">
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setFixedCols((v) => !v)}
            className={`px-3 py-1.5 text-xs border rounded transition-colors ${
              fixedCols
                ? 'bg-[var(--brand-wash)] border-[var(--brand)] text-[var(--brand)]'
                : 'border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
            }`}
          >
            컬럼간격고정 {fixedCols ? 'ON' : ''}
          </button>
          <button
            type="button"
            onClick={() => setFixedCols(false)}
            className="px-3 py-1.5 text-xs border border-[var(--line-strong)] rounded text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            컬럼간격초기화
          </button>
        </div>

        <div
          ref={tableRef}
          className="relative border border-[var(--line-default)] rounded-lg overflow-hidden"
        >
          {/* thead — 고정 */}
          <table className="w-full border-collapse text-sm table-fixed">
            <colgroup>
              <col style={{ width: '36px' }} />
              <col style={{ width: fixedCols ? '130px' : '15%' }} />
              <col />
              <col style={{ width: fixedCols ? '80px' : '10%' }} />
              <col style={{ width: fixedCols ? '90px' : '11%' }} />
              <col style={{ width: fixedCols ? '90px' : '11%' }} />
              <col style={{ width: fixedCols ? '100px' : '12%' }} />
              <col style={{ width: '32px' }} />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-[var(--line-strong)] bg-[var(--surface-2)]">
                {(
                  ['#', '코드', '제품명', '수량', '판매가', '공급가', '합계', ''] as const
                ).map((h, i) => (
                  <th
                    key={i}
                    className="py-2 px-2 text-left text-xs font-medium text-[var(--ink-3)] border-r border-[var(--line-subtle)] last:border-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          </table>

          {/* tbody — 10행 고정 높이 스크롤 */}
          <div
            style={{ height: '360px' }}
            className="overflow-y-auto overflow-x-hidden"
          >
            <table className="w-full border-collapse text-sm table-fixed">
              <colgroup>
                <col style={{ width: '36px' }} />
                <col style={{ width: fixedCols ? '130px' : '15%' }} />
                <col />
                <col style={{ width: fixedCols ? '80px' : '10%' }} />
                <col style={{ width: fixedCols ? '90px' : '11%' }} />
                <col style={{ width: fixedCols ? '90px' : '11%' }} />
                <col style={{ width: fixedCols ? '100px' : '12%' }} />
                <col style={{ width: '32px' }} />
              </colgroup>
              <tbody>
                {rows.map((row, idx) => {
                  const isFocused = focusCell?.rowId === row.id;
                  return (
                    <tr
                      key={row.id}
                      style={{ height: '36px' }}
                      className={`border-b border-[var(--line-subtle)] ${
                        isFocused
                          ? 'bg-[var(--brand-wash)]'
                          : 'hover:bg-[var(--surface-2)]'
                      } ${row.is_return && row.product_id ? 'text-red-500' : ''}`}
                    >
                      <td className="px-2 text-center text-xs text-[var(--ink-3)] border-r border-[var(--line-subtle)]">
                        {idx + 1}
                      </td>
                      {/* 코드 */}
                      <td className="px-0 border-r border-[var(--line-subtle)]">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${row.id}-code`] = el;
                          }}
                          value={row.product_code}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      product_code: v,
                                      product_id: '',
                                      codeError: false,
                                    }
                                  : r,
                              ),
                            );
                            setCodeQuery(v);
                            setNameQuery('');
                            setFocusCell({ rowId: row.id, col: 'code' });
                            setShowSuggestions(v.length > 0);
                            updateDropdownPos(e.target);
                          }}
                          onFocus={(e) => {
                            setFocusCell({ rowId: row.id, col: 'code' });
                            if (row.product_code) {
                              setCodeQuery(row.product_code);
                              setShowSuggestions(true);
                              updateDropdownPos(e.target);
                            }
                          }}
                          onKeyDown={(e) => handleCodeKeyDown(row.id, e)}
                          placeholder="코드"
                          className={`w-full h-9 px-2 text-xs bg-transparent outline-none ${
                            row.codeError ? 'text-red-500' : 'text-[var(--ink)]'
                          } focus:bg-[var(--brand-wash)]`}
                        />
                      </td>
                      {/* 제품명 */}
                      <td className="px-0 border-r border-[var(--line-subtle)]">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${row.id}-name`] = el;
                          }}
                          value={row.product_name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      product_name: v,
                                      product_id: '',
                                      nameError: false,
                                    }
                                  : r,
                              ),
                            );
                            setNameQuery(v);
                            setCodeQuery('');
                            setFocusCell({ rowId: row.id, col: 'name' });
                            setShowSuggestions(v.length > 0);
                            updateDropdownPos(e.target);
                          }}
                          onFocus={(e) => {
                            setFocusCell({ rowId: row.id, col: 'name' });
                            if (row.product_name) {
                              setNameQuery(row.product_name);
                              setShowSuggestions(true);
                              updateDropdownPos(e.target);
                            }
                          }}
                          onKeyDown={(e) => handleNameKeyDown(row.id, e)}
                          placeholder="제품명 검색"
                          className="w-full h-9 px-2 text-xs bg-transparent outline-none text-[var(--ink)] focus:bg-[var(--brand-wash)]"
                        />
                      </td>
                      {/* 수량 */}
                      <td className="px-0 border-r border-[var(--line-subtle)]">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${row.id}-qty`] = el;
                          }}
                          type="number"
                          min={0}
                          value={row.quantity === 0 ? '' : row.quantity}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const qty = raw === '' ? 0 : Number(raw);
                            const safe =
                              Number.isFinite(qty) && qty >= 0 ? qty : 0;
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      quantity: safe,
                                      amount: safe * r.supply_price,
                                    }
                                  : r,
                              ),
                            );
                          }}
                          onFocus={() =>
                            setFocusCell({ rowId: row.id, col: 'qty' })
                          }
                          onKeyDown={(e) => handleQtyKeyDown(row.id, e)}
                          className="w-full h-9 px-2 text-xs text-right bg-transparent outline-none text-[var(--ink)] focus:bg-[var(--brand-wash)]"
                          placeholder=""
                        />
                      </td>
                      {/* 판매가 */}
                      <td className="px-2 text-right text-xs font-num text-[var(--ink-2)] border-r border-[var(--line-subtle)]">
                        {row.unit_price ? (
                          row.unit_price.toLocaleString()
                        ) : (
                          <span className="text-[var(--ink-3)]">—</span>
                        )}
                      </td>
                      {/* 공급가 */}
                      <td className="px-2 text-right text-xs font-num text-[var(--ink-2)] border-r border-[var(--line-subtle)]">
                        {row.supply_price ? (
                          row.supply_price.toLocaleString()
                        ) : (
                          <span className="text-[var(--ink-3)]">—</span>
                        )}
                      </td>
                      {/* 합계 */}
                      <td className="px-2 text-right text-xs font-num font-medium border-r border-[var(--line-subtle)]">
                        {row.amount ? (
                          row.amount.toLocaleString()
                        ) : (
                          <span className="text-[var(--ink-3)]">—</span>
                        )}
                      </td>
                      {/* 삭제 */}
                      <td className="px-1 text-center">
                        {row.product_id && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-[var(--ink-3)] hover:text-red-500 text-xs leading-none"
                            title="행 삭제"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 자동완성 드롭다운 */}
          {showSuggestions && suggestions.length > 0 && focusCell && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 bg-[var(--surface)] border border-[var(--line-strong)] rounded-md shadow-xl overflow-hidden"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                minWidth: '320px',
                maxHeight: '240px',
                overflowY: 'auto',
              }}
            >
              {suggestions.map((product, idx) => (
                <button
                  type="button"
                  key={product.id}
                  ref={(el) => {
                    suggestionRefs.current[idx] = el;
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--brand-wash)] flex items-center gap-3 border-b border-[var(--line-subtle)] last:border-0 focus:outline-none focus:bg-[var(--brand-wash)]"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyProduct(focusCell.rowId, product);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      suggestionRefs.current[idx + 1]?.focus();
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (idx === 0) {
                        inputRefs.current[
                          `${focusCell.rowId}-${focusCell.col}`
                        ]?.focus();
                      } else {
                        suggestionRefs.current[idx - 1]?.focus();
                      }
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyProduct(focusCell.rowId, product);
                    }
                    if (e.key === 'Escape') {
                      setShowSuggestions(false);
                      inputRefs.current[
                        `${focusCell.rowId}-${focusCell.col}`
                      ]?.focus();
                    }
                  }}
                >
                  <span className="font-mono text-[var(--ink-3)] shrink-0 w-24">
                    {product.code}
                  </span>
                  <span className="text-[var(--ink)] flex-1 truncate">
                    {product.name}
                  </span>
                  <span className="font-num text-[var(--ink-3)] shrink-0">
                    {product.sell_price.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 하단 바 */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--line-default)] bg-[var(--surface)] shrink-0">
        <div className="text-sm text-[var(--ink-3)]">
          총{' '}
          <span className="font-medium text-[var(--ink)] font-num">
            {totalQty.toLocaleString()}
          </span>
          개 · 합계{' '}
          <span className="font-medium text-[var(--ink)] font-num">
            {totalAmount.toLocaleString()}
          </span>
          원
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || validRows.length === 0}
          className="px-5 py-2 text-sm font-medium rounded bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isSaving ? '저장 중...' : `저장 (${validRows.length}건)`}
        </button>
      </div>
      </div>

      {/* ===== 우측: 미리보기 영역 ===== */}
      <div className="w-[420px] shrink-0 flex flex-col bg-[var(--surface-2)]">
        {previewUrl ? (
          <div className="flex-1 relative overflow-hidden">
            <img
              src={previewUrl}
              alt="주문서 미리보기"
              className="absolute inset-0 w-full h-full object-contain p-2"
            />
            <button
              type="button"
              onClick={() => {
                setUploadedFile(null);
                fileInputRef.current?.click();
              }}
              className="absolute top-3 right-3 px-2 py-1 text-xs bg-black/50 text-white rounded hover:bg-black/70 transition-colors"
            >
              파일 교체
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFileChange(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer border-2 border-dashed border-[var(--line-strong)] m-4 rounded-xl hover:border-[var(--brand)] hover:bg-[var(--brand-wash)] transition-colors"
          >
            <span className="text-4xl">📎</span>
            <div className="text-center">
              <div className="text-sm font-medium text-[var(--ink-2)]">클릭 또는 드래그</div>
              <div className="text-xs text-[var(--ink-3)] mt-1">사진 / PDF / 엑셀</div>
            </div>
            <div className="text-xs text-[var(--ink-3)] text-center px-6">
              엑셀 업로드 시 주문 항목 자동 파싱
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.jpg,.jpeg,.png,.pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileChange(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
