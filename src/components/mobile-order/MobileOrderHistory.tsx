/**
 * 파트너 모바일 주문 - 주문 확인 (내 주문 이력).
 *
 * 두 개의 이력을 병렬 조회:
 *  - orders (최근 30건, order_items 조인)
 *  - customer_order_uploads (최근 20건)
 *
 * 🟠 상태 라벨은 기존 OPS(OrdersPage/mobile OrderListPage) 와 동일 어휘 사용 —
 *   received/confirmed/processing/shipped 4단계 + 레거시 draft/done/canceled.
 * 🟠 KST 기준 표시. Supabase 는 UTC 저장, `toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})` 로 렌더.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, RefreshCw, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MobileSession } from '@/lib/mobileOrderAuth';

// ───────────────────────────────────────────────────────────
// 상태 라벨 매핑
// ───────────────────────────────────────────────────────────

interface StatusStyle {
  label: string;
  bg: string;
  fg: string;
}

/**
 * 4단계 상태 체계 + 레거시. 미매핑 값은 원본 문자열 그대로 노출 (fallback).
 * bg/fg 는 CSS 변수 조합으로 다크/라이트 자동 대응.
 */
const ORDER_STATUS_MAP: Record<string, StatusStyle> = {
  received:   { label: '주문접수', bg: 'var(--mo-bg-input)',  fg: 'var(--mo-accent)' },
  confirmed:  { label: '주문확인', bg: 'var(--mo-badge-low-bg)', fg: 'var(--mo-badge-low-text)' },
  processing: { label: '처리중',   bg: 'var(--mo-badge-low-bg)', fg: 'var(--mo-badge-low-text)' },
  shipped:    { label: '발송완료', bg: 'var(--mo-bg-input)',  fg: 'var(--mo-success)' },
  draft:      { label: '임시',     bg: 'var(--mo-bg-input)',  fg: 'var(--mo-text-secondary)' },
  done:       { label: '완료',     bg: 'var(--mo-bg-input)',  fg: 'var(--mo-success)' },
  canceled:   { label: '취소',     bg: 'var(--mo-badge-out-bg)', fg: 'var(--mo-badge-out-text)' },
};

const UPLOAD_STATUS_MAP: Record<string, StatusStyle> = {
  pending: { label: '검토중',   bg: 'var(--mo-badge-low-bg)', fg: 'var(--mo-badge-low-text)' },
  done:    { label: '처리완료', bg: 'var(--mo-bg-input)',     fg: 'var(--mo-success)' },
};

function orderStatusStyle(status: string): StatusStyle {
  return ORDER_STATUS_MAP[status] ?? {
    label: status,
    bg: 'var(--mo-bg-input)',
    fg: 'var(--mo-text-secondary)',
  };
}
function uploadStatusStyle(status: string): StatusStyle {
  return UPLOAD_STATUS_MAP[status] ?? {
    label: status,
    bg: 'var(--mo-bg-input)',
    fg: 'var(--mo-text-secondary)',
  };
}

// ───────────────────────────────────────────────────────────
// 데이터 타입 (Supabase 반환 형태와 매칭)
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

function formatKrw(n: number | null | undefined): string {
  if (n == null) return '-';
  return `₩${n.toLocaleString('ko-KR')}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

// ───────────────────────────────────────────────────────────
// 메인 컴포넌트
// ───────────────────────────────────────────────────────────

interface Props {
  session: MobileSession;
}

export function MobileOrderHistory({ session }: Props) {
  const ordersQuery = useQuery({
    queryKey: ['mo', 'orders', session.companyId, session.customerId],
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
            id, order_date, status, total_amount, memo, source, created_at,
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

  const refresh = (): void => {
    void ordersQuery.refetch();
    void uploadsQuery.refetch();
  };

  const anyLoading =
    (ordersQuery.isLoading && !ordersQuery.data) ||
    (uploadsQuery.isLoading && !uploadsQuery.data);

  return (
    <div>
      {/* 새로고침 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={refresh}
          className="mo-icon-btn"
          aria-label="새로고침"
          disabled={ordersQuery.isFetching || uploadsQuery.isFetching}
        >
          {ordersQuery.isFetching || uploadsQuery.isFetching ? (
            <Loader2 size={16} className="mo-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>

      {/* 주문 이력 섹션 */}
      <SectionHeader title="주문 이력" count={ordersQuery.data?.length ?? 0} />
      {anyLoading && !ordersQuery.data ? (
        <SkeletonCard />
      ) : ordersQuery.error ? (
        <ErrorCard message="주문 이력을 불러올 수 없습니다." onRetry={refresh} />
      ) : (ordersQuery.data?.length ?? 0) === 0 ? (
        <EmptyCard message="주문 이력이 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ordersQuery.data!.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}

      {/* 사진 업로드 이력 섹션 */}
      <div style={{ height: 20 }} />
      <SectionHeader title="사진 업로드 이력" count={uploadsQuery.data?.length ?? 0} />
      {anyLoading && !uploadsQuery.data ? (
        <SkeletonCard />
      ) : uploadsQuery.error ? (
        <ErrorCard message="업로드 이력을 불러올 수 없습니다." onRetry={refresh} />
      ) : (uploadsQuery.data?.length ?? 0) === 0 ? (
        <EmptyCard message="사진 업로드 이력이 없습니다." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {uploadsQuery.data!.map((u) => (
            <UploadCard key={u.id} upload={u} />
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 섹션 요소
// ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '0 4px 10px',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mo-text-primary)' }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--mo-text-secondary)' }}>{count}건</div>
    </div>
  );
}

function StatusBadge({ style }: { style: StatusStyle }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: style.bg,
        color: style.fg,
      }}
    >
      {style.label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div
      className="mo-card"
      style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--mo-text-secondary)' }}
    >
      <Loader2 size={18} className="mo-spin" />
      <div style={{ marginTop: 8, fontSize: 12 }}>불러오는 중…</div>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div
      className="mo-card"
      style={{
        textAlign: 'center',
        padding: '24px 16px',
        color: 'var(--mo-text-secondary)',
        fontSize: 13,
      }}
    >
      {message}
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

// ───────────────────────────────────────────────────────────
// 주문 카드
// ───────────────────────────────────────────────────────────

function OrderCard({ order }: { order: OrderRow }) {
  const [expanded, setExpanded] = useState(false);
  const items = order.order_items ?? [];
  const itemCount = items.length;
  const style = orderStatusStyle(order.status);

  return (
    <div className="mo-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <StatusBadge style={style} />
            <span style={{ fontSize: 11, color: 'var(--mo-text-secondary)' }}>
              #{shortId(order.id)}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--mo-text-secondary)' }}>
            {formatKst(order.order_date)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mo-text-primary)' }}>
            {formatKrw(order.total_amount)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mo-text-secondary)', marginTop: 2 }}>
            {itemCount}종
          </div>
        </div>
      </div>

      {order.memo ? (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 6,
            background: 'var(--mo-bg-input)',
            fontSize: 12,
            color: 'var(--mo-text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {order.memo}
        </div>
      ) : null}

      {itemCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '8px 0',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid var(--mo-border)',
            color: 'var(--mo-text-secondary)',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            cursor: 'pointer',
          }}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} /> 품목 접기
            </>
          ) : (
            <>
              <ChevronDown size={14} /> 품목 보기 ({itemCount})
            </>
          )}
        </button>
      ) : null}

      {expanded && itemCount > 0 ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => (
            <ItemRow key={it.id} item={it} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({ item }: { item: OrderItemRow }) {
  const name = item.products?.name ?? '(제품 없음)';
  const code = item.products?.code ?? '';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 12,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: 'var(--mo-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        {code ? (
          <div style={{ color: 'var(--mo-text-secondary)', fontSize: 11, marginTop: 1 }}>
            {code} · × {item.quantity}
          </div>
        ) : (
          <div style={{ color: 'var(--mo-text-secondary)', fontSize: 11, marginTop: 1 }}>
            × {item.quantity}
          </div>
        )}
      </div>
      <div style={{ color: 'var(--mo-text-primary)', flexShrink: 0 }}>
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
    <div className="mo-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <StatusBadge style={style} />
            <span style={{ fontSize: 11, color: 'var(--mo-text-secondary)' }}>
              {formatKst(upload.created_at)}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--mo-text-primary)',
              wordBreak: 'break-all',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FileText size={14} style={{ color: 'var(--mo-text-secondary)', flexShrink: 0 }} />
            <span>{upload.file_name ?? '(파일명 없음)'}</span>
          </div>
        </div>
      </div>

      {upload.message ? (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 6,
            background: 'var(--mo-bg-input)',
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
          style={{ display: 'block', marginTop: 8 }}
        >
          <img
            src={upload.file_url}
            alt={upload.file_name ?? '업로드 이미지'}
            style={{
              width: '100%',
              maxHeight: 180,
              objectFit: 'contain',
              borderRadius: 6,
              background: 'var(--mo-bg-input)',
            }}
            loading="lazy"
          />
        </a>
      ) : null}

      {/* 처리 결과 */}
      {upload.status === 'done' ? (
        <FootRow label="처리">
          {upload.processed_at ? formatKst(upload.processed_at) : '완료'}
          {upload.processed_memo ? ` · ${upload.processed_memo}` : ''}
        </FootRow>
      ) : null}
      {upload.order_id ? (
        <FootRow label="연결 주문">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--mo-accent)',
            }}
          >
            #{shortId(upload.order_id)}
            <ExternalLink size={11} />
          </span>
        </FootRow>
      ) : null}
    </div>
  );
}

function FootRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--mo-border)',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--mo-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--mo-text-primary)', textAlign: 'right' }}>{children}</span>
    </div>
  );
}
