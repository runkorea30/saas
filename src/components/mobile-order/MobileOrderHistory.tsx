/**
 * 파트너 모바일 주문 - 주문 확인 (내 주문 이력).
 *
 * 두 개의 이력을 병렬 조회 → 하나의 스크롤 뷰:
 *  - orders (최근 30건, order_items 조인, tracking_numbers 포함)
 *  - customer_order_uploads (최근 20건)
 *
 * 🟠 4단계 상태 (received/confirmed/processing/shipped) + 레거시 처리.
 * 🟠 KST 기준 표시. Supabase 는 UTC 저장.
 * 🟠 카드 터치 → 품목/메모 상세 펼침. 송장 있으면 조회 버튼(로젠/CJ 등 캐리어 URL).
 * 🟠 상단 기간 필터(오늘/이번주/이번달/전체) — 클라이언트 필터링.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  RefreshCw,
  Truck,
  ExternalLink,
  MessageSquare,
  Camera,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getCarrierLabel,
  getTrackingUrl,
  normalizeTrackingNumbers,
} from '@/utils/shippingCarriers';
import type { MobileSession } from '@/lib/mobileOrderAuth';

// ───────────────────────────────────────────────────────────
// 상태 라벨/색 매핑
// ───────────────────────────────────────────────────────────

interface StatusStyle {
  label: string;
  bg: string;
  color: string;
  dot: string;
}

const ORDER_STATUS_MAP: Record<string, StatusStyle> = {
  received:   { label: '접수중',   bg: 'rgba(100,100,255,0.15)', color: '#8888ff', dot: '#8888ff' },
  confirmed:  { label: '확인됨',   bg: 'rgba(255,170,0,0.15)',   color: '#ffaa00', dot: '#ffaa00' },
  processing: { label: '처리중',   bg: 'rgba(0,170,255,0.15)',   color: '#00aaff', dot: '#00aaff' },
  shipped:    { label: '배송중',   bg: 'rgba(0,200,100,0.15)',   color: '#00c864', dot: '#00c864' },
  done:       { label: '완료',     bg: 'rgba(100,100,100,0.15)', color: '#888888', dot: '#888888' },
  draft:      { label: '임시',     bg: 'rgba(100,100,100,0.15)', color: '#888888', dot: '#888888' },
  canceled:   { label: '취소',     bg: 'rgba(255,80,80,0.15)',   color: '#ff5050', dot: '#ff5050' },
};

const UPLOAD_STATUS_MAP: Record<string, StatusStyle> = {
  pending: { label: '검토중',   bg: 'rgba(255,170,0,0.15)', color: '#ffaa00', dot: '#ffaa00' },
  done:    { label: '처리완료', bg: 'rgba(0,200,100,0.15)', color: '#00c864', dot: '#00c864' },
};

function orderStatusStyle(status: string): StatusStyle {
  return ORDER_STATUS_MAP[status] ?? {
    label: status,
    bg: 'rgba(120,120,120,0.15)',
    color: '#888888',
    dot: '#888888',
  };
}
function uploadStatusStyle(status: string): StatusStyle {
  return UPLOAD_STATUS_MAP[status] ?? {
    label: status,
    bg: 'rgba(120,120,120,0.15)',
    color: '#888888',
    dot: '#888888',
  };
}

// ───────────────────────────────────────────────────────────
// Row 타입
// ───────────────────────────────────────────────────────────

interface OrderItemRow {
  id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  products: { id: string; name: string; code: string } | null;
}

interface OrderRow {
  id: string;
  order_date: string;
  status: string;
  total_amount: number;
  memo: string | null;
  source: string;
  created_at: string;
  tracking_numbers: unknown;
  order_items: OrderItemRow[] | null;
}

interface UploadRow {
  id: string;
  created_at: string;
  status: string;
  file_name: string | null;
  message: string | null;
  order_id: string | null;
  processed_at: string | null;
  processed_memo: string | null;
  file_url: string | null;
  upload_type: string;
}

// ───────────────────────────────────────────────────────────
// 기간 필터
// ───────────────────────────────────────────────────────────

type PeriodKey = 'today' | 'week' | 'month' | 'all';

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'all', label: '전체' },
];

/** KST 기준 기간 시작 ISO 문자열. all → null. */
function periodStartIso(period: PeriodKey): string | null {
  if (period === 'all') return null;
  // KST = UTC+9. 로컬(브라우저)이 KST 라는 가정 하에 로컬 Date 사용.
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'today') {
    return start.toISOString();
  }
  if (period === 'week') {
    // 월요일 시작. getDay(): 0=일 1=월 ... 6=토.
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1; // 월요일까지의 거리
    start.setDate(start.getDate() - diff);
    return start.toISOString();
  }
  // month
  start.setDate(1);
  return start.toISOString();
}

// ───────────────────────────────────────────────────────────
// 유틸
// ───────────────────────────────────────────────────────────

function formatKst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function formatKstDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
function formatKrw(n: number | null | undefined): string {
  if (n == null) return '-';
  return `₩${n.toLocaleString('ko-KR')}`;
}

// ───────────────────────────────────────────────────────────
// 메인
// ───────────────────────────────────────────────────────────

interface Props {
  session: MobileSession;
}

export function MobileOrderHistory({ session }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['mo', 'orders', session.companyId, session.customerId],
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
            id, order_date, status, total_amount, memo, source, created_at,
            tracking_numbers,
            order_items (
              id, quantity, unit_price, amount,
              products ( id, name, code )
            )
          `,
        )
        .eq('company_id', session.companyId)
        .eq('customer_id', session.customerId)
        .is('deleted_at', null)
        .order('order_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
    staleTime: 15_000,
  });

  const uploadsQuery = useQuery({
    queryKey: ['mo', 'uploads', session.companyId, session.customerId],
    queryFn: async (): Promise<UploadRow[]> => {
      const { data, error } = await supabase
        .from('customer_order_uploads')
        .select(
          'id, created_at, status, file_name, message, order_id, processed_at, processed_memo, file_url, upload_type',
        )
        .eq('company_id', session.companyId)
        .eq('customer_id', session.customerId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as UploadRow[];
    },
    staleTime: 15_000,
  });

  const orders = ordersQuery.data ?? [];
  const uploads = uploadsQuery.data ?? [];

  // 기간 필터 — orders 만 적용. uploads 는 항상 최근 20건.
  const filteredOrders = useMemo(() => {
    const startIso = periodStartIso(period);
    if (!startIso) return orders;
    return orders.filter((o) => o.order_date >= startIso);
  }, [orders, period]);

  const refresh = (): void => {
    void ordersQuery.refetch();
    void uploadsQuery.refetch();
  };
  const anyFetching = ordersQuery.isFetching || uploadsQuery.isFetching;
  const anyLoading =
    (ordersQuery.isLoading && !ordersQuery.data) ||
    (uploadsQuery.isLoading && !uploadsQuery.data);

  const toggleExpand = (id: string): void => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div>
      {/* ── 기간 필터 + 새로고침 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            flex: 1,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`mo-period-pill${period === opt.id ? ' active' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="mo-icon-btn"
          aria-label="새로고침"
          disabled={anyFetching}
          style={{ flexShrink: 0 }}
        >
          {anyFetching ? (
            <Loader2 size={16} className="mo-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>

      {/* ── 주문 이력 ── */}
      {anyLoading && !ordersQuery.data ? (
        <SkeletonCard />
      ) : ordersQuery.error ? (
        <ErrorCard message="주문 이력을 불러올 수 없습니다." onRetry={refresh} />
      ) : filteredOrders.length === 0 ? (
        <EmptyCard
          icon={<Clock size={22} strokeWidth={1.5} />}
          title={period === 'all' ? '주문 이력이 없습니다.' : '해당 기간의 주문이 없습니다.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              customerName={session.customerName}
              expanded={expandedId === o.id}
              onToggle={() => toggleExpand(o.id)}
            />
          ))}
        </div>
      )}

      {/* ── 사진 접수 이력 (있을 때만) ── */}
      {(uploadsQuery.data?.length ?? 0) > 0 ? (
        <>
          <div
            style={{
              marginTop: 24,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '0 4px',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mo-text-primary)' }}>
              사진 접수 내역
            </div>
            <div style={{ fontSize: 11, color: 'var(--mo-text-secondary)' }}>
              {uploads.length}건
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {uploads.map((u) => (
              <UploadCard key={u.id} upload={u} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 주문 카드
// ───────────────────────────────────────────────────────────

function OrderCard({
  order,
  customerName,
  expanded,
  onToggle,
}: {
  order: OrderRow;
  customerName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = orderStatusStyle(order.status);
  const items = order.order_items ?? [];
  const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const tracking = normalizeTrackingNumbers(order.tracking_numbers);

  return (
    <div
      className="mo-order-card"
      style={{
        background: 'var(--mo-bg-card)',
        border: '1px solid var(--mo-border)',
        borderRadius: 16,
        padding: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.20)',
      }}
    >
      {/* 헤더 클릭 영역 — 3-Row (거래처명+상태 / 날짜+수량 / 금액) */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        {/* Row 1: 거래처명 좌측 (17px/700) + 상태 배지 우측 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--mo-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {customerName}
          </span>
          <StatusPill style={style} />
        </div>

        {/* Row 2: 날짜 좌측 + 수량 우측 (12px/secondary) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--mo-text-secondary)' }}>
            {formatKstDate(order.order_date)}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--mo-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {totalQty}개
          </span>
        </div>

        {/* Row 3: 금액 우측 정렬 (22px/700/accent) */}
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--mo-accent)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}
          >
            {formatKrw(order.total_amount)}
          </span>
        </div>
      </div>

      {/* 송장 라인 — 있을 때만. 클릭 영역은 헤더와 분리(외부 링크 이동). */}
      {tracking.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--mo-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {tracking.map((t, i) => {
            const url = getTrackingUrl(t.carrier, t.number);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12.5,
                    color: 'var(--mo-text-primary)',
                    minWidth: 0,
                  }}
                >
                  <Truck size={14} style={{ color: 'var(--mo-text-secondary)', flexShrink: 0 }} />
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getCarrierLabel(t.carrier)} · {t.number}
                  </span>
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--mo-accent)',
                      border: '1px solid var(--mo-accent)',
                      background: 'transparent',
                      textDecoration: 'none',
                      flexShrink: 0,
                    }}
                  >
                    조회
                    <ExternalLink size={11} />
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* 상세 펼치기 — 품목 + 메모 */}
      {expanded ? (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--mo-border)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--mo-text-secondary)',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            주문 품목
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--mo-text-secondary)' }}>
              품목 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </div>
          )}

          {order.memo ? (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                background: 'var(--mo-bg-input)',
                border: '1px solid var(--mo-border)',
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--mo-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                <MessageSquare size={12} strokeWidth={2} />
                메모
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: 'var(--mo-text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {order.memo}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({ item }: { item: OrderItemRow }) {
  const name = item.products?.name ?? '(제품 없음)';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          minWidth: 0,
          flex: 1,
          color: 'var(--mo-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>
      <div
        style={{
          flexShrink: 0,
          fontSize: 12,
          color: 'var(--mo-text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {item.quantity}개
      </div>
      <div
        style={{
          flexShrink: 0,
          minWidth: 68,
          textAlign: 'right',
          color: 'var(--mo-text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatKrw(item.amount)}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 업로드 카드
// ───────────────────────────────────────────────────────────

function UploadCard({ upload }: { upload: UploadRow }) {
  const style = uploadStatusStyle(upload.status);
  const isImage =
    upload.file_url != null &&
    /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(upload.file_url);

  return (
    <div
      className="mo-order-card"
      style={{
        background: 'var(--mo-bg-card)',
        border: '1px solid var(--mo-border)',
        borderRadius: 16,
        padding: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--mo-text-primary)',
            }}
          >
            <Camera size={14} strokeWidth={2} style={{ color: 'var(--mo-text-secondary)' }} />
            사진 접수
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--mo-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatKst(upload.created_at)}
          </div>
        </div>
        <StatusPill style={style} />
      </div>

      {upload.message ? (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--mo-bg-input)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--mo-text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {upload.message}
        </div>
      ) : null}

      {isImage && upload.file_url ? (
        <a
          href={upload.file_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', marginTop: 10 }}
        >
          <img
            src={upload.file_url}
            alt={upload.file_name ?? '업로드 이미지'}
            style={{
              width: '100%',
              maxHeight: 160,
              objectFit: 'contain',
              borderRadius: 10,
              background: 'var(--mo-bg-input)',
            }}
            loading="lazy"
          />
        </a>
      ) : null}

      {upload.status === 'done' && upload.processed_at ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--mo-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            color: 'var(--mo-success)',
          }}
        >
          <CheckCircle2 size={13} strokeWidth={2} />
          <span>{formatKst(upload.processed_at)} 처리 완료</span>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 재사용 요소
// ───────────────────────────────────────────────────────────

function StatusPill({ style }: { style: StatusStyle }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: style.dot,
          display: 'inline-block',
        }}
      />
      {style.label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div
      className="mo-card"
      style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--mo-text-secondary)' }}
    >
      <Loader2 size={20} className="mo-spin" />
      <div style={{ marginTop: 10, fontSize: 12 }}>불러오는 중…</div>
    </div>
  );
}

function EmptyCard({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div
      className="mo-card"
      style={{
        textAlign: 'center',
        padding: '36px 16px',
        color: 'var(--mo-text-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{title}</div>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mo-card">
      <div className="mo-error" role="alert">
        {message}
      </div>
      <button
        type="button"
        className="mo-btn-secondary"
        style={{ marginTop: 12 }}
        onClick={onRetry}
      >
        다시 시도
      </button>
    </div>
  );
}
