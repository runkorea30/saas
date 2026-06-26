/**
 * 모바일 재고현황 — 검색·분류·품절/부족 필터 + 인라인 재고 편집.
 *
 * 기능:
 *  1) 제품명 검색 input (실시간)
 *  2) 분류 select (전체 + 카테고리 동적)
 *  3) 품절/부족 카드 토글 필터 (활성 시 진한 배경)
 *  4) 재고수량 인라인 편집:
 *     - 숫자 클릭 → number input 전환
 *     - Enter/blur → 저장 (델타 = newStock - oldStock, RPC create_stock_adjustment)
 *     - Escape → 취소 (편집 모드 종료, 값 복원)
 *  5) 필터 조합: 품절/부족 → 분류 → 검색 (AND)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 * 🔴 CLAUDE.md §2: 재고는 stockByProduct (계산식 직접 X).
 * 🔴 CLAUDE.md §5: useCreateAdjustment 가 invalidate 자동 (inventory-stock).
 * 🟠 데스크톱 StockPage handleInlineStockSave 와 동일한 저장 패턴 사용.
 */
import { useMemo, useRef, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { useCreateAdjustment } from '@/hooks/queries/useCreateAdjustment';
import { useToast } from '@/components/ui/Toast';

type StockLevel = 'out' | 'low' | 'mid' | 'ok';
type StockFilter = 'out' | 'low' | null;

function levelOf(qty: number): StockLevel {
  if (qty <= 0) return 'out';
  if (qty < 5) return 'low';
  if (qty <= 20) return 'mid';
  return 'ok';
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

interface EnrichedRow {
  product: Product;
  qty: number;
  level: StockLevel;
}

export function InventoryPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const { data: products = [], isLoading: loadingProducts } =
    useProducts(companyId);
  const { data: stockSummary, isLoading: loadingStock } =
    useInventoryStock(companyId);
  const adjustMut = useCreateAdjustment(companyId);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(''); // '' = 전체
  const [stockFilter, setStockFilter] = useState<StockFilter>(null);

  // 활성 제품 + 현재 재고 + 등급 계산
  const enriched = useMemo<EnrichedRow[]>(() => {
    const stockByProduct = stockSummary?.stockByProduct;
    return products
      .filter((p) => p.is_active)
      .map((p) => {
        const qty = stockByProduct?.get(p.id)?.current ?? 0;
        return { product: p, qty, level: levelOf(qty) };
      });
  }, [products, stockSummary]);

  // 분류 옵션 (활성 제품 기준)
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of enriched) {
      if (r.product.category) set.add(r.product.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [enriched]);

  // 전체 요약 (필터 적용 전 — 카드 카운트는 항상 전체 기준)
  const summary = useMemo(() => {
    let out = 0;
    let low = 0;
    for (const r of enriched) {
      if (r.level === 'out') out++;
      else if (r.level === 'low') low++;
    }
    return { out, low };
  }, [enriched]);

  // 필터 조합: stockFilter → category → query (AND)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((r) => {
      if (stockFilter === 'out' && r.level !== 'out') return false;
      if (stockFilter === 'low' && r.level !== 'low') return false;
      if (categoryFilter && r.product.category !== categoryFilter) return false;
      if (q && !r.product.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, stockFilter, categoryFilter, query]);

  // 분류별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedRow[]>();
    for (const r of filtered) {
      const cat = r.product.category || '(미분류)';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        a.product.name.localeCompare(b.product.name, 'ko'),
      );
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'ko'),
    );
  }, [filtered]);

  const isLoading = loadingProducts || loadingStock;

  // 인라인 저장 — 데스크톱 StockPage 와 동일 델타 RPC 패턴
  const handleSave = async (
    productId: string,
    newStock: number,
  ): Promise<void> => {
    const row = enriched.find((r) => r.product.id === productId);
    if (!row) return;
    const oldStock = row.qty;
    const delta = newStock - oldStock;
    if (delta === 0) return;
    try {
      await adjustMut.mutateAsync({
        product_id: productId,
        quantity: delta,
        memo: '모바일 인라인 재고 수정',
        transaction_date: new Date().toISOString(),
      });
      const sign = delta > 0 ? '+' : '';
      showToast({
        kind: 'success',
        text: `「${row.product.name}」 ${sign}${fmt(delta)}${row.product.unit} → ${fmt(newStock)}${row.product.unit}`,
      });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '재고 저장 실패',
      });
    }
  };

  return (
    <div>
      <header className="m-page-header" style={{ paddingBottom: 8 }}>
        <h1 className="m-page-title">재고현황</h1>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 8,
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제품명 검색…"
            style={{
              flex: 1,
              minWidth: 0,
              height: 32,
              padding: '0 10px',
              border: '1px solid var(--m-border-strong)',
              borderRadius: 8,
              fontSize: 12.5,
              background: 'var(--m-surface)',
              color: 'var(--m-text)',
              outline: 'none',
            }}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              flex: '0 0 110px',
              height: 32,
              padding: '0 8px',
              border: '1px solid var(--m-border-strong)',
              borderRadius: 8,
              fontSize: 12,
              background: 'var(--m-surface)',
              color: 'var(--m-text)',
              outline: 'none',
            }}
          >
            <option value="">전체 분류</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* 품절/부족 토글 카드 */}
      <div style={{ padding: '10px 16px 6px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <ToggleSummaryCard
            label="품절"
            value={summary.out}
            tone="out"
            active={stockFilter === 'out'}
            onClick={() =>
              setStockFilter((prev) => (prev === 'out' ? null : 'out'))
            }
          />
          <ToggleSummaryCard
            label="부족"
            value={summary.low}
            tone="low"
            active={stockFilter === 'low'}
            onClick={() =>
              setStockFilter((prev) => (prev === 'low' ? null : 'low'))
            }
          />
        </div>
        {stockFilter && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: 'var(--m-text-secondary)',
            }}
          >
            {stockFilter === 'out' ? '품절' : '부족'} 제품만 표시 중 ·
            <button
              type="button"
              onClick={() => setStockFilter(null)}
              style={{
                marginLeft: 4,
                border: 0,
                background: 'transparent',
                color: 'var(--m-primary)',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              해제
            </button>
          </div>
        )}
      </div>

      {/* 본문 */}
      {isLoading ? (
        <div className="m-empty">불러오는 중…</div>
      ) : grouped.length === 0 ? (
        <div className="m-empty">조건에 맞는 제품이 없습니다.</div>
      ) : (
        <div
          style={{
            padding: '4px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {grouped.map(([cat, rows]) => (
            <section key={cat} className="m-card" style={{ padding: 0 }}>
              <h2
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--m-text-secondary)',
                  padding: '8px 14px',
                  margin: 0,
                  borderBottom: '1px solid var(--m-border)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {cat} ({rows.length})
              </h2>
              {rows.map((r, idx) => (
                <StockRow
                  key={r.product.id}
                  row={r}
                  isLast={idx === rows.length - 1}
                  busy={adjustMut.isPending}
                  onSave={(next) => handleSave(r.product.id, next)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 품절/부족 토글 카드
// ───────────────────────────────────────────────────────────

function ToggleSummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'out' | 'low';
  active: boolean;
  onClick: () => void;
}) {
  const color = tone === 'out' ? 'var(--m-danger)' : 'var(--m-warning)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: 1,
        textAlign: 'left',
        border: `1.5px solid ${color}`,
        borderRadius: 12,
        padding: '12px 14px',
        background: active ? color : `${color}10`,
        color: active ? '#ffffff' : color,
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
      <div
        className="m-num"
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 2,
        }}
      >
        {fmt(value)}
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            marginLeft: 4,
            opacity: 0.85,
          }}
        >
          개
        </span>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// 재고 행 (인라인 편집)
// ───────────────────────────────────────────────────────────

function StockRow({
  row,
  isLast,
  busy,
  onSave,
}: {
  row: EnrichedRow;
  isLast: boolean;
  busy: boolean;
  onSave: (next: number) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  // 🟠 Escape 후 input unmount 시 onBlur 가 발화돼도 commit 을 차단하기 위한 가드.
  const cancelledRef = useRef(false);
  const { product, qty, level } = row;

  const startEdit = () => {
    if (busy) return;
    cancelledRef.current = false;
    setDraft(String(qty));
    setEditing(true);
  };

  const commit = () => {
    if (cancelledRef.current) return; // Escape 직후 onBlur 무시
    const next = Number(draft);
    setEditing(false);
    if (!Number.isFinite(next) || !Number.isInteger(next) || next < 0) return;
    if (next === qty) return;
    void onSave(next);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setEditing(false);
    setDraft('');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--m-border)',
      }}
    >
      <span
        className={`m-dot ${level === 'ok' ? 'ok' : level === 'out' ? 'out' : 'low'}`}
      />
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
        title={product.name}
      >
        {product.name}
      </div>
      <span
        style={{
          fontSize: 11,
          color: 'var(--m-text-secondary)',
          marginRight: 2,
        }}
      >
        {product.unit}
      </span>
      {editing ? (
        <input
          type="number"
          inputMode="numeric"
          min={0}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur(); // → commit via onBlur
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
          disabled={busy}
          style={{
            width: 72,
            height: 28,
            padding: '0 6px',
            border: '1px solid var(--m-primary)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'right',
            background: 'var(--m-surface)',
            color: 'var(--m-text)',
            outline: 'none',
            fontFamily: 'Inter Tight, system-ui, sans-serif',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={busy}
          title="클릭하여 수정"
          style={{
            border: 0,
            background: 'transparent',
            cursor: busy ? 'wait' : 'pointer',
            padding: 0,
          }}
        >
          <StockValue qty={qty} level={level} />
        </button>
      )}
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
