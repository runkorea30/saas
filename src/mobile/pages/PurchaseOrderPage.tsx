/**
 * 모바일 발주서.
 * - usePurchaseOrder 재사용 — 저장된 카테고리 품목을 모바일 양식으로 표시.
 * - 영문명(name_en) 우선, 발주단위(unit_order)/판매단위(unit) 폴백.
 * - 수량은 calcOrderQty 결과(이미 unit_order 환산됨).
 * - 엑셀 다운로드: ORDER SHEET 양식 (데스크톱 PurchaseOrderPage 와 동일 구조).
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 * 🔴 CLAUDE.md §2: calcOrderQty / calcSalesQty3m 재사용.
 */
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useCompany } from '@/hooks/useCompany';
import { usePurchaseOrder } from '@/hooks/queries/usePurchaseOrder';
import { calcOrderQty, calcSalesQty3m } from '@/utils/calculations';
import { getCategoryLabel } from '@/constants/categories';

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface LineRow {
  productId: string;
  code: string;
  nameEn: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
  category: string;
}

export function PurchaseOrderPage() {
  const { companyId } = useCompany();
  const { products, salesMap, savedCategories, categories, isLoading } =
    usePurchaseOrder(companyId);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  // 저장된 카테고리만 탭으로 표시. 첫 카테고리 자동 선택.
  const tabs = useMemo(
    () => categories.filter((c) => savedCategories.has(c)),
    [categories, savedCategories],
  );
  const activeCat = selectedCat ?? tabs[0] ?? null;

  const lines = useMemo<LineRow[]>(() => {
    if (!activeCat) return [];
    const result: LineRow[] = [];
    for (const p of products) {
      if (p.category !== activeCat) continue;
      const qty3m = calcSalesQty3m(salesMap.get(p.id) ?? 0);
      const qty = calcOrderQty(qty3m, p.unit_order || p.unit);
      if (qty <= 0) continue;
      const price = p.unit_price_usd != null ? Number(p.unit_price_usd) : 0;
      result.push({
        productId: p.id,
        code: p.code,
        nameEn: p.name_en || p.name,
        unit: p.unit_order || p.unit,
        qty,
        price,
        amount: Number((qty * price).toFixed(2)),
        category: p.category,
      });
    }
    return result;
  }, [products, salesMap, activeCat]);

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);

  const handleDownload = () => {
    if (lines.length === 0) return;
    const dateStr = ymd(new Date());
    const aoa: (string | number)[][] = [
      ['ORDER SHEET', '', '', '', `DATE: ${dateStr}`, ''],
      ['RUNKOREA', '', '', '', '', ''],
      [activeCat ?? '', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['CODE', 'DESCRIPTION', 'UNIT', 'PRICE', 'QTY', 'AMOUNT'],
    ];
    for (const l of lines) {
      aoa.push([l.code, l.nameEn, l.unit, l.price, l.qty, l.amount]);
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
    const totalRow = aoa.length;
    const dataStart = 6;
    const dataEnd = totalRow - 1;
    ws[`F${totalRow}`] = { t: 'n', f: `SUM(F${dataStart}:F${dataEnd})` };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ORDER SHEET');
    XLSX.writeFile(wb, `ORDER_SHEET_${activeCat ?? ''}_${dateStr}.xlsx`);
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <header className="m-page-header">
        <h1 className="m-page-title">발주서</h1>
        <div className="m-tab-row">
          {tabs.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}>
              저장된 카테고리 없음
            </span>
          ) : (
            tabs.map((c) => (
              <button
                type="button"
                key={c}
                className="m-tab"
                aria-pressed={activeCat === c}
                onClick={() => setSelectedCat(c)}
              >
                {getCategoryLabel(c)}
              </button>
            ))
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="m-empty">불러오는 중…</div>
      ) : tabs.length === 0 ? (
        <div className="m-empty">
          데스크톱 발주서에서 카테고리를 저장하면 여기에 표시됩니다.
        </div>
      ) : lines.length === 0 ? (
        <div className="m-empty">발주 품목이 없습니다.</div>
      ) : (
        <>
          <div style={{ padding: '12px 16px' }}>
            <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 80px',
                  gap: 8,
                  padding: '10px 14px',
                  background: 'var(--m-surface-2)',
                  borderBottom: '1px solid var(--m-border)',
                  fontSize: 11,
                  color: 'var(--m-text-secondary)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <span>PRODUCT</span>
                <span style={{ textAlign: 'right' }}>QTY</span>
                <span style={{ textAlign: 'right' }}>AMOUNT</span>
              </div>
              {lines.map((l) => (
                <div
                  key={l.productId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 50px 80px',
                    gap: 8,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--m-border)',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--m-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={l.nameEn}
                    >
                      {l.nameEn}
                    </div>
                    <div
                      className="m-num"
                      style={{
                        fontSize: 10.5,
                        color: 'var(--m-text-secondary)',
                      }}
                    >
                      {l.code}
                    </div>
                  </div>
                  <div
                    className="m-num"
                    style={{
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {l.qty} {l.unit}
                  </div>
                  <div
                    className="m-num"
                    style={{
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--m-text)',
                    }}
                  >
                    ${fmtUsd(l.amount)}
                  </div>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px',
                  gap: 8,
                  padding: '12px 14px',
                  background: 'var(--m-surface-2)',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--m-text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  TOTAL
                </span>
                <span
                  className="m-num"
                  style={{
                    textAlign: 'right',
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--m-primary)',
                  }}
                >
                  ${fmtUsd(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ padding: '0 16px' }}>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 10,
                border: 0,
                background: 'var(--m-primary)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              엑셀 다운로드
            </button>
          </div>
        </>
      )}
    </div>
  );
}
