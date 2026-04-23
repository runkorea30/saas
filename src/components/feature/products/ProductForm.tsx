/**
 * Products 생성/수정 폼 (모달 내부에서 사용).
 *
 * 필드 순서: 제품코드 · 상품명 · 카테고리 · 단위 · 판매가 · 공급가 · USD 단가 · 활성여부
 * - 수정 모드(initial 전달)에서는 제품코드 readonly.
 * - 카테고리 select: 이미 등록된 카테고리 + "직접 입력" 옵션.
 * - 공급가 입력 시 실시간 마진율(부가세포함 판매가 기준) 미리보기.
 *
 * 🟠 유효성은 제출 시점(handleSubmit) 에서 한 번 평가 → 필드별 에러 표시.
 *    빈 값/형식 오류만 차단. 중복 코드 에러는 서버(23505) 에서 돌아옴.
 */
import { useMemo, useState } from 'react';
import type { Product, ProductCreateInput } from '@/hooks/queries/useProducts';
import {
  CATEGORY_OPTIONS,
  PRODUCT_CATEGORIES,
  getCategoryLabel,
} from '@/constants/categories';

interface Props {
  initial?: Product | null;
  knownCategories: ReadonlyArray<string>;
  onSubmit: (values: ProductCreateInput) => void;
  onCancel: () => void;
  busy?: boolean;
}

interface FormState {
  code: string;
  name: string;
  categoryMode: 'preset' | 'custom';
  categoryPreset: string;
  categoryCustom: string;
  unit: string;
  sell_price: string;
  supply_price: string;
  unit_price_usd: string;
  is_active: boolean;
}

type FieldError = Partial<Record<keyof FormState | 'category', string>>;

function toNumberOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrNaN(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function ProductForm({
  initial,
  knownCategories,
  onSubmit,
  onCancel,
  busy,
}: Props) {
  const isEdit = Boolean(initial);

  // 표준 카테고리(4종) + DB 에 남아있는 비표준 레거시 카테고리의 합집합.
  // 레거시 항목이 있으면 preset select 에서 원본 키 그대로 재선택 가능하게 해준다.
  const presetOptions = useMemo(() => {
    const extras = knownCategories
      .filter(
        (c) => !(PRODUCT_CATEGORIES as ReadonlyArray<string>).includes(c),
      )
      .map((c) => ({ value: c, label: getCategoryLabel(c) }));
    return [...CATEGORY_OPTIONS, ...extras];
  }, [knownCategories]);

  const presetValues = useMemo(
    () => presetOptions.map((o) => o.value),
    [presetOptions],
  );

  const initialCategoryMode: 'preset' | 'custom' =
    initial && !presetValues.includes(initial.category) ? 'custom' : 'preset';

  const [form, setForm] = useState<FormState>({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    categoryMode: initialCategoryMode,
    categoryPreset:
      initial && initialCategoryMode === 'preset'
        ? initial.category
        : PRODUCT_CATEGORIES[0],
    categoryCustom:
      initial && initialCategoryMode === 'custom' ? initial.category : '',
    unit: initial?.unit ?? 'ea',
    sell_price: String(initial?.sell_price ?? ''),
    supply_price: String(initial?.supply_price ?? ''),
    unit_price_usd:
      initial?.unit_price_usd !== null && initial?.unit_price_usd !== undefined
        ? String(initial.unit_price_usd)
        : '',
    is_active: initial?.is_active ?? true,
  });
  const [errors, setErrors] = useState<FieldError>({});

  const categoryValue =
    form.categoryMode === 'preset' ? form.categoryPreset : form.categoryCustom;

  // 실시간 마진율 미리보기
  const marginPreview = useMemo(() => {
    const sell = toNumberOrNaN(form.sell_price);
    const supply = toNumberOrNaN(form.supply_price);
    if (!Number.isFinite(sell) || !Number.isFinite(supply) || sell <= 0) {
      return null;
    }
    const margin = sell - supply;
    const pct = (margin / sell) * 100;
    return { margin, pct };
  }, [form.sell_price, form.supply_price]);

  const validate = (): FieldError => {
    const e: FieldError = {};
    if (!form.code.trim()) e.code = '제품코드를 입력해 주세요';
    if (!form.name.trim()) e.name = '상품명을 입력해 주세요';
    if (!categoryValue.trim()) e.category = '카테고리를 선택하거나 입력해 주세요';
    if (!form.unit.trim()) e.unit = '단위를 입력해 주세요';

    const sell = toNumberOrNaN(form.sell_price);
    if (!Number.isFinite(sell)) e.sell_price = '판매가를 숫자로 입력해 주세요';
    else if (sell < 0) e.sell_price = '판매가는 0 이상이어야 합니다';
    else if (!Number.isInteger(sell)) e.sell_price = '판매가는 정수여야 합니다';

    const supply = toNumberOrNaN(form.supply_price);
    if (!Number.isFinite(supply)) e.supply_price = '공급가를 숫자로 입력해 주세요';
    else if (supply < 0) e.supply_price = '공급가는 0 이상이어야 합니다';
    else if (!Number.isInteger(supply)) e.supply_price = '공급가는 정수여야 합니다';

    if (form.unit_price_usd.trim()) {
      const usd = toNumberOrNaN(form.unit_price_usd);
      if (!Number.isFinite(usd)) e.unit_price_usd = 'USD 단가를 숫자로 입력해 주세요';
      else if (usd < 0) e.unit_price_usd = 'USD 단가는 0 이상이어야 합니다';
    }
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const values: ProductCreateInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: categoryValue.trim(),
      unit: form.unit.trim(),
      sell_price: toNumberOrNaN(form.sell_price),
      supply_price: toNumberOrNaN(form.supply_price),
      unit_price_usd: toNumberOrNull(form.unit_price_usd),
      is_active: form.is_active,
    };
    onSubmit(values);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* 제품코드 */}
      <Field
        label="제품코드"
        error={errors.code}
        required
        hint={isEdit ? undefined : '예: AGL-ACR-WHT-4oz'}
      >
        <input
          type="text"
          value={form.code}
          disabled={isEdit || busy}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder={isEdit ? undefined : 'AGL-ACR-WHT-4oz'}
          style={inputStyle(!!errors.code, isEdit || busy)}
          autoFocus={!isEdit}
        />
      </Field>

      {/* 상품명 */}
      <Field label="상품명" error={errors.name} required>
        <input
          type="text"
          value={form.name}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="예: Angelus Acrylic Paint — White 4oz"
          style={inputStyle(!!errors.name, !!busy)}
          autoFocus={isEdit}
        />
      </Field>

      {/* 카테고리 */}
      <Field label="카테고리" error={errors.category} required>
        <div style={{ display: 'flex', gap: 6 }}>
          {form.categoryMode === 'preset' ? (
            <select
              value={form.categoryPreset}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryPreset: e.target.value }))
              }
              style={{ ...inputStyle(!!errors.category, !!busy), flex: 1 }}
            >
              {presetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.categoryCustom}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoryCustom: e.target.value }))
              }
              placeholder="직접 입력"
              style={{ ...inputStyle(!!errors.category, !!busy), flex: 1 }}
            />
          )}
          <button
            type="button"
            className="btn-base"
            disabled={busy}
            onClick={() =>
              setForm((f) => ({
                ...f,
                categoryMode: f.categoryMode === 'preset' ? 'custom' : 'preset',
              }))
            }
            style={{ height: 34, fontSize: 12, whiteSpace: 'nowrap' }}
          >
            {form.categoryMode === 'preset' ? '직접 입력' : '목록에서 선택'}
          </button>
        </div>
      </Field>

      {/* 단위 · 활성 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="단위" error={errors.unit} required>
          <input
            type="text"
            value={form.unit}
            disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            placeholder="ea"
            style={inputStyle(!!errors.unit, !!busy)}
          />
        </Field>

        <Field label="활성 여부">
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 34,
              fontSize: 12.5,
              color: 'var(--ink-2)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.is_active}
              disabled={busy}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_active: e.target.checked }))
              }
            />
            {form.is_active ? '활성' : '비활성'}
          </label>
        </Field>
      </div>

      {/* 판매가 · 공급가 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="판매가 (원, 부가세 포함)" error={errors.sell_price} required>
          <input
            type="text"
            inputMode="numeric"
            value={form.sell_price}
            disabled={busy}
            onChange={(e) =>
              setForm((f) => ({ ...f, sell_price: e.target.value }))
            }
            placeholder="9800"
            style={{ ...inputStyle(!!errors.sell_price, !!busy), textAlign: 'right' }}
          />
        </Field>

        <Field label="공급가 (원가 근사)" error={errors.supply_price} required>
          <input
            type="text"
            inputMode="numeric"
            value={form.supply_price}
            disabled={busy}
            onChange={(e) =>
              setForm((f) => ({ ...f, supply_price: e.target.value }))
            }
            placeholder="5880"
            style={{
              ...inputStyle(!!errors.supply_price, !!busy),
              textAlign: 'right',
            }}
          />
        </Field>
      </div>

      {/* 마진 미리보기 */}
      {marginPreview && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--surface-2)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--ink-2)',
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-num)',
          }}
        >
          <span>마진 미리보기</span>
          <span>
            ₩{marginPreview.margin.toLocaleString('ko-KR')} ·{' '}
            <strong
              style={{
                color:
                  marginPreview.pct >= 30
                    ? 'var(--success)'
                    : marginPreview.pct < 10
                      ? 'var(--danger)'
                      : 'var(--ink)',
              }}
            >
              {marginPreview.pct.toFixed(1)}%
            </strong>
          </span>
        </div>
      )}

      {/* USD */}
      <Field label="USD 단가 (선택, 미국 매입 원가)" error={errors.unit_price_usd}>
        <input
          type="text"
          inputMode="decimal"
          value={form.unit_price_usd}
          disabled={busy}
          onChange={(e) =>
            setForm((f) => ({ ...f, unit_price_usd: e.target.value }))
          }
          placeholder="예: 4.80"
          style={{
            ...inputStyle(!!errors.unit_price_usd, !!busy),
            textAlign: 'right',
          }}
        />
      </Field>

      {/* 액션 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 6,
        }}
      >
        <button
          type="button"
          className="btn-base"
          style={{ height: 32, fontSize: 12.5 }}
          disabled={busy}
          onClick={onCancel}
        >
          취소
        </button>
        <button
          type="submit"
          className="btn-base primary"
          style={{ height: 32, fontSize: 12.5 }}
          disabled={busy}
        >
          {busy ? '저장 중…' : isEdit ? '저장' : '추가'}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          fontSize: 11.5,
          color: error ? 'var(--danger)' : 'var(--ink-2)',
          fontWeight: 500,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {(error || hint) && (
        <div
          style={{
            fontSize: 11,
            color: error ? 'var(--danger)' : 'var(--ink-3)',
            marginTop: 1,
          }}
        >
          {error ?? hint}
        </div>
      )}
    </div>
  );
}

function inputStyle(hasError: boolean, disabled: boolean): React.CSSProperties {
  return {
    height: 34,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${hasError ? 'var(--danger)' : 'var(--line)'}`,
    background: disabled ? 'var(--surface-2)' : 'var(--surface)',
    color: 'var(--ink)',
    fontSize: 12.5,
    fontFamily: 'var(--font-kr)',
    outline: 'none',
    opacity: disabled ? 0.7 : 1,
    cursor: disabled ? 'not-allowed' : 'auto',
    width: '100%',
  };
}
