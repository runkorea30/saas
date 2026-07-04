/**
 * 거래처 편집 모달.
 *
 * - 기본 정보(거래처명/등급/정산주기/연락처/이메일/배송지/은행별칭)
 *   + 세금계산서 발행 정보(사업자등록번호/종사업장번호/대표자명/주소/업태/종목/이메일) 편집.
 * - 사업자등록번호는 입력 시 자동 하이픈 포맷 (utils/formatBizNo).
 * - 그룹 소속 거래처는 안내 문구 표시 (group_id는 그룹 모달에서만 변경).
 * - name 만 필수. 나머지는 모두 빈 값 허용 → null 저장.
 *
 * 🔴 CLAUDE.md §1: company_id 컨텍스트 useCompany() 경유.
 */
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatBizNo } from '@/utils/formatBizNo';
import {
  useUpdateCustomer,
  type Customer,
  type CustomerUpdateInput,
} from '@/hooks/queries/useCustomers';

interface FormState {
  name: string;
  grade: string;
  settlement_cycle: string;
  contact1: string;
  contact2: string;
  email: string;
  billing_email: string;
  delivery_address: string;
  bank_aliases: string;
  business_registration_number: string;
  ceo_name: string;
  business_address: string;
  business_type: string;
  business_category: string;
  tax_email: string;
  login_id: string;
  login_password: string;
}

function initFromCustomer(c: Customer): FormState {
  return {
    name: c.name ?? '',
    grade: c.grade ?? '',
    settlement_cycle: c.settlement_cycle ?? '',
    contact1: c.contact1 ?? '',
    contact2: c.contact2 ?? '',
    email: c.email ?? '',
    billing_email: c.billing_email ?? '',
    delivery_address: c.delivery_address ?? '',
    bank_aliases: c.bank_aliases ?? '',
    business_registration_number: c.business_registration_number ?? '',
    ceo_name: c.ceo_name ?? '',
    business_address: c.business_address ?? '',
    business_type: c.business_type ?? '',
    business_category: c.business_category ?? '',
    tax_email: c.tax_email ?? '',
    login_id: c.login_id ?? '',
    login_password: c.login_password ?? '',
  };
}

const GRADE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '미지정' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'E', label: 'E' },
];

const SETTLEMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '미지정' },
  { value: '당월', label: '당월' },
  { value: '익월', label: '익월' },
  { value: '2개월', label: '2개월' },
];

interface Props {
  open: boolean;
  customer: Customer | null;
  companyId: string | null;
  onClose: () => void;
}

export function CustomerEditModal({ open, customer, companyId, onClose }: Props) {
  const { showToast } = useToast();
  const updateMutation = useUpdateCustomer(companyId);

  const [form, setForm] = useState<FormState>(() =>
    customer ? initFromCustomer(customer) : initFromCustomer({
      // 안전한 빈 초기값 (open=false 시 사용되지 않음)
      ...({} as Customer),
      name: '',
    } as Customer),
  );

  // customer가 바뀔 때 폼 동기화
  // open + customer 변경 시 새로 초기화
  // (별도 useEffect 안 쓰고, modal이 닫혔다 다시 열릴 때 컴포넌트가 unmount/remount 되도록 부모에서 처리)
  // 부모에서 key={customer?.id} 또는 conditional render 권장.

  if (!customer || !open) return null;

  const busy = updateMutation.isPending;
  const canSave = form.name.trim().length > 0 && !busy;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const payload: CustomerUpdateInput = {
      name: form.name.trim(),
      grade: form.grade.trim() || null,
      settlement_cycle: form.settlement_cycle.trim() || null,
      contact1: form.contact1.trim() || null,
      contact2: form.contact2.trim() || null,
      email: form.email.trim() || null,
      billing_email: form.billing_email.trim() || null,
      delivery_address: form.delivery_address.trim() || null,
      bank_aliases: form.bank_aliases.trim() || null,
      business_registration_number:
        form.business_registration_number.trim() || null,
      ceo_name: form.ceo_name.trim() || null,
      business_address: form.business_address.trim() || null,
      business_type: form.business_type.trim() || null,
      business_category: form.business_category.trim() || null,
      tax_email: form.tax_email.trim() || null,
      login_id: form.login_id.trim() || null,
      login_password: form.login_password.trim() || null,
    };

    try {
      await updateMutation.mutateAsync({ id: customer.id, data: payload });
      showToast({ kind: 'success', text: '거래처를 수정했습니다.' });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장에 실패했습니다.';
      showToast({ kind: 'error', text: msg });
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`거래처 편집 — ${customer.name}`}
      width={560}
      footer={
        <>
          <button
            type="button"
            className="btn-base"
            style={{ height: 32, fontSize: 12.5 }}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-base primary"
            style={{ height: 32, fontSize: 12.5 }}
            disabled={!canSave}
            onClick={handleSave}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ───── 섹션 1: 기본 정보 ───── */}
        <SectionLabel>기본 정보</SectionLabel>

        <Row>
          <Field label="거래처명" required style={{ flex: 2 }}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <Field label="등급" style={{ flex: 1, minWidth: 80 }}>
            <select
              value={form.grade}
              onChange={(e) => update('grade', e.target.value)}
              disabled={busy}
              style={inputStyle}
            >
              {GRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="정산주기" style={{ flex: 1, minWidth: 96 }}>
            <select
              value={form.settlement_cycle}
              onChange={(e) => update('settlement_cycle', e.target.value)}
              disabled={busy}
              style={inputStyle}
            >
              {SETTLEMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </Row>

        <Row>
          <Field label="연락처 1" style={{ flex: 1 }}>
            <input
              type="text"
              value={form.contact1}
              onChange={(e) => update('contact1', e.target.value)}
              placeholder="010-0000-0000"
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <Field label="연락처 2" style={{ flex: 1 }}>
            <input
              type="text"
              value={form.contact2}
              onChange={(e) => update('contact2', e.target.value)}
              disabled={busy}
              style={inputStyle}
            />
          </Field>
        </Row>

        <Field label="이메일">
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="contact@example.com"
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        <Field
          label="청구서 발송 이메일"
          hint="세금계산서용 이메일과 다른 경우 별도 입력"
        >
          <input
            type="email"
            value={form.billing_email}
            onChange={(e) => update('billing_email', e.target.value)}
            placeholder="청구서를 받을 이메일 주소"
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        <Field
          label="배송 주소 (택배 발송용)"
          hint="일반(비직송) 주문의 송장 인쇄 시 이 주소가 사용됩니다. 사업장 주소와 다른 경우에만 입력."
        >
          <textarea
            value={form.delivery_address}
            onChange={(e) => update('delivery_address', e.target.value)}
            placeholder="사업장 주소와 같으면 비워두어도 됩니다"
            rows={2}
            disabled={busy}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
          />
        </Field>

        <Field
          label="은행 입금자명 (별칭)"
          hint="여러 개는 쉼표로 구분 (예: 홍길동, 길동상사)"
        >
          <input
            type="text"
            value={form.bank_aliases}
            onChange={(e) => update('bank_aliases', e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        {/* ───── 섹션 2: 포털 로그인 정보 ───── */}
        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: 14,
            marginTop: 2,
          }}
        >
          <SectionLabel>포털 로그인 정보</SectionLabel>
          <div style={{ marginTop: 10 }}>
            <Row>
              <Field label="로그인 ID" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={form.login_id}
                  onChange={(e) => update('login_id', e.target.value)}
                  placeholder="예: sns2025"
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
              <Field label="비밀번호" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={form.login_password}
                  onChange={(e) => update('login_password', e.target.value)}
                  placeholder="예: 1234"
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
            </Row>
            <p
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              거래처 포털(customer-order)의 로그인 아이디/비밀번호입니다. 비워두면 로그인 불가.
            </p>
          </div>
        </div>

        {/* ───── 섹션 3: 세금계산서 발행 정보 ───── */}
        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: 14,
            marginTop: 2,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <SectionLabel>세금계산서 발행 정보</SectionLabel>
            {customer.group_id && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--brand)',
                  fontWeight: 500,
                  fontFamily: 'var(--font-kr)',
                }}
              >
                (이 거래처는 그룹 소속 — 그룹 대표 업체로 발행)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row>
              <Field label="사업자등록번호" style={{ flex: 1.4 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.business_registration_number}
                  onChange={(e) =>
                    update(
                      'business_registration_number',
                      formatBizNo(e.target.value),
                    )
                  }
                  placeholder="000-00-00000"
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
              <Field label="대표자명" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={form.ceo_name}
                  onChange={(e) => update('ceo_name', e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
            </Row>

            <Field
              label="사업장 주소 (세금계산서용)"
              hint="세금계산서 발행 시 표시되는 사업자등록증 상 주소. 배송 주소와 다를 수 있음."
            >
              <textarea
                value={form.business_address}
                onChange={(e) => update('business_address', e.target.value)}
                rows={2}
                disabled={busy}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              />
            </Field>

            <Row>
              <Field label="업태" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={form.business_type}
                  onChange={(e) => update('business_type', e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
              <Field label="종목" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={form.business_category}
                  onChange={(e) => update('business_category', e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
            </Row>

            <Field label="세금계산서 이메일">
              <input
                type="email"
                value={form.tax_email}
                onChange={(e) => update('tax_email', e.target.value)}
                placeholder="tax@example.com"
                disabled={busy}
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────
// 내부 소조각
// ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-num)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  style,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        ...style,
      }}
    >
      <label
        style={{
          fontSize: 11.5,
          color: 'var(--ink-2)',
          fontWeight: 500,
          fontFamily: 'var(--font-kr)',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>
        )}
      </label>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 34,
  padding: '0 10px',
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--surface)',
  fontSize: 13,
  fontFamily: 'var(--font-kr)',
  color: 'var(--ink)',
  outline: 'none',
  boxSizing: 'border-box',
};
