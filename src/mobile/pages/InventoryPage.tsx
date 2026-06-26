/**
 * 모바일 재고현황 페이지.
 * - 상단: 품절/부족 요약 카드
 * - 본문: 분류별 그룹핑 + 색상 도트 + 재고 수량
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 * 🔴 CLAUDE.md §2: 재고는 useInventoryStock 의 stockByProduct 만 사용 (계산 직접 X).
 */
import { useMemo } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { useMediaQuery } from '../hooks/useMediaQuery';

type StockLevel = 'out' | 'low' | 'mid' | 'ok';

function levelOf(qty: number): StockLevel {
  if (qty <= 0) return 'out';
  if (qty < 5) return 'low';
  if (qty <= 20) return 'mid';
  return 'ok';
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function InventoryPage() {
  const { companyId } = useCompany();
  const { data: products = [], isLoading: loadingProducts } =
    useProducts(companyId);
  const { data: stockSummary, isLoading: loadingStock } =
    useInventoryStock(companyId);
  const isUnfolded = useMediaQuery('(min-width: 601px)');

  const enriched = useMemo(() => {
    const stockByProduct = stockSummary?.stockByProduct;
    return products
      .filter((p) => p.is_active)
      .map((p) => ({
        product: p,
        qty: stockByProduct?.get(p.id)?.current ?? 0,
      }));
  }, [products, stockSummary]);

  const summary = useMemo(() => {
    let out = 0;
    let low = 0;
    for (const r of enriched) {
      if (r.qty <= 0) out++;
      else if (r.qty < 5) low++;
    }
    return { out, low };
  }, [enriched]);

  const grouped = useMemo(() => {
    const map = new Map<string, { product: Product; qty: number }[]>();
    for (const r of enriched) {
      const cat = r.product.category || '(미분류)';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.product.name.localeCompare(b.product.name, 'ko'));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'));
  }, [enriched]);

  const isLoading = loadingProducts || loadingStock;

  return (
    <div>
      <header className="m-page-header">
        <h1 className="m-page-title">재고현황</h1>
      </header>

      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <SummaryCard label="품절" value={summary.out} tone="out" />
          <SummaryCard label="부족" value={summary.low} tone="low" />
        </div>
      </div>

      {isLoading ? (
        <div className="m-empty">불러오는 중…</div>
      ) : grouped.length === 0 ? (
        <div className="m-empty">제품이 없습니다.</div>
      ) : (
        <div
          style={{
            padding: '4px 16px 16px',
            display: 'grid',
            gridTemplateColumns: isUnfolded
              ? 'repeat(2, minmax(0, 1fr))'
              : '1fr',
            gap: 10,
          }}
        >
          {grouped.map(([cat, rows]) => (
            <section key={cat} className="m-card" style={{ padding: 0 }}>
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--m-text)',
                  padding: '10px 14px',
                  margin: 0,
                  borderBottom: '1px solid var(--m-border)',
                }}
              >
                {cat}
              </h2>
              {rows.map((r) => (
                <StockRow key={r.product.id} name={r.product.name} qty={r.qty} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'out' | 'low';
}) {
  const color = tone === 'out' ? 'var(--m-danger)' : 'var(--m-warning)';
  return (
    <div
      className="m-card"
      style={{
        flex: 1,
        padding: '12px 14px',
        borderColor: color,
        background: `${color}10`,
      }}
    >
      <div style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</div>
      <div
        className="m-num"
        style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}
      >
        {fmt(value)}
        <span
          style={{
            fontSize: 12,
            color: 'var(--m-text-secondary)',
            marginLeft: 4,
          }}
        >
          개
        </span>
      </div>
    </div>
  );
}

function StockRow({ name, qty }: { name: string; qty: number }) {
  const level = levelOf(qty);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--m-border)',
      }}
    >
      <span className={`m-dot ${level === 'ok' ? 'ok' : level === 'out' ? 'out' : 'low'}`} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          color: 'var(--m-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={name}
      >
        {name}
      </div>
      <StockValue qty={qty} level={level} />
    </div>
  );
}

function StockValue({ qty, level }: { qty: number; level: StockLevel }) {
  if (level === 'out') {
    return (
      <span
        className="m-badge"
        style={{ background: 'var(--m-danger)', color: '#ffffff' }}
      >
        품절
      </span>
    );
  }
  if (level === 'low' || level === 'mid') {
    return (
      <span
        className="m-num"
        style={{
          padding: '2px 8px',
          borderRadius: 6,
          background: 'var(--m-warning)' + '22',
          color: 'var(--m-warning)',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {fmt(qty)}
      </span>
    );
  }
  return (
    <span
      className="m-num"
      style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-text)' }}
    >
      {fmt(qty)}
    </span>
  );
}
