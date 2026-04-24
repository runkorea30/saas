/**
 * 기초재고 투입 폼 — Modal 내부 콘텐츠.
 *
 * 필드: 수량(양의 정수) · 단가(원, 기본 supply_price × quantity) · 발생일(기본 오늘 KST 자정).
 * 저장: 호출부에서 `useCreateOpeningLot` 뮤테이션 실행.
 *
 * 🟡 단가 기본값: `products.supply_price × quantity`. 사용자가 직접 수정 가능.
 * 🟡 발생일 저장: KST 자정 → UTC ISO (`new Date(localMidnight).toISOString()`) 변환.
 * 🟡 inventory_lots 에 memo 컬럼이 없어 메모 필드 미포함.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@/hooks/queries/useProducts';

export interface OpeningStockFormValues {
  quantity: number;
  cost_krw: number;
  /** ISO 문자열. */
  lot_date: string;
}

interface Props {
  product: Product;
  onSubmit: (values: OpeningStockFormValues) => void;
  onCancel: () => void;
  busy?: boolean;
}

/** 오늘의 YYYY-MM-DD (로컬 = KST). `<input type="date">` 초기값. */
function todayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 'YYYY-MM-DD' (로컬 자정) → ISO UTC 문자열. */
function localDateToIso(localDate: string): string {
  // `new Date('YYYY-MM-DD')` 는 UTC 자정으로 해석되므로, 로컬 자정으로 만들기 위해
  // 연/월/일을 분리해 로컬 Date 생성자를 사용한다.
  const [y, m, d] = localDate.split('-').map((s) => parseInt(s, 10));
  const local = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return local.toISOString();
}

export function OpeningStockForm({ product, onSubmit, onCancel, busy }: Props) {
  const [quantityStr, setQuantityStr] = useState('');
  const [costManuallyEdited, setCostManuallyEdited] = useState(false);
  const [costStr, setCostStr] = useState('');
  const [lotDate, setLotDate] = useState<string>(todayLocalDateStr());
  const [error, setError] = useState<string | null>(null);

  const quantityNum = useMemo(() => {
    const n = parseInt(quantityStr, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [quantityStr]);

  // 단가 자동 계산 (수동 편집 전까지만).
  useEffect(() => {
    if (costManuallyEdited) return;
    if (Number.isFinite(quantityNum) && quantityNum > 0) {
      setCostStr(String(product.supply_price * quantityNum));
    } else {
      setCostStr('');
    }
  }, [quantityNum, product.supply_price, costManuallyEdited]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Number.isInteger(quantityNum) || quantityNum <= 0) {
      setError('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    const costNum = parseInt(costStr, 10);
    if (!Number.isFinite(costNum) || costNum < 0) {
      setError('단가는 0 이상의 정수여야 합니다.');
      return;
    }
    if (!lotDate) {
      setError('발생일을 선택하세요.');
      return;
    }
    onSubmit({
      quantity: quantityNum,
      cost_krw: costNum,
      lot_date: localDateToIso(lotDate),
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
          {product.code} · 공급가 ₩{product.supply_price.toLocaleString('ko-KR')}
        </span>
      </div>

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
              placeholder="예: 100"
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
      />

      {/* 단가 */}
      <Field
        label="총 단가 (원)"
        hint={
          costManuallyEdited
            ? '수동 편집됨 — 수량이 바뀌어도 재계산되지 않습니다'
            : `자동 계산: 공급가 × 수량 (${product.supply_price.toLocaleString('ko-KR')} × ${Number.isFinite(quantityNum) && quantityNum > 0 ? quantityNum : '—'})`
        }
        input={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>₩</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={costStr}
              onChange={(e) => {
                setCostStr(e.target.value);
                setCostManuallyEdited(true);
              }}
              placeholder="0"
              required
              disabled={busy}
              style={inputStyle}
            />
            {costManuallyEdited && (
              <button
                type="button"
                onClick={() => setCostManuallyEdited(false)}
                disabled={busy}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--brand)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  padding: '0 4px',
                  fontFamily: 'var(--font-kr)',
                }}
              >
                자동 계산으로
              </button>
            )}
          </div>
        }
      />

      {/* 발생일 */}
      <Field
        label="발생일"
        required
        input={
          <input
            type="date"
            value={lotDate}
            onChange={(e) => setLotDate(e.target.value)}
            required
            disabled={busy}
            style={{ ...inputStyle, maxWidth: 180 }}
          />
        }
      />

      {error && (
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
          disabled={busy}
          style={{ height: 32, fontSize: 12.5 }}
        >
          {busy ? '저장 중…' : '기초재고 투입'}
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
      <span
        style={{
          fontSize: 11.5,
          color: 'var(--ink-2)',
          fontWeight: 500,
        }}
      >
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
