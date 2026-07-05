/**
 * 모바일 주문내역 페이지.
 * - 접힘: 주문 카드 리스트
 * - 펼침: 좌측 카드 리스트 + 우측 선택된 주문 상세
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서.
 * 🔴 CLAUDE.md §5: 기존 useOrders 재사용 → fetchAllRows 자동 적용.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ExternalLink, X } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useOrders } from '@/hooks/queries/useOrders';
import { useOrderPhotosByOrders, type OrderPhoto } from '@/hooks/queries/useOrderPhotos';
import { OrderPhotoSection } from '@/components/order/OrderPhotoSection';
import type { Order } from '@/types/orders';
import {
  getCarrierLabel,
  getTrackingUrl,
  normalizeTrackingNumbers,
  type TrackingEntry,
} from '@/utils/shippingCarriers';
import { groupOrdersByCustomerAndDate } from '@/utils/orderGrouping';
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

// 🟠 신규 4단계 라벨 매핑. 색상은 mobile 3-token(m-success/warning/danger) 안에서:
//    received/confirmed/processing → warning (진행 중), shipped → success, canceled → danger.
//    레거시 draft/done 은 각각 임시/완료 로 표시(읽기 전용).
function statusBadge(status: Order['status']) {
  if (status === 'shipped') return { label: '발송완료', color: 'var(--m-success)' };
  if (status === 'processing') return { label: '처리중', color: 'var(--m-warning)' };
  if (status === 'confirmed') return { label: '주문확인', color: 'var(--m-warning)' };
  if (status === 'received') return { label: '주문접수', color: 'var(--m-warning)' };
  if (status === 'canceled') return { label: '취소', color: 'var(--m-danger)' };
  if (status === 'done') return { label: '완료', color: 'var(--m-success)' };
  return { label: '임시', color: 'var(--m-warning)' };
}

/**
 * 우측(또는 하단) 디테일 패널의 표시 모드.
 * - single: 묶음 내 특정 1건 주문의 품목만 표시
 * - group : 같은 거래처+같은 날짜 묶음의 모든 주문 품목을 섹션별로 합쳐 표시
 */
type ViewSel =
  | { kind: 'single'; orderId: string }
  | { kind: 'group'; orderIds: string[] };

function viewSelEquals(a: ViewSel | null, b: ViewSel | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'single' && b.kind === 'single') return a.orderId === b.orderId;
  if (a.kind === 'group' && b.kind === 'group') {
    if (a.orderIds.length !== b.orderIds.length) return false;
    const setA = new Set(a.orderIds);
    return b.orderIds.every((id) => setA.has(id));
  }
  return false;
}

export function OrderListPage() {
  const { companyId } = useCompany();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [viewSel, setViewSel] = useState<ViewSel | null>(null);
  const isUnfolded = useMediaQuery('(min-width: 601px)');

  const range = useMemo(() => getRange(period), [period]);
  const ordersQuery = useOrders({ companyId, range });
  const { data: orders = [], isLoading } = ordersQuery;
  const refreshing = ordersQuery.isFetching;
  const handleRefresh = () => {
    void ordersQuery.refetch();
  };

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { data: photosByOrder } = useOrderPhotosByOrders(orderIds, companyId);

  // 같은 거래처+같은 날짜 묶음 — 그룹 내 created_at 오름차순, 그룹 자체는 가장
  // 늦은 주문 기준 최신순(주문일 desc → created_at desc) 으로 표시.
  const orderGroups = useMemo(() => {
    const groups = groupOrdersByCustomerAndDate(orders);
    groups.sort((a, b) => {
      const aLast = a[a.length - 1];
      const bLast = b[b.length - 1];
      if (aLast.order_date !== bLast.order_date) {
        return aLast.order_date < bLast.order_date ? 1 : -1;
      }
      return aLast.created_at < bLast.created_at ? 1 : -1;
    });
    return groups;
  }, [orders]);

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

  // viewSel 이 유효하지 않으면(주문 목록 갱신/필터 변경 등) 첫 그룹의 첫 주문으로 폴백.
  const effectiveViewSel: ViewSel | null = useMemo(() => {
    const isValid = (() => {
      if (!viewSel) return false;
      if (viewSel.kind === 'single')
        return orders.some((o) => o.id === viewSel.orderId);
      return viewSel.orderIds.every((id) =>
        orders.some((o) => o.id === id),
      );
    })();
    if (isValid) return viewSel;
    const first = orderGroups[0]?.[0];
    return first ? { kind: 'single', orderId: first.id } : null;
  }, [viewSel, orders, orderGroups]);

  // 디테일 패널에 보여줄 주문(들) — 단일이면 1건, 묶음이면 group orders.
  const detailOrders: Order[] = useMemo(() => {
    if (!effectiveViewSel) return [];
    if (effectiveViewSel.kind === 'single') {
      const o = orders.find((x) => x.id === effectiveViewSel.orderId);
      return o ? [o] : [];
    }
    return effectiveViewSel.orderIds
      .map((id) => orders.find((x) => x.id === id))
      .filter((x): x is Order => !!x);
  }, [effectiveViewSel, orders]);

  const showDetail = isUnfolded && detailOrders.length > 0;

  const handleSelectSingle = (orderId: string) =>
    setViewSel({ kind: 'single', orderId });
  const handleSelectGroup = (orderIds: string[]) =>
    setViewSel({ kind: 'group', orderIds });

  // 🟠 펼침(Z Fold) 2열 모드: 좌/우 패널이 각각 독립 스크롤이라야 좌측 스크롤
  //    중 우측 상세가 같이 밀려나가지 않음. 우측 새 항목 선택 시 우측 스크롤
  //    위치를 맨 위로 리셋해 이전 선택의 잔여 스크롤 영향 차단.
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const detailKey =
    effectiveViewSel?.kind === 'single'
      ? `s:${effectiveViewSel.orderId}`
      : effectiveViewSel?.kind === 'group'
        ? `g:${effectiveViewSel.orderIds.join(',')}`
        : 'none';
  useEffect(() => {
    if (!isUnfolded) return;
    if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
  }, [detailKey, isUnfolded]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUnfolded ? 'row' : 'column',
        // 펼침: 부모(.mobile-content) 높이를 채우고 overflow 차단 → 좌/우가 각각
        // 자체 overflow-y:auto 로 독립 스크롤. 접힘: 기존처럼 페이지 전체가 흐름.
        ...(isUnfolded
          ? { height: '100%', overflow: 'hidden' }
          : { minHeight: '100%' }),
      }}
    >
      {/* 좌측(또는 단일) 리스트 — 펼침 시 35% + 자체 스크롤 */}
      <div
        // 펼침 모드에서만 스크롤바 시각 숨김 (스크롤 기능 유지).
        className={isUnfolded ? 'm-hide-scrollbar' : undefined}
        style={{
          // 🟡 (2026-07-06) 좌측 목록 폭 35% → 44% 로 확장. 태블릿 가로 뷰에서
          //    금액("₩745,360") 이 줄바꿈되던 문제 해결. 우측 상세는 flex:1 이라
          //    자동 축소되지만 여전히 56% 확보되므로 가독성 유지.
          flex: isUnfolded ? '0 0 44%' : '1 1 auto',
          borderRight: isUnfolded ? '1px solid var(--m-border)' : 'none',
          minHeight: 0,
          ...(isUnfolded
            ? { height: '100%', overflowY: 'auto', overflowX: 'hidden' }
            : {}),
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
            {orderGroups.map((group) => {
              const groupKey = group.map((o) => o.id).join('|');
              return (
                <OrderGroupCard
                  key={groupKey}
                  group={group}
                  photosByOrder={photosByOrder}
                  viewSel={effectiveViewSel}
                  onSelectSingle={handleSelectSingle}
                  onSelectGroup={handleSelectGroup}
                  onOpenPhoto={openPhotoModal}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 우측 상세 (펼침 한정) — single: OrderDetail, group: OrderGroupDetail.
          자체 overflow-y:auto + 새 항목 선택 시 useEffect 로 scrollTop=0 리셋. */}
      {showDetail && (
        <div
          ref={detailScrollRef}
          className="m-hide-scrollbar"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '12px 16px',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {effectiveViewSel?.kind === 'group' ? (
            <OrderGroupDetail orders={detailOrders} />
          ) : (
            <OrderDetail order={detailOrders[0]!} />
          )}
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

/**
 * 같은 거래처+같은 날짜 묶음을 표시하는 카드.
 * - 단일 주문(group.length === 1) 이면 기존 OrderCard 와 동일하게 단순 표시.
 * - 묶음(2건 이상) 이면 헤더에 그룹 합계 + "N건 묶음" 배지, 카드 안에 각 주문을
 *   "최초/추가1/추가2..." 라벨 + 시간 + 개별 금액 으로 나열. 각 행 탭 시 그 주문을
 *   선택(Z Fold 펼침에서 OrderDetail 갱신).
 * - 송장: 묶음 전체 송장을 하나의 strip 으로 통합 표시.
 * - 사진: 묶음 내 모든 주문의 사진 썸네일 + 본주문 ID 기준 모달 진입.
 */
function OrderGroupCard({
  group,
  photosByOrder,
  viewSel,
  onSelectSingle,
  onSelectGroup,
  onOpenPhoto,
}: {
  group: Order[];
  photosByOrder: Map<string, OrderPhoto[]> | undefined;
  viewSel: ViewSel | null;
  onSelectSingle: (orderId: string) => void;
  onSelectGroup: (orderIds: string[]) => void;
  onOpenPhoto: (orderId: string, customerId: string | null) => void;
}) {
  const first = group[0];
  const groupOrderIds = group.map((o) => o.id);
  // 그룹 헤더 자체가 선택된 상태(전체보기 모드)인지 — viewSel kind='group' 이고
  // orderIds 가 이 그룹과 정확히 일치할 때만 true.
  const isGroupSelected = viewSelEquals(viewSel, {
    kind: 'group',
    orderIds: groupOrderIds,
  });
  // single 모드에서 어느 행이 선택되었는지 — 행 단위 border 강조용.
  const selectedSingleOrderId =
    viewSel?.kind === 'single' ? viewSel.orderId : null;
  // 🟠 그룹 내 사진 첨부 대상 — 사용자가 그룹 내 행을 탭해 선택했으면 그 주문,
  //    아직 아무 행도 선택하지 않았으면 기존과 동일하게 첫 주문(first)으로 폴백.
  //    (버그수정: 이전에는 무조건 first 로 고정되어 있었음)
  const targetOrder =
    group.find((o) => o.id === selectedSingleOrderId) ?? first;
  const targetIdx = group.findIndex((o) => o.id === targetOrder.id);
  const targetLabel = targetIdx > 0 ? `추가${targetIdx}` : '최초';

  if (group.length === 1) {
    return (
      <OrderCard
        order={first}
        photos={photosByOrder?.get(first.id) ?? []}
        selected={selectedSingleOrderId === first.id}
        onClick={() => onSelectSingle(first.id)}
        onOpenPhoto={() => onOpenPhoto(first.id, first.customer?.id ?? null)}
      />
    );
  }
  // ── 묶음 카드 ──
  const groupTotal = group.reduce((s, o) => s + o.total_amount, 0);
  const groupQty = group.reduce(
    (s, o) => s + o.items.reduce((x, it) => x + (it.quantity ?? 0), 0),
    0,
  );
  const grade = first.customer?.grade ?? null;
  const status = statusBadge(first.status);
  const trackingEntries = group.flatMap((o) =>
    normalizeTrackingNumbers(o.tracking_numbers),
  );
  const photos = group.flatMap((o) => photosByOrder?.get(o.id) ?? []);
  const hasPhoto = photos.length > 0;
  const THUMB_LIMIT = 4;
  const thumbs = photos.slice(0, THUMB_LIMIT);
  const extra = Math.max(0, photos.length - THUMB_LIMIT);

  // 카드는 group 선택과 무관하게 항상 surface 배경 유지. 묶음 어떤 행이라도
  // 선택되어 있으면 카드 전체 테두리만 강조 — 어떤 행이 선택됐는지는 행 자체
  // 의 border 로 별도 표시.
  const someRowSelected =
    selectedSingleOrderId !== null &&
    group.some((o) => o.id === selectedSingleOrderId);
  const cardHighlighted = isGroupSelected || someRowSelected;

  return (
    <div
      className="m-card"
      style={{
        textAlign: 'left',
        // 카드 자체는 클릭 영역으로 쓰지 않음 — 헤더/행에 각각 핸들러.
        borderColor: cardHighlighted ? 'var(--m-primary)' : 'var(--m-border)',
        borderWidth: cardHighlighted ? 2 : 1,
        background: 'var(--m-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* 헤더 (거래처/배지/날짜/합계) — 탭 시 묶음 전체보기. 그룹 선택 시 border 강조. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectGroup(groupOrderIds)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectGroup(groupOrderIds);
          }
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '6px 8px',
          margin: '-6px -8px 0',
          borderRadius: 8,
          border: `2px solid ${isGroupSelected ? 'var(--m-primary)' : 'transparent'}`,
          cursor: 'pointer',
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
            {first.customer?.name ?? '거래처 미상'}
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
          <span
            className="m-badge"
            style={{
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fcd34d',
            }}
            title="같은 거래처 같은 날짜 묶음"
          >
            {group.length}건 묶음
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
          <span className="m-num">{first.order_date?.slice(0, 10)}</span>
          <span className="m-num">{fmtWon(groupQty)}개</span>
        </div>
        <div
          className="m-num"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--m-text)',
            textAlign: 'right',
            whiteSpace: 'nowrap',
          }}
        >
          ₩{fmtWon(groupTotal)}
        </div>
      </div>

      {/* 묶음 내 각 주문 row — 최초/추가 라벨 + 시간 + 개별 금액 */}
      <div
        style={{
          marginTop: 2,
          paddingTop: 8,
          borderTop: '1px solid var(--m-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {group.map((o, idx) => {
          const isAdd = idx > 0;
          const label = isAdd ? `추가${idx}` : '최초';
          const t = (o.created_at ?? '').slice(11, 16); // HH:MM (UTC 기준 표시)
          const qty = o.items.reduce((s, it) => s + (it.quantity ?? 0), 0);
          const isSel = selectedSingleOrderId === o.id;
          return (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSingle(o.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectSingle(o.id);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                // 🟠 추가주문 행의 amber-50 배경(#fffbeb)을 제거 — 거의 흰색이라
                //    선택 하이라이트로 오인되는 시각 충돌이 있었음.
                //    "최초/추가N" 라벨 텍스트만으로 구분 + 선택은 border 로 명시.
                padding: '6px 8px',
                borderRadius: 8,
                border: `2px solid ${isSel ? 'var(--m-primary)' : 'transparent'}`,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  minWidth: 36,
                  color: isAdd ? '#92400e' : 'var(--m-primary)',
                }}
              >
                {label}
              </span>
              <span
                className="m-num"
                style={{
                  fontSize: 12,
                  color: 'var(--m-text-secondary)',
                  minWidth: 48,
                }}
              >
                {t}
              </span>
              <span
                className="m-num"
                style={{
                  fontSize: 12,
                  color: 'var(--m-text-secondary)',
                  flex: 1,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {fmtWon(qty)}개
              </span>
              <span
                className="m-num"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--m-text)',
                  minWidth: 90,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                ₩{fmtWon(o.total_amount)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 묶음 전체 송장 통합 표시 */}
      <TrackingNumberStrip entries={trackingEntries} />

      {/* 사진 — 묶음 내 모든 주문의 사진 통합 표시. 촬영/추가는 현재 선택된 행
          (targetOrder) 기준으로 진입. 그룹 내 행을 탭하면 대상이 바뀐다. */}
      <div
        style={{
          marginTop: 4,
          paddingTop: 8,
          borderTop: '1px solid var(--m-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: 'var(--m-text-secondary)',
          }}
        >
          촬영대상: {targetLabel}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          {hasPhoto ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onOpenPhoto(targetOrder.id, targetOrder.customer?.id ?? null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                flex: 1,
                minWidth: 0,
              }}
            >
              {thumbs.map((p) => (
                <div
                  key={p.id}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'var(--m-border)',
                    flex: '0 0 auto',
                  }}
                >
                  <img
                    src={p.storage_url}
                    alt="출고사진"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.visibility = 'hidden';
                    }}
                  />
                </div>
              ))}
              {extra > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--m-text-secondary)',
                    marginLeft: 2,
                  }}
                >
                  +{extra}
                </span>
              )}
            </div>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--m-text-secondary)',
              }}
            >
              <Camera size={12} />
              <span>사진 없음</span>
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhoto(targetOrder.id, targetOrder.customer?.id ?? null);
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
              background: hasPhoto ? 'var(--m-border)' : 'var(--m-primary)',
              color: hasPhoto ? 'var(--m-text)' : '#ffffff',
              flex: '0 0 auto',
            }}
          >
            <Camera size={12} />
            <span>{hasPhoto ? '사진 보기/추가' : '출고 촬영'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  photos,
  selected,
  onClick,
  onOpenPhoto,
}: {
  order: Order;
  photos: OrderPhoto[];
  selected: boolean;
  onClick: () => void;
  onOpenPhoto: () => void;
}) {
  const hasPhoto = photos.length > 0;
  const THUMB_LIMIT = 4;
  const thumbs = photos.slice(0, THUMB_LIMIT);
  const extra = Math.max(0, photos.length - THUMB_LIMIT);
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
        // 선택 표시는 border 만으로 — 묶음 카드 행 스타일과 일관.
        borderColor: selected ? 'var(--m-primary)' : 'var(--m-border)',
        borderWidth: selected ? 2 : 1,
        background: 'var(--m-surface)',
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
          whiteSpace: 'nowrap',
        }}
      >
        ₩{fmtWon(order.total_amount)}
      </div>

      {/* 송장번호 — OPS 에서 등록된 데이터를 읽기 전용으로 표시. 조회 가능 택배사는
          탭 시 새 탭으로 조회 페이지 오픈, 퀵/직접전달은 정보 표시만. */}
      <TrackingNumberStrip
        entries={normalizeTrackingNumbers(order.tracking_numbers)}
      />

      {/* 카드 하단: 출고 사진 — 썸네일 직접 표시 + 촬영/추가 버튼 */}
      <div
        style={{
          marginTop: 4,
          paddingTop: 8,
          borderTop: '1px solid var(--m-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {hasPhoto ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhoto();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              flex: 1,
              minWidth: 0,
            }}
          >
            {thumbs.map((p) => (
              <div
                key={p.id}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: 'var(--m-border)',
                  flex: '0 0 auto',
                }}
              >
                <img
                  src={p.storage_url}
                  alt="출고사진"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              </div>
            ))}
            {extra > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--m-text-secondary)',
                  marginLeft: 2,
                }}
              >
                +{extra}
              </span>
            )}
          </div>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--m-text-secondary)',
            }}
          >
            <Camera size={12} />
            <span>사진 없음</span>
          </span>
        )}
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
            background: hasPhoto ? 'var(--m-border)' : 'var(--m-primary)',
            color: hasPhoto ? 'var(--m-text)' : '#ffffff',
            flex: '0 0 auto',
          }}
        >
          <Camera size={12} />
          <span>{hasPhoto ? '사진 보기/추가' : '출고 촬영'}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 송장번호 가로 스트립 — "택배사명:송장번호" 형태의 칩 나열.
 * 조회 URL 이 있는 택배사(로젠/CJ/한진/우체국)는 탭 시 새 탭 오픈,
 * 퀵/직접전달은 회색 칩으로만 표시. 입력/등록 UI 없음 — 조회 전용.
 */
function TrackingNumberStrip({ entries }: { entries: TrackingEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {entries.map((tn, idx) => {
        const label = getCarrierLabel(tn.carrier);
        const url = getTrackingUrl(tn.carrier, tn.number);
        const hasUrl = !!url;
        const handleClick = (e: React.MouseEvent) => {
          if (!hasUrl || !url) return;
          // 카드 onClick 으로 버블링 차단 — 송장 탭이 주문 선택을 바꾸면 어색함.
          e.stopPropagation();
          window.open(url, '_blank', 'noopener,noreferrer');
        };
        return (
          <span
            key={`${tn.carrier}-${tn.number}-${idx}`}
            role={hasUrl ? 'button' : undefined}
            onClick={hasUrl ? handleClick : undefined}
            title={hasUrl ? `${label} 조회: ${tn.number}` : `${label}: ${tn.number}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 9px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 999,
              fontVariantNumeric: 'tabular-nums',
              color: hasUrl ? '#1D4ED8' : 'var(--m-text-secondary)',
              background: hasUrl ? 'rgba(29, 78, 216, 0.10)' : 'var(--m-border)',
              border: `1px solid ${hasUrl ? 'rgba(29, 78, 216, 0.35)' : 'transparent'}`,
              cursor: hasUrl ? 'pointer' : 'default',
            }}
          >
            <span>
              {label}:{tn.number}
            </span>
            {hasUrl && <ExternalLink size={10} strokeWidth={2} />}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 묶음(같은 거래처+같은 날짜) 전체보기 상세 — 카드 헤더 탭 시 사용.
 * 각 주문을 "최초/추가N (HH:MM)" 섹션 헤더 아래에 품목 표로 나열하고,
 * 맨 아래 묶음 전체 합계를 표시.
 */
function OrderGroupDetail({ orders }: { orders: Order[] }) {
  if (orders.length === 0) return null;
  const head = orders[0];
  const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);
  const trackingEntries = orders.flatMap((o) =>
    normalizeTrackingNumbers(o.tracking_numbers),
  );
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {head.customer?.name ?? '거래처 미상'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--m-text-secondary)',
            marginTop: 4,
          }}
        >
          <span className="m-num">{head.order_date?.slice(0, 10)}</span>
          <span> · {orders.length}건 묶음</span>
        </div>
        {trackingEntries.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <TrackingNumberStrip entries={trackingEntries} />
          </div>
        )}
      </div>

      {orders.map((o, idx) => {
        const isAdd = idx > 0;
        const label = isAdd ? `추가${idx}` : '최초';
        const t = (o.created_at ?? '').slice(11, 16);
        return (
          <div key={o.id} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: isAdd ? '#92400e' : 'var(--m-primary)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: isAdd
                    ? 'rgba(252, 211, 77, 0.20)'
                    : 'var(--m-primary-wash)',
                }}
              >
                {label}
              </span>
              <span
                className="m-num"
                style={{ fontSize: 12, color: 'var(--m-text-secondary)' }}
              >
                {t}
              </span>
              <div style={{ flex: 1 }} />
              <span
                className="m-num"
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--m-text)' }}
              >
                ₩{fmtWon(o.total_amount)}
              </span>
            </div>
            <div className="m-card" style={{ padding: 0, overflow: 'hidden' }}>
              {o.items.length === 0 ? (
                <div className="m-empty">제품이 없습니다.</div>
              ) : (
                o.items.map((it, i) => (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom:
                        i < o.items.length - 1
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
                        style={{
                          fontSize: 11,
                          color: 'var(--m-text-secondary)',
                        }}
                      >
                        {it.product?.code}
                      </div>
                    </div>
                    <div
                      className="m-num"
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        minWidth: 48,
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
                        minWidth: 80,
                        textAlign: 'right',
                      }}
                    >
                      ₩{fmtWon(it.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '2px solid var(--m-border)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 14,
        }}
      >
        <span style={{ color: 'var(--m-text-secondary)' }}>묶음 전체 합계</span>
        <span
          className="m-num"
          style={{ fontWeight: 700, color: 'var(--m-primary)' }}
        >
          ₩{fmtWon(totalAmount)}
        </span>
      </div>
    </div>
  );
}

function OrderDetail({ order }: { order: Order }) {
  const trackingEntries = normalizeTrackingNumbers(order.tracking_numbers);
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
        {trackingEntries.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <TrackingNumberStrip entries={trackingEntries} />
          </div>
        )}
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
