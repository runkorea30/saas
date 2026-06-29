/**
 * 모바일 주문내역 페이지.
 * - 접힘: 주문 카드 리스트
 * - 펼침: 좌측 카드 리스트 + 우측 선택된 주문 상세
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서.
 * 🔴 CLAUDE.md §5: 기존 useOrders 재사용 → fetchAllRows 자동 적용.
 */
import { useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useOrders } from '@/hooks/queries/useOrders';
import { useOrderPhotoFlags } from '@/hooks/queries/useOrderPhotos';
import { OrderPhotoSection } from '@/components/order/OrderPhotoSection';
import type { Order } from '@/types/orders';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { RefreshButton } from '../components/RefreshButton';

type PeriodKey = 'today' | 'week' | 'month' | 'all';

interface PeriodRange {
  key: PeriodKey;
  label: string;
}

const PERIODS: PeriodRange[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'all', label: '전체' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getRange(p: PeriodKey): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (p === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: ymd(start), end: ymd(end) };
  }
  if (p === 'week') {
    const day = now.getDay(); // 일=0
    const monOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + monOffset,
    );
    return { start: ymd(start), end: ymd(end) };
  }
  if (p === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: ymd(start), end: ymd(end) };
  }
  // all: 충분히 넓은 범위
  const start = new Date(2020, 0, 1);
  return { start: ymd(start), end: ymd(end) };
}

function fmtWon(n: number): string {
  return n.toLocaleString('ko-KR');
}

function gradeBadgeColor(grade: string | null | undefined): string {
  switch ((grade || '').toLowerCase()) {
    case 'a':
      return 'var(--m-primary)';
    case 'b':
      return 'var(--m-warning)';
    case 'c':
      return '#3b82f6';
    case 'd':
      return '#6b7280';
    default:
      return '#9ca3af';
  }
}

function statusBadge(status: Order['status']) {
  if (status === 'confirmed' || status === 'shipped' || status === 'done') {
    return { label: '확정', color: 'var(--m-success)' };
  }
  if (status === 'canceled') {
    return { label: '취소', color: 'var(--m-danger)' };
  }
  return { label: '대기', color: 'var(--m-warning)' };
}

export function OrderListPage() {
  const { companyId } = useCompany();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isUnfolded = useMediaQuery('(min-width: 601px)');

  const range = useMemo(() => getRange(period), [period]);
  const ordersQuery = useOrders({ companyId, range });
  const { data: orders = [], isLoading } = ordersQuery;
  const refreshing = ordersQuery.isFetching;
  const handleRefresh = () => {
    void ordersQuery.refetch();
  };

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { data: photoFlags } = useOrderPhotoFlags(orderIds, companyId);

  // 🟠 출고 사진 바텀시트 모달 — 카드 하단 버튼 클릭 시 열림.
  const [photoModal, setPhotoModal] = useState<{
    orderId: string;
    customerId: string | null;
  } | null>(null);
  // 🔴 업로드 진행 중에는 모달 닫기 차단 (네트워크 취소 방지).
  const [photoUploading, setPhotoUploading] = useState(false);

  const openPhotoModal = (orderId: string, customerId: string | null) => {
    setPhotoModal({ orderId, customerId });
  };

  const closePhotoModal = () => {
    if (photoUploading) return;
    setPhotoModal(null);
  };

  const selected = orders.find((o) => o.id === selectedId) ?? orders[0] ?? null;
  const showDetail = isUnfolded && selected !== null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUnfolded ? 'row' : 'column',
        minHeight: '100%',
      }}
    >
      {/* 좌측(또는 단일) 리스트 — 펼침 시 35% */}
      <div
        style={{
          flex: isUnfolded ? '0 0 35%' : '1 1 auto',
          borderRight: isUnfolded ? '1px solid var(--m-border)' : 'none',
          minHeight: 0,
        }}
      >
        <header className="m-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 className="m-page-title">주문내역</h1>
            <div style={{ flex: 1 }} />
            <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
          </div>
          <div className="m-tab-row">
            {PERIODS.map((p) => (
              <button
                type="button"
                key={p.key}
                className="m-tab"
                aria-pressed={period === p.key}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="m-empty">불러오는 중…</div>
        ) : orders.length === 0 ? (
          <div className="m-empty">해당 기간에 주문이 없습니다.</div>
        ) : (
          <div className="m-list">
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                hasPhoto={photoFlags?.has(o.id) ?? false}
                selected={isUnfolded && selected?.id === o.id}
                onClick={() => setSelectedId(o.id)}
                onOpenPhoto={() =>
                  openPhotoModal(o.id, o.customer?.id ?? null)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* 우측 상세 (펼침 한정) */}
      {showDetail && (
        <div style={{ flex: 1, minWidth: 0, padding: '12px 16px' }}>
          <OrderDetail order={selected!} />
        </div>
      )}

      {/* 출고 사진 바텀시트 — 카드 촬영/조회 버튼 진입점 */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closePhotoModal}
            style={photoUploading ? { pointerEvents: 'none' } : undefined}
          />
          <div className="relative w-full bg-[#1a1a1a] rounded-t-2xl p-4 pb-8 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">출고 사진</h3>
              <button
                type="button"
                onClick={closePhotoModal}
                disabled={photoUploading}
                aria-label="닫기"
                className="disabled:opacity-30"
              >
                <X size={18} className="text-white/60" />
              </button>
            </div>
            <OrderPhotoSection
              orderId={photoModal.orderId}
              companyId={companyId}
              customerId={photoModal.customerId}
              showCamera={true}
              theme="dark"
              onUploadingChange={setPhotoUploading}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  hasPhoto,
  selected,
  onClick,
  onOpenPhoto,
}: {
  order: Order;
  hasPhoto: boolean;
  selected: boolean;
  onClick: () => void;
  onOpenPhoto: () => void;
}) {
  const qty = order.items.reduce((s, it) => s + (it.quantity ?? 0), 0);
  const grade = order.customer?.grade ?? null;
  const status = statusBadge(order.status);
  // 🟠 외부 button(전체 카드)과의 nested-button 방지: div 로 변경 + 키보드 활성화 직접 처리.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="m-card"
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: selected ? 'var(--m-primary)' : 'var(--m-border)',
        background: selected ? 'var(--m-primary-wash)' : 'var(--m-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--m-text)' }}>
          {order.customer?.name ?? '거래처 미상'}
        </span>
        {grade && (
          <span
            className="m-badge"
            style={{ background: gradeBadgeColor(grade), color: '#ffffff' }}
          >
            {grade.toUpperCase()}
          </span>
        )}
        <span
          className="m-badge"
          style={{
            background: `${status.color}22`,
            color: status.color,
            border: `1px solid ${status.color}`,
          }}
        >
          {status.label}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--m-text-secondary)',
        }}
      >
        <span className="m-num">{order.order_date?.slice(0, 10)}</span>
        <span className="m-num">{fmtWon(qty)}개</span>
      </div>
      <div
        className="m-num"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--m-text)',
          textAlign: 'right',
        }}
      >
        ₩{fmtWon(order.total_amount)}
      </div>

      {/* 카드 하단: 사진 상태 + 촬영/조회 버튼 — 카드 클릭과 분리 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 4,
          paddingTop: 8,
          borderTop: '1px solid var(--m-border)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: hasPhoto
              ? 'var(--m-success, #16a34a)'
              : 'var(--m-text-secondary)',
          }}
        >
          <Camera size={12} />
          <span>{hasPhoto ? '촬영완료' : '사진 없음'}</span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenPhoto();
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 999,
            border: 0,
            cursor: 'pointer',
            background: hasPhoto
              ? 'var(--m-border)'
              : 'var(--m-primary)',
            color: hasPhoto ? 'var(--m-text)' : '#ffffff',
          }}
        >
          <Camera size={12} />
          <span>{hasPhoto ? '사진 보기/추가' : '출고 촬영'}</span>
        </button>
      </div>
    </div>
  );
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {order.customer?.name ?? '거래처 미상'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--m-text-secondary)',
            marginTop: 4,
          }}
        >
          <span className="m-num">{order.order_date?.slice(0, 10)}</span>
          {order.memo && <span> · {order.memo}</span>}
        </div>
      </div>
      <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
        {order.items.length === 0 ? (
          <div className="m-empty">제품이 없습니다.</div>
        ) : (
          order.items.map((it, idx) => (
            <div
              key={it.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom:
                  idx < order.items.length - 1
                    ? '1px solid var(--m-border)'
                    : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--m-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={it.product?.name ?? ''}
                >
                  {it.product?.name ?? '—'}
                </div>
                <div
                  className="m-num"
                  style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}
                >
                  {it.product?.code}
                </div>
              </div>
              <div
                className="m-num"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  minWidth: 56,
                  textAlign: 'right',
                }}
              >
                {fmtWon(it.quantity)}
              </div>
              <div
                className="m-num"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  minWidth: 88,
                  textAlign: 'right',
                }}
              >
                ₩{fmtWon(it.amount)}
              </div>
            </div>
          ))
        )}
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 14,
        }}
      >
        <span style={{ color: 'var(--m-text-secondary)' }}>합계</span>
        <span
          className="m-num"
          style={{ fontWeight: 700, color: 'var(--m-primary)' }}
        >
          ₩{fmtWon(order.total_amount)}
        </span>
      </div>
    </div>
  );
}
