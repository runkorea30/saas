/**
 * Orders 우측 상세 패널. 선택된 주문이 없으면 placeholder.
 * VAT 역산 + 공급가는 calcSupplyAmount(utils/calculations) 사용 — 부가세 포함 금액 ÷ 1.1.
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany()에서만 조달.
 * 🔴 CLAUDE.md §2: 공급가/VAT 계산은 calcSupplyAmount 단일 진입점.
 * 🟠 편집 모드: useOrderItems 별도 fetch + draft 임시 모델. 저장 후 ['order-items', orderId] / ['orders'] 양쪽 invalidate.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, FileText, MoreHorizontal, Tag, Trash2 } from 'lucide-react';
import {
  CARRIERS,
  DEFAULT_CARRIER,
  getCarrierLabel,
  getTrackingUrl,
  normalizeTrackingNumbers,
  type CarrierCode,
  type TrackingEntry,
} from '@/utils/shippingCarriers';
import {
  GradeBadge,
  SourceIcon,
  StatusBadge,
  fmtDateTime,
} from './primitives';
import { calcSupplyPriceByCustomerGrade } from '@/utils/calculations';
import { syncOrderTotal } from '@/utils/orderTotal';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import { useOrderItems, type OrderItemRow } from '@/hooks/queries/useOrderItems';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { OrderPhotoSection } from '@/components/order/OrderPhotoSection';
import { useToast } from '@/components/ui/Toast';
import type { OrderStatus } from '@/types/common';
import type { Order, OrderItemDraft } from '@/types/orders';

export function OrderDetailPane({
  order,
  isAdditional = false,
}: {
  order: Order | null;
  /** 같은 날짜·같은 거래처 묶음에서 본주문 이후에 생성된 추가주문 여부 — true 면 헤더에 배지 표시. */
  isAdditional?: boolean;
}) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();

  /** 거래처가 이미지를 보내 생성된 빈 주문(품목 0건 + attachment_url 존재) 판별. */
  const isImagePendingOrder =
    !!order?.attachment_url && (order?.items?.length ?? 0) === 0;
  /** 새 행 추가 모드 — 반품추가/주문추가 클릭 시 활성. */
  const [editMode, setEditMode] = useState(false);
  const [draftItems, setDraftItems] = useState<OrderItemDraft[]>([]);
  /**
   * 이미지 대기 주문을 열면 자동으로 편집모드 진입(품목 0건이므로 즉시 입력 가능하게).
   * orderItems 로딩이 끝나 0건임이 확정된 뒤 1회만 트리거.
   */
  const autoEditTriggeredRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** 수량 인라인 편집의 임시 오버라이드 — blur 시 DB 반영 + 클리어. */
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  /** 자동완성: { draftId: { col: 'code'|'name', query } } — 현재 포커스된 셀만 드롭다운 표시. */
  const [autoFocus, setAutoFocus] = useState<{
    draftId: string;
    col: 'code' | 'name';
  } | null>(null);

  const { data: orderItems = [], isLoading: itemsLoading } = useOrderItems(
    order?.id ?? null,
    companyId,
  );

  useEffect(() => {
    if (
      order &&
      companyId &&
      isImagePendingOrder &&
      !itemsLoading &&
      orderItems.length === 0 &&
      autoEditTriggeredRef.current !== order.id
    ) {
      autoEditTriggeredRef.current = order.id;
      setEditMode(true);
      setDraftItems([
        createNewDraft({ orderId: order.id, companyId, isReturn: false }),
      ]);
    }
  }, [order, companyId, isImagePendingOrder, itemsLoading, orderItems.length]);

  const { data: products = [] } = useProducts(companyId);
  // 🟠 재고부족 표시 + 재고확인 일괄조정용 — Map<product_id, ProductStockInfo>.
  const { data: stockSummary } = useInventoryStock(companyId);
  const stockByProduct = stockSummary?.stockByProduct;

  /**
   * 제품의 현재 가용 재고. lots+tx+올해 판매수량 기준 (calcCurrentStockByProduct).
   * 미존재 시 0 으로 폴백.
   */
  const stockOf = (productId: string | null): number => {
    if (!productId) return 0;
    return stockByProduct?.get(productId)?.current ?? 0;
  };


  // 자동완성 후보 — 코드/이름 모두 대소문자 무시 부분일치 (includes).
  const suggestions: Product[] = useMemo(() => {
    if (!autoFocus) return [];
    const draft = draftItems.find((d) => d.id === autoFocus.draftId);
    if (!draft) return [];
    if (autoFocus.col === 'code') {
      const q = draft.product_code.trim().toLowerCase();
      if (!q) return [];
      return products
        .filter((p) => p.code.toLowerCase().includes(q))
        .slice(0, 10);
    }
    const q = draft.product_name.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [autoFocus, draftItems, products]);

  // 일반 모드: orderItems 만 표시 (수량은 인라인 편집).
  // 새 행 추가 모드: orderItems + draftItems (신규 행만 별도 INSERT).
  // 🟠 기존 행은 카테고리→코드 오름차순 정렬. draft 행은 정렬 제외 (입력 순서 유지, 맨 뒤).
  // 🔴 hook 규칙: order=null 조기반환보다 위에 위치해야 hook 순서가 매 렌더 일관됨.
  const displayRows: Array<OrderItemRow | OrderItemDraft> = useMemo(() => {
    if (!order) return [];
    const base: Array<OrderItemRow | OrderItemDraft> = editMode
      ? [...orderItems, ...draftItems]
      : [...orderItems];
    const existing = base.filter((r) => !(r as OrderItemDraft)._isNew);
    const drafts = base.filter((r) => (r as OrderItemDraft)._isNew);
    existing.sort((a, b) => {
      const catA = (a as OrderItemRow).category ?? '';
      const catB = (b as OrderItemRow).category ?? '';
      const catCmp = catA.localeCompare(catB, 'ko');
      if (catCmp !== 0) return catCmp;
      const codeA = (a as OrderItemRow).product_code ?? '';
      const codeB = (b as OrderItemRow).product_code ?? '';
      return codeA.localeCompare(codeB);
    });
    return [...existing, ...drafts];
  }, [order, editMode, orderItems, draftItems]);

  if (!order) return <DetailEmpty />;

  const d = new Date(order.order_date);

  // ───── 인라인 수량 편집 (기존 행) — blur 시 자동저장 ─────
  const handleQtyInput = (id: string, raw: number) => {
    setQtyOverrides((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(raw)) }));
  };

  const handleQtyBlur = async (id: string) => {
    if (!order || !companyId) return;
    const nextQty = qtyOverrides[id];
    if (nextQty === undefined) return;
    const item = orderItems.find((i) => i.id === id);
    if (!item || item.quantity === nextQty) {
      // 변경 없음 — 오버라이드만 제거
      setQtyOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const { error } = await supabase
        .from('order_items')
        .update({
          quantity: nextQty,
          amount: nextQty * item.unit_price,
        })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      // 🔴 아이템 변경 시 orders.total_amount 재동기화 (DB SUM 기준).
      await syncOrderTotal({ companyId, orderId: order.id });
      await queryClient.invalidateQueries({ queryKey: ['order-items', order.id] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      console.error('수량 자동저장 실패:', err);
      alert('수량 저장 중 오류가 발생했습니다.');
    } finally {
      setQtyOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // ───── 새 행 추가 모드 ─────
  const handleCancel = () => {
    setDraftItems([]);
    setEditMode(false);
  };

  const handleQtyChange = (id: string, qty: number) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: qty,
              amount: qty * item.unit_price,
              _dirty: true,
            }
          : item,
      ),
    );
  };

  const applyProductToDraft = (draftId: string, p: Product) => {
    const customerGrade = order?.customer?.grade ?? null;
    const supplyPrice = calcSupplyPriceByCustomerGrade(p.sell_price, customerGrade, {
      grade_a: p.grade_a ?? null,
      grade_b: p.grade_b ?? null,
      grade_c: p.grade_c ?? null,
      grade_d: p.grade_d ?? null,
      grade_e: p.grade_e ?? null,
    });
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? {
              ...item,
              product_id: p.id,
              product_code: p.code,
              product_name: p.name,
              sell_price: p.sell_price,
              // 🔴 unit_price 는 공급가 기준 — 화면 표시/저장 금액 모두 이 값을 사용.
              //    판매가(sell_price)는 참고용 컬럼으로만 별도 유지.
              unit_price: supplyPrice,
              supply_price: supplyPrice,
              grade_a: p.grade_a ?? 0,
              grade_b: p.grade_b ?? 0,
              grade_c: p.grade_c ?? 0,
              grade_d: p.grade_d ?? 0,
              grade_e: p.grade_e ?? 0,
              amount: item.quantity * supplyPrice,
              _dirty: true,
            }
          : item,
      ),
    );
    setAutoFocus(null);
  };

  const handleCodeQueryChange = (draftId: string, value: string) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? {
              ...item,
              product_code: value,
              // 코드를 직접 수정하면 기존 선택 무효화.
              product_id: null,
              product_name: '',
              sell_price: 0,
              unit_price: 0,
              supply_price: 0,
              amount: 0,
            }
          : item,
      ),
    );
    setAutoFocus({ draftId, col: 'code' });
  };

  const handleNameQueryChange = (draftId: string, value: string) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === draftId
          ? {
              ...item,
              product_name: value,
              product_id: null,
              product_code: '',
              sell_price: 0,
              unit_price: 0,
              supply_price: 0,
              amount: 0,
            }
          : item,
      ),
    );
    setAutoFocus({ draftId, col: 'name' });
  };

  /**
   * Enter/Tab 으로 자동완성 확정 — OrderEntryPage 패턴.
   *  1) 정확히 일치하는 제품이 있으면 즉시 적용.
   *  2) 단일 후보 매칭이면 그것을 적용.
   *  3) 아니면 그냥 통과 (블러 효과).
   */
  const handleAutocompleteKeyDown = (
    draftId: string,
    col: 'code' | 'name',
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const draft = draftItems.find((d) => d.id === draftId);
    if (!draft) return;
    const q = (col === 'code' ? draft.product_code : draft.product_name)
      .trim()
      .toLowerCase();
    if (!q) return;
    const field = col === 'code' ? 'code' : 'name';
    const exact = products.find((p) => p[field].toLowerCase() === q);
    const matches = products.filter((p) => p[field].toLowerCase().includes(q));
    const target = exact ?? (matches.length === 1 ? matches[0] : null);
    if (target) {
      e.preventDefault();
      applyProductToDraft(draftId, target);
    }
  };

  const handleAddReturn = () => {
    if (!companyId || !order) return;
    setEditMode(true);
    setDraftItems((prev) => [
      ...prev,
      createNewDraft({ orderId: order.id, companyId, isReturn: true }),
    ]);
  };

  const handleAddOrderItem = () => {
    if (!companyId || !order) return;
    setEditMode(true);
    setDraftItems((prev) => [
      ...prev,
      createNewDraft({ orderId: order.id, companyId, isReturn: false }),
    ]);
  };

  /**
   * 품목 행 삭제 — 신규(저장 전) 행은 draftItems 에서 제거,
   * 기존(저장된) 행은 DB hard delete 후 orders.total_amount 재동기화.
   */
  const handleDeleteItem = async (itemId: string, isNewRow: boolean) => {
    if (isNewRow) {
      setDraftItems((prev) => prev.filter((item) => item.id !== itemId));
      return;
    }
    if (!order || !companyId) return;
    if (!window.confirm('이 품목을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase
        .from('order_items')
        .delete()
        .eq('id', itemId)
        .eq('company_id', companyId);
      if (error) throw error;
      await syncOrderTotal({ companyId, orderId: order.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-items', order.id] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock', companyId] }),
      ]);
    } catch (err) {
      console.error('품목 삭제 실패:', err);
      alert('품목 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSave = async () => {
    if (!order || !companyId) return;

    const newRows = draftItems.filter((item) => item._isNew);
    const unselected = newRows.filter((item) => !item.product_id);
    if (unselected.length > 0) {
      alert('제품을 선택해주세요');
      return;
    }
    const zeroQty = newRows.filter((item) => !item.quantity || item.quantity <= 0);
    if (zeroQty.length > 0) {
      alert('수량을 입력해주세요');
      return;
    }

    // 🔴 자동 재고조정 — 비반품 신규 행에 대해 quantity > stock 이면 축소,
    //    원래 수량을 original_quantity 로 저장. 누적 메시지 후 알림.
    const shortageMsgs: string[] = [];
    const adjustedNewRows = newRows.map((item) => {
      if (item.is_return || !item.product_id) {
        return { item, finalQty: item.quantity, originalQty: null as number | null };
      }
      const stock = stockOf(item.product_id);
      if (item.quantity > stock) {
        const finalQty = Math.max(0, stock);
        shortageMsgs.push(
          `[${item.product_name}] 재고 부족으로 수량이 ${item.quantity}개 → ${finalQty}개로 조정되었습니다.`,
        );
        return { item, finalQty, originalQty: item.quantity };
      }
      return { item, finalQty: item.quantity, originalQty: null };
    });
    const adjustedById = new Map(adjustedNewRows.map((a) => [a.item.id, a]));

    setIsSaving(true);
    try {
      const dirtyItems = draftItems.filter((item) => item._dirty);

      for (const item of dirtyItems) {
        if (item._isNew) {
          const adj = adjustedById.get(item.id);
          const finalQty = adj?.finalQty ?? item.quantity;
          const originalQty = adj?.originalQty ?? null;
          // 🔴 반품은 quantity/amount 모두 음수로 저장 — calculations.ts 정합성.
          const sign = item.is_return ? -1 : 1;
          const absQty = Math.abs(finalQty);
          // 🟠 original_quantity 컬럼은 자동생성 타입에 아직 미반영 → payload 단언 우회.
          const insertPayload = {
            id: item.id,
            company_id: companyId,
            order_id: item.order_id,
            product_id: item.product_id!,
            quantity: sign * absQty,
            original_quantity: originalQty,
            unit_price: item.unit_price,
            amount: sign * absQty * item.unit_price,
            is_return: item.is_return,
          } as unknown as {
            id: string;
            company_id: string;
            order_id: string;
            product_id: string;
            quantity: number;
            unit_price: number;
            amount: number;
            is_return: boolean;
          };
          const { error } = await supabase.from('order_items').insert(insertPayload);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('order_items')
            .update({
              quantity: item.quantity,
              amount: item.quantity * item.unit_price,
            })
            .eq('id', item.id)
            .eq('company_id', companyId);
          if (error) throw error;
        }
      }

      // 🔴 orders.total_amount 재동기화 — DB 의 order_items.amount SUM 기준.
      //    이전: 클라이언트 reduce 로 계산했으나 staleness/부분 실패 시 어긋났음.
      await syncOrderTotal({ companyId, orderId: order.id });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-items', order.id] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock', companyId] }),
      ]);
      setEditMode(false);
      setDraftItems([]);
      setAutoFocus(null);

      if (shortageMsgs.length > 0) {
        alert(
          '재고 부족으로 아래 품목의 수량이 자동 조정되었습니다:\n\n' +
            shortageMsgs.join('\n'),
        );
      }
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const tableTotal = displayRows.reduce((sum, it) => {
    if ((it as OrderItemDraft)._isNew) {
      return sum + (it as OrderItemDraft).quantity * it.unit_price;
    }
    return sum + (it as OrderItemRow).amount;
  }, 0);

  return (
    <div
      className="card-surface"
      style={{
        padding: 0,
        position: 'sticky',
        top: 24,
        // 🟠 sticky + 컨텐츠가 viewport 보다 크면 하단(출고 사진 등) 클리핑 발생.
        //    내부 스크롤 + horizontal clip(rounded corner 유지) 으로 해결.
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Header — 압축형 */}
      <div
        style={{
          padding: '8px 12px 6px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            ORDER
          </span>
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {order.id.slice(0, 8)}
          </span>
          <StatusPicker order={order} />
          <SourceIcon source={order.source} />
          {isAdditional && (
            <span
              title="같은 날짜·같은 거래처의 추가 주문"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 6px',
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 600,
                background: '#fef3c7',
                color: '#92400e',
                letterSpacing: '0.04em',
              }}
            >
              추가주문
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-base ghost"
            style={{ height: 24, fontSize: 11, padding: '0 6px' }}
          >
            <MoreHorizontal size={12} />
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          <GradeBadge grade={order.customer?.grade ?? null} size="sm" />
          <h2
            className="disp"
            style={{
              fontSize: 15,
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
            }}
          >
            {order.customer?.name ?? '—'}
          </h2>
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
            }}
          >
            {fmtDateTime(d)}
            {order.creator && ` · ${order.creator.name}`}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink)',
              fontFamily: 'var(--font-num)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {order.total_amount.toLocaleString('ko-KR')}원
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleAddReturn}
            className="px-2.5 py-1 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            반품추가
          </button>
          <button
            type="button"
            onClick={handleAddOrderItem}
            className="px-2.5 py-1 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
          >
            주문추가
          </button>
        </div>
        {order.attachment_url && (
          <div
            style={{
              marginTop: 10,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px',
              background: '#FFF7ED',
              border: '1px solid #FDBA74',
              borderRadius: 8,
            }}
          >
            <a
              href={order.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              title="원본 이미지를 새 탭에서 보기"
              style={{ flexShrink: 0 }}
            >
              <img
                src={order.attachment_url}
                alt="거래처 첨부 이미지"
                style={{
                  width: 96,
                  height: 96,
                  objectFit: 'cover',
                  borderRadius: 6,
                  border: '1px solid #FDBA74',
                  cursor: 'zoom-in',
                  display: 'block',
                }}
              />
            </a>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9A3412' }}>
                거래처가 보낸 이미지
              </span>
              <span style={{ fontSize: 11.5, color: '#7C2D12', lineHeight: 1.5 }}>
                이미지를 클릭하면 새 탭에서 원본을 볼 수 있습니다.
                이미지를 보면서 아래 품목 입력을 직접 진행해주세요.
              </span>
            </div>
          </div>
        )}
        <TrackingNumberSection
          key={order.id}
          orderId={order.id}
          initialTrackingNumbers={normalizeTrackingNumbers(order.tracking_numbers)}
          currentStatus={order.status}
        />
        {order.is_direct_shipping &&
          (() => {
            // shipping_info 가 string(JSON) 또는 object 배열로 올 수 있어 양쪽 처리.
            // 필드명도 한글/영문 혼재 대비해 ?? 체인으로 폴백.
            const raw = order.shipping_info as unknown;
            let rows: Array<Record<string, unknown>> = [];
            if (typeof raw === 'string') {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) rows = parsed;
              } catch {
                rows = [];
              }
            } else if (Array.isArray(raw)) {
              rows = raw as Array<Record<string, unknown>>;
            }
            if (rows.length === 0) return null;
            const cell = (v: unknown): string =>
              v == null ? '' : String(v);
            return (
              <div className="mt-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-success-wash px-2 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                    직송
                  </span>
                  <span className="text-[11.5px] font-semibold text-ink">
                    직송 정보 ({rows.length}건)
                  </span>
                </div>
                <div className="overflow-x-auto rounded border border-line">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-surface-2 text-ink-3">
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">받는사람</th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">우편번호</th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">주소</th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">연락처1</th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">연락처2</th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold"></th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">제품</th>
                        <th className="whitespace-nowrap border-r border-line px-2 py-1.5 text-left font-semibold">거래처</th>
                        <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">신용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-t border-line bg-surface">
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.name ?? (row as Record<string, unknown>)['받는사람'] ?? row.recipient)}
                          </td>
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.zipcode ?? (row as Record<string, unknown>)['우편번호'] ?? row.zipCode)}
                          </td>
                          <td className="max-w-[220px] border-r border-line px-2 py-1.5">
                            {cell(row.address ?? (row as Record<string, unknown>)['주소'])}
                          </td>
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.phone1 ?? (row as Record<string, unknown>)['연락처1'])}
                          </td>
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.phone2 ?? (row as Record<string, unknown>)['연락처2'])}
                          </td>
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.blank ?? (row as Record<string, unknown>)['메모'])}
                          </td>
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.product ?? (row as Record<string, unknown>)['제품'])}
                          </td>
                          <td className="whitespace-nowrap border-r border-line px-2 py-1.5">
                            {cell(row.customer ?? (row as Record<string, unknown>)['거래처'])}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            {cell(row.credit ?? (row as Record<string, unknown>)['신용'])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Items: 편집 가능한 6컬럼 테이블 */}
      <div style={{ padding: '14px 20px 8px' }}>
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-num)',
            marginBottom: 8,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>주문 품목</span>
          <span>{displayRows.length}개 라인</span>
        </div>

        {/* 편집 모드 액션 — 행 추가는 헤더 우측 버튼에서. 수량은 항상 인라인 편집(blur autosave). */}
        {editMode && (
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSaving ? '저장 중...' : '저장하기'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--line-strong)] text-[var(--ink-3)] hover:bg-[var(--surface-2)] transition-colors ml-auto"
            >
              취소
            </button>
          </div>
        )}

        {itemsLoading ? (
          <div className="text-xs text-[var(--ink-3)] py-4 text-center">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--line-default)]">
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)] w-20">코드</th>
                  <th className="text-left py-2 px-2 font-medium text-[var(--ink-3)]">제품명</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-14">수량</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">판매가</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">공급가</th>
                  <th className="text-right py-2 px-2 font-medium text-[var(--ink-3)] w-20">합계</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((item) => {
                  const isNewRow = (item as OrderItemDraft)._isNew === true;
                  // 신규 행: draft.quantity 직접 사용 + handleQtyChange (저장 전 임시)
                  // 기존 행: orderItems.quantity 가 base, qtyOverrides 가 우선
                  const displayQty = isNewRow
                    ? (item as OrderItemDraft).quantity
                    : (qtyOverrides[item.id] ?? item.quantity);
                  const rowAmount = isNewRow
                    ? (item as OrderItemDraft).quantity * item.unit_price
                    : (qtyOverrides[item.id] !== undefined
                        ? qtyOverrides[item.id] * item.unit_price
                        : (item as OrderItemRow).amount);
                  // 🟠 거래처 포털 INSERT 정책: unit_price = 공급가.
                  //    OPS 수동주문입력 INSERT 정책: unit_price = 판매가.
                  //    혼재 가능하나 dogfooding 단계에서는 unit_price 를 공급가로 표시.

                  const draft = item as OrderItemDraft;
                  const showSuggestForCode =
                    isNewRow &&
                    autoFocus?.draftId === item.id &&
                    autoFocus.col === 'code' &&
                    suggestions.length > 0;
                  const showSuggestForName =
                    isNewRow &&
                    autoFocus?.draftId === item.id &&
                    autoFocus.col === 'name' &&
                    suggestions.length > 0;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-[var(--line-subtle)] hover:bg-[var(--surface-2)] transition-colors ${
                        item.is_return ? 'text-red-500' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 font-mono relative">
                        {isNewRow ? (
                          <>
                            <input
                              type="text"
                              value={draft.product_code}
                              onChange={(e) =>
                                handleCodeQueryChange(item.id, e.target.value)
                              }
                              onFocus={() =>
                                setAutoFocus({ draftId: item.id, col: 'code' })
                              }
                              onBlur={() =>
                                setTimeout(() => {
                                  setAutoFocus((cur) =>
                                    cur?.draftId === item.id && cur.col === 'code'
                                      ? null
                                      : cur,
                                  );
                                }, 120)
                              }
                              onKeyDown={(e) =>
                                handleAutocompleteKeyDown(item.id, 'code', e)
                              }
                              placeholder="코드"
                              className="w-full border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                            />
                            {showSuggestForCode && (
                              <SuggestionList
                                items={suggestions}
                                onPick={(p) => applyProductToDraft(item.id, p)}
                              />
                            )}
                          </>
                        ) : (
                          (item as OrderItemRow).product_code
                        )}
                      </td>
                      <td className="py-1.5 px-2 relative">
                        {isNewRow ? (
                          <>
                            <input
                              type="text"
                              value={draft.product_name}
                              onChange={(e) =>
                                handleNameQueryChange(item.id, e.target.value)
                              }
                              onFocus={() =>
                                setAutoFocus({ draftId: item.id, col: 'name' })
                              }
                              onBlur={() =>
                                setTimeout(() => {
                                  setAutoFocus((cur) =>
                                    cur?.draftId === item.id && cur.col === 'name'
                                      ? null
                                      : cur,
                                  );
                                }, 120)
                              }
                              onKeyDown={(e) =>
                                handleAutocompleteKeyDown(item.id, 'name', e)
                              }
                              placeholder="제품명 검색"
                              className="w-full border border-[var(--line-strong)] rounded px-1 py-0.5 bg-[var(--surface)] text-[var(--ink)] text-xs focus:outline-none focus:border-[var(--brand)]"
                            />
                            {showSuggestForName && (
                              <SuggestionList
                                items={suggestions}
                                onPick={(p) => applyProductToDraft(item.id, p)}
                              />
                            )}
                          </>
                        ) : (
                          (item as OrderItemRow).product_name
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {(() => {
                          // 재고부족 / 조정 이력 시각 표시 — 신규 행은 적용 안 함.
                          const row = !isNewRow ? (item as OrderItemRow) : null;
                          const orig = row?.original_quantity ?? null;
                          const productId = row?.product_id ?? null;
                          const stock = productId ? stockOf(productId) : 0;
                          const isShortage =
                            !!row &&
                            !row.is_return &&
                            orig == null &&
                            row.quantity > stock;
                          const inputColor = isShortage
                            ? 'var(--danger)'
                            : 'var(--ink)';
                          return (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'baseline',
                                justifyContent: 'flex-end',
                                gap: 4,
                              }}
                            >
                              {orig != null && (
                                <span
                                  title={`원래 주문수량 ${orig} → 재고조정 ${row?.quantity}`}
                                  style={{
                                    color: 'var(--ink-3)',
                                    textDecoration: 'line-through',
                                    fontSize: 'inherit',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {orig}
                                </span>
                              )}
                              <input
                                type="number"
                                min={isNewRow ? 1 : 0}
                                // 🔴 신규 행만 0 → 빈문자열(placeholder 표시). 기존 행은
                                //    품절 자동조정 결과 quantity=0 을 명시적으로 보여줘야 함.
                                value={
                                  isNewRow && displayQty === 0 ? '' : displayQty
                                }
                                placeholder={isNewRow ? '수량' : undefined}
                                title={
                                  isShortage
                                    ? `재고부족 — 현재재고 ${stock} (요청 ${row?.quantity})`
                                    : undefined
                                }
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const num = raw === '' ? 0 : Number(raw);
                                  const safe =
                                    Number.isFinite(num) && num >= 0 ? num : 0;
                                  if (isNewRow) handleQtyChange(item.id, safe);
                                  else handleQtyInput(item.id, safe);
                                }}
                                onBlur={
                                  isNewRow
                                    ? undefined
                                    : () => handleQtyBlur(item.id)
                                }
                                onFocus={(e) => {
                                  e.currentTarget.style.border =
                                    '1px solid var(--brand)';
                                }}
                                onBlurCapture={(e) => {
                                  e.currentTarget.style.border =
                                    '1px solid transparent';
                                }}
                                style={{
                                  width: 52,
                                  textAlign: 'right',
                                  border: '1px solid transparent',
                                  borderRadius: 4,
                                  padding: '2px 4px',
                                  fontSize: 12,
                                  background: 'transparent',
                                  outline: 'none',
                                  color: inputColor,
                                  fontWeight: isShortage ? 600 : 400,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              />
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-1.5 px-2 text-right font-num">
                        {item.sell_price > 0
                          ? item.sell_price.toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-num">
                        {isNewRow
                          ? draft.supply_price > 0
                            ? draft.supply_price.toLocaleString()
                            : '—'
                          : // 🔴 공급가 = amount / quantity (DB 설계: amount = 공급가 × 수량).
                            //    unit_price 는 판매가이므로 사용 금지.
                            (item as OrderItemRow).quantity !== 0
                            ? Math.round(
                                Math.abs(
                                  (item as OrderItemRow).amount /
                                    (item as OrderItemRow).quantity,
                                ),
                              ).toLocaleString()
                            : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-num font-medium">
                        {rowAmount.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id, isNewRow)}
                          title="이 품목 삭제"
                          className="text-[var(--ink-4)] hover:text-[var(--danger)] transition-colors"
                        >
                          <Trash2 size={12} strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--line-strong)]">
                  <td
                    colSpan={5}
                    className="py-2 px-2 text-right text-xs font-medium text-[var(--ink-2)]"
                  >
                    합계
                  </td>
                  <td className="py-2 px-2 text-right text-xs font-medium font-num">
                    {tableTotal.toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 🟠 출고 사진 — 데스크탑은 조회 전용 (모바일 앱에서 촬영). */}
      <div
        style={{
          padding: '8px 20px 16px',
          borderTop: '1px solid var(--line)',
        }}
      >
        <OrderPhotoSection
          orderId={order.id}
          companyId={companyId}
          readOnly={true}
          showCamera={false}
        />
      </div>
    </div>
  );
}

function SuggestionList({
  items,
  onPick,
}: {
  items: Product[];
  onPick: (p: Product) => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 2,
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
        zIndex: 20,
        maxHeight: 240,
        overflowY: 'auto',
        minWidth: 280,
      }}
    >
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          onMouseDown={(e) => {
            // input blur 보다 먼저 발화 — autoFocus 초기화 방지.
            e.preventDefault();
            onPick(p);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--line-subtle)',
            cursor: 'pointer',
            fontSize: 11.5,
            textAlign: 'left',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'var(--brand-wash)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'transparent')
          }
        >
          <span
            style={{
              fontFamily: 'monospace',
              color: 'var(--ink-3)',
              minWidth: 90,
            }}
          >
            {p.code}
          </span>
          <span style={{ color: 'var(--ink)', flex: 1 }}>{p.name}</span>
          <span
            style={{
              fontFamily: 'var(--font-num)',
              color: 'var(--ink-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {p.sell_price.toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  );
}

function createNewDraft(args: {
  orderId: string;
  companyId: string;
  isReturn: boolean;
}): OrderItemDraft {
  return {
    id: crypto.randomUUID(),
    company_id: args.companyId,
    order_id: args.orderId,
    product_id: null,
    quantity: 0,
    unit_price: 0,
    amount: 0,
    is_return: args.isReturn,
    deleted_at: null,
    product_code: '',
    product_name: '',
    sell_price: 0,
    supply_price: 0,
    grade_a: 0,
    grade_b: 0,
    grade_c: 0,
    grade_d: 0,
    grade_e: 0,
    _dirty: true,
    _isNew: true,
  };
}

function DetailEmpty() {
  return (
    <div
      className="card-surface"
      style={{
        padding: '60px 28px',
        position: 'sticky',
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        color: 'var(--ink-3)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <FileText size={20} color="var(--ink-3)" strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
        주문을 선택해 주세요
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center' }}>
        왼쪽 목록에서 주문을 클릭하면 상세 내용이 여기에 표시됩니다.
      </div>
    </div>
  );
}

/**
 * 상태 수동 변경 UI — 헤더의 상태 뱃지 자리에 렌더.
 * 클릭 시 드롭다운으로 5개 옵션(주문접수/주문확인/처리중/발송완료/취소) 표시.
 * 선택 시 orders.status + 해당 *_at 타임스탬프 함께 UPDATE. 역방향 전환도 허용.
 * 취소(canceled) 는 별도 타임스탬프 없이 status 만 갱신.
 */
const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'received', label: '주문접수' },
  { value: 'confirmed', label: '주문확인' },
  { value: 'processing', label: '처리중' },
  { value: 'shipped', label: '발송완료' },
  { value: 'canceled', label: '취소' },
];

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  received: 'received_at',
  confirmed: 'confirmed_at',
  processing: 'processing_at',
  shipped: 'shipped_at',
};

function StatusPicker({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const changeStatus = async (next: OrderStatus) => {
    if (busy || next === order.status) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setOpen(false);
    const timestampCol = STATUS_TIMESTAMP[next];
    const payload: Record<string, unknown> = { status: next };
    if (timestampCol) payload[timestampCol] = new Date().toISOString();
    const { error } = await supabase
      .from('orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq('id', order.id);
    setBusy(false);
    if (error) {
      showToast({ kind: 'error', text: `상태 변경 실패: ${error.message}` });
      return;
    }
    const label = STATUS_OPTIONS.find((o) => o.value === next)?.label ?? next;
    showToast({ kind: 'success', text: `상태가 "${label}"(으)로 변경되었습니다.` });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="상태 변경"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        <StatusBadge status={order.status} />
        <ChevronDown size={11} strokeWidth={1.8} color="var(--ink-3)" />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 40,
            minWidth: 130,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
          }}
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === order.status;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void changeStatus(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: active ? 'var(--brand-wash)' : 'transparent',
                  color: active ? 'var(--brand)' : 'var(--ink-2)',
                  fontSize: 12,
                  fontFamily: 'var(--font-kr)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <StatusBadge status={opt.value} />
                {active && (
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--brand)' }}>
                    현재
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 송장번호 입력 — 거의 1건이지만 복수 등록 가능.
 * 각 행은 택배사 + 송장번호 한 쌍. 기본 택배사 = 로젠택배.
 * 저장 즉시 orders.tracking_numbers (jsonb 배열 of {carrier, number}) 업데이트.
 */
function TrackingNumberSection({
  orderId,
  initialTrackingNumbers,
  currentStatus,
}: {
  orderId: string;
  initialTrackingNumbers: TrackingEntry[];
  currentStatus: string;
}) {
  const queryClient = useQueryClient();
  const initialRows: TrackingEntry[] =
    initialTrackingNumbers.length > 0
      ? initialTrackingNumbers
      : [{ carrier: DEFAULT_CARRIER, number: '' }];
  const [rows, setRows] = useState<TrackingEntry[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<TrackingEntry[]>(initialRows);

  const isDirty = JSON.stringify(rows) !== JSON.stringify(savedSnapshot);

  const persist = async (next: TrackingEntry[]) => {
    const cleaned: TrackingEntry[] = next
      .map((r) => ({ carrier: r.carrier, number: r.number.trim() }))
      .filter((r) => r.number.length > 0);
    setSaving(true);
    // Supabase 자동생성 Json 타입은 모든 키에 index signature 를 요구해 strict
    // 객체 타입과 충돌. payload 는 JSON 직렬화 가능하므로 update 인자 통째로
    // unknown 경유 캐스팅으로 통과.
    // 🔴 신규 4단계 상태: 송장이 실제로 있고 아직 shipped 가 아니면 shipped + shipped_at 자동 기록.
    //    이미 shipped 이면 status/shipped_at 는 건드리지 않음 (재변경 없음).
    const shouldMarkShipped = cleaned.length > 0 && currentStatus !== 'shipped';
    const payload: Record<string, unknown> = { tracking_numbers: cleaned };
    if (shouldMarkShipped) {
      payload.status = 'shipped';
      payload.shipped_at = new Date().toISOString();
    }
    await supabase
      .from('orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq('id', orderId);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    setSaving(false);
    setSavedSnapshot(next);
  };

  /** 입력값에서 하이픈(-) 즉시 제거. */
  const sanitize = (value: string): string => value.replace(/-/g, '');

  const handleNumberChange = (idx: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], number: sanitize(value) };
      return next;
    });
  };

  const handleCarrierChange = (idx: number, code: CarrierCode) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], carrier: code };
      return next;
    });
  };

  const handleSaveClick = () => {
    void persist(rows);
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { carrier: DEFAULT_CARRIER, number: '' }]);
  };

  const handleRemoveRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    const finalRows: TrackingEntry[] =
      next.length > 0 ? next : [{ carrier: DEFAULT_CARRIER, number: '' }];
    setRows(finalRows);
    void persist(finalRows);
  };

  const handleOpenTracking = (entry: TrackingEntry) => {
    const url = getTrackingUrl(entry.carrier, entry.number);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        background: 'var(--tracking-wash-bg)',
        border: '1px solid var(--tracking-wash-border)',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--tracking-label-color)',
          letterSpacing: '0.04em',
        }}
      >
        <Tag size={10} strokeWidth={1.8} />
        송장번호{saving && ' · 저장중…'}
      </div>

      {rows.map((row, idx) => {
        const savedRow = savedSnapshot[idx];
        const isPersisted =
          !!savedRow &&
          savedRow.carrier === row.carrier &&
          savedRow.number === row.number &&
          row.number.trim().length > 0;
        const trackable =
          isPersisted && !!getTrackingUrl(row.carrier, row.number);
        return (
          <div
            key={idx}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <select
              value={row.carrier}
              onChange={(e) =>
                handleCarrierChange(idx, e.target.value as CarrierCode)
              }
              style={{
                height: 28,
                padding: '0 6px',
                fontSize: 12,
                border: '1px solid var(--tracking-input-border)',
                borderRadius: 4,
                background: 'var(--tracking-input-bg)',
                color: 'var(--tracking-input-color)',
                outline: 'none',
                minWidth: 96,
              }}
            >
              {CARRIERS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={row.number}
              onChange={(e) => handleNumberChange(idx, e.target.value)}
              placeholder="운송장 번호 입력"
              style={{
                flex: 1,
                height: 28,
                padding: '0 8px',
                fontSize: 12,
                border: '1px solid var(--tracking-input-border)',
                borderRadius: 4,
                background: 'var(--tracking-input-bg)',
                color: 'var(--tracking-input-color)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => handleOpenTracking(row)}
              disabled={!trackable}
              title={
                trackable
                  ? `${getCarrierLabel(row.carrier)} 조회 새 탭에서 열기`
                  : '저장된 송장번호 + 조회 가능 택배사일 때만 활성'
              }
              style={{
                width: 26,
                height: 26,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                color: trackable ? '#2563EB' : '#CBD5E1',
                cursor: trackable ? 'pointer' : 'not-allowed',
              }}
            >
              <ExternalLink size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => handleRemoveRow(idx)}
              style={{
                width: 22,
                height: 22,
                border: 'none',
                background: 'transparent',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: 13,
              }}
              title="삭제"
            >
              ×
            </button>
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        <button
          type="button"
          onClick={handleAddRow}
          style={{
            fontSize: 11,
            color: '#2563EB',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          + 송장번호 추가
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={!isDirty || saving}
          style={{
            height: 26,
            padding: '0 12px',
            fontSize: 11.5,
            fontWeight: 600,
            color: '#fff',
            background: !isDirty || saving ? '#94A3B8' : '#1C1917',
            border: 'none',
            borderRadius: 4,
            cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '저장중…' : '저장하기'}
        </button>
      </div>
    </div>
  );
}

