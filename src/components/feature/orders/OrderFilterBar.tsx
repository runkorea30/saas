/**
 * Orders 필터 바. 기간(Segmented), 검색, 거래처/상태(MultiChip), 접수경로(Segmented).
 * 모든 상태는 부모(Orders.tsx)가 소유하고 callback으로 전달 — 순수 presentational.
 */
import { Calendar, Flag, Search, Users } from 'lucide-react';
import {
  GradeBadge,
  MultiChip,
  Segmented,
  SourceIcon,
  fmtDate,
} from './primitives';
import type { OrderStatus } from '@/types/common';
import type { PeriodKey, SourceFilter } from '@/types/orders';

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'lastmonth', label: '지난 달' },
  { id: '90d', label: '90일' },
  { id: 'custom', label: '사용자 지정' },
];

const STATUS_OPTIONS: { id: OrderStatus; label: string; dot: string }[] = [
  { id: 'draft', label: '임시', dot: 'var(--ink-4)' },
  { id: 'confirmed', label: '확정', dot: 'var(--info)' },
  { id: 'shipped', label: '출고', dot: 'var(--warning)' },
  { id: 'done', label: '완료', dot: 'var(--success)' },
  { id: 'canceled', label: '취소', dot: 'var(--danger)' },
];

interface CustomerOption {
  id: string;
  name: string;
  grade: string | null;
}

export interface OrderFilterBarProps {
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  custom: { from: string; to: string };
  onCustomChange: (c: { from: string; to: string }) => void;
  query: string;
  onQueryChange: (q: string) => void;
  statusSel: OrderStatus[];
  onStatusChange: (s: OrderStatus[]) => void;
  customerSel: string[];
  onCustomerChange: (c: string[]) => void;
  source: SourceFilter;
  onSourceChange: (s: SourceFilter) => void;
  customers: CustomerOption[];
  rangeStart: Date;
  rangeEnd: Date;
  count: number;
}

const inputStyle: React.CSSProperties = {
  height: 30,
  width: 260,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '0 12px 0 32px',
  fontSize: 12.5,
  color: 'var(--ink)',
  fontFamily: 'var(--font-kr)',
  outline: 'none',
};

const dateInputStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-num)',
  fontSize: 12,
  color: 'var(--ink-2)',
  outline: 'none',
};

export function OrderFilterBar({
  period,
  onPeriodChange,
  custom,
  onCustomChange,
  query,
  onQueryChange,
  statusSel,
  onStatusChange,
  customerSel,
  onCustomerChange,
  source,
  onSourceChange,
  customers,
  rangeStart,
  rangeEnd,
  count,
}: OrderFilterBarProps) {
  return (
    <div
      className="card-surface"
      style={{
        padding: '12px 14px',
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* 1단: 기간 + 검색 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Segmented compact options={PERIOD_OPTIONS} value={period} onChange={onPeriodChange} />
          {period === 'custom' && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                fontFamily: 'var(--font-num)',
                fontSize: 12,
                color: 'var(--ink-2)',
              }}
            >
              <Calendar size={13} color="var(--ink-3)" strokeWidth={1.6} />
              <input
                type="date"
                value={custom.from}
                onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
                style={dateInputStyle}
              />
              <span style={{ color: 'var(--ink-4)' }}>—</span>
              <input
                type="date"
                value={custom.to}
                onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
                style={dateInputStyle}
              />
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="주문번호 · 거래처 · 상품…"
            style={inputStyle}
          />
          <div
            style={{
              position: 'absolute',
              left: 10,
              top: 8,
              pointerEvents: 'none',
            }}
          >
            <Search size={14} color="var(--ink-3)" strokeWidth={1.6} />
          </div>
        </div>
      </div>

      {/* 2단: 거래처·상태·접수경로 + 안내 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MultiChip
          label="거래처"
          icon={<Users size={13} strokeWidth={1.6} />}
          selected={customerSel}
          onChange={onCustomerChange}
          options={customers.map((c) => ({
            id: c.id,
            label: c.name,
            prefix: <GradeBadge grade={c.grade} size="sm" />,
          }))}
        />
        <MultiChip
          label="상태"
          icon={<Flag size={13} strokeWidth={1.6} />}
          selected={statusSel}
          onChange={(ids) => onStatusChange(ids as OrderStatus[])}
          options={STATUS_OPTIONS.map((s) => ({
            id: s.id,
            label: s.label,
            prefix: (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: s.dot,
                }}
              />
            ),
          }))}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>접수 경로</span>
          <Segmented<SourceFilter>
            compact
            options={[
              { id: 'all', label: '전체' },
              { id: 'manual', label: '손', icon: <SourceIcon source="manual" size={12} /> },
              { id: 'portal', label: '포털', icon: <SourceIcon source="portal" size={12} /> },
              { id: 'ai', label: 'AI', icon: <SourceIcon source="ai" size={12} /> },
            ]}
            value={source}
            onChange={onSourceChange}
          />
        </div>

        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
          }}
        >
          {fmtDate(rangeStart)} — {fmtDate(rangeEnd)} · {count}건
        </span>
      </div>
    </div>
  );
}
