/**
 * 모바일 수동주문입력.
 * - 거래처 select + 날짜 input
 * - 제품 행: 제품 select + 수량 + 자동 계산 금액
 * - 하단: 합계 + 저장 (RPC insert_order 재사용, 데스크톱 OrderEntryPage 와 동일)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 * 🔴 CLAUDE.md §2: 공급가는 calcSupplyPriceByCustomerGrade.
 * 🔴 CLAUDE.md §5: 저장은 RPC mochicraft_demo.insert_order.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useCustomers } from '@/hooks/queries/useCustomers';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';
import { RefreshButton } from '../components/RefreshButton';

interface EntryRow {
  id: string;
  product_id: string;
  unit_price: number;
  quantity: number;
}

function makeRow(): EntryRow {
  return { id: crypto.randomUUID(), product_id: '', unit_price: 0, quantity: 1 };
}

function todayKstString(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function fmtWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

/**
 * 공급가 계산 — grade 미지정 시 'a' 폴백.
 * 🔴 판매가 폴백 금지 — 등급가 누락을 감춰 정가 청구 유발했음(2026-07-08).
 *    grade rate 0/null → 0 반환. handleSave 에서 검출해 저장 차단.
 */
function computeSupply(p: Product, grade: string | null | undefined): number {
  return calcSupplyPriceByCustomerGrade(p.sell_price, grade ?? 'a', p);
}

export function OrderInputPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyId } = useCompany();
  const customersQuery = useCustomers(companyId);
  const productsQuery = useProducts(companyId);
  const { data: customers = [] } = customersQuery;
  const { data: products = [] } = productsQuery;
  const refreshing = customersQuery.isFetching || productsQuery.isFetching;
  const handleRefresh = () => {
    void Promise.all([customersQuery.refetch(), productsQuery.refetch()]);
  };

  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(todayKstString());
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<EntryRow[]>(() => [makeRow()]);
  const [saving, setSaving] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  // 거래처 선택 시 기존 행 공급가 재계산.
  const applyCustomerGrade = (cid: string) => {
    setCustomerId(cid);
    const c = customers.find((x) => x.id === cid) ?? null;
    setRows((prev) =>
      prev.map((r) => {
        if (!r.product_id) return r;
        const p = products.find((x) => x.id === r.product_id);
        if (!p) return r;
        return { ...r, unit_price: computeSupply(p, c?.grade) };
      }),
    );
  };

  const applyProduct = (rowId: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, product_id: '', unit_price: 0 } : r,
        ),
      );
      return;
    }
    const unit_price = computeSupply(p, selectedCustomer?.grade);
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, product_id: p.id, unit_price } : r,
      ),
    );
  };

  const updateQty = (rowId: string, raw: string) => {
    const n = Number(raw);
    const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, quantity: safe } : r)),
    );
  };

  const addRow = () => setRows((prev) => [...prev, makeRow()]);
  const removeRow = (rowId: string) =>
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((r) => r.id !== rowId),
    );

  const validRows = useMemo(
    () => rows.filter((r) => r.product_id && r.quantity > 0),
    [rows],
  );
  const totalAmount = validRows.reduce(
    (s, r) => s + r.quantity * r.unit_price,
    0,
  );
  const totalQty = validRows.reduce((s, r) => s + r.quantity, 0);

  const canSave = Boolean(
    companyId && customerId && orderDate && validRows.length > 0 && !saving,
  );

  const handleSave = async () => {
    if (!canSave || !companyId) return;

    // 🔴 등급가 미설정 검출 — 판매가 폴백 없이 저장 차단.
    //    products.grade_a~e 가 0/null 이면 unit_price=0 이 되므로 저장 진입 전 감지.
    const effectiveGrade = (selectedCustomer?.grade ?? 'a').toUpperCase();
    const missingRows = validRows.filter((r) => r.unit_price === 0);
    if (missingRows.length > 0) {
      const list = missingRows
        .map((r) => {
          const p = products.find((x) => x.id === r.product_id);
          return `- ${p?.name ?? '(제품)'} (${p?.code ?? r.product_id})`;
        })
        .join('\n');
      alert(
        `이 제품은 [${effectiveGrade}] 등급 공급가가 설정되지 않았습니다 — 제품 관리에서 먼저 입력해주세요.\n\n${list}`,
      );
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('insert_order', {
        p_company_id: companyId,
        p_customer_id: customerId,
        p_order_date: orderDate,
        p_source: 'manual',
        p_status: 'confirmed',
        p_memo: memo || null,
        p_items: validRows.map((r) => ({
          product_id: r.product_id,
          quantity: r.quantity,
          original_quantity: null,
          unit_price: r.unit_price,
          amount: r.quantity * r.unit_price,
          is_return: false,
        })),
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({
          queryKey: ['inventory-stock', companyId],
        }),
      ]);
      navigate('/mobile/orders');
    } catch (err) {
      alert(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <header className="m-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="m-page-title">수동주문입력</h1>
          <div style={{ flex: 1 }} />
          <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
        </div>
      </header>

      <div style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
        <Field label="거래처">
          <select
            value={customerId}
            onChange={(e) => applyCustomerGrade(e.target.value)}
            style={selectStyle}
          >
            <option value="">거래처 선택</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.grade ? ` [${c.grade.toUpperCase()}]` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="주문일">
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              style={selectStyle}
            />
          </Field>
          <Field label="메모">
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="(선택)"
              style={selectStyle}
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          padding: '4px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 2px',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>제품 ({rows.length})</span>
          <button
            type="button"
            onClick={addRow}
            style={{
              border: '1px solid var(--m-border-strong)',
              background: 'transparent',
              color: 'var(--m-text)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            + 추가
          </button>
        </div>
        {rows.map((r, idx) => {
          const amount = r.quantity * r.unit_price;
          return (
            <div
              key={r.id}
              className="m-card"
              style={{
                padding: 10,
                display: 'grid',
                gridTemplateColumns: '20px 1fr 70px 30px',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span
                style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}
                className="m-num"
              >
                {idx + 1}
              </span>
              <select
                value={r.product_id}
                onChange={(e) => applyProduct(r.id, e.target.value)}
                style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }}
              >
                <option value="">제품 선택</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={r.quantity}
                onChange={(e) => updateQty(r.id, e.target.value)}
                style={{ ...selectStyle, fontSize: 12, textAlign: 'right' }}
              />
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                aria-label="행 삭제"
                style={{
                  border: 0,
                  background: 'transparent',
                  color: 'var(--m-text-secondary)',
                  cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                  fontSize: 16,
                }}
                disabled={rows.length === 1}
              >
                ✕
              </button>
              <div style={{ gridColumn: '2 / 5', textAlign: 'right' }}>
                <span
                  className="m-num"
                  style={{
                    fontSize: 12,
                    color: r.product_id
                      ? 'var(--m-primary)'
                      : 'var(--m-text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {amount > 0 ? `₩${fmtWon(amount)}` : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <footer
        style={{
          position: 'sticky',
          bottom: 0,
          padding: '12px 16px',
          background: 'var(--m-surface)',
          borderTop: '1px solid var(--m-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}>
            총 {fmtWon(totalQty)}개
          </div>
          <div
            className="m-num"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--m-text)',
            }}
          >
            ₩{fmtWon(totalAmount)}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            flex: '0 0 140px',
            height: 44,
            borderRadius: 10,
            border: 0,
            background: canSave ? 'var(--m-primary)' : 'var(--m-border-strong)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 14,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? '저장 중…' : `저장 (${validRows.length}건)`}
        </button>
      </footer>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '6px 10px',
  border: '1px solid var(--m-border-strong)',
  borderRadius: 8,
  background: 'var(--m-surface)',
  color: 'var(--m-text)',
  fontSize: 13,
  outline: 'none',
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--m-text-secondary)',
          display: 'block',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
