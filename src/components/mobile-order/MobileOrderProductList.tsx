/**
 * 파트너 모바일 주문 - 품목 선택 리스트.
 *
 * 검색/카테고리 필터 + 제품 카드 + 수량 조정을 제공.
 * 데이터 로딩과 quantities 상태 소유권은 부모(MobileOrderForm)에 있음.
 *
 * 🟠 재고 배지 규칙 (지시문):
 *   current <= 0                       → 품절 (수량 조정 비활성)
 *   safety_stock 존재 & current < ss   → 재고 부족 (경고 배지)
 *   그 외                              → 재고 숫자만 표시
 * 🟠 공급가는 거래처 등급 기준. session.grade 를 부모가 주입.
 */
import { useMemo, useState } from 'react';
import { Search, Minus, Plus, X } from 'lucide-react';

/** 부모가 전달하는 최소 필드 셋 (products 테이블 부분 select). */
export interface ProductForList {
  id: string;
  code: string;
  name: string;
  category: string;
  sell_price: number;
  supply_price: number;
  safety_stock: number | null;
  grade_a: number | null;
  grade_b: number | null;
  grade_c: number | null;
  grade_d: number | null;
  grade_e: number | null;
}

interface Props {
  products: ProductForList[];
  /** productId → 현재 재고 수량. 없으면 0으로 간주. */
  stockMap: Map<string, number>;
  /** 거래처 등급 (A~E 또는 null). 공급가 계산에 사용. */
  grade: string | null;
  /** productId → 선택 수량. 0/undefined 이면 미선택. */
  quantities: Record<string, number>;
  /** 사용자가 수량을 바꾸면 호출. 0 전달 = 선택 해제. */
  onChangeQuantity: (productId: string, quantity: number) => void;
  /** 등급별 공급가 계산 함수 — utils/calculations 에서 부모가 주입 (SSR/테스트 유연성). */
  calcSupply: (
    sellPrice: number,
    grade: string | null,
    product: ProductForList,
  ) => number;
}

export function MobileOrderProductList({
  products,
  stockMap,
  grade,
  quantities,
  onChangeQuantity,
  calcSupply,
}: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category);
    return ['all', ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      );
    });
  }, [products, search, category]);

  return (
    <div>
      {/* 검색 */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--mo-text-secondary)',
            pointerEvents: 'none',
          }}
        />
        <input
          className="mo-input"
          type="search"
          placeholder="품목명 또는 코드 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 36, paddingRight: search ? 36 : 14 }}
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="검색어 지우기"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              borderRadius: 999,
              background: 'transparent',
              border: 'none',
              color: 'var(--mo-text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* 카테고리 pills (수평 스크롤) */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '2px 2px 12px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className="mo-btn-secondary"
            style={{
              width: 'auto',
              padding: '8px 14px',
              minHeight: 34,
              fontSize: 12,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              background:
                category === c ? 'var(--mo-accent)' : 'var(--mo-bg-input)',
              color: category === c ? '#fff' : 'var(--mo-text-primary)',
              borderColor:
                category === c ? 'var(--mo-accent)' : 'var(--mo-border)',
            }}
          >
            {c === 'all' ? '전체' : c}
          </button>
        ))}
      </div>

      {/* 결과 카운트 */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--mo-text-secondary)',
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        {filtered.length}개 품목
      </div>

      {/* 제품 카드 목록 */}
      {filtered.length === 0 ? (
        <div className="mo-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ color: 'var(--mo-text-secondary)', fontSize: 13 }}>
            검색 결과가 없습니다.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              currentStock={stockMap.get(p.id) ?? 0}
              supplyPrice={calcSupply(p.sell_price, grade, p)}
              quantity={quantities[p.id] ?? 0}
              onChange={(q) => onChangeQuantity(p.id, q)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 제품 카드
// ───────────────────────────────────────────────────────────

interface CardProps {
  product: ProductForList;
  currentStock: number;
  supplyPrice: number;
  quantity: number;
  onChange: (q: number) => void;
}

function ProductCard({ product, currentStock, supplyPrice, quantity, onChange }: CardProps) {
  const isOut = currentStock <= 0;
  const isLow =
    !isOut &&
    product.safety_stock != null &&
    currentStock < product.safety_stock;

  return (
    <div
      className="mo-card"
      style={{
        padding: 12,
        opacity: isOut ? 0.55 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* 1행: 제품명 + 재고 배지/수량 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--mo-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={product.name}
          >
            {product.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--mo-text-secondary)',
              marginTop: 2,
            }}
          >
            {product.code} · {product.category}
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          {isOut ? (
            <span className="mo-badge mo-badge--out">품절</span>
          ) : isLow ? (
            <span className="mo-badge mo-badge--low">재고 부족</span>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--mo-text-secondary)' }}>
              재고 {currentStock}
            </div>
          )}
        </div>
      </div>

      {/* 2행: 공급가 + 수량 조정 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mo-text-primary)' }}>
          ₩{supplyPrice.toLocaleString('ko-KR')}
        </div>
        <QtyStepper
          value={quantity}
          onChange={onChange}
          disabled={isOut}
          maxStock={currentStock}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 수량 조정 스테퍼
// ───────────────────────────────────────────────────────────

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** 실재고. 초과 입력을 경고 표시하는 용도는 아니고, 단순 참고. 지시문 상 초과 주문 자체는 허용. */
  maxStock: number;
}

function QtyStepper({ value, onChange, disabled }: StepperProps) {
  const dec = (): void => onChange(Math.max(0, value - 1));
  const inc = (): void => onChange(value + 1);

  const handleInput = (raw: string): void => {
    const n = Number(raw.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      onChange(0);
      return;
    }
    onChange(n);
  };

  const btnStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid var(--mo-border)',
    background: 'var(--mo-bg-input)',
    color: 'var(--mo-text-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 0,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || value <= 0}
        style={{ ...btnStyle, opacity: disabled || value <= 0 ? 0.5 : 1 }}
        aria-label="수량 감소"
      >
        <Minus size={14} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value === 0 ? '' : String(value)}
        onChange={(e) => handleInput(e.target.value)}
        disabled={disabled}
        placeholder="0"
        style={{
          width: 44,
          height: 32,
          textAlign: 'center',
          borderRadius: 8,
          border: '1px solid var(--mo-border)',
          background: 'var(--mo-bg-input)',
          color: 'var(--mo-text-primary)',
          fontSize: 14,
          fontWeight: 600,
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        style={{ ...btnStyle, opacity: disabled ? 0.5 : 1 }}
        aria-label="수량 증가"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
