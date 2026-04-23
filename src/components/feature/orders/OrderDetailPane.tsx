/**
 * Orders 우측 상세 패널. 선택된 주문이 없으면 placeholder.
 * VAT 역산은 calcSupplyAmount(utils/calculations) 사용 — 부가세 포함 금액 ÷ 1.1.
 */
import { FileText, MoreHorizontal, Printer, Tag, Truck } from 'lucide-react';
import {
  GradeBadge,
  SourceIcon,
  StatusBadge,
  fmtDateTime,
} from './primitives';
import { calcSupplyAmount } from '@/utils/calculations';
import type { Order } from '@/types/orders';

export function OrderDetailPane({ order }: { order: Order | null }) {
  if (!order) return <DetailEmpty />;

  const d = new Date(order.order_date);
  const saleSubtotal = order.items.reduce(
    (s, it) => s + (it.is_return ? 0 : it.amount),
    0,
  );
  const returnTotal = order.items.reduce(
    (s, it) => s + (it.is_return ? it.amount : 0),
    0,
  );
  const total = saleSubtotal + returnTotal;
  // 🔴 CLAUDE.md §4: 매출금액은 이미 부가세 포함. 공급가액은 ÷ 1.1로 역산.
  const { vat } = calcSupplyAmount(saleSubtotal);

  return (
    <div
      className="card-surface"
      style={{ padding: 0, position: 'sticky', top: 24, overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 10.5,
              color: 'var(--ink-3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            ORDER
          </span>
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {order.id.slice(0, 8)}
          </span>
          <StatusBadge status={order.status} />
          <SourceIcon source={order.source} />
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-base ghost"
            style={{ height: 28, fontSize: 12, padding: '0 8px' }}
          >
            <MoreHorizontal size={13} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GradeBadge grade={order.customer?.grade ?? null} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              className="disp"
              style={{
                fontSize: 20,
                fontWeight: 500,
                margin: 0,
                letterSpacing: '-0.015em',
                color: 'var(--ink)',
              }}
            >
              {order.customer?.name ?? '—'}
            </h2>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                marginTop: 2,
              }}
            >
              {fmtDateTime(d)}
              {order.creator && ` · 작성 ${order.creator.name}`}
            </div>
          </div>
        </div>
        {order.memo && (
          <div
            style={{
              marginTop: 10,
              padding: '7px 10px',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--ink-2)',
            }}
          >
            <Tag size={11} color="var(--ink-3)" strokeWidth={1.6} />
            <span>{order.memo}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {[
          { label: '라인', v: `${order.items.length}건`, bold: false },
          {
            label: '수량',
            v: `${order.items.reduce((s, it) => s + Math.abs(it.quantity), 0)} ea`,
            bold: false,
          },
          {
            label: '총액',
            v: `${order.total_amount.toLocaleString('ko-KR')}원`,
            bold: true,
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '12px 16px',
              borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 3,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-num)',
                fontSize: s.bold ? 16 : 14,
                fontWeight: s.bold ? 600 : 500,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>

      {/* Line items */}
      <div style={{ padding: '14px 20px 8px' }}>
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-num)',
            marginBottom: 8,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>주문 품목</span>
          <span>{order.items.length}개 라인</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {order.items.map((it, i) => (
            <div
              key={it.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 70px 100px 110px',
                gap: 10,
                alignItems: 'center',
                padding: '10px 0',
                borderBottom:
                  i === order.items.length - 1 ? 'none' : '1px solid var(--line)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: it.is_return ? 'var(--danger)' : 'var(--ink)',
                    fontWeight: 500,
                    textDecoration: it.is_return ? 'line-through' : 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {it.product?.name ?? '알 수 없는 상품'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: 'var(--ink-4)',
                      fontFamily: 'var(--font-num)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {it.product?.code ?? '—'}
                  </span>
                  {it.is_return && (
                    <span
                      style={{
                        fontSize: 9.5,
                        color: 'var(--danger)',
                        fontWeight: 500,
                        background: 'var(--danger-wash)',
                        padding: '1px 5px',
                        borderRadius: 4,
                        letterSpacing: '0.04em',
                      }}
                    >
                      반품
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-num)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: it.is_return ? 'var(--danger)' : 'var(--ink-2)',
                }}
              >
                {it.quantity > 0 ? '+' : ''}
                {it.quantity}
                <span style={{ color: 'var(--ink-4)', fontSize: 10.5, marginLeft: 2 }}>ea</span>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-num)',
                  fontSize: 12,
                  color: 'var(--ink-3)',
                }}
              >
                {it.unit_price.toLocaleString('ko-KR')}원
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-num)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: it.is_return ? 'var(--danger)' : 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {it.amount.toLocaleString('ko-KR')}
                <span
                  style={{
                    color: 'var(--ink-4)',
                    fontSize: 10,
                    fontWeight: 500,
                    marginLeft: 2,
                  }}
                >
                  KRW
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div
        style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--line)',
          background: 'var(--surface-2)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <TotalRow label="판매 소계" value={saleSubtotal} />
          {returnTotal < 0 && (
            <TotalRow label="반품" value={returnTotal} tone="danger" />
          )}
          <TotalRow label="VAT 포함분 (10%)" value={vat} faded />
          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>합계</span>
            <span
              style={{
                fontFamily: 'var(--font-num)',
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {total.toLocaleString('ko-KR')}
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontWeight: 500,
                  marginLeft: 3,
                }}
              >
                KRW
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <button
          type="button"
          className="btn-base primary"
          style={{ height: 32, fontSize: 12.5 }}
        >
          <Truck size={13} /> 출고 처리
        </button>
        <button type="button" className="btn-base" style={{ height: 32, fontSize: 12.5 }}>
          <FileText size={13} /> 거래명세서
        </button>
        <button type="button" className="btn-base" style={{ height: 32, fontSize: 12.5 }}>
          <Printer size={13} /> 송장 인쇄
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn-base ghost"
          style={{ height: 32, fontSize: 12.5 }}
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
    </div>
  );
}

function DetailEmpty() {
  return (
    <div
      className="card-surface"
      style={{
        padding: '60px 28px',
        position: 'sticky',
        top: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        color: 'var(--ink-3)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <FileText size={20} color="var(--ink-3)" strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
        주문을 선택해 주세요
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center' }}>
        왼쪽 목록에서 주문을 클릭하면 상세 내용이 여기에 표시됩니다.
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  tone,
  faded,
}: {
  label: string;
  value: number;
  tone?: 'danger';
  faded?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        color: faded ? 'var(--ink-3)' : 'var(--ink-2)',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-num)',
          fontVariantNumeric: 'tabular-nums',
          color: tone === 'danger' ? 'var(--danger)' : 'inherit',
        }}
      >
        {value.toLocaleString('ko-KR')}원
      </span>
    </div>
  );
}
