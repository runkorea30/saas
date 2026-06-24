/**
 * 거래처 주문서 직접 입력 화면.
 *
 * 🔴 CLAUDE.md §2: 공급가 = `calcSupplyPriceByGrade(sell_price, gradeRate)`.
 * 🟠 useProducts 는 grade_a~e 컬럼을 select 하지 않으므로 인라인 쿼리 사용.
 * 🟠 재고는 `useInventoryStock(companyId)` 재활용.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';
import {
  getCategoryLabel,
  PRODUCT_CATEGORY_DEFAULT,
  PRODUCT_CATEGORY_ALL,
} from '@/constants/categories';
import { useToast } from '@/components/ui/Toast';
import type { CustomerSession } from '@/hooks/useCustomerAuth';

interface ProductRow {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  sell_price: number;
  grade_a: number | null;
  grade_b: number | null;
  grade_c: number | null;
  grade_d: number | null;
  grade_e: number | null;
}

async function fetchActiveProducts(companyId: string): Promise<ProductRow[]> {
  return fetchAllRows<ProductRow>(() =>
    supabase
      .from('products')
      .select(
        'id, code, name, category, unit, sell_price, grade_a, grade_b, grade_c, grade_d, grade_e',
      )
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('code', { ascending: true }),
  );
}

interface CustomerOrderInputProps {
  customer: CustomerSession;
  onBack: () => void;
  fontScale: number;
}

export function CustomerOrderInput({
  customer,
  onBack,
  fontScale,
}: CustomerOrderInputProps) {
  const { showToast } = useToast();
  const productsQuery = useQuery<ProductRow[]>({
    queryKey: ['customer-order-products', customer.companyId],
    queryFn: () => fetchActiveProducts(customer.companyId),
    staleTime: 60_000,
  });
  const stockQuery = useInventoryStock(customer.companyId);

  const [qtyMap, setQtyMap] = useState<Map<string, number>>(new Map());
  /** 기본 카테고리 — 운영 데이터 기본값(constants/categories) 사용. */
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORY_DEFAULT);
  const [fixedWidth, setFixedWidth] = useState(false);
  const [busy, setBusy] = useState(false);

  const products = productsQuery.data ?? [];
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (category === PRODUCT_CATEGORY_ALL) return products;
    return products.filter((p) => p.category === category);
  }, [products, category]);

  // 🟡 dogfooding 진단 — Phase 2 Auth 도입 시 제거.
  // customer.grade 가 null/비표준이면 공급가가 전부 0으로 표시되는 흔한 원인.
  // (예: 컬럼 추가 전에 로그인해 localStorage 세션이 stale 인 경우)
  useEffect(() => {
    if (!customer.grade) {
      // eslint-disable-next-line no-console
      console.warn(
        '[customer-order.session] customer.grade 가 비어 있음 — 로그아웃 후 재로그인 필요',
        { grade: customer.grade },
      );
      return;
    }
    if (filtered.length === 0) return;
    const p0 = filtered[0];
    // eslint-disable-next-line no-console
    console.log('[customer-order.sample-pricing]', {
      customerGrade: customer.grade,
      productCode: p0.code,
      sellPrice: p0.sell_price,
      grades: {
        a: p0.grade_a,
        b: p0.grade_b,
        c: p0.grade_c,
        d: p0.grade_d,
        e: p0.grade_e,
      },
      calculatedSupply: calcSupplyPriceByCustomerGrade(
        p0.sell_price,
        customer.grade,
        p0,
      ),
    });
  }, [customer.grade, filtered]);

  const stockOf = (productId: string): number => {
    return stockQuery.data?.stockByProduct.get(productId)?.current ?? 0;
  };

  const updateQty = (productId: string, raw: string) => {
    const next = new Map(qtyMap);
    const n = Math.max(0, Math.floor(Number(raw)));
    if (!raw.trim() || !Number.isFinite(n) || n === 0) next.delete(productId);
    else next.set(productId, n);
    setQtyMap(next);
  };

  const filledCount = qtyMap.size;

  const handleSubmit = async () => {
    if (filledCount === 0) {
      showToast({ kind: 'error', text: '주문 수량이 입력된 품목이 없습니다.' });
      return;
    }
    setBusy(true);
    try {
      const items = products
        .filter((p) => (qtyMap.get(p.id) ?? 0) > 0)
        .map((p) => {
          const qty = qtyMap.get(p.id)!;
          const supply = calcSupplyPriceByCustomerGrade(
            p.sell_price,
            customer.grade,
            p,
          );
          return {
            product_id: p.id,
            code: p.code,
            name: p.name,
            qty,
            sell_price: p.sell_price,
            supply_price: supply,
          };
        });
      const totalAmount = items.reduce(
        (s, it) => s + it.qty * it.sell_price,
        0,
      );

      // 🟡 dogfooding 디버그 — Phase 2 Auth 도입 시 제거 권장.
      // eslint-disable-next-line no-console
      console.log('[customer-order.submit]', {
        company_id: customer.companyId,
        customer_id: customer.customerId,
        itemCount: items.length,
        totalAmount,
      });

      // 1) customer_order_uploads — 거래처 포털 자체 이력 (items JSON 포함)
      const { error: uploadErr } = await supabase
        .from('customer_order_uploads')
        .insert({
          company_id: customer.companyId,
          customer_id: customer.customerId,
          upload_type: 'direct',
          items,
          status: 'pending',
        });
      // eslint-disable-next-line no-console
      console.log('[customer-order.uploads]', { uploadErr });
      if (uploadErr) throw uploadErr;

      // 2) orders 헤더 — OPS 대시보드 주문내역과 연동
      //    status 는 DB CHECK 제약(draft|confirmed|shipped|done|canceled) 에 따라 'draft'
      //    source 는 'portal' (거래처 자체 입력)
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          company_id: customer.companyId,
          customer_id: customer.customerId,
          order_date: new Date().toISOString(),
          status: 'draft',
          source: 'portal',
          memo: '거래처 직접입력 주문',
          total_amount: totalAmount,
        })
        .select('id')
        .single();
      // eslint-disable-next-line no-console
      console.log('[customer-order.order]', { order, orderErr });
      if (orderErr || !order) throw orderErr ?? new Error('주문 생성 실패');

      // 3) order_items — 실제 컬럼명은 unit_price/amount (sell_price/supply_price 아님)
      const orderItemsPayload = items.map((it) => ({
        order_id: order.id,
        company_id: customer.companyId,
        product_id: it.product_id,
        quantity: it.qty,
        unit_price: it.sell_price,
        amount: it.qty * it.sell_price,
        is_return: false,
      }));
      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(orderItemsPayload);
      // eslint-disable-next-line no-console
      console.log('[customer-order.items]', {
        itemsErr,
        count: orderItemsPayload.length,
      });
      if (itemsErr) throw itemsErr;

      showToast({
        kind: 'success',
        text: `주문서 ${items.length}품목 전송 완료`,
      });
      onBack();
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '주문서 전송 실패',
      });
    } finally {
      setBusy(false);
    }
  };

  const fontSize = 13 * fontScale;
  const headerFont = 26 * fontScale;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F4', padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            style={{
              ...secondaryBtn,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={14} /> 돌아가기
          </button>
          <h1
            style={{
              fontSize: headerFont,
              fontWeight: 600,
              margin: 0,
              color: '#1C1917',
            }}
          >
            주문서 직접 입력
          </h1>
          <div style={{ flex: 1 }} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={selectStyle}
          >
            <option value={PRODUCT_CATEGORY_ALL}>전체 분류</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {getCategoryLabel(c)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFixedWidth(true)}
            style={{
              ...secondaryBtn,
              background: fixedWidth ? '#1C1917' : '#FFFFFF',
              color: fixedWidth ? '#FFFFFF' : '#1C1917',
            }}
          >
            컬럼간격고정
          </button>
          <button
            type="button"
            onClick={() => setFixedWidth(false)}
            style={secondaryBtn}
          >
            컬럼간격초기화
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || filledCount === 0}
            style={{
              ...primaryBtn,
              opacity: busy || filledCount === 0 ? 0.55 : 1,
              cursor: busy || filledCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {busy && (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            )}{' '}
            주문서 만들기 ({filledCount})
          </button>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E7E5E4',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize,
                tableLayout: fixedWidth ? 'fixed' : 'auto',
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#FAFAF9',
                    borderBottom: '1px solid #E7E5E4',
                  }}
                >
                  <ThCustomer width={fixedWidth ? 120 : undefined}>코드</ThCustomer>
                  <ThCustomer align="left">제품명</ThCustomer>
                  <ThCustomer width={fixedWidth ? 80 : undefined}>재고</ThCustomer>
                  <ThCustomer width={fixedWidth ? 100 : undefined} align="right">수량</ThCustomer>
                  <ThCustomer width={fixedWidth ? 110 : undefined} align="right">공급가</ThCustomer>
                  <ThCustomer width={fixedWidth ? 110 : undefined} align="right">판매가</ThCustomer>
                </tr>
              </thead>
              <tbody>
                {productsQuery.isLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 40, textAlign: 'center', color: '#78716C' }}
                    >
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {!productsQuery.isLoading && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 40, textAlign: 'center', color: '#78716C' }}
                    >
                      표시할 제품이 없습니다.
                    </td>
                  </tr>
                )}
                {filtered.map((p) => {
                  const stock = stockOf(p.id);
                  const supply = calcSupplyPriceByCustomerGrade(
                    p.sell_price,
                    customer.grade,
                    p,
                  );
                  const qty = qtyMap.get(p.id) ?? 0;
                  return (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid #F5F5F4' }}
                    >
                      <TdCustomer>{p.code}</TdCustomer>
                      <TdCustomer align="left">{p.name}</TdCustomer>
                      <TdCustomer>
                        <StockBadge stock={stock} />
                      </TdCustomer>
                      <TdCustomer align="right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={qty === 0 ? '' : qty}
                          onChange={(e) => updateQty(p.id, e.target.value)}
                          placeholder="0"
                          style={{
                            width: 80,
                            height: 28,
                            padding: '0 8px',
                            border: '1px solid #D6D3D1',
                            borderRadius: 4,
                            fontSize: 13,
                            textAlign: 'right',
                            background: stock <= 0 ? '#FAFAF9' : '#FFFFFF',
                          }}
                          disabled={stock <= 0}
                        />
                      </TdCustomer>
                      <TdCustomer align="right">
                        {supply > 0
                          ? supply.toLocaleString('ko-KR') + '원'
                          : '—'}
                      </TdCustomer>
                      <TdCustomer align="right">
                        {p.sell_price.toLocaleString('ko-KR')}원
                      </TdCustomer>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function StockBadge({ stock }: { stock: number }) {
  const isInStock = stock > 0;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: isInStock ? '#DCFCE7' : '#FEE2E2',
        color: isInStock ? '#166534' : '#B91C1C',
      }}
    >
      {isInStock ? '재고' : '품절'}
    </span>
  );
}

function ThCustomer({
  children,
  align = 'center',
  width,
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number;
}) {
  return (
    <th
      style={{
        padding: '10px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: '#44403C',
        textAlign: align,
        whiteSpace: 'nowrap',
        width: width != null ? width : undefined,
      }}
    >
      {children}
    </th>
  );
}

function TdCustomer({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <td
      style={{
        padding: '8px 12px',
        textAlign: align,
        color: '#1C1917',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

const primaryBtn: React.CSSProperties = {
  height: 36,
  padding: '0 14px',
  background: '#2563EB',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const secondaryBtn: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  background: '#FFFFFF',
  color: '#1C1917',
  border: '1px solid #D6D3D1',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: '0 10px',
  border: '1px solid #D6D3D1',
  borderRadius: 6,
  fontSize: 13,
  background: '#FFFFFF',
  color: '#1C1917',
};
