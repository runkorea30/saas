/**
 * Orders 페이지 전용 UI atoms.
 * 외부 페이지에서 사용 예정이 생기면 `components/ui/`로 승격.
 *
 * 🟠 CLAUDE.md §7: 인라인 스타일은 `var(--…)` 토큰 참조가 기본. 단일 진실 원본은 src/index.css.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check as LucideCheck,
  ChevronDown,
  Globe,
  Hand,
  Sparkles,
} from 'lucide-react';
import type { OrderSource, OrderStatus } from '@/types/common';

// ===== 포맷터 ==============================================================
export const fmtWon = (n: number) => n.toLocaleString('ko-KR');

export const fmtDate = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

export const fmtDateTime = (d: Date) =>
  `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// ===== StatusBadge =========================================================
const STATUS_META: Record<
  OrderStatus,
  { label: string; dot: string; bg: string; color: string }
> = {
  draft: { label: '임시', dot: 'var(--ink-4)', bg: 'var(--surface-2)', color: 'var(--ink-2)' },
  confirmed: { label: '확정', dot: 'var(--info)', bg: 'var(--info-wash)', color: 'var(--info)' },
  shipped: { label: '출고', dot: 'var(--warning)', bg: 'var(--warning-wash)', color: 'var(--warning)' },
  done: { label: '완료', dot: 'var(--success)', bg: 'var(--success-wash)', color: 'var(--success)' },
  canceled: { label: '취소', dot: 'var(--danger)', bg: 'var(--danger-wash)', color: 'var(--danger)' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className="chip" style={{ background: meta.bg, color: meta.color }}>
      <span className="dot" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

// ===== GradeBadge ==========================================================
const GRADE_COLORS: Record<string, { bg: string; color: string }> = {
  A: { bg: '#E8C87A', color: '#6D5318' },
  B: { bg: '#C89368', color: '#5A3A1E' },
  C: { bg: 'var(--surface-2)', color: 'var(--ink-2)' },
  D: { bg: 'var(--surface-2)', color: 'var(--ink-2)' },
  E: { bg: 'var(--surface-2)', color: 'var(--ink-3)' },
};

export function GradeBadge({
  grade,
  size = 'sm',
}: {
  grade: string | null;
  size?: 'sm' | 'md';
}) {
  const key = grade && GRADE_COLORS[grade] ? grade : 'E';
  const c = GRADE_COLORS[key];
  const d = size === 'md' ? 24 : 18;
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: d,
        height: d,
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        fontFamily: 'var(--font-num)',
        fontSize: size === 'md' ? 12 : 10.5,
        fontWeight: 600,
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
      title={`등급 ${grade ?? '미지정'}`}
    >
      {grade ?? '—'}
    </span>
  );
}

// ===== SourceIcon ==========================================================
export function SourceIcon({
  source,
  size = 13,
}: {
  source: OrderSource;
  size?: number;
}) {
  if (source === 'portal') return <Globe size={size} color="var(--info)" strokeWidth={1.6} />;
  if (source === 'ai') return <Sparkles size={size} color="var(--brand)" strokeWidth={1.6} />;
  return <Hand size={size} color="var(--ink-3)" strokeWidth={1.6} />;
}

// ===== Check ===============================================================
export function Check({
  on,
  onChange,
  indet,
}: {
  on: boolean;
  onChange?: () => void;
  indet?: boolean;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.();
      }}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: 16,
        height: 16,
        borderRadius: 4,
        border: `1.5px solid ${on || indet ? 'var(--brand)' : 'var(--line-strong)'}`,
        background: on ? 'var(--brand)' : indet ? 'var(--brand-wash)' : 'var(--surface)',
        cursor: onChange ? 'pointer' : 'default',
        transition: 'all .12s',
        flexShrink: 0,
      }}
    >
      {on && <LucideCheck size={11} color="var(--surface)" strokeWidth={3} />}
      {!on && indet && (
        <span style={{ width: 8, height: 2, background: 'var(--brand)', borderRadius: 1 }} />
      )}
    </span>
  );
}

// ===== Segmented ===========================================================
interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  compact?: boolean;
}) {
  const h = compact ? 26 : 30;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
      }}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: h,
              padding: compact ? '0 8px' : '0 10px',
              border: 'none',
              borderRadius: 6,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--ink-3)',
              fontSize: compact ? 11.5 : 12,
              fontWeight: active ? 500 : 400,
              fontFamily: 'var(--font-kr)',
              cursor: 'pointer',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'all .12s',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ===== MultiChip ===========================================================
export interface ChipOption {
  id: string;
  label: ReactNode;
  prefix?: ReactNode;
}

export function MultiChip({
  label,
  icon,
  selected,
  onChange,
  options,
}: {
  label: string;
  icon?: ReactNode;
  selected: string[];
  onChange: (ids: string[]) => void;
  options: ChipOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const badge = selected.length;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 28,
          padding: '0 10px',
          border: '1px solid var(--line)',
          borderRadius: 8,
          background: badge ? 'var(--brand-wash)' : 'var(--surface)',
          color: badge ? 'var(--brand)' : 'var(--ink-2)',
          fontSize: 12,
          fontWeight: 500,
          fontFamily: 'var(--font-kr)',
          cursor: 'pointer',
        }}
      >
        {icon}
        <span>{label}</span>
        {badge > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontSize: 10.5,
              padding: '0 5px',
              borderRadius: 999,
              background: 'var(--brand)',
              color: 'var(--surface)',
              fontWeight: 600,
              minWidth: 16,
              textAlign: 'center',
            }}
          >
            {badge}
          </span>
        )}
        <ChevronDown size={12} strokeWidth={1.8} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 0,
            zIndex: 40,
            minWidth: 220,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
          }}
        >
          {options.map((opt) => {
            const sel = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 8px',
                  border: 'none',
                  borderRadius: 6,
                  background: sel ? 'var(--brand-wash)' : 'transparent',
                  color: 'var(--ink-2)',
                  fontSize: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-kr)',
                }}
                onMouseEnter={(e) => {
                  if (!sel) e.currentTarget.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!sel) e.currentTarget.style.background = 'transparent';
                }}
              >
                <Check on={sel} />
                {opt.prefix}
                <span
                  style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--ink-3)',
                  fontSize: 11.5,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-kr)',
                }}
              >
                선택 해제
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===== EmptyState ==========================================================
export function EmptyState({
  title,
  body,
  primary,
  secondary,
  onPrimary,
  onSecondary,
}: {
  title: string;
  body?: string;
  primary?: string;
  secondary?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div
      style={{
        padding: '44px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        color: 'var(--ink-3)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)' }}>{title}</div>
      {body && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{body}</div>}
      {(primary || secondary) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {primary && (
            <button type="button" className="btn-base primary" onClick={onPrimary}>
              {primary}
            </button>
          )}
          {secondary && (
            <button type="button" className="btn-base" onClick={onSecondary}>
              {secondary}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 기간 계산 ===========================================================
export function periodRange(key: string, today = new Date()): [Date, Date] {
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  if (key === 'today') {
    const s = new Date(today);
    s.setHours(0, 0, 0, 0);
    return [s, endOfDay];
  }
  if (key === 'week') {
    const dow = today.getDay();
    const monOff = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today);
    mon.setDate(mon.getDate() - monOff);
    mon.setHours(0, 0, 0, 0);
    return [mon, endOfDay];
  }
  if (key === 'month') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return [s, endOfDay];
  }
  if (key === 'lastmonth') {
    const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastEnd = new Date(firstThis);
    lastEnd.setDate(0);
    lastEnd.setHours(23, 59, 59, 999);
    const lastStart = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1);
    return [lastStart, lastEnd];
  }
  if (key === '90d') {
    const s = new Date(today);
    s.setDate(s.getDate() - 90);
    s.setHours(0, 0, 0, 0);
    return [s, endOfDay];
  }
  const s = new Date(2025, 0, 1);
  return [s, endOfDay];
}
