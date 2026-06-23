/**
 * 재고조정 폼 — Modal 내부 콘텐츠.
 *
 * 필드: 조정 방향(+/-) · 수량(양의 정수) · 사유 메모(옵션) · 발생일(기본 오늘 KST 자정).
 * 저장: 호출부에서 `useCreateAdjustment` 뮤테이션 실행.
 *
 * 🟠 음수 방지: 감소(-) 방향 + (현재 opening qty - 수량) < 0 이면 저장 버튼 비활성 + 경고.
 * 🟡 RPC 에 전달되는 quantity 부호는 호출부에서 (감소면 음수) 변환해 전달.
 *    이 폼은 표시용 절대값과 방향(direction)만 다룬다.
 * 🟡 발생일 저장: KST 자정 → UTC ISO (`new Date(localMidnight).toISOString()`) 변환.
 */
import { useMemo, useState } from 'react';
import type { Product } from '@/hooks/queries/useProducts';

export type AdjustDirection = 'increase' | 'decrease';

export interface AdjustmentFormValues {
  direction: AdjustDirection;
  /** 항상 양의 정수 (표시용). 부호는 호출부에서 direction 으로 결정. */
  quantity: number;
  memo: string | null;
  /** ISO 문자열. */
  transaction_date: string;
}

interface Props {
  product: Product;
  /** 현재 opening lot 의 quantity. 감소 한도 검증용. */
  currentOpeningQty: number;
  onSubmit: (values: AdjustmentFormValues) => void;
  onCancel: () => void;
  busy?: boolean;
}

function todayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function localDateToIso(localDate: string): string {
  const [y, m, d] = localDate.split('-').map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return local.toISOString();
}

export function AdjustmentForm({
  product,
  currentOpeningQty,
  onSubmit,
  onCancel,
  busy,
}: Props) {
  const [direction, setDirection] = useState<AdjustDirection>('increase');
  const [quantityStr, setQuantityStr] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState<string>(todayLocalDateStr());
  const [error, setError] = useState<string | null>(null);

  const quantityNum = useMemo(() => {
    const n = parseInt(quantityStr, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [quantityStr]);

  /** 감소 방향에서 조정 후 opening 이 음수가 되는지. */
  const negativeAfter = useMemo(() => {
    if (direction !== 'decrease') return false;
    if (!Number.isInteger(quantityNum) || quantityNum <= 0) return false;
    return currentOpeningQty - quantityNum < 0;
  }, [direction, quantityNum, currentOpeningQty]);

  const submitDisabled =
    busy ||
    !Number.isInteger(quantityNum) ||
    quantityNum <= 0 ||
    !date ||
    negativeAfter;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Number.isInteger(quantityNum) || quantityNum <= 0) {
      setError('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    if (!date) {
      setError('발생일을 선택하세요.');
      return;
    }
    if (negativeAfter) {
      setError('조정 후 기초재고가 음수가 됩니다.');
      return;
    }
    onSubmit({
      direction,
      quantity: quantityNum,
      memo: memo.trim() ? memo.trim() : null,
      transaction_date: localDateToIso(date),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* 대상 제품 요약 */}
      <div
        style={{
          background: 'var(--surface-2)',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          대상 제품
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
          {product.name}
        </span>
        <span className="num" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
          {product.code} · 현재 기초재고{' '}
          {currentOpeningQty.toLocaleString('ko-KR')} {product.unit}
        </span>
      </div>

      {/* 조정 방향 */}
      <Field
        label="조정 방향"
        required
        input={
          <div style={{ display: 'flex', gap: 6 }}>
            <DirectionButton
              active={direction === 'increase'}
              onClick={() => setDirection('increase')}
              disabled={busy}
            >
              + 증가
            </DirectionButton>
            <DirectionButton
              active={direction === 'decrease'}
              onClick={() => setDirection('decrease')}
              disabled={busy}
              tone="warning"
            >
              − 감소
            </DirectionButton>
          </div>
        }
      />

      {/* 수량 */}
      <Field
        label="수량"
        required
        input={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              placeholder="예: 10"
              autoFocus
              required
              disabled={busy}
              style={inputStyle}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {product.unit}
            </span>
          </div>
        }
        hint={
          direction === 'decrease' && Number.isInteger(quantityNum) && quantityNum > 0
            ? `조정 후 기초재고: ${(currentOpeningQty - quantityNum).toLocaleString('ko-KR')} ${product.unit}`
            : direction === 'increase' && Number.isInteger(quantityNum) && quantityNum > 0
              ? `조정 후 기초재고: ${(currentOpeningQty + quantityNum).toLocaleString('ko-KR')} ${product.unit}`
              : undefined
        }
      />

      {/* 사유 메모 */}
      <Field
        label="사유 (선택)"
        input={
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예) 재고조사 결과 조정"
            disabled={busy}
            rows={3}
            style={{ ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
        }
      />

      {/* 발생일 */}
      <Field
        label="발생일"
        required
        input={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            disabled={busy}
            style={{ ...inputStyle, maxWidth: 180 }}
          />
        }
      />

      {negativeAfter && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--warning-wash)',
            color: 'var(--warning)',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          조정 후 기초재고가 음수가 됩니다. 감소 수량을 줄여 주세요.
        </div>
      )}
      {error && !negativeAfter && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--danger-wash)',
            color: 'var(--danger)',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 4,
        }}
      >
        <button
          type="button"
          className="btn-base"
          onClick={onCancel}
          disabled={busy}
          style={{ height: 32, fontSize: 12.5 }}
        >
          취소
        </button>
        <button
          type="submit"
          className="btn-base primary"
          disabled={submitDisabled}
          style={{ height: 32, fontSize: 12.5 }}
        >
          {busy ? '저장 중…' : '재고조정 저장'}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 12.5,
  fontFamily: 'var(--font-num)',
  outline: 'none',
};

function Field({
  label,
  required,
  hint,
  input,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  input: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>
        {label}
        {required && (
          <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>
        )}
      </span>
      {input}
      {hint && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-num)',
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function DirectionButton({
  active,
  onClick,
  disabled,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'warning';
  children: React.ReactNode;
}) {
  const accent = tone === 'warning' ? 'var(--warning)' : 'var(--brand)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 34,
        border: `1px solid ${active ? accent : 'var(--line)'}`,
        background: active ? `${accent}1a` : 'var(--surface)',
        color: active ? accent : 'var(--ink-2)',
        borderRadius: 6,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background .12s, border-color .12s, color .12s',
      }}
    >
      {children}
    </button>
  );
}
