/**
 * 최근 거래 타임라인. 5종 이벤트 머지 후 시간 역순 10건.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Landmark,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import type { TimelineEvent, TimelineKind } from '@/hooks/queries/useHomeDashboard';

interface Props {
  events: TimelineEvent[] | undefined;
  isLoading: boolean;
  error?: Error | null;
}

const KIND_CONF: Record<
  TimelineKind,
  { icon: LucideIcon; color: string; wash: string; label: string }
> = {
  order: {
    icon: ShoppingCart,
    color: 'var(--brand)',
    wash: 'var(--brand-wash)',
    label: '주문',
  },
  deposit: {
    icon: Landmark,
    color: 'var(--info)',
    wash: 'var(--info-wash)',
    label: '입금',
  },
  po_confirm: {
    icon: Truck,
    color: 'var(--tan)',
    wash: 'var(--tan-wash)',
    label: '발주',
  },
  invoice: {
    icon: Receipt,
    color: 'var(--success)',
    wash: 'var(--success-wash)',
    label: '세금계산서',
  },
  stock_move: {
    icon: Package,
    color: 'var(--warning)',
    wash: 'var(--warning-wash)',
    label: '재고',
  },
};

export function Timeline({ events, isLoading, error }: Props) {
  return (
    <div className="card-surface" style={{ padding: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 12px',
        }}
      >
        <div>
          <div
            className="disp"
            style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}
          >
            최근 거래 타임라인
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
            최근 10개 이벤트 · 시간 역순
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ padding: '16px 20px', fontSize: 12.5, color: 'var(--danger)' }}>
          타임라인 로딩 실패: {error.message}
        </div>
      ) : isLoading ? (
        <div
          style={{
            padding: '32px 20px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 12.5,
          }}
        >
          불러오는 중…
        </div>
      ) : !events || events.length === 0 ? (
        <div
          style={{
            padding: '32px 20px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 12.5,
          }}
        >
          표시할 이벤트가 없습니다
        </div>
      ) : (
        <div
          style={{
            padding: '4px 12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '2px 16px',
          }}
        >
          {events.map((ev) => {
            const conf = KIND_CONF[ev.kind];
            const Icon = conf.icon;
            return (
              <div
                key={ev.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 12,
                  padding: '11px 10px',
                  borderRadius: 8,
                  alignItems: 'center',
                  color: 'var(--ink)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--surface-2)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: conf.wash,
                    color: conf.color,
                    display: 'grid',
                    placeItems: 'center',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={15} strokeWidth={1.6} />
                  {ev.warn && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -3,
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: 'var(--danger)',
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--font-num)',
                        border: '2px solid var(--surface)',
                      }}
                    >
                      !
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {ev.title}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-num)',
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        background: 'var(--bg-sunken)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0,
                      }}
                    >
                      {ev.ref}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: 'var(--font-num)',
                    }}
                  >
                    {ev.desc}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    color: 'var(--ink-3)',
                    fontSize: 11,
                    fontFamily: 'var(--font-num)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {relTime(ev.at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24);
  return `${d}일 전`;
}
