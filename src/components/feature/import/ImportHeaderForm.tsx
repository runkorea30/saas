/**
 * 수입/매입 — 인보이스 헤더 폼 (카드형).
 *
 * 6필드: Invoice # · Invoice Date · Supplier · Exchange Rate · Shipping USD · PDF Total USD
 * + Notes (textarea, full width).
 *
 * 🟡 값 변경은 부모(state owner)가 `onChange({ ...header, [key]: value })` 로 처리.
 *    로컬 state 없음.
 * 🟡 숫자 필드는 number state. 빈 입력은 0 으로 유지 (빈 문자열 허용 안 함).
 */
import { useRef } from 'react';
import type { ImportInvoiceHeader } from '@/types/import';

interface Props {
  value: ImportInvoiceHeader;
  onChange: (next: ImportInvoiceHeader) => void;
  disabled?: boolean;
  /**
   * 운임 인보이스 PDF 선택 시 호출 (항목 3). 부모가 parseInvoicePDF 로 파싱해
   * shippingCostUsd 를 자동 채움. 미전달 시 업로드 UI 자체가 렌더되지 않음(하위호환).
   */
  onFreightPdfSelect?: (file: File) => void;
  /** 현재 보관 중인 운임 인보이스 파일명 (표시용). */
  freightFileName?: string | null;
  /** 운임 인보이스 파싱 진행 중 여부. */
  freightParsing?: boolean;
}

export function ImportHeaderForm({
  value,
  onChange,
  disabled,
  onFreightPdfSelect,
  freightFileName,
  freightParsing,
}: Props) {
  const freightInputRef = useRef<HTMLInputElement>(null);
  const patch = (key: keyof ImportInvoiceHeader, v: string | number) => {
    onChange({ ...value, [key]: v });
  };

  const numberInput = (v: number) => (Number.isFinite(v) && v !== 0 ? String(v) : '');
  const parseNum = (s: string): number => {
    if (!s.trim()) return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        <Field label="Invoice #" required>
          <input
            type="text"
            value={value.invoiceNumber}
            onChange={(e) => patch('invoiceNumber', e.target.value)}
            placeholder="예: 80966"
            disabled={disabled}
            style={inputStyle}
          />
        </Field>
        <Field label="Invoice Date" required>
          <input
            type="date"
            value={value.invoiceDate}
            onChange={(e) => patch('invoiceDate', e.target.value)}
            disabled={disabled}
            style={inputStyle}
          />
        </Field>
        <Field label="Supplier Name">
          <input
            type="text"
            value={value.supplierName}
            onChange={(e) => patch('supplierName', e.target.value)}
            disabled={disabled}
            style={inputStyle}
          />
        </Field>

        <Field label="Exchange Rate (USD→KRW)" required>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={numberInput(value.exchangeRate)}
            onChange={(e) => patch('exchangeRate', parseNum(e.target.value))}
            placeholder="1450"
            disabled={disabled}
            style={inputStyle}
          />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>
              Shipping Cost (USD)
              <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={numberInput(value.shippingCostUsd)}
              onChange={(e) => patch('shippingCostUsd', parseNum(e.target.value))}
              placeholder="0"
              disabled={disabled}
              style={inputStyle}
            />
          </label>
          {onFreightPdfSelect && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <input
                ref={freightInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFreightPdfSelect(file);
                  // 같은 파일 재선택도 onChange 발화되도록 값 초기화.
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => freightInputRef.current?.click()}
                disabled={disabled || freightParsing}
                className="btn-base"
                style={{ height: 26, fontSize: 11, padding: '0 10px' }}
                title="운임(Freight) 인보이스 PDF 를 업로드하면 총액이 Shipping Cost 에 자동 입력됩니다 (수정 가능)"
              >
                {freightParsing ? '파싱 중…' : '운임 인보이스 PDF'}
              </button>
              {freightFileName && !freightParsing && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={freightFileName}
                >
                  {freightFileName}
                </span>
              )}
            </div>
          )}
        </div>
        <Field
          label="PDF Total USD"
          hint="PDF 에 찍힌 Total — 실제 합계와 차이 검증용. 비워 두면 검증 스킵."
        >
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={numberInput(value.pdfTotalUsd)}
            onChange={(e) => patch('pdfTotalUsd', parseNum(e.target.value))}
            placeholder="0"
            disabled={disabled}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Notes">
          <textarea
            value={value.notes}
            onChange={(e) => patch('notes', e.target.value)}
            disabled={disabled}
            rows={2}
            style={{
              ...inputStyle,
              height: 'auto',
              paddingTop: 8,
              paddingBottom: 8,
              resize: 'vertical',
              minHeight: 48,
              fontFamily: 'var(--font-kr)',
            }}
          />
        </Field>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
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
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{hint}</span>
      )}
    </label>
  );
}
