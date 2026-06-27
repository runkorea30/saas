/**
 * 발주서 페이지 — 재고매입 > 발주서.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만 (하드코딩 금지).
 * 🔴 CLAUDE.md §2: 모든 계산식은 calculations.ts (`calcSalesQty3m` / `calcSalesQty1m` / `calcOrderQty`).
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 fetchAllRows 경유 (usePurchaseOrder 내부).
 *
 * 핵심 동작:
 *  - "발주서 생성" → 전 제품에 대해 calcOrderQty(qty3m, unit) 자동 입력
 *  - "현재 카테고리 저장" → 선택된(혹은 전체) 카테고리별로 purchase_orders + items upsert
 *      · po_number = `PO-{YYYY}-{MM}-{카테고리}` (같은 번호 있으면 DELETE 후 INSERT)
 *      · template_id = 카테고리명 (저장 여부 추적용)
 *  - "초기화" → 이번 달 모든 draft 발주서 삭제 + orderQty 리셋
 *  - "엑셀" → savedCategories 의 품목만 ORDER SHEET 양식으로 다운로드
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, RefreshCw, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCompany } from '@/hooks/useCompany';
import { usePurchaseOrder } from '@/hooks/queries/usePurchaseOrder';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import {
  calcOrderQty,
  calcSalesQty1m,
  calcSalesQty3m,
} from '@/utils/calculations';
import { getCategoryLabel } from '@/constants/categories';
import { sortByCategory } from '@/utils/sortProducts';

const SAVED_QUERY_KEY = 'purchase-order-saved-categories';

/**
 * "저장된 분류 전체선택" 의 가상 단일-선택 sentinel.
 *
 * 🟠 카테고리 필터는 단일 선택(`selectedCategory: string | null`) 모델이지만,
 *    "저장된 분류 전체선택" 버튼은 사용자 요구상 그대로 유지해야 한다.
 *    실제 카테고리 이름과 충돌하지 않는 sentinel 한 값으로 표현해
 *    상태 자체는 단일 string 으로 유지한다.
 */
const SAVED_ALL_FILTER = '__SAVED_ALL__';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function PurchaseOrderPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const {
    products,
    salesMap,
    stockMap,
    savedCategories,
    savedItemCount,
    savedTotalUsd,
    categories,
    isLoading,
    error,
  } = usePurchaseOrder(companyId);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  /** product_id → 발주수량 (EA). 0/없음 = 빈칸. */
  const [orderQty, setOrderQty] = useState<Map<string, number>>(new Map());
  /**
   * 선택된 카테고리 (단일 선택).
   * - `null` : 전체
   * - `SAVED_ALL_FILTER` : 저장된 분류 전체선택 모드 (가상)
   * - 그 외 : 해당 카테고리 단일
   */
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 발주 기준: '1m' = 1개월 판매량, '3m' = 3개월 판매량 (기본값 '3m') */
  const [salesBasis, setSalesBasis] = useState<'1m' | '3m'>('3m');
  /** 목표 주문금액 임계값 (USD) — 기본 $4,000 */
  const [threshold, setThreshold] = useState<number>(4000);
  const [thresholdInput, setThresholdInput] = useState<string>('4000');

  const filteredProducts = useMemo(() => {
    const base =
      selectedCategory === null
        ? products
        : selectedCategory === SAVED_ALL_FILTER
          ? products.filter((p) => savedCategories.has(p.category))
          : products.filter((p) => p.category === selectedCategory);
    // 분류명 → 제품명 오름차순.
    return sortByCategory(base);
  }, [products, selectedCategory, savedCategories]);

  const totalUsd = useMemo(() => {
    let sum = 0;
    for (const p of products) {
      const qty = orderQty.get(p.id) ?? 0;
      if (qty > 0 && p.unit_price_usd) sum += qty * Number(p.unit_price_usd);
    }
    return sum;
  }, [products, orderQty]);

  const filledCount = useMemo(() => {
    let n = 0;
    for (const v of orderQty.values()) if (v > 0) n++;
    return n;
  }, [orderQty]);

  /** totalUsd 기준 목표 달성 여부 + 부족금액 + 달성률(%) */
  const thresholdStatus = useMemo(() => {
    return {
      reached: totalUsd >= threshold,
      diff: Math.abs(totalUsd - threshold),
      percent: threshold > 0 ? Math.min((totalUsd / threshold) * 100, 100) : 0,
    };
  }, [totalUsd, threshold]);

  // ───── 액션 ─────

  const updateQty = (productId: string, raw: string) => {
    const next = new Map(orderQty);
    const n = Math.max(0, Math.floor(Number(raw)));
    if (!raw.trim() || !Number.isFinite(n) || n === 0) next.delete(productId);
    else next.set(productId, n);
    setOrderQty(next);
  };

  /** 발주서 생성 — 모든 제품의 추천 발주수량을 자동 입력. */
  const handleGenerate = () => {
    const next = new Map<string, number>();
    for (const p of products) {
      const qty6mExcl = salesMap.get(p.id) ?? 0;
      const qty3m = calcSalesQty3m(qty6mExcl);
      // salesBasis 에 따라 기준 수량 결정 (1m = 3m / 3)
      const baseQty = salesBasis === '1m' ? calcSalesQty1m(qty3m) : qty3m;
      // 🟠 unit_order 우선 — 없으면 unit 로 폴백. DZ 면 calcOrderQty 가 /12.
      const orderQ = calcOrderQty(baseQty, p.unit_order || p.unit);
      if (orderQ > 0) next.set(p.id, orderQ);
    }
    setOrderQty(next);
    const basisLabel = salesBasis === '1m' ? '1개월' : '3개월';
    showToast({
      kind: 'success',
      text: `발주서 생성 완료 (${next.size}품목 · ${basisLabel} 기준)`,
    });
  };

  /** 초기화 — 이번 달 draft 발주서 전체 삭제 + orderQty 리셋. */
  const handleReset = async () => {
    if (!window.confirm('발주수량을 모두 초기화하시겠습니까?')) return;
    if (!companyId) return;
    setBusy(true);
    try {
      const monthStartIso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const nextMonthIso = new Date(Date.UTC(year, month, 1)).toISOString();

      // 헤더 조회 → CASCADE 로 items 도 함께 삭제됨 (FK ON DELETE CASCADE)
      const { data: rows, error: selErr } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'draft')
        .gte('po_date', monthStartIso)
        .lt('po_date', nextMonthIso)
        .is('deleted_at', null);
      if (selErr) throw selErr;

      if (rows && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        // 명시적 순서 — items 먼저, 헤더 다음 (FK 안전).
        const { error: itemsDelErr } = await supabase
          .from('purchase_order_items')
          .delete()
          .in('purchase_order_id', ids);
        if (itemsDelErr) throw itemsDelErr;
        const { error: hdrDelErr } = await supabase
          .from('purchase_orders')
          .delete()
          .in('id', ids);
        if (hdrDelErr) throw hdrDelErr;
      }

      setOrderQty(new Map());
      await queryClient.invalidateQueries({
        queryKey: [SAVED_QUERY_KEY, companyId],
      });
      showToast({ kind: 'success', text: '초기화 완료' });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '초기화 실패',
      });
    } finally {
      setBusy(false);
    }
  };

  /** 카테고리 단일 선택 — 클릭한 카테고리만 활성화. */
  const handleCategoryClick = (cat: string) => {
    setSelectedCategory(cat);
  };

  /** 저장된 분류 전체선택 — 가상 sentinel 로 표시 (단일 선택 모델 유지). */
  const handleSelectSavedCategories = () => {
    if (savedCategories.size === 0) return;
    setSelectedCategory(SAVED_ALL_FILTER);
  };

  /** 현재 카테고리 저장 — 선택 상태에 따라 대상 카테고리 결정. */
  const handleSaveCategory = async () => {
    if (!companyId) return;
    const targetCats =
      selectedCategory === null
        ? categories
        : selectedCategory === SAVED_ALL_FILTER
          ? Array.from(savedCategories)
          : [selectedCategory];
    if (targetCats.length === 0) {
      showToast({ kind: 'error', text: '저장할 카테고리가 없습니다.' });
      return;
    }
    setBusy(true);
    try {
      const monthYY = `${year}-${pad2(month)}`;
      let savedCount = 0;
      const skipped: string[] = [];

      for (const cat of targetCats) {
        const items = products
          .filter(
            (p) => p.category === cat && (orderQty.get(p.id) ?? 0) > 0,
          )
          .map((p) => ({
            product_id: p.id,
            quantity: orderQty.get(p.id)!,
            unit_price_usd:
              p.unit_price_usd != null ? Number(p.unit_price_usd) : null,
          }));
        if (items.length === 0) {
          skipped.push(cat);
          continue;
        }

        const poNumber = `PO-${monthYY}-${cat}`;

        // 같은 po_number 의 기존 draft 삭제 (있을 수 있음)
        const { data: existing, error: selErr } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('company_id', companyId)
          .eq('po_number', poNumber)
          .is('deleted_at', null);
        if (selErr) throw selErr;
        if (existing && existing.length > 0) {
          const ids = existing.map((r) => r.id);
          const { error: delItemsErr } = await supabase
            .from('purchase_order_items')
            .delete()
            .in('purchase_order_id', ids);
          if (delItemsErr) throw delItemsErr;
          const { error: delHdrErr } = await supabase
            .from('purchase_orders')
            .delete()
            .in('id', ids);
          if (delHdrErr) throw delHdrErr;
        }

        const total = items.reduce(
          (s, it) => s + it.quantity * (it.unit_price_usd ?? 0),
          0,
        );

        const { data: header, error: insErr } = await supabase
          .from('purchase_orders')
          .insert({
            company_id: companyId,
            po_number: poNumber,
            po_date: new Date().toISOString(),
            template_id: cat,
            currency: 'USD',
            total_amount: total,
            status: 'draft',
          })
          .select('id')
          .single();
        if (insErr || !header) throw insErr ?? new Error('발주서 헤더 생성 실패');

        const { error: itemsErr } = await supabase
          .from('purchase_order_items')
          .insert(
            items.map((it) => ({
              purchase_order_id: header.id,
              company_id: companyId,
              product_id: it.product_id,
              quantity: it.quantity,
              unit_price_usd: it.unit_price_usd,
            })),
          );
        if (itemsErr) throw itemsErr;

        savedCount++;
      }

      await queryClient.invalidateQueries({
        queryKey: [SAVED_QUERY_KEY, companyId],
      });

      if (savedCount === 0) {
        showToast({ kind: 'error', text: '저장할 품목이 없습니다.' });
      } else {
        const skipMsg = skipped.length > 0 ? ` (품목 0인 ${skipped.length}개 분류 건너뜀)` : '';
        showToast({
          kind: 'success',
          text: `${savedCount}개 카테고리 저장 완료${skipMsg}`,
        });
      }
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '저장 실패',
      });
    } finally {
      setBusy(false);
    }
  };

  /** 엑셀 다운로드 — savedCategories 의 품목만 ORDER SHEET 양식으로. */
  const handleDownloadExcel = () => {
    if (savedCategories.size === 0) {
      showToast({ kind: 'error', text: '저장된 카테고리가 없습니다.' });
      return;
    }
    const dateStr = formatDateStr(now);

    // 카테고리 정렬 순서 유지 (categories 는 이미 정렬됨).
    const orderedCats = categories.filter((c) => savedCategories.has(c));
    const lines: Array<{
      code: string;
      name: string;
      unit: string;
      price: number | '';
      qty: number;
      amount: number;
    }> = [];
    for (const cat of orderedCats) {
      for (const p of products) {
        if (p.category !== cat) continue;
        const qty = orderQty.get(p.id) ?? 0;
        if (qty <= 0) continue;
        const price = p.unit_price_usd != null ? Number(p.unit_price_usd) : 0;
        // 미국 공급사 발주서 — 영문명/발주단위 우선, 없으면 한글명/판매단위로 폴백.
        // 수량은 이미 calcOrderQty 로 unit_order 환산을 거친 값이므로 그대로 출력.
        lines.push({
          code: p.code,
          name: p.name_en || p.name,
          unit: p.unit_order || p.unit,
          price: p.unit_price_usd != null ? price : '',
          qty,
          amount: Number((qty * price).toFixed(2)),
        });
      }
    }
    if (lines.length === 0) {
      showToast({ kind: 'error', text: '다운로드할 품목이 없습니다.' });
      return;
    }

    const aoa: (string | number)[][] = [
      ['ORDER SHEET', '', '', '', `DATE: ${dateStr}`, ''],
      ['RUNKOREA', '', '', '', '', ''],
      ['ZIPCODE : 16348', '', '', '', '', ''],
      [
        '92, Gyeongsudaero 1081beongil, Jangangu, Suwonsi, Gyeonggido, Republic of Korea',
        '',
        '',
        '',
        '',
        '',
      ],
      ['Tel :  01089811434', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['CODE', 'DESCRIPTION', 'UNIT', 'PRICE', 'QTY', 'AMOUNT'],
    ];
    for (const it of lines) {
      aoa.push([it.code, it.name, it.unit, it.price, it.qty, it.amount]);
    }
    aoa.push(['TOTAL', '', '', '', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 36 },
      { wch: 8 },
      { wch: 10 },
      { wch: 8 },
      { wch: 12 },
    ];

    // TOTAL 행의 F 열에 SUM 수식 설정. 데이터 시작행 = 8 (1-based).
    const totalRowIdx = aoa.length;
    const dataStart = 8;
    const dataEnd = totalRowIdx - 1;
    ws[`F${totalRowIdx}`] = {
      t: 'n',
      f: `SUM(F${dataStart}:F${dataEnd})`,
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ORDER SHEET');
    XLSX.writeFile(wb, `ORDER_SHEET_${dateStr}.xlsx`);
  };

  // ───── 렌더 ─────

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
            재고매입 › 발주서
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="disp"
              style={{
                fontSize: 26,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              발주서
            </h1>
            <div
              style={{
                display: 'flex',
                gap: 18,
                flex: 1,
                flexWrap: 'wrap',
                paddingBottom: 4,
              }}
            >
              <SummaryItem
                label="기준"
                value={`${year}년 ${month}월`}
                sub="(최근 6개월 판매 기준)"
              />
              {/* 🔴 상단 KPI는 DB 저장된 purchase_orders + items 기준 — 미저장 입력 제외. */}
              <SummaryItem label="발주 품목" value={`${savedItemCount}개`} />
              <SummaryItem
                label="총합계 USD"
                value={`$${formatUsd(savedTotalUsd)}`}
                tone="brand"
              />
              <SummaryItem
                label="저장된 분류"
                value={`${savedCategories.size}개`}
                tone={savedCategories.size > 0 ? 'success' : undefined}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* 1개월 / 3개월 기준 토글 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: 2,
                  background: 'var(--surface)',
                }}
              >
                {(['1m', '3m'] as const).map((basis) => (
                  <button
                    key={basis}
                    type="button"
                    onClick={() => setSalesBasis(basis)}
                    style={{
                      height: 26,
                      padding: '0 10px',
                      fontSize: 12,
                      fontWeight: salesBasis === basis ? 600 : 400,
                      borderRadius: 4,
                      border: 'none',
                      background: salesBasis === basis ? 'var(--ink)' : 'transparent',
                      color: salesBasis === basis ? '#fff' : 'var(--ink-2)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    title={basis === '1m' ? '1개월 판매량 기준' : '3개월 판매량 기준'}
                  >
                    {basis === '1m' ? '1개월' : '3개월'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading || products.length === 0 || busy}
                className="btn-base primary"
                style={{ height: 32, fontSize: 12.5 }}
                title="당월 제외 6개월 판매량 기반 추천 발주수량 자동 입력"
              >
                <FileSpreadsheet size={13} />
                <StepBadge tone="onPrimary">1단계</StepBadge>
                발주서 생성
              </button>
              <button
                type="button"
                onClick={handleSaveCategory}
                disabled={filledCount === 0 || busy}
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
                title="선택된 카테고리(없으면 전체)별로 발주서 저장"
              >
                <Save size={13} />
                <StepBadge>2단계</StepBadge>
                {busy ? '저장 중…' : '현재 카테고리 저장'}
              </button>
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={savedCategories.size === 0 || busy}
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
                title="저장된 카테고리 품목만 ORDER SHEET 양식으로 다운로드"
              >
                <Download size={13} />
                <StepBadge>3단계</StepBadge>
                엑셀 다운로드
              </button>
              <span
                style={{
                  width: 1,
                  height: 18,
                  background: 'var(--line)',
                  margin: '0 4px',
                }}
                aria-hidden
              />
              <button
                type="button"
                onClick={handleReset}
                disabled={busy}
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
                title="이번 달 발주서 저장본 및 입력값 초기화"
              >
                <RefreshCw size={13} /> 초기화
              </button>
            </div>
            {/* 목표금액 실시간 알림 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${thresholdStatus.reached ? 'var(--success)' : 'var(--line)'}`,
                background: thresholdStatus.reached
                  ? 'var(--success-wash)'
                  : 'var(--surface)',
                minWidth: 220,
                marginLeft: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  목표
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>$</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={thresholdInput}
                  onChange={(e) => {
                    setThresholdInput(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0) setThreshold(n);
                  }}
                  style={{
                    width: 68,
                    height: 22,
                    padding: '0 4px',
                    border: '1px solid var(--line)',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'var(--font-num)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                    textAlign: 'right',
                  }}
                />
              </div>
              <span style={{ width: 1, height: 14, background: 'var(--line)' }} />
              <div style={{ flex: 1 }}>
                {thresholdStatus.reached ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>
                    ✅ 목표 달성! ${formatUsd(totalUsd)}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
                      현재 ${formatUsd(totalUsd)}
                      <span style={{ marginLeft: 6, color: 'var(--danger)', fontWeight: 600 }}>
                        -${formatUsd(thresholdStatus.diff)} 부족
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 4,
                        background: 'var(--line)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${thresholdStatus.percent}%`,
                          height: '100%',
                          background:
                            thresholdStatus.percent >= 80
                              ? 'var(--warning)'
                              : 'var(--accent, #2563eb)',
                          borderRadius: 2,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                      {thresholdStatus.percent.toFixed(0)}% 달성
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* 카테고리 필터 바 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
            padding: '10px 12px',
            background: 'var(--surface-2, #fafafa)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <CategoryButton
            label="전체"
            isSelected={selectedCategory === null}
            isSaved={false}
            onClick={() => setSelectedCategory(null)}
          />
          {categories.map((cat) => (
            <CategoryButton
              key={cat}
              label={getCategoryLabel(cat)}
              isSelected={selectedCategory === cat}
              isSaved={savedCategories.has(cat)}
              onClick={() => handleCategoryClick(cat)}
            />
          ))}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleSelectSavedCategories}
            disabled={savedCategories.size === 0}
            className="btn-base"
            style={{ height: 28, fontSize: 12 }}
            title="저장된 카테고리 모두 선택"
          >
            저장된 분류 전체선택
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--danger-wash)',
              color: 'var(--danger)',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 12,
            }}
          >
            데이터 로딩 실패: {error.message}
          </div>
        )}

        {/* 메인 테이블 */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--surface-2, #fafafa)',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <Th>코드</Th>
                  <Th align="left">제품명</Th>
                  <Th align="right">수입원가($)</Th>
                  <Th align="center">단위</Th>
                  <Th align="right">판매량(3개월)</Th>
                  <Th align="right">판매량(1개월)</Th>
                  <Th align="right">재고수량</Th>
                  <Th align="right">발주수량(DZ)</Th>
                  <Th align="right">합계($)</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        padding: 40,
                        textAlign: 'center',
                        color: 'var(--ink-3)',
                      }}
                    >
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {!isLoading && filteredProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        padding: 40,
                        textAlign: 'center',
                        color: 'var(--ink-3)',
                      }}
                    >
                      표시할 제품이 없습니다.
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filteredProducts.map((p) => {
                    const qty6mExcl = salesMap.get(p.id) ?? 0;
                    const qty3m = calcSalesQty3m(qty6mExcl);
                    const qty1m = calcSalesQty1m(qty3m);
                    const stock = stockMap.get(p.id) ?? 0;
                    const qty = orderQty.get(p.id) ?? 0;
                    const usd =
                      p.unit_price_usd != null ? Number(p.unit_price_usd) : 0;
                    const lineTotal = qty * usd;
                    return (
                      <tr
                        key={p.id}
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        <Td>
                          <span className="num">{p.code}</span>
                        </Td>
                        <Td align="left">{p.name}</Td>
                        <Td align="right" muted={p.unit_price_usd == null}>
                          {p.unit_price_usd != null ? formatUsd(usd) : '—'}
                        </Td>
                        <Td align="center" muted>
                          {p.unit}
                        </Td>
                        <Td align="right" muted>
                          {qty3m.toLocaleString('ko-KR')}
                        </Td>
                        <Td align="right" muted>
                          {qty1m.toLocaleString('ko-KR')}
                        </Td>
                        <Td align="right" muted>
                          {stock.toLocaleString('ko-KR')}
                        </Td>
                        <Td align="right">
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
                              border: '1px solid var(--line)',
                              borderRadius: 4,
                              fontSize: 13,
                              textAlign: 'right',
                              fontFamily: 'var(--font-num)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        </Td>
                        <Td align="right">
                          {qty > 0 ? (
                            <span
                              className="num"
                              style={{
                                fontWeight: 600,
                                color: 'var(--ink)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatUsd(lineTotal)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ink-4, #ccc)' }}>
                              —
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: 'var(--ink-3)',
            textAlign: 'right',
          }}
        >
          총 {filteredProducts.length}품목 표시 · 발주 {filledCount}품목 ·
          총합계 ${formatUsd(totalUsd)}
        </div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function StepBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'onPrimary';
}) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: 'var(--font-num)',
        letterSpacing: '0.04em',
        color: tone === 'onPrimary' ? 'rgba(255,255,255,0.78)' : 'var(--ink-3)',
        marginLeft: 4,
        marginRight: 2,
      }}
    >
      {children}
    </span>
  );
}

function CategoryButton({
  label,
  isSelected,
  isSaved,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  isSaved: boolean;
  onClick: () => void;
}) {
  // 우선순위: selected > saved > 기본
  let background = 'transparent';
  let color = 'var(--ink)';
  let borderColor = 'var(--line)';
  if (isSelected) {
    background = '#6B1F2A';
    color = '#ffffff';
    borderColor = '#6B1F2A';
  } else if (isSaved) {
    background = '#DCFCE7'; // tailwind green-100
    color = '#166534'; // green-800
    borderColor = '#22C55E'; // green-500
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-base"
      style={{
        height: 28,
        fontSize: 12,
        background,
        color,
        borderColor,
      }}
    >
      {label}
    </button>
  );
}

function SummaryItem({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'brand' | 'success';
}) {
  const color =
    tone === 'brand'
      ? 'var(--brand)'
      : tone === 'success'
        ? 'var(--success)'
        : 'var(--ink)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {sub && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--ink-3)',
              marginLeft: 6,
            }}
          >
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

function Th({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <th
      style={{
        padding: '10px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ink-2)',
        textAlign: align,
        whiteSpace: 'nowrap',
        borderRight: '1px solid var(--line)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'center',
  muted,
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  muted?: boolean;
}) {
  return (
    <td
      style={{
        padding: '8px 12px',
        textAlign: align,
        color: muted ? 'var(--ink-3)' : 'var(--ink)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        borderRight: '1px solid var(--line)',
        background: muted ? 'var(--surface-2, #fafafa)' : 'var(--surface)',
      }}
    >
      {children}
    </td>
  );
}
