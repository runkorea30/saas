/**
 * "오늘 처리할 것" — 2x2 서브카드.
 * 각 블록: 미입고 발주 / 미수금 경과 / 재고 부족 / 미매칭 입금.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ChevronRight,
  Coins,
  Landmark,
  Package,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  LowStockItem,
  OverdueReceivable,
  TodayData,
  UnmatchedDeposit,
  UnreceivedPO,
} from '@/hooks/queries/useHomeDashboard';

interface Props {
  data: TodayData | undefined;
  isLoading: boolean;
  error?: Error | null;
}

type Tone = 'warning' | 'danger' | 'info' | 'success';

const TONE: Record<Tone, { c: string; w: string }> = {
  warning: { c: 'var(--warning)', w: 'var(--warning-wash)' },
  danger: { c: 'var(--danger)', w: 'var(--danger-wash)' },
  info: { c: 'var(--info)', w: 'var(--info-wash)' },
  success: { c: 'var(--success)', w: 'var(--success-wash)' },
};

export function TodaySection({ data, isLoading, error }: Props) {
  return (
    <div
      className="card-surface"
      style={{ padding: 0, overflow: 'hidden', height: '100%' }}
    >
      <SectionHeader
        title="오늘 처리할 것"
        sub="각 섹션은 실제 업무 데이터 기준으로 집계됩니다"
      />
      {error ? (
        <div style={{ padding: 20, fontSize: 13, color: 'var(--danger)' }}>
          Today 로딩 실패: {error.message}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderTop: '1px solid var(--line)',
          }}
        >
          <UnreceivedPOCard
            items={data?.unreceivedPOs ?? []}
            loading={isLoading}
            borderR
            borderB
          />
          <OverdueReceivableCard
            items={data?.overdueReceivables ?? []}
            loading={isLoading}
            borderB
          />
          <LowStockCard
            items={data?.lowStock ?? []}
            ready={data?.inventoryReady ?? true}
            safetyShortageCount={data?.safetyShortageCount ?? 0}
            loading={isLoading}
            borderR
          />
          <UnmatchedDepositCard
            items={data?.unmatchedDeposits ?? []}
            loading={isLoading}
          />
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 14px',
      }}
    >
      <div>
        <div
          className="disp"
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
interface TaskCardFrameProps {
  icon: LucideIcon;
  title: string;
  count: number;
  countLabel?: string;
  meta: string;
  tone: Tone;
  borderR?: boolean;
  borderB?: boolean;
  cta: { label: string; to: string };
  children: ReactNode;
}

function TaskCardFrame({
  icon: Icon,
  title,
  count,
  countLabel = '건',
  meta,
  tone,
  borderR,
  borderB,
  cta,
  children,
}: TaskCardFrameProps) {
  const t = TONE[tone];
  return (
    <div
      style={{
        padding: '14px 18px 14px',
        borderRight: borderR ? '1px solid var(--line)' : 'none',
        borderBottom: borderB ? '1px solid var(--line)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: t.w,
            color: t.c,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={15} strokeWidth={1.6} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{meta}</div>
        </div>
        <div
          className="num"
          style={{ fontSize: 20, fontWeight: 500, color: t.c, lineHeight: 1 }}
        >
          {count}
          <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 2 }}>
            {countLabel}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>

      <Link
        to={cta.to}
        className="row-link"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 10,
          paddingTop: 10,
          gap: 8,
          borderTop: '1px dashed var(--line-strong)',
          fontSize: 12,
          color: 'var(--brand)',
          fontWeight: 500,
        }}
      >
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cta.label}
        </span>
        <span className="hover-arrow" style={{ opacity: 1, flexShrink: 0 }}>
          <ArrowRight size={13} strokeWidth={1.6} />
        </span>
      </Link>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
interface TaskRowData {
  main: string;
  sub: string;
  right: string;
  rightSub?: string;
  status?: Tone;
  bar?: { cur: number; max: number };
}

function TaskRow({ row }: { row: TaskRowData }) {
  const toneColor = row.status ? TONE[row.status].c : 'var(--ink-3)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        color: 'var(--ink)',
        transition: 'background .1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div
        style={{ width: 2, alignSelf: 'stretch', background: toneColor, borderRadius: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {row.main}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--font-num)',
          }}
        >
          {row.sub}
        </div>
        {row.bar && (
          <div
            style={{
              marginTop: 4,
              height: 3,
              background: 'var(--bg-sunken)',
              borderRadius: 2,
              overflow: 'hidden',
              maxWidth: 140,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (row.bar.cur / row.bar.max) * 100)}%`,
                background: toneColor,
              }}
            />
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="num" style={{ fontSize: 12.5, fontWeight: 500 }}>
          {row.right}
        </div>
        {row.rightSub && (
          <div
            style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-num)' }}
          >
            {row.rightSub}
          </div>
        )}
      </div>
      <ChevronRight size={13} color="var(--ink-4)" style={{ flexShrink: 0 }} />
    </div>
  );
}

function EmptyRows({ label, loading }: { label: string; loading: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        padding: '16px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-3)',
        fontSize: 11.5,
      }}
    >
      {loading ? '불러오는 중…' : label}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 4 블록
// ───────────────────────────────────────────────────────────

function UnreceivedPOCard({
  items,
  loading,
  borderR,
  borderB,
}: {
  items: UnreceivedPO[];
  loading: boolean;
  borderR?: boolean;
  borderB?: boolean;
}) {
  const oldest = items.reduce((m, p) => Math.max(m, p.days), 0);
  return (
    <TaskCardFrame
      icon={Truck}
      title="미입고 발주서"
      count={items.length}
      meta={items.length ? `최장 ${oldest}일 경과` : '발주서 없음'}
      tone="warning"
      borderR={borderR}
      borderB={borderB}
      cta={{ label: `발주서 보기`, to: '/inventory/purchase-orders' }}
    >
      {items.length === 0 ? (
        <EmptyRows label="미입고 발주서가 없습니다" loading={loading} />
      ) : (
        items.slice(0, 3).map((p) => (
          <TaskRow
            key={p.id}
            row={{
              main: p.po_number,
              sub: `${p.currency} ${Number(p.total_amount).toLocaleString('en-US')}`,
              right: `${p.days}일`,
              rightSub: 'PO 경과',
              status: p.days > 7 ? 'warning' : 'info',
            }}
          />
        ))
      )}
    </TaskCardFrame>
  );
}

function OverdueReceivableCard({
  items,
  loading,
  borderR,
  borderB,
}: {
  items: OverdueReceivable[];
  loading: boolean;
  borderR?: boolean;
  borderB?: boolean;
}) {
  return (
    <TaskCardFrame
      icon={Coins}
      title="미수금 경과"
      count={items.length}
      meta="30일 이상 경과"
      tone="danger"
      borderR={borderR}
      borderB={borderB}
      cta={{ label: '미수금 전체 보기', to: '/finance/receivables' }}
    >
      {items.length === 0 ? (
        <EmptyRows label="경과 미수금이 없습니다" loading={loading} />
      ) : (
        items.slice(0, 3).map((c) => (
          <TaskRow
            key={c.customer_id}
            row={{
              main: c.name,
              sub: `등급 ${c.grade ?? '—'} · 최근 거래 ${formatDate(c.last_order_date)}`,
              right: `₩${c.balance.toLocaleString('ko-KR')}`,
              rightSub: `${c.days_since_last}일 경과`,
              status: c.days_since_last > 45 ? 'danger' : 'warning',
            }}
          />
        ))
      )}
    </TaskCardFrame>
  );
}

function LowStockCard({
  items,
  ready,
  safetyShortageCount,
  loading,
  borderR,
  borderB,
}: {
  items: LowStockItem[];
  ready: boolean;
  safetyShortageCount: number;
  loading: boolean;
  borderR?: boolean;
  borderB?: boolean;
}) {
  return (
    <TaskCardFrame
      icon={Package}
      title="재고 부족"
      count={items.length}
      meta={
        !ready
          ? '재고 데이터 준비 전'
          : safetyShortageCount > 0
            ? `권장 임계 이하 · 안전재고 미달 ${safetyShortageCount}개`
            : '권장 임계 이하'
      }
      tone="warning"
      borderR={borderR}
      borderB={borderB}
      cta={{ label: '재고 현황 열기', to: '/inventory/stock' }}
    >
      {!ready ? (
        <EmptyRows
          label="재고 로트·트랜잭션을 등록하면 표시됩니다"
          loading={loading}
        />
      ) : items.length === 0 ? (
        <EmptyRows label="부족한 상품이 없습니다" loading={loading} />
      ) : (
        items.slice(0, 3).map((s) => (
          <TaskRow
            key={s.product_id}
            row={{
              main: s.name,
              sub: s.code,
              right: `${s.onhand} ${s.unit}`,
              rightSub: `권장 ${s.suggest} DZ`,
              status: s.onhand <= 3 ? 'danger' : 'warning',
              bar: { cur: s.onhand, max: Math.max(s.suggest, 1) },
            }}
          />
        ))
      )}
    </TaskCardFrame>
  );
}

function UnmatchedDepositCard({
  items,
  loading,
  borderR,
  borderB,
}: {
  items: UnmatchedDeposit[];
  loading: boolean;
  borderR?: boolean;
  borderB?: boolean;
}) {
  return (
    <TaskCardFrame
      icon={Landmark}
      title="미매칭 입금"
      count={items.length}
      meta="최근 7일 자동매칭 실패"
      tone="info"
      borderR={borderR}
      borderB={borderB}
      cta={{ label: '은행거래 매칭하기', to: '/finance/banking' }}
    >
      {items.length === 0 ? (
        <EmptyRows label="미매칭 입금이 없습니다" loading={loading} />
      ) : (
        items.slice(0, 3).map((d) => (
          <TaskRow
            key={d.id}
            row={{
              main: d.depositor_name ?? '입금자 미상',
              sub: d.description ?? '',
              right: `₩${d.amount.toLocaleString('ko-KR')}`,
              rightSub: formatDate(d.transaction_date),
              status: 'info',
            }}
          />
        ))
      )}
    </TaskCardFrame>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
