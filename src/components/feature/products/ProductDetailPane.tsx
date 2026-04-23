/**
 * Products Detail Pane.
 * 헤더(상품명+상태) · 액션(편집/삭제) · KPI 3(판매가/공급가/마진율) · 기본 정보.
 * 🟠 재고/판매 섹션 숨김 (inventory_lots 데이터 부재, Q6).
 */
import { Pencil, Trash2 } from 'lucide-react';
import type { Product } from '@/hooks/queries/useProducts';
import { getCategoryLabel } from '@/constants/categories';

interface Props {
  product: Product | null;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

export function ProductDetailPane({ product, onEdit, onDelete }: Props) {
  if (!product) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: 40,
          textAlign: 'center',
          color: 'var(--ink-3)',
          fontSize: 13,
        }}
      >
        좌측에서 제품을 선택하세요.
      </div>
    );
  }

  const marginAmount = product.sell_price - product.supply_price;
  const marginPct =
    product.sell_price > 0 ? (marginAmount / product.sell_price) * 100 : 0;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="chip"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--ink-2)',
              fontSize: 11,
            }}
          >
            {getCategoryLabel(product.category)}
          </span>
          <h2
            className="disp"
            style={{
              fontSize: 19,
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={product.name}
          >
            {product.name}
          </h2>
          <span
            className="chip"
            style={{
              color: product.is_active ? 'var(--success)' : 'var(--ink-3)',
              background: product.is_active ? 'var(--success-wash)' : 'var(--surface-2)',
            }}
          >
            <span className="dot" />
            {product.is_active ? '활성' : '비활성'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
          }}
        >
          <div
            className="num"
            style={{ fontSize: 11.5, color: 'var(--ink-3)' }}
          >
            {product.code}
          </div>
          {(onEdit || onDelete) && (
            <div style={{ display: 'flex', gap: 6 }}>
              {onEdit && (
                <button
                  type="button"
                  className="btn-base"
                  onClick={() => onEdit(product)}
                  style={{ height: 28, fontSize: 12 }}
                >
                  <Pencil size={12} /> 편집
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="btn-base"
                  onClick={() => onDelete(product)}
                  style={{
                    height: 28,
                    fontSize: 12,
                    color: 'var(--danger)',
                    borderColor: 'var(--danger-wash)',
                  }}
                >
                  <Trash2 size={12} /> 삭제
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI */}
      <div
        style={{
          padding: '14px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <KpiBlock label="판매가" value={fmtWon(product.sell_price)} />
        <KpiBlock label="공급가" value={fmtWon(product.supply_price)} />
        <KpiBlock
          label="마진율"
          value={`${marginPct.toFixed(1)}%`}
          sub={marginAmount > 0 ? `+₩${marginAmount.toLocaleString('ko-KR')}` : undefined}
          tone={marginPct >= 30 ? 'success' : marginPct < 10 ? 'danger' : undefined}
        />
      </div>

      {/* 기본 정보 */}
      <div style={{ padding: '14px 20px' }}>
        <SectionTitle>기본 정보</SectionTitle>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 14px',
            fontSize: 12.5,
          }}
        >
          <InfoRow label="제품코드" value={product.code} numeric />
          <InfoRow label="카테고리" value={getCategoryLabel(product.category)} />
          <InfoRow label="단위" value={product.unit} />
          <InfoRow
            label="USD 단가"
            value={
              product.unit_price_usd !== null
                ? `$${Number(product.unit_price_usd).toFixed(2)}`
                : null
            }
            numeric={product.unit_price_usd !== null}
            muted={product.unit_price_usd === null}
          />
          <InfoRow label="등록일" value={fmtDate(product.created_at)} numeric />
          <InfoRow label="수정일" value={fmtDate(product.updated_at)} numeric />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-num)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  numeric,
  muted,
}: {
  label: string;
  value: string | null;
  numeric?: boolean;
  muted?: boolean;
}) {
  return (
    <>
      <span style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        className={numeric ? 'num' : undefined}
        style={{
          color: muted ? 'var(--ink-3)' : 'var(--ink)',
          fontStyle: muted ? 'italic' : 'normal',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value ?? '미등록'}
      </span>
    </>
  );
}

function KpiBlock({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'danger' | 'success';
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'success'
        ? 'var(--success)'
        : 'var(--ink)';
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color,
          marginTop: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function fmtWon(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
