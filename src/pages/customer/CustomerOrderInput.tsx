/**
 * 거래처 주문서 직접 입력 화면 — 사이드바 카테고리 + 컴팩트 제품 행 + 고정 푸터.
 *
 * 🔴 CLAUDE.md §2: 공급가 = `calcSupplyPriceByCustomerGrade(sell_price, grade, gradeRates)`.
 * 🟠 useProducts 는 grade_a~e 컬럼을 select 하지 않으므로 인라인 쿼리 사용.
 * 🟠 재고는 `useInventoryStock(companyId)` 재활용. 재고 표시 3단계:
 *    품절(stock ≤ 0) / 부족(0 < stock < LOW_THRESHOLD) / 재고(그 이상).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';
import { syncOrderTotal } from '@/utils/orderTotal';
import {
  DELIVERY_FEE_PRODUCT_ID,
  DELIVERY_FEE_AMOUNT,
  calcDeliveryFee,
  removeDeliveryFeeFromOrder,
} from '@/utils/deliveryFee';
import {
  getCategoryLabel,
  PRODUCT_CATEGORY_DEFAULT,
  PRODUCT_CATEGORY_ALL,
} from '@/constants/categories';
import { useToast } from '@/components/ui/Toast';
import { SubmitSuccessDialog } from '@/components/feature/customer-order/SubmitSuccessDialog';
import type { CustomerSession } from '@/hooks/useCustomerAuth';

/** 재고 부족 임계값 — stock < 이 값이면 '부족' 뱃지. */
const LOW_STOCK_THRESHOLD = 10;

/**
 * 제품 행 / 컬럼 헤더 공용 flex 셀 너비.
 * 컬럼 순서: 제품명(flex-1) · 수량 · 재고 · 공급가 · 판매가.
 * 우측 4 컬럼은 shrink-0 고정 너비 → 창 크기와 무관하게 항상 같은 위치에 stick.
 * (이전 grid `1fr_..._..._..._...` + gap-3 은 창이 넓어질수록 컬럼 사이 빈 공간이 커지는 문제.)
 */
const COL_QTY = 'w-[72px]';
const COL_STOCK = 'w-[60px]';
const COL_PRICE = 'w-[88px]';

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
      .order('name', { ascending: true }),
  );
}

interface CustomerOrderInputProps {
  customer: CustomerSession;
  onBack: () => void;
}

export function CustomerOrderInput({
  customer,
  onBack,
}: CustomerOrderInputProps) {
  const { showToast } = useToast();
  const productsQuery = useQuery<ProductRow[]>({
    queryKey: ['customer-order-products', customer.companyId],
    queryFn: () => fetchActiveProducts(customer.companyId),
    staleTime: 60_000,
  });
  const stockQuery = useInventoryStock(customer.companyId);

  const [qtyMap, setQtyMap] = useState<Map<string, number>>(new Map());
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORY_DEFAULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  // 전송 완료 다이얼로그 — 닫히면 onBack() 으로 메인 화면 복귀.
  const [submitResult, setSubmitResult] = useState<{
    show: boolean;
    hasChanges: boolean;
  } | null>(null);

  // 한글 콜레이션 보장 위해 클라이언트에서 제품명 오름차순으로 재정렬.
  //   서버 정렬은 DB 콜레이션에 의존해 한글 순서가 흐트러질 수 있음.
  const products = useMemo(() => {
    const rows = productsQuery.data ?? [];
    return [...rows].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', 'ko'),
    );
  }, [productsQuery.data]);

  // 사이드바 카테고리 옵션: '전체' + 실제 카테고리(빈문자열 제외) 오름차순. 각 항목 카운트 포함.
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.category) continue;
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    const list = Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([id, count]) => ({ id, label: getCategoryLabel(id), count }));
    return [
      { id: PRODUCT_CATEGORY_ALL, label: '전체', count: products.length },
      ...list,
    ];
  }, [products]);

  // 활성 카테고리 라벨 — 헤더 타이틀 표시용.
  const activeCategoryLabel = useMemo(
    () => categoryOptions.find((c) => c.id === category)?.label ?? '전체',
    [categoryOptions, category],
  );

  // 카테고리 필터 (검색 적용 전).
  const activeProducts = useMemo(() => {
    if (category === PRODUCT_CATEGORY_ALL) return products;
    return products.filter((p) => p.category === category);
  }, [products, category]);

  // 검색 + 카테고리 적용된 최종 표시 목록.
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q),
    );
  }, [activeProducts, searchQuery]);

  // 주문 합계 요약 (전체 qtyMap 기준 — 필터링과 무관, 헤더 chip/푸터 공용).
  const orderSummary = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const p of products) {
      const qty = qtyMap.get(p.id) ?? 0;
      if (qty <= 0) continue;
      const supply = calcSupplyPriceByCustomerGrade(
        p.sell_price,
        customer.grade,
        p,
      );
      count += 1;
      total += qty * supply;
    }
    return { count, total };
  }, [products, qtyMap, customer.grade]);

  // 🟡 dogfooding 진단 — Phase 2 Auth 도입 시 제거.
  useEffect(() => {
    if (!customer.grade) {
      // eslint-disable-next-line no-console
      console.warn(
        '[customer-order.session] customer.grade 가 비어 있음 — 로그아웃 후 재로그인 필요',
        { grade: customer.grade },
      );
      return;
    }
    if (activeProducts.length === 0) return;
    const p0 = activeProducts[0];
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
  }, [customer.grade, activeProducts]);

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

  const handleSubmit = async () => {
    if (orderSummary.count === 0) {
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
      // 🔴 거래처 주문은 공급가 기준 (sell_price 아님).
      const subtotal = items.reduce(
        (s, it) => s + it.qty * it.supply_price,
        0,
      );
      // 🔴 택배비 4규칙 — 직접 입력은 직송 UI 가 없어 항상 비-직송.
      //    오늘 같은 거래처 기존 주문과 합산 + 기존 택배비 유무까지 종합 판단.
      const hasDeliveryAlready = items.some(
        (it) => it.product_id === DELIVERY_FEE_PRODUCT_ID,
      );
      const decision = hasDeliveryAlready
        ? { addDeliveryFee: false, removeDeliveryFeeFromOrderId: null }
        : await calcDeliveryFee({
            companyId: customer.companyId,
            customerId: customer.customerId,
            newOrderAmount: subtotal,
            isDirectShipping: false,
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

      // eslint-disable-next-line no-console
      console.log('[customer-order.submit]', {
        company_id: customer.companyId,
        customer_id: customer.customerId,
        itemCount: items.length,
        totalAmount,
      });

      // 1) customer_order_uploads — 거래처 포털 자체 이력
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

      // 2) orders 헤더
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

      // 3) order_items — unit_price 에는 공급가 저장, amount = qty × 공급가.
      const orderItemsPayload = items.map((it) => ({
        order_id: order.id,
        company_id: customer.companyId,
        product_id: it.product_id,
        quantity: it.qty,
        unit_price: it.supply_price,
        amount: it.qty * it.supply_price,
        is_return: false,
      }));
      if (decision.addDeliveryFee) {
        orderItemsPayload.push({
          order_id: order.id,
          company_id: customer.companyId,
          product_id: DELIVERY_FEE_PRODUCT_ID,
          quantity: 1,
          unit_price: DELIVERY_FEE_AMOUNT,
          amount: DELIVERY_FEE_AMOUNT,
          is_return: false,
        });
      }
      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(orderItemsPayload);
      // eslint-disable-next-line no-console
      console.log('[customer-order.items]', {
        itemsErr,
        count: orderItemsPayload.length,
      });
      if (itemsErr) throw itemsErr;

      // 🔴 orders.total_amount 안전망 — items INSERT 후 DB SUM 으로 재동기화.
      await syncOrderTotal({
        companyId: customer.companyId,
        orderId: order.id,
      });

      // 직접 입력은 품절 품목 입력이 disabled 되어 INSERT 시점에 조정이 발생할 일이 없음
      // → hasChanges 는 항상 false. 다이얼로그 닫기 시 onBack() 호출.
      setSubmitResult({ show: true, hasChanges: false });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '주문서 전송 실패',
      });
    } finally {
      setBusy(false);
    }
  };

  const krw = (n: number) => `${n.toLocaleString('ko-KR')}원`;
  const submitDisabled = busy || orderSummary.count === 0;

  return (
    <div className="flex h-screen flex-col bg-[#f8f7f5] text-[#312b27]">
      {/* ── 상단 고정 헤더 ── */}
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#ece7e2] bg-white px-[22px]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e3dcd5] bg-white px-3 py-1.5 text-[13px] text-[#5f574f] hover:bg-[#faf6f4] disabled:opacity-55"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            돌아가기
          </button>
          <span className="text-base font-bold text-[#2b2521]">
            주문서 직접 입력
          </span>
          <span className="pl-1 text-[12.5px] text-[#9a8f86]">
            {activeCategoryLabel} · {filteredProducts.length}개 품목
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          {/* 주문 건수 + 금액 chip */}
          <div className="flex items-center gap-2 rounded-full border border-[#ecdcd5] bg-[#f6efea] px-4 py-1.5">
            <span className="text-[12.5px] text-[#8a7066]">
              {orderSummary.count}건
            </span>
            <span className="h-[11px] w-px bg-[#dcc7be]" />
            <span className="text-[13px] font-bold text-[#6B1F2A]">
              {krw(orderSummary.total)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#6B1F2A] px-4 py-1.5 text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(107,31,42,0.20)] hover:bg-[#5c1a24] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            주문서 만들기
          </button>
        </div>
      </header>

      {/* ── 본문: 사이드바 + 제품 영역 ── */}
      <div className="flex min-h-0 flex-1">
        {/* 카테고리 사이드바 */}
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-[#ece7e2] bg-white py-3">
          <div className="px-[18px] pb-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#b3a89f]">
            카테고리
          </div>
          {categoryOptions.map((cat) => {
            const isActive = cat.id === category;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`my-px flex w-full items-center justify-between border-l-[3px] px-[18px] py-2.5 text-left text-[12.5px] transition-colors ${
                  isActive
                    ? 'border-[#6B1F2A] bg-[#f9f0f1] font-semibold text-[#6B1F2A]'
                    : 'border-transparent font-medium text-[#6b6058] hover:bg-[#faf6f5]'
                }`}
              >
                <span className="truncate">{cat.label}</span>
                <span
                  className={`shrink-0 rounded-full px-[7px] py-px text-[10.5px] ${
                    isActive
                      ? 'bg-[#6B1F2A] text-white'
                      : 'bg-[#f1ece7] text-[#a89e95]'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* 제품 목록 영역 */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* 카테고리 타이틀 + 검색 */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#ece7e2] bg-[#faf8f6] px-[22px]">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[15px] font-bold text-[#2b2521]">
                {activeCategoryLabel}
              </span>
              <span className="text-xs text-[#9a8f86]">
                {activeProducts.length}개 품목
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#e3dcd5] bg-white px-3 py-1.5">
              <Search className="h-[13px] w-[13px] text-[#a89e95]" />
              <input
                type="text"
                placeholder="제품명 또는 코드 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-auto w-48 border-0 bg-transparent p-0 text-[12.5px] text-[#2b2521] placeholder:text-[#b9aea5] outline-none"
              />
            </div>
          </div>

          {/* 테이블 헤더 — 컬럼: 제품명 / 수량 / 재고 / 공급가 / 판매가 */}
          <div className="flex h-9 shrink-0 items-center border-b border-[#ece7e2] bg-white px-[22px] text-[11.5px] font-semibold uppercase tracking-wide text-[#a89e95]">
            <span className="min-w-0 flex-1 pr-3">제품명</span>
            <span className={`${COL_QTY} shrink-0 text-center`}>수량</span>
            <span className={`${COL_STOCK} shrink-0 text-center`}>재고</span>
            <span className={`${COL_PRICE} shrink-0 text-right`}>공급가</span>
            <span className={`${COL_PRICE} shrink-0 text-right`}>판매가</span>
          </div>

          {/* 제품 행 목록 (스크롤) */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            {productsQuery.isLoading && (
              <div className="py-10 text-center text-[13px] text-[#78716C]">
                불러오는 중…
              </div>
            )}
            {!productsQuery.isLoading && filteredProducts.length === 0 && (
              <div className="py-10 text-center text-[13px] text-[#78716C]">
                표시할 제품이 없습니다.
              </div>
            )}
            {filteredProducts.map((p) => {
              const stock = stockOf(p.id);
              const isOut = stock <= 0;
              const isLow = !isOut && stock < LOW_STOCK_THRESHOLD;
              const supply = calcSupplyPriceByCustomerGrade(
                p.sell_price,
                customer.grade,
                p,
              );
              const qty = qtyMap.get(p.id) ?? 0;
              const rowBgClass = isOut
                ? 'opacity-60'
                : qty > 0
                  ? 'bg-[#edf7ef]'
                  : 'hover:bg-[#f9f0f1]';
              return (
                <div
                  key={p.id}
                  className={`flex h-11 items-center border-b border-[#f3efea] px-[22px] text-[13px] transition-colors ${rowBgClass}`}
                >
                  {/* 제품명 + 코드 — flex-1 로 남은 공간 차지, 우측 컬럼은 항상 같은 위치 stick */}
                  <div className="flex min-w-0 flex-1 flex-col gap-px pr-3">
                    <span
                      className={`truncate text-[13px] font-medium ${
                        isOut ? 'text-[#a89e95] line-through' : 'text-[#2b2521]'
                      }`}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <span className="font-mono text-[10.5px] text-[#bdb3aa]">
                      {p.code}
                    </span>
                  </div>

                  {/* 수량 입력 */}
                  <div className={`${COL_QTY} flex shrink-0 justify-center`}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={qty > 0 ? String(qty) : ''}
                      placeholder="0"
                      disabled={isOut}
                      onChange={(e) => updateQty(p.id, e.target.value)}
                      className={`h-7 w-[58px] rounded-md px-2 text-right text-[13px] outline-none transition-colors ${
                        isOut
                          ? 'cursor-not-allowed border border-[#ece6e1] bg-[#f3efec] text-[#c3b9b0]'
                          : qty > 0
                            ? 'border-[1.5px] border-[#16a34a] bg-white font-semibold text-[#15803d]'
                            : 'border border-[#ddd5cf] bg-white focus:border-[#6B1F2A]'
                      }`}
                    />
                  </div>

                  {/* 재고 뱃지 */}
                  <div className={`${COL_STOCK} flex shrink-0 justify-center`}>
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                        isOut
                          ? 'bg-[#fdeaea] text-[#c0392b]'
                          : isLow
                            ? 'bg-[#fef3e2] text-[#b45309]'
                            : 'bg-[#e7f6ec] text-[#16803c]'
                      }`}
                      title={`현재 재고 ${stock}`}
                    >
                      {isOut ? '품절' : isLow ? '부족' : '재고'}
                    </span>
                  </div>

                  {/* 공급가 */}
                  <span
                    className={`${COL_PRICE} shrink-0 text-right text-[12.5px] text-[#7a6f66]`}
                  >
                    {supply > 0 ? krw(supply) : '—'}
                  </span>

                  {/* 판매가 */}
                  <span
                    className={`${COL_PRICE} shrink-0 text-right text-[12.5px] font-semibold text-[#2b2521]`}
                  >
                    {krw(p.sell_price)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 하단 고정 푸터 */}
          <footer className="flex h-16 shrink-0 items-center justify-between border-t border-[#ece7e2] bg-white px-6 shadow-[0_-3px_12px_rgba(40,20,10,0.04)]">
            <div className="flex items-center gap-[18px]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12.5px] text-[#9a8f86]">선택 품목</span>
                <span className="text-base font-bold text-[#6B1F2A]">
                  {orderSummary.count}
                </span>
                <span className="text-[12.5px] text-[#9a8f86]">개</span>
              </div>
              <span className="h-[18px] w-px bg-[#e6ddd6]" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12.5px] text-[#9a8f86]">합계</span>
                <span className="text-xl font-bold text-[#2b2521]">
                  {krw(orderSummary.total)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled}
              className="inline-flex items-center gap-2 rounded-md bg-[#6B1F2A] px-7 py-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(107,31,42,0.20)] hover:bg-[#5c1a24] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              주문서 만들기
              <ArrowRight className="h-[15px] w-[15px]" />
            </button>
          </footer>
        </main>
      </div>

      <SubmitSuccessDialog
        open={!!submitResult?.show}
        hasChanges={submitResult?.hasChanges ?? false}
        onClose={() => {
          setSubmitResult(null);
          onBack();
        }}
      />
    </div>
  );
}
