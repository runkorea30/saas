/**
 * 발주서 페이지 — 재고매입 > 발주서.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만 (하드코딩 금지).
 * 🔴 CLAUDE.md §2: 발주 추천 수량 산식은 calculations.ts 의 `calcPurchaseOrderQty`.
 * 🔴 CLAUDE.md §5: 모든 목록 조회는 fetchAllRows 경유 (`usePurchaseOrder` 내부).
 *
 * 핵심 동작:
 *  - "발주서 생성" → 전 제품에 대해 calcPurchaseOrderQty(qty3m, stock) 자동 입력
 *  - "저장" → 같은 월 draft 삭제 후 purchase_orders + purchase_order_items 재insert
 *  - "초기화" → 발주수량 전부 0 (confirm 후)
 *  - "엑셀" → 발주수량>0 품목만 xlsx 다운로드
 *  - localStorage 키: mc.purchase-order.lastSaved (ISO)
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCompany } from '@/hooks/useCompany';
import { usePurchaseOrder } from '@/hooks/queries/usePurchaseOrder';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { calcPurchaseOrderQty } from '@/utils/calculations';
import { getCategoryLabel } from '@/constants/categories';

const LAST_SAVED_KEY = 'mc.purchase-order.lastSaved';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PurchaseOrderPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const { products, salesMap, stockMap, categories, isLoading, error } =
    usePurchaseOrder(companyId);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  /** product_id → 발주수량 (EA). 0 또는 없으면 빈칸. */
  const [orderQty, setOrderQty] = useState<Map<string, number>>(new Map());
  /** 선택된 카테고리. 빈 배열이면 전체. */
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  /** localStorage 에서 복원되는 마지막 저장 시각 (ISO). */
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LAST_SAVED_KEY);
    if (saved) setLastSavedAt(saved);
  }, []);

  const filteredProducts = useMemo(() => {
    if (selectedCategories.length === 0) return products;
    const set = new Set(selectedCategories);
    return products.filter((p) => set.has(p.category));
  }, [products, selectedCategories]);

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

  // ───── 액션 ─────

  const updateQty = (productId: string, raw: string) => {
    const next = new Map(orderQty);
    const n = Math.max(0, Math.floor(Number(raw)));
    if (!raw.trim() || !Number.isFinite(n) || n === 0) next.delete(productId);
    else next.set(productId, n);
    setOrderQty(next);
  };

  const handleGenerate = () => {
    const next = new Map<string, number>();
    for (const p of products) {
      const qty3m = salesMap.get(p.id)?.qty_3m ?? 0;
      const stock = stockMap.get(p.id) ?? 0;
      const suggested = calcPurchaseOrderQty(qty3m, stock);
      if (suggested > 0) next.set(p.id, suggested);
    }
    setOrderQty(next);
    showToast({
      kind: 'success',
      text: `발주서 생성 완료 (${next.size}품목)`,
    });
  };

  const handleReset = () => {
    if (orderQty.size === 0) return;
    if (!window.confirm('발주수량을 모두 0으로 초기화하시겠습니까?')) return;
    setOrderQty(new Map());
  };

  const handleSelectSavedCategories = () => {
    const set = new Set<string>();
    for (const p of products) {
      if ((orderQty.get(p.id) ?? 0) > 0 && p.category) set.add(p.category);
    }
    setSelectedCategories(Array.from(set));
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = async () => {
    if (!companyId) return;
    const items = products
      .filter((p) => (orderQty.get(p.id) ?? 0) > 0)
      .map((p) => ({
        product_id: p.id,
        quantity: orderQty.get(p.id)!,
        unit_price_usd: p.unit_price_usd != null ? Number(p.unit_price_usd) : null,
      }));
    if (items.length === 0) {
      showToast({ kind: 'error', text: '발주 수량이 입력된 품목이 없습니다.' });
      return;
    }
    setSaving(true);
    try {
      const poPrefix = `PO-${year}-${pad2(month)}-`;

      // 같은 월 draft 삭제 (헤더 + items)
      const { data: existing, error: selErr } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'draft')
        .like('po_number', `${poPrefix}%`)
        .is('deleted_at', null);
      if (selErr) throw selErr;

      if (existing && existing.length > 0) {
        const ids = existing.map((r) => r.id);
        const { error: delItemsErr } = await supabase
          .from('purchase_order_items')
          .delete()
          .in('purchase_order_id', ids);
        if (delItemsErr) throw delItemsErr;
        const { error: delHeaderErr } = await supabase
          .from('purchase_orders')
          .delete()
          .in('id', ids);
        if (delHeaderErr) throw delHeaderErr;
      }

      const total = items.reduce(
        (s, it) => s + it.quantity * (it.unit_price_usd ?? 0),
        0,
      );
      const poNumber = `${poPrefix}${Date.now()}`;

      const { data: header, error: insErr } = await supabase
        .from('purchase_orders')
        .insert({
          company_id: companyId,
          po_number: poNumber,
          po_date: new Date().toISOString(),
          template_id: 'default',
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

      const nowIso = new Date().toISOString();
      localStorage.setItem(LAST_SAVED_KEY, nowIso);
      setLastSavedAt(nowIso);
      showToast({
        kind: 'success',
        text: `발주서 저장 완료 (${items.length}품목 · $${formatUsd(total)})`,
      });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '저장 실패',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const items = products.filter((p) => (orderQty.get(p.id) ?? 0) > 0);
    if (items.length === 0) {
      showToast({ kind: 'error', text: '다운로드할 품목이 없습니다.' });
      return;
    }
    const header = [
      '코드',
      '제품명',
      '수입원가($)',
      '단위',
      '판매량(3개월)',
      '판매량(1개월)',
      '재고수량',
      '발주수량',
      '합계($)',
    ];
    const body = items.map((p) => {
      const qty = orderQty.get(p.id) ?? 0;
      const sales = salesMap.get(p.id) ?? { qty_3m: 0, qty_1m: 0 };
      const stock = stockMap.get(p.id) ?? 0;
      const usd = p.unit_price_usd != null ? Number(p.unit_price_usd) : 0;
      return [
        p.code,
        p.name,
        p.unit_price_usd != null ? Number(p.unit_price_usd) : '',
        p.unit,
        sales.qty_3m,
        sales.qty_1m,
        stock,
        qty,
        Number((qty * usd).toFixed(2)),
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 36 },
      { wch: 12 },
      { wch: 8 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '발주서');
    XLSX.writeFile(wb, `발주서_${year}년${pad2(month)}월.xlsx`);
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
            재고매입 › 발주서
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
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
              <SummaryItem label="기준" value={`${year}년 ${month}월`} />
              <SummaryItem label="판매 기간" value="최근 6개월" />
              <SummaryItem label="발주 품목" value={`${filledCount}개`} />
              <SummaryItem
                label="총합계 USD"
                value={`$${formatUsd(totalUsd)}`}
                tone="brand"
              />
              {lastSavedAt && (
                <SummaryItem
                  label="마지막 저장"
                  value={formatDateTime(lastSavedAt)}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={filledCount === 0}
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
                title="발주 수량이 입력된 품목만 엑셀로 다운로드"
              >
                <Download size={13} /> 엑셀
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={orderQty.size === 0 || saving}
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
                title="발주수량 전체 0으로 초기화"
              >
                <RefreshCw size={13} /> 초기화
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={filledCount === 0 || saving}
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Save size={13} /> {saving ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading || products.length === 0}
                className="btn-base primary"
                style={{ height: 32, fontSize: 12.5 }}
                title="최근 3개월 판매량 기준으로 발주수량 자동 입력"
              >
                <FileSpreadsheet size={13} /> 발주서 생성
              </button>
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
          <button
            type="button"
            onClick={() => setSelectedCategories([])}
            className="btn-base"
            style={{
              height: 28,
              fontSize: 12,
              background:
                selectedCategories.length === 0
                  ? 'var(--brand)'
                  : 'transparent',
              color:
                selectedCategories.length === 0 ? '#FDFAF4' : 'var(--ink)',
              borderColor:
                selectedCategories.length === 0
                  ? 'var(--brand)'
                  : 'var(--line)',
            }}
          >
            전체
          </button>
          {categories.map((cat) => {
            const active = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className="btn-base"
                style={{
                  height: 28,
                  fontSize: 12,
                  background: active ? 'var(--brand)' : 'transparent',
                  color: active ? '#FDFAF4' : 'var(--ink)',
                  borderColor: active ? 'var(--brand)' : 'var(--line)',
                }}
              >
                {getCategoryLabel(cat)}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={handleSelectSavedCategories}
            disabled={filledCount === 0}
            className="btn-base"
            style={{ height: 28, fontSize: 12 }}
            title="발주수량이 입력된 품목이 있는 분류만 선택"
          >
            저장된 분류 전체선택
          </button>
        </div>

        {/* 에러 */}
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
                  <Th align="right">발주수량</Th>
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
                    const sales = salesMap.get(p.id) ?? {
                      qty_3m: 0,
                      qty_1m: 0,
                    };
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
                          {sales.qty_3m.toLocaleString('ko-KR')}
                        </Td>
                        <Td align="right" muted>
                          {sales.qty_1m.toLocaleString('ko-KR')}
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

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand';
}) {
  const color = tone === 'brand' ? 'var(--brand)' : 'var(--ink)';
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
      }}
    >
      {children}
    </td>
  );
}
