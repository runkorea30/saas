/**
 * 모바일 발주서 — 데스크톱 OPS PurchaseOrderPage 와 동일 기능.
 *
 * 액션 (데스크톱과 동일):
 *  1) 발주서 생성: 전 제품 추천 발주수량(calcOrderQty) 자동 입력
 *  2) 현재 카테고리 저장: 선택된(또는 전체) 카테고리별 purchase_orders + items upsert
 *  3) 엑셀 다운로드: ORDER SHEET 양식 (영문명 + 발주단위)
 *  4) 초기화: 이번 달 draft 발주서 삭제 + 입력값 리셋
 *
 * 메인 테이블 컬럼 (좌측 sticky):
 *  코드 / 제품명 / 수입원가($) / 단위 / 판매량(3개월) / 판매량(1개월) / 재고 / 발주수량(DZ input) / 합계($)
 *
 * 🔴 CLAUDE.md §1: company_id useCompany().
 * 🔴 CLAUDE.md §2: 계산은 calculations.ts 의 calcSalesQty3m / calcSalesQty1m / calcOrderQty.
 * 🔴 CLAUDE.md §5: usePurchaseOrder (fetchAllRows 경유) 재사용.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

/** "저장된 분류 전체선택" sentinel — 실제 카테고리명과 충돌 방지. */
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
    categories,
    isLoading,
    error,
  } = usePurchaseOrder(companyId);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [orderQty, setOrderQty] = useState<Map<string, number>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filteredProducts = useMemo(() => {
    const base =
      selectedCategory === null
        ? products
        : selectedCategory === SAVED_ALL_FILTER
          ? products.filter((p) => savedCategories.has(p.category))
          : products.filter((p) => p.category === selectedCategory);
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

  const updateQty = (productId: string, raw: string) => {
    const next = new Map(orderQty);
    const n = Math.max(0, Math.floor(Number(raw)));
    if (!raw.trim() || !Number.isFinite(n) || n === 0) next.delete(productId);
    else next.set(productId, n);
    setOrderQty(next);
  };

  // ───── 액션 1: 발주서 생성 ─────
  const handleGenerate = () => {
    const next = new Map<string, number>();
    for (const p of products) {
      const qty6mExcl = salesMap.get(p.id) ?? 0;
      const qty3m = calcSalesQty3m(qty6mExcl);
      const orderQ = calcOrderQty(qty3m, p.unit_order || p.unit);
      if (orderQ > 0) next.set(p.id, orderQ);
    }
    setOrderQty(next);
    showToast({
      kind: 'success',
      text: `발주서 생성 완료 (${next.size}품목)`,
    });
  };

  // ───── 액션 2: 현재 카테고리 저장 ─────
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
          .filter((p) => p.category === cat && (orderQty.get(p.id) ?? 0) > 0)
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

  // ───── 액션 3: 초기화 ─────
  const handleReset = async () => {
    if (!window.confirm('발주수량을 모두 초기화하시겠습니까?')) return;
    if (!companyId) return;
    setBusy(true);
    try {
      const monthStartIso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const nextMonthIso = new Date(Date.UTC(year, month, 1)).toISOString();
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

  // ───── 액션 4: 엑셀 다운로드 ─────
  const handleDownloadExcel = () => {
    if (savedCategories.size === 0) {
      showToast({ kind: 'error', text: '저장된 카테고리가 없습니다.' });
      return;
    }
    const dateStr = formatDateStr(now);
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

  const handleCategoryClick = (cat: string) => setSelectedCategory(cat);
  const handleSelectSavedCategories = () => {
    if (savedCategories.size === 0) return;
    setSelectedCategory(SAVED_ALL_FILTER);
  };

  return (
    <div>
      <header className="m-page-header" style={{ paddingBottom: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <h1 className="m-page-title">발주서</h1>
          <div style={{ flex: 1 }} />
          <span
            className="m-num"
            style={{
              fontSize: 11,
              color: 'var(--m-text-secondary)',
            }}
          >
            {year}년 {month}월
          </span>
        </div>

        {/* KPI — 가로 스크롤 */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          <KpiCard label="발주 품목" value={`${filledCount}개`} />
          <KpiCard label="총합계" value={`$${formatUsd(totalUsd)}`} tone="brand" />
          <KpiCard
            label="저장 분류"
            value={`${savedCategories.size}개`}
            tone={savedCategories.size > 0 ? 'success' : undefined}
          />
        </div>

        {/* 액션 버튼 — 4개 가로 스크롤 */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <ActionBtn
            label={`1. 생성`}
            onClick={handleGenerate}
            disabled={isLoading || products.length === 0 || busy}
            primary
          />
          <ActionBtn
            label={busy ? '저장 중…' : '2. 저장'}
            onClick={handleSaveCategory}
            disabled={filledCount === 0 || busy}
          />
          <ActionBtn
            label="3. 엑셀"
            onClick={handleDownloadExcel}
            disabled={savedCategories.size === 0 || busy}
          />
          <ActionBtn label="초기화" onClick={handleReset} disabled={busy} />
        </div>
      </header>

      {/* 카테고리 필터 바 — 가로 스크롤 */}
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--m-surface-2)',
          borderBottom: '1px solid var(--m-border)',
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <CategoryChip
          label="전체"
          selected={selectedCategory === null}
          saved={false}
          onClick={() => setSelectedCategory(null)}
        />
        {categories.map((cat) => (
          <CategoryChip
            key={cat}
            label={getCategoryLabel(cat)}
            selected={selectedCategory === cat}
            saved={savedCategories.has(cat)}
            onClick={() => handleCategoryClick(cat)}
          />
        ))}
        <button
          type="button"
          onClick={handleSelectSavedCategories}
          disabled={savedCategories.size === 0}
          style={{
            flexShrink: 0,
            height: 28,
            padding: '0 10px',
            fontSize: 11,
            borderRadius: 999,
            border: '1px solid var(--m-border-strong)',
            background: 'var(--m-surface)',
            color: 'var(--m-text-secondary)',
            cursor: savedCategories.size === 0 ? 'not-allowed' : 'pointer',
            opacity: savedCategories.size === 0 ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          저장된 분류 전체선택
        </button>
      </div>

      {error && (
        <div
          style={{
            margin: '10px 16px',
            padding: '10px 12px',
            background: 'var(--m-danger)' + '11',
            color: 'var(--m-danger)',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          데이터 로딩 실패: {error.message}
        </div>
      )}

      {/* 메인 테이블 — 가로/세로 스크롤 + 좌측 첫 컬럼 sticky */}
      <div style={{ padding: '10px 16px 16px' }}>
        <div
          style={{
            background: 'var(--m-surface)',
            border: '1px solid var(--m-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 320px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 100 }}>
                    코드
                  </th>
                  <th style={{ ...thStyle, minWidth: 150, textAlign: 'left' }}>
                    제품명
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 70 }}>
                    원가($)
                  </th>
                  <th style={{ ...thStyle, minWidth: 50 }}>단위</th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 60 }}>
                    3M
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 60 }}>
                    1M
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 60 }}>
                    재고
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 80 }}>
                    발주(DZ)
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 70 }}>
                    합계($)
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} style={emptyTdStyle}>
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {!isLoading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={9} style={emptyTdStyle}>
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
                      <tr key={p.id} style={rowStyle}>
                        <td
                          style={{
                            ...tdStyle,
                            ...stickyLeftStyle,
                            background: 'var(--m-surface)',
                            fontFamily: 'Inter Tight, system-ui, sans-serif',
                            textAlign: 'left',
                          }}
                          title={p.code}
                        >
                          {p.code}
                        </td>
                        <td
                          style={{ ...tdStyle, textAlign: 'left' }}
                          title={p.name}
                        >
                          {p.name}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            color:
                              p.unit_price_usd == null
                                ? 'var(--m-text-secondary)'
                                : 'var(--m-text)',
                          }}
                        >
                          {p.unit_price_usd != null ? formatUsd(usd) : '—'}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--m-text-secondary)' }}>
                          {p.unit_order || p.unit}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            color: 'var(--m-text-secondary)',
                          }}
                        >
                          {qty3m.toLocaleString('ko-KR')}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            color: 'var(--m-text-secondary)',
                          }}
                        >
                          {qty1m.toLocaleString('ko-KR')}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            color: 'var(--m-text-secondary)',
                          }}
                        >
                          {stock.toLocaleString('ko-KR')}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={qty === 0 ? '' : qty}
                            onChange={(e) => updateQty(p.id, e.target.value)}
                            placeholder="0"
                            style={{
                              width: 64,
                              height: 26,
                              padding: '0 6px',
                              border: '1px solid var(--m-border-strong)',
                              borderRadius: 4,
                              fontSize: 12,
                              textAlign: 'right',
                              fontFamily: 'Inter Tight, system-ui, sans-serif',
                              background: 'var(--m-surface)',
                              color: 'var(--m-text)',
                              outline: 'none',
                            }}
                          />
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontWeight: qty > 0 ? 600 : 400,
                            color:
                              qty > 0
                                ? 'var(--m-primary)'
                                : 'var(--m-text-secondary)',
                          }}
                        >
                          {qty > 0 ? formatUsd(lineTotal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: 'var(--m-text-secondary)',
            textAlign: 'right',
          }}
        >
          {filteredProducts.length}품목 · 발주 {filledCount}품목 · 총
          ${formatUsd(totalUsd)}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 하위 컴포넌트
// ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'success';
}) {
  const color =
    tone === 'brand'
      ? 'var(--m-primary)'
      : tone === 'success'
        ? 'var(--m-success)'
        : 'var(--m-text)';
  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--m-surface)',
        border: '1px solid var(--m-border)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 92,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--m-text-secondary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        className="m-num"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flexShrink: 0,
        height: 30,
        padding: '0 12px',
        border: `1px solid ${primary ? 'var(--m-primary)' : 'var(--m-border-strong)'}`,
        borderRadius: 6,
        background: primary
          ? disabled
            ? 'var(--m-surface-2)'
            : 'var(--m-primary)'
          : 'var(--m-surface)',
        color: primary
          ? disabled
            ? 'var(--m-text-secondary)'
            : '#ffffff'
          : 'var(--m-text)',
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !primary ? 0.55 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function CategoryChip({
  label,
  selected,
  saved,
  onClick,
}: {
  label: string;
  selected: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  let background = 'var(--m-surface)';
  let color = 'var(--m-text)';
  let borderColor = 'var(--m-border-strong)';
  if (selected) {
    background = 'var(--m-primary)';
    color = '#ffffff';
    borderColor = 'var(--m-primary)';
  } else if (saved) {
    background = '#DCFCE7';
    color = '#166534';
    borderColor = '#22C55E';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        height: 28,
        padding: '0 10px',
        borderRadius: 999,
        border: `1px solid ${borderColor}`,
        background,
        color,
        fontSize: 11.5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// 테이블 스타일
// ───────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11.5,
};

const theadRowStyle: React.CSSProperties = {
  background: 'var(--m-surface-2)',
  borderBottom: '1px solid var(--m-border)',
};

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--m-border)',
};

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--m-text-secondary)',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  borderRight: '1px solid var(--m-border)',
  position: 'sticky',
  top: 0,
  background: 'var(--m-surface-2)',
  zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  whiteSpace: 'nowrap',
  borderRight: '1px solid var(--m-border)',
  color: 'var(--m-text)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
};

const stickyLeftStyle: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
};

const emptyTdStyle: React.CSSProperties = {
  padding: 30,
  textAlign: 'center',
  color: 'var(--m-text-secondary)',
  fontSize: 12,
};
