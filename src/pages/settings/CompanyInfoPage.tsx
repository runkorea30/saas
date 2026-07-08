/**
 * 설정 > 회사정보 — 세금계산서 발행용 공급자(자사) 정보 입력.
 *
 * 🔴 CLAUDE.md §1: companyId 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §8: 조회/수정 로직은 useCompanyProfile.ts 에만 — 이 파일은 폼 UI 전용.
 */
import { useEffect, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { useCompanyProfile, useUpdateCompanyProfile } from '@/hooks/queries/useCompanyProfile';
import { useToast } from '@/components/ui/Toast';

interface FormState {
  name: string;
  business_number: string;
  ceo_name: string;
  business_address: string;
  business_type: string;
  business_category: string;
  tax_email: string;
}

const EMPTY: FormState = {
  name: '',
  business_number: '',
  ceo_name: '',
  business_address: '',
  business_type: '',
  business_category: '',
  tax_email: '',
};

function inputStyle(): React.CSSProperties {
  return {
    height: 36,
    padding: '0 12px',
    border: '1px solid var(--line)',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
    color: 'var(--ink)',
    background: 'var(--surface-2)',
    fontFamily: 'var(--font-kr)',
    width: '100%',
  };
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function CompanyInfoPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const profileQuery = useCompanyProfile(companyId);
  const updateMut = useUpdateCompanyProfile(companyId);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);

  // 조회 성공 시 폼 초기화 (사용자가 아직 수정 안 했을 때만 덮어씀).
  useEffect(() => {
    if (!profileQuery.data || dirty) return;
    const p = profileQuery.data;
    setForm({
      name: p.name ?? '',
      business_number: p.business_number ?? '',
      ceo_name: p.ceo_name ?? '',
      business_address: p.business_address ?? '',
      business_type: p.business_type ?? '',
      business_category: p.business_category ?? '',
      tax_email: p.tax_email ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const canSave = form.name.trim().length > 0 && form.business_number.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      showToast({ kind: 'error', text: '회사명과 사업자등록번호는 필수입니다.' });
      return;
    }
    try {
      await updateMut.mutateAsync({
        name: form.name.trim(),
        business_number: form.business_number.trim(),
        ceo_name: form.ceo_name.trim() || null,
        business_address: form.business_address.trim() || null,
        business_type: form.business_type.trim() || null,
        business_category: form.business_category.trim() || null,
        tax_email: form.tax_email.trim() || null,
      });
      setDirty(false);
      showToast({ kind: 'success', text: '회사정보를 저장했습니다.' });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.',
      });
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 20 }}>
        <h2
          className="disp"
          style={{ fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--ink)' }}
        >
          회사정보
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '6px 0 0', lineHeight: 1.55 }}>
          여기서 입력한 정보는 세금계산서 일괄발급 엑셀의 공급자(자사) 정보로 그대로
          사용됩니다. 사업자등록번호는 홈택스 로그인 사업자와 반드시 일치해야 합니다.
        </p>
      </header>

      {profileQuery.isLoading ? (
        <div style={{ padding: 32, color: 'var(--ink-3)', fontSize: 13 }}>불러오는 중…</div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '20px 22px',
          }}
        >
          <Field label="회사명 (공급자 상호)" required>
            <input style={inputStyle()} value={form.name} onChange={setField('name')} />
          </Field>

          <Field label='사업자등록번호 ("-" 포함 입력 가능, 저장 시 그대로 저장)' required>
            <input
              style={inputStyle()}
              value={form.business_number}
              onChange={setField('business_number')}
              placeholder="예: 110-09-76120"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="대표자 성명">
              <input style={inputStyle()} value={form.ceo_name} onChange={setField('ceo_name')} />
            </Field>
            <Field label="세금계산서 수신 이메일">
              <input
                type="email"
                style={inputStyle()}
                value={form.tax_email}
                onChange={setField('tax_email')}
                placeholder="tax@example.com"
              />
            </Field>
          </div>

          <Field label="사업장주소">
            <input
              style={inputStyle()}
              value={form.business_address}
              onChange={setField('business_address')}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="업태">
              <input
                style={inputStyle()}
                value={form.business_type}
                onChange={setField('business_type')}
                placeholder="예: 도매 및 상품중개업"
              />
            </Field>
            <Field label="종목">
              <input
                style={inputStyle()}
                value={form.business_category}
                onChange={setField('business_category')}
                placeholder="예: 가죽공예 용품"
              />
            </Field>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              className="btn-base primary"
              style={{ height: 36, fontSize: 13 }}
              disabled={!canSave || updateMut.isPending}
              onClick={handleSave}
            >
              {updateMut.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
