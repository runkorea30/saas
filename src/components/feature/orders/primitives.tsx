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
// 🔴 신규 4단계(received/confirmed/processing/shipped) + 레거시 3개(draft/done/canceled).
//    색상 계열: received=파랑 / confirmed=주황 / processing=보라 / shipped=초록.
const STATUS_META: Record<
  OrderStatus,
  { label: string; dot: string; bg: string; color: string }
> = {
  received:   { label: '주문접수', dot: 'var(--info)',    bg: 'var(--info-wash)',    color: 'var(--info)' },
  confirmed:  { label: '주문확인', dot: 'var(--warning)', bg: 'var(--warning-wash)', color: 'var(--warning)' },
  processing: { label: '처리중',   dot: '#8b5cf6',        bg: '#f3ecff',             color: '#6d28d9' },
  shipped:    { label: '발송완료', dot: 'var(--success)', bg: 'var(--success-wash)', color: 'var(--success)' },
  // 레거시 — 기존 데이터 보존 목적, 회색 계열.
  draft:      { label: '임시',     dot: 'var(--ink-4)',   bg: 'var(--surface-2)',    color: 'var(--ink-2)' },
  done:       { label: '완료',     dot: 'var(--ink-4)',   bg: 'var(--surface-2)',    color: 'var(--ink-2)' },
  canceled:   { label: '취소',     dot: 'var(--danger)',  bg: 'var(--danger-wash)',  color: 'var(--danger)' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.received;
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
  /** 항목 22: 타이핑 검색 대상 문자열(label 이 문자열이 아닐 때 사용). */
  searchText?: string;
}

/** 검색 매칭용 문자열 — searchText 우선, 없으면 문자열 label. */
function optSearchStr(o: ChipOption): string {
  if (o.searchText) return o.searchText;
  return typeof o.label === 'string' ? o.label : '';
}

export function MultiChip({
  label,
  icon,
  selected,
  onChange,
  options,
  searchable = false,
}: {
  label: string;
  icon?: ReactNode;
  selected: string[];
  onChange: (ids: string[]) => void;
  options: ChipOption[];
  /** 항목 22: true 면 드롭다운 상단에 타이핑 검색 입력 표시. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // 드롭다운 닫히면 검색어 초기화.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown =
    searchable && q
      ? options.filter((o) => optSearchStr(o).toLowerCase().includes(q))
      : options;

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
          {searchable && (
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`${label} 검색`}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 30,
                padding: '0 8px',
                marginBottom: 4,
                border: '1px solid var(--line)',
                borderRadius: 6,
                background: 'var(--surface-2)',
                color: 'var(--ink)',
                fontSize: 12,
                fontFamily: 'var(--font-kr)',
                outline: 'none',
              }}
            />
          )}
          {shown.length === 0 && (
            <div
              style={{
                padding: '10px 8px',
                fontSize: 11.5,
                color: 'var(--ink-3)',
                textAlign: 'center',
              }}
            >
              검색 결과가 없습니다.
            </div>
          )}
          {shown.map((opt) => {
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
// ===== DateTypeInput =======================================================
/** 'YYYY-MM-DD' 문자열이 유효한 달력 날짜인지. */
function isValidYmd(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  const dt = new Date(y, mo - 1, da);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da
  );
}

/** 숫자만 추출(최대 8자리) → 'YYYY-MM-DD' 로 대시 자동 삽입. */
function formatDigits(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/**
 * 항목 21: YYYYMMDD 8자리 연속 타이핑 날짜 입력(로케일 무관) + 네이티브 달력 보조.
 * value/onChange 는 'YYYY-MM-DD'. 8자리 입력 시 유효하면 즉시 반영, 아니면 blur 시 되돌림.
 */
export function DateTypeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const commit = (s: string) => {
    if (isValidYmd(s)) onChange(s);
    else setText(value);
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 2 }}
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={focused ? text : value}
        placeholder="YYYYMMDD"
        onFocus={() => {
          setFocused(true);
          setText(value);
        }}
        onChange={(e) => {
          const f = formatDigits(e.target.value);
          setText(f);
          if (f.replace(/\D/g, '').length === 8) commit(f);
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        style={{
          width: 96,
          height: 24,
          padding: '0 4px',
          border: 'none',
          background: 'transparent',
          fontFamily: 'var(--font-num)',
          fontSize: 12,
          color: 'var(--ink-2)',
          outline: 'none',
        }}
      />
      <span
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      >
        <span aria-hidden style={{ fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer' }}>
          📅
        </span>
        <input
          type="date"
          aria-label={ariaLabel ? `${ariaLabel} 달력` : '달력'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          }}
        />
      </span>
    </span>
  );
}

export function periodRange(key: string, today = new Date()): [Date, Date] {
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  if (key === 'today') {
    const s = new Date(today);
    s.setHours(0, 0, 0, 0);
    return [s, endOfDay];
  }
  if (key === 'yesterday') {
    const s = new Date(today);
    s.setDate(s.getDate() - 1);
    s.setHours(0, 0, 0, 0);
    const e = new Date(today);
    e.setDate(e.getDate() - 1);
    e.setHours(23, 59, 59, 999);
    return [s, e];
  }
  if (key === 'week') {
    const dow = today.getDay();
    const monOff = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today);
    mon.setDate(mon.getDate() - monOff);
    mon.setHours(0, 0, 0, 0);
    return [mon, endOfDay];
  }
  if (key === 'lastweek') {
    // 이번 주 월요일 계산 후 -7일(지난 주 월) ~ 이번 주 월 -1일(지난 주 일).
    const dow = today.getDay();
    const monOff = dow === 0 ? 6 : dow - 1;
    const thisMon = new Date(today);
    thisMon.setDate(thisMon.getDate() - monOff);
    thisMon.setHours(0, 0, 0, 0);
    const lastMon = new Date(thisMon);
    lastMon.setDate(lastMon.getDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setDate(lastSun.getDate() - 1);
    lastSun.setHours(23, 59, 59, 999);
    return [lastMon, lastSun];
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
