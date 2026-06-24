/**
 * Orders 필터 바. 단일 행: 기간 | 거래처 / 상태 — 우측: 날짜 범위.
 *
 * 🟡 v2 변경: 검색 / 접수경로(source) 필터 제거. 사용자 요구로 UI 최소화.
 * 모든 상태는 부모(OrdersPage) 가 소유. 순수 presentational.
 */
import { Calendar, Flag, Users } from 'lucide-react';
import { GradeBadge, MultiChip, Segmented, fmtDate } from './primitives';
import type { OrderStatus } from '@/types/common';
import type { PeriodKey } from '@/types/orders';

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
  statusSel: OrderStatus[];
  onStatusChange: (s: OrderStatus[]) => void;
  customerSel: string[];
  onCustomerChange: (c: string[]) => void;
  customers: CustomerOption[];
  rangeStart: Date;
  rangeEnd: Date;
  count: number;
}

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
  statusSel,
  onStatusChange,
  customerSel,
  onCustomerChange,
  customers,
  rangeStart,
  rangeEnd,
  count,
}: OrderFilterBarProps) {
  return (
    <div
      className="card-surface"
      style={{
        padding: '8px 12px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
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

      <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 4px' }} />

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
  );
}
