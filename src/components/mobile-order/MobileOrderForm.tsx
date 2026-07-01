/**
 * 파트너 모바일 주문 - Mode B: 직접 입력.
 *
 * 제품 목록/재고 조회 → 사용자가 수량 선택 → insert_order RPC 로 draft 주문 생성.
 *
 * 🟠 판매금액 = quantity × 공급가 (부가세 포함, 기존 관례와 동일).
 * 🟠 insert_order RPC 는 total_amount 를 items 의 amount 합계로 자동 계산.
 * 🟠 데이터 로딩은 useQuery. 재고 맵과 상품 목록을 병렬로 확보.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  calcCurrentStockByProduct,
  calcSupplyPriceByCustomerGrade,
} from '@/utils/calculations';
import type { MobileSession } from '@/lib/mobileOrderAuth';
import type { Json } from '@/types/database';
import {
  MobileOrderProductList,
  type ProductForList,
} from './MobileOrderProductList';

interface Props {
  session: MobileSession;
  onSubmitted?: (orderId: string) => void;
}

interface SelectedSummary {
  productId: string;
  name: string;
  quantity: number;
  supplyPrice: number;
  amount: number;
}

export function MobileOrderForm({ session, onSubmitted }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);

  // 제품 목록 (활성만)
  const productsQuery = useQuery({
    queryKey: ['mo', 'products', session.companyId],
    queryFn: async (): Promise<ProductForList[]> => {
      const rows = await fetchAllRows<ProductForList>(() =>
        supabase
          .from('products')
          .select(
            'id, code, name, category, sell_price, supply_price, safety_stock, grade_a, grade_b, grade_c, grade_d, grade_e',
          )
          .eq('company_id', session.companyId)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('category', { ascending: true })
          .order('name', { ascending: true }),
      );
      return rows;
    },
    staleTime: 60_000,
  });

  // 재고 맵 (product_id → current stock)
  const stockQuery = useQuery({
    queryKey: ['mo', 'stock', session.companyId],
    queryFn: async (): Promise<Map<string, number>> => {
      const info = await calcCurrentStockByProduct(session.companyId);
      const flat = new Map<string, number>();
      for (const [pid, v] of info.entries()) flat.set(pid, v.current);
      return flat;
    },
    staleTime: 30_000,
  });

  const products = productsQuery.data ?? [];
  const stockMap = stockQuery.data ?? new Map<string, number>();
  const loading = productsQuery.isLoading || stockQuery.isLoading;

  // 선택 항목 요약 — quantities > 0 인 것만.
  const selected: SelectedSummary[] = useMemo(() => {
    const out: SelectedSummary[] = [];
    for (const p of products) {
      const qty = quantities[p.id] ?? 0;
      if (qty <= 0) continue;
      const supplyPrice = calcSupplyPriceByCustomerGrade(
        p.sell_price,
        session.grade,
        p,
      );
      out.push({
        productId: p.id,
        name: p.name,
        quantity: qty,
        supplyPrice,
        amount: qty * supplyPrice,
      });
    }
    return out;
  }, [products, quantities, session.grade]);

  const totalQty = selected.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = selected.reduce((s, r) => s + r.amount, 0);

  const handleChangeQty = (productId: string, quantity: number): void => {
    setError(null);
    setSuccessOrderId(null);
    setQuantities((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });
  };

  const handleReset = (): void => {
    setQuantities({});
    setMemo('');
    setError(null);
    setSuccessOrderId(null);
  };

  const handleSubmit = async (): Promise<void> => {
    if (submitting || selected.length === 0) return;
    setError(null);
    setSuccessOrderId(null);
    setSubmitting(true);

    try {
      // p_items 는 RPC 상 jsonb — 재귀 Json 타입 매칭이 어려워 명시적 캐스팅.
      const items: Json = selected.map((s) => ({
        product_id: s.productId,
        quantity: s.quantity,
        unit_price: s.supplyPrice,
        amount: s.amount,
      })) as unknown as Json;

      const { data, error: rpcErr } = await supabase.rpc('insert_order', {
        p_company_id: session.companyId,
        p_customer_id: session.customerId,
        p_order_date: new Date().toISOString(),
        p_source: 'mobile',
        // 🔴 4단계 상태 체계 (2026-07 개편): 파트너 시스템 접수는 'received'.
        //    OPS 에서 주문 확인 시 'confirmed' 로 전환.
        p_status: 'received',
        p_memo: memo.trim() || null,
        p_items: items,
      });
      if (rpcErr || !data) {
        // eslint-disable-next-line no-console
        console.error('[mo.form.insert_order]', rpcErr);
        throw new Error('주문 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }

      const newOrderId = String(data);
      setSuccessOrderId(newOrderId);
      setQuantities({});
      setMemo('');
      onSubmitted?.(newOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주문 접수 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mo-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
        <Loader2 size={20} className="mo-spin" style={{ color: 'var(--mo-text-secondary)' }} />
        <div style={{ marginTop: 12, color: 'var(--mo-text-secondary)', fontSize: 13 }}>
          품목 정보를 불러오는 중…
        </div>
      </div>
    );
  }

  if (productsQuery.error || stockQuery.error) {
    return (
      <div className="mo-card">
        <div className="mo-error" role="alert">
          품목 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.
        </div>
        <button
          type="button"
          className="mo-btn-secondary"
          style={{ marginTop: 12 }}
          onClick={() => {
            productsQuery.refetch();
            stockQuery.refetch();
          }}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div>
      <MobileOrderProductList
        products={products}
        stockMap={stockMap}
        grade={session.grade}
        quantities={quantities}
        onChangeQuantity={handleChangeQty}
        calcSupply={calcSupplyPriceByCustomerGrade}
      />

      {/* 선택 요약 */}
      {selected.length > 0 ? (
        <div className="mo-card" style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>선택 {selected.length}종 · {totalQty}개</span>
            <span>₩{totalAmount.toLocaleString('ko-KR')}</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 12,
              color: 'var(--mo-text-secondary)',
              maxHeight: 160,
              overflowY: 'auto',
            }}
          >
            {selected.map((s) => (
              <div
                key={s.productId}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name} × {s.quantity}
                </span>
                <span>₩{s.amount.toLocaleString('ko-KR')}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleReset}
            style={{
              marginTop: 10,
              background: 'transparent',
              border: 'none',
              color: 'var(--mo-text-secondary)',
              fontSize: 12,
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            전체 초기화
          </button>
        </div>
      ) : null}

      {/* 메모 */}
      <div className="mo-card" style={{ marginTop: 12 }}>
        <label className="mo-label" htmlFor="mo-form-memo">
          메모 (선택)
        </label>
        <textarea
          id="mo-form-memo"
          className="mo-textarea"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="배송 요청사항 등"
          rows={3}
          disabled={submitting}
        />
      </div>

      {/* 상태/에러 */}
      {error ? (
        <div className="mo-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
      {successOrderId ? (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: 'var(--mo-bg-card)',
            border: '1px solid var(--mo-success)',
            color: 'var(--mo-success)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>주문이 접수되었습니다. '주문 확인' 탭에서 진행 상태를 확인하세요.</span>
        </div>
      ) : null}

      {/* 제출 */}
      <button
        type="button"
        className="mo-btn-primary"
        onClick={handleSubmit}
        disabled={selected.length === 0 || submitting}
        style={{ marginTop: 16 }}
      >
        {submitting ? <Loader2 size={16} className="mo-spin" /> : null}
        {submitting
          ? '접수 중…'
          : selected.length === 0
            ? '품목을 선택하세요'
            : `주문 접수 (${totalQty}개 · ₩${totalAmount.toLocaleString('ko-KR')})`}
      </button>
    </div>
  );
}
