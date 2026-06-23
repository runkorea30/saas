/**
 * 재고현황 Detail Pane.
 * 헤더(카테고리·상품명·상태) · [기초재고 투입] 액션 · KPI 3(현재재고/기초재고/올해판매수량)
 * · 최근 움직임 리스트 (lots + transactions 시간 역순 병합).
 *
 * 🟠 "최근 움직임"은 useInventoryDetail 에서 이미 병합·정렬된 movements[] 를 받아
 *    유형별 칩 색상으로 렌더링만 담당.
 */
import { Package, Plus } from 'lucide-react';
import { getCategoryLabel } from '@/constants/categories';
import type { Product } from '@/hooks/queries/useProducts';
import type { StockStatus } from '@/utils/calculations';
import type {
  InventoryDetailResult,
  MovementSubtype,
} from '@/hooks/queries/useInventoryDetail';

interface Props {
  product: Product | null;
  stock: {
    current: number;
    opening: number;
    soldThisYear: number;
    status: StockStatus;
  } | null;
  detail: InventoryDetailResult | undefined;
  isDetailLoading: boolean;
  onOpenAdjust: (product: Product) => void;
}

const STATUS_META: Record<StockStatus, { label: string; color: string; bg: string }> = {
  out:    { label: '품절', color: 'var(--danger)',  bg: 'var(--danger-wash)' },
  low:    { label: '부족', color: 'var(--warning)', bg: 'var(--warning-wash)' },
  normal: { label: '정상', color: 'var(--success)', bg: 'var(--success-wash)' },
};

const SUBTYPE_META: Record<
  MovementSubtype,
  { label: string; color: string; bg: string; sign: '+' | '−' }
> = {
  opening:  { label: '기초',   color: 'var(--ink-2)', bg: 'var(--surface-2)',    sign: '+' },
  purchase: { label: '매입',   color: 'var(--info)',  bg: 'var(--info-wash)',    sign: '+' },
  import:   { label: '수입',   color: '#7A5BB5',       bg: 'rgba(122, 91, 181, 0.12)', sign: '+' },
  out:      { label: '출고',   color: 'var(--warning)', bg: 'var(--warning-wash)', sign: '−' },
  return:   { label: '반품',   color: 'var(--success)', bg: 'var(--success-wash)', sign: '+' },
  damage:   { label: '파손',   color: 'var(--danger)',  bg: 'var(--danger-wash)',  sign: '−' },
};

export function StockDetailPane({
  product,
  stock,
  detail,
  isDetailLoading,
  onOpenAdjust,
}: Props) {
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

  const statusMeta = stock ? STATUS_META[stock.status] : null;

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
          {statusMeta && (
            <span
              className="chip"
              style={{ color: statusMeta.color, background: statusMeta.bg }}
            >
              <span className="dot" style={{ background: statusMeta.color }} />
              {statusMeta.label}
            </span>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
          }}
        >
          <div className="num" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            {product.code} · 단위 {product.unit}
          </div>
          <button
            type="button"
            className="btn-base primary"
            onClick={() => onOpenAdjust(product)}
            style={{ height: 28, fontSize: 12 }}
          >
            <Plus size={12} /> 기초재고 투입
          </button>
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
        <KpiBlock
          label="현재재고"
          value={fmtQty(stock?.current ?? 0)}
          tone={
            stock && stock.current <= 0
              ? 'danger'
              : stock && stock.status === 'low'
                ? 'warning'
                : undefined
          }
          suffix={product.unit}
        />
        <KpiBlock
          label="기초재고"
          value={fmtQty(stock?.opening ?? 0)}
          suffix={product.unit}
          muted
        />
        <KpiBlock
          label="올해 판매수량"
          value={fmtQty(stock?.soldThisYear ?? 0)}
          suffix={product.unit}
          muted
        />
      </div>

      {/* 최근 움직임 */}
      <div style={{ padding: '14px 20px' }}>
        <SectionTitle>최근 움직임</SectionTitle>
        {isDetailLoading ? (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 12,
            }}
          >
            불러오는 중…
          </div>
        ) : !detail || detail.movements.length === 0 ? (
          <div
            style={{
              padding: '24px 0',
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Package size={20} color="var(--ink-4)" strokeWidth={1.5} />
            <div>재고 움직임 기록이 없습니다.</div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
              [기초재고 투입] 으로 첫 레코드를 만들어 주세요.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.movements.map((m) => {
              const meta = SUBTYPE_META[m.subtype];
              return (
                <div
                  key={`${m.kind}-${m.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                  }}
                >
                  <span
                    className="chip"
                    style={{
                      color: meta.color,
                      background: meta.bg,
                      fontSize: 10.5,
                      fontWeight: 500,
                      minWidth: 36,
                      justifyContent: 'center',
                    }}
                  >
                    {meta.label}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: 0,
                    }}
                  >
                    <span
                      className="num"
                      style={{
                        fontSize: 12.5,
                        color: 'var(--ink)',
                        fontWeight: 500,
                      }}
                    >
                      {meta.sign}
                      {fmtQty(m.quantity)} {product.unit}
                      {m.cost_krw != null && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            fontWeight: 400,
                          }}
                        >
                          원가 ₩{m.cost_krw.toLocaleString('ko-KR')}
                        </span>
                      )}
                    </span>
                    {m.memo && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--ink-3)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={m.memo}
                      >
                        {m.memo}
                      </span>
                    )}
                  </div>
                  <span
                    className="num"
                    style={{ fontSize: 11, color: 'var(--ink-3)' }}
                  >
                    {fmtDate(m.at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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

function KpiBlock({
  label,
  value,
  suffix,
  tone,
  muted,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'danger' | 'warning';
  muted?: boolean;
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
        ? 'var(--warning)'
        : muted
          ? 'var(--ink-2)'
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
        {suffix && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontWeight: 400,
              marginLeft: 4,
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function fmtQty(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
