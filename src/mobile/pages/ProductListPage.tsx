/**
 * 모바일 제품리스트.
 * - useProducts 재사용 → 분류별 그룹핑, 코드/제품명/판매가 표시
 * - 검색 input 으로 코드/이름 부분 매칭
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 */
import { useMemo, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { useProducts, type Product } from '@/hooks/queries/useProducts';

function fmtWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function ProductListPage() {
  const { companyId } = useCompany();
  const { data: products = [], isLoading } = useProducts(companyId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.is_active) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    });
  }, [products, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const cat = p.category || '(미분류)';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'ko'),
    );
  }, [filtered]);

  return (
    <div>
      <header className="m-page-header">
        <h1 className="m-page-title">제품리스트</h1>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제품 코드 또는 이름 검색"
          style={{
            marginTop: 8,
            width: '100%',
            height: 36,
            padding: '6px 12px',
            border: '1px solid var(--m-border-strong)',
            borderRadius: 8,
            background: 'var(--m-surface)',
            color: 'var(--m-text)',
            fontSize: 13,
            outline: 'none',
          }}
        />
      </header>

      {isLoading ? (
        <div className="m-empty">불러오는 중…</div>
      ) : grouped.length === 0 ? (
        <div className="m-empty">검색 결과가 없습니다.</div>
      ) : (
        <div
          style={{
            padding: '8px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {grouped.map(([cat, items]) => (
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
                {cat} ({items.length})
              </h2>
              {items.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1fr 90px',
                    gap: 8,
                    padding: '10px 14px',
                    borderBottom:
                      idx < items.length - 1
                        ? '1px solid var(--m-border)'
                        : 'none',
                    alignItems: 'center',
                  }}
                >
                  <span
                    className="m-num"
                    style={{
                      fontSize: 11,
                      color: 'var(--m-text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={p.code}
                  >
                    {p.code}
                  </span>
                  <div
                    style={{
                      minWidth: 0,
                      fontSize: 13,
                      color: 'var(--m-text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={p.name}
                  >
                    {p.name}
                  </div>
                  <span
                    className="m-num"
                    style={{
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--m-text)',
                    }}
                  >
                    ₩{fmtWon(p.sell_price)}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
