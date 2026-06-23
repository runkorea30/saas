/**
 * 수동주문입력 페이지 — 판매 > 수동주문입력.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만 조달.
 * 🔴 CLAUDE.md §2: 공급가 계산은 calcSupplyPriceByGrade (utils/calculations).
 * 🔴 CLAUDE.md §5: 저장은 RPC mochicraft_demo.insert_order (orders+items 트랜잭션 보장).
 *
 * 입력 UX: 코드 input → Enter → 제품 매칭 → 수량 input 으로 포커스 이동.
 * 마지막 행에 항상 빈 입력 행이 유지된다.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useCustomers } from '@/hooks/queries/useCustomers';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { calcSupplyPriceByGrade } from '@/utils/calculations';

type OrderType = '일반' | '반품';

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
  /** 코드 매칭 실패 시 빨간 테두리 표시. */
  codeError?: boolean;
}

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
  };
}

function todayKstDateString(): string {
  // KST(UTC+9) 기준 YYYY-MM-DD.
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

export function OrderEntryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyId } = useCompany();

  const { data: customers = [] } = useCustomers(companyId);
  const { data: products = [] } = useProducts(companyId);

  const [orderType, setOrderType] = useState<OrderType>('일반');
  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState<string>(todayKstDateString());
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<EntryRow[]>(() => [createEmptyRow(false)]);
  const [isSaving, setIsSaving] = useState(false);

  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const codeRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  // 거래처 등급에 따른 공급가 재계산 헬퍼.
  const computeSupplyPrice = useCallback(
    (product: Product): number => {
      const gradeKey = `grade_${(selectedCustomer?.grade ?? '').toLowerCase()}` as
        | 'grade_a'
        | 'grade_b'
        | 'grade_c'
        | 'grade_d'
        | 'grade_e';
      const rate =
        gradeKey in product ? ((product[gradeKey] as number | undefined) ?? 0) : 0;
      return calcSupplyPriceByGrade(product.sell_price, rate);
    },
    [selectedCustomer?.grade],
  );

  const handleReset = () => {
    setCustomerId('');
    setOrderDate(todayKstDateString());
    setMemo('');
    setOrderType('일반');
    setRows([createEmptyRow(false)]);
  };

  // 주문구분 변경 시 모든 행의 is_return 일괄 토글.
  const handleOrderTypeChange = (next: OrderType) => {
    setOrderType(next);
    setRows((prev) =>
      prev.map((r) => ({ ...r, is_return: next === '반품' })),
    );
  };

  // 거래처 변경 시 입력된 행들의 공급가 재계산.
  const handleCustomerChange = (nextId: string) => {
    setCustomerId(nextId);
    setRows((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        const p = products.find((x) => x.id === r.product_id);
        if (!p) return r;
        const customer = customers.find((c) => c.id === nextId) ?? null;
        const gradeKey = `grade_${(customer?.grade ?? '').toLowerCase()}` as
          | 'grade_a'
          | 'grade_b'
          | 'grade_c'
          | 'grade_d'
          | 'grade_e';
        const rate =
          gradeKey in p ? ((p[gradeKey] as number | undefined) ?? 0) : 0;
        return {
          ...r,
          supply_price: calcSupplyPriceByGrade(p.sell_price, rate),
        };
      }),
    );
  };

  const addEmptyRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow(orderType === '반품')]);
  }, [orderType]);

  const handleCodeInput = (rowId: string, code: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, product_code: code, codeError: false } : r,
      ),
    );
  };

  const handleCodeEnter = (rowId: string, code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    const exact = products.find((p) => p.code.toUpperCase() === trimmed);
    const product =
      exact ?? products.find((p) => p.code.toUpperCase().startsWith(trimmed));

    if (!product) {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, codeError: true } : r)),
      );
      return;
    }

    const supplyPrice = computeSupplyPrice(product);

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
              is_return: orderType === '반품',
              codeError: false,
            }
          : r,
      );
      const hasEmpty = next.some((r) => !r.product_id);
      if (!hasEmpty) {
        next.push(createEmptyRow(orderType === '반품'));
      }
      return next;
    });

    setTimeout(() => qtyRefs.current[rowId]?.focus(), 50);
  };

  const handleQtyChange = (rowId: string, qty: number) => {
    const safeQty = Number.isFinite(qty) && qty >= 0 ? qty : 0;
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, quantity: safeQty, amount: safeQty * r.unit_price }
          : r,
      ),
    );
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== rowId);
      // 항상 마지막에 빈 행 1개는 유지.
      if (filtered.length === 0 || filtered.every((r) => r.product_id)) {
        filtered.push(createEmptyRow(orderType === '반품'));
      }
      return filtered;
    });
  };

  const validRows = useMemo(
    () => rows.filter((r) => r.product_id && r.quantity > 0),
    [rows],
  );

  const totalQty = validRows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0);

  const handleSave = async () => {
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
    if (validRows.length === 0) {
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
        p_items: validRows.map((r) => ({
          product_id: r.product_id,
          quantity: r.is_return ? -Math.abs(r.quantity) : r.quantity,
          unit_price: r.unit_price,
          amount: r.is_return ? -Math.abs(r.amount) : r.amount,
          is_return: r.is_return,
        })),
      });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate('/sales/orders', { state: { selectedOrderId: data } });
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
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
            style={{
              fontSize: 26,
              fontWeight: 500,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            수동주문입력
          </h1>
        </header>

        <div className="card-surface" style={{ padding: 20 }}>
          {/* 상단 폼 */}
          <div className="flex flex-wrap gap-4 items-end mb-4">
            <div>
              <label className="text-xs text-[var(--ink-3)] mb-1 block">주문구분</label>
              <div className="flex gap-1">
                {(['일반', '반품'] as OrderType[]).map((t) => (
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

            <div className="flex-1 min-w-48">
              <label className="text-xs text-[var(--ink-3)] mb-1 block">
                거래처 {selectedCustomer?.grade && (
                  <span className="ml-1 text-[var(--ink-3)]">
                    (등급 {selectedCustomer.grade})
                  </span>
                )}
              </label>
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
              <label className="text-xs text-[var(--ink-3)] mb-1 block">날짜</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="border border-[var(--line-strong)] rounded px-2 py-1.5 text-sm bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>

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
          </div>

          {/* 행 입력 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--line-default)]">
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)] w-8">#</th>
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)] w-28">코드</th>
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)]">제품명</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-16">수량</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-24">판매가</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-24">공급가</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-24">합계</th>
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
                    <td className="py-1.5 px-2 text-[var(--ink-3)] font-num">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 px-2">
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
                            handleCodeEnter(row.id, row.product_code);
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
                    <td className="py-1.5 px-2">{row.product_name || '—'}</td>
                    <td className="py-1.5 px-2 text-right">
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
                        className="w-14 text-right border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right font-num">
                      {row.unit_price ? row.unit_price.toLocaleString() : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-num">
                      {row.supply_price ? row.supply_price.toLocaleString() : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-num font-medium">
                      {row.amount ? row.amount.toLocaleString() : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {row.product_id && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="text-[var(--ink-3)] hover:text-red-500 transition-colors"
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
                <tr className="border-t-2 border-[var(--line-strong)]">
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

          {/* 하단 합계 + 저장 */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--line-default)] mt-3">
            <div className="flex gap-6 text-sm">
              <span className="text-[var(--ink-3)]">
                총{' '}
                <span className="font-medium text-[var(--ink)] font-num">
                  {totalQty.toLocaleString()}
                </span>
                개
              </span>
              <span className="text-[var(--ink-3)]">
                합계{' '}
                <span className="font-medium text-[var(--ink)] font-num">
                  {totalAmount.toLocaleString()}
                </span>
                원
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm border border-[var(--line-strong)] rounded text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || validRows.length === 0}
                className="px-4 py-2 text-sm rounded bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
              >
                {isSaving ? '저장 중...' : `저장 (${validRows.length}건)`}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
