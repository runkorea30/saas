/**
 * 시험검사번호 탭 — inspection_certificates 테이블 CRUD.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 hard delete (deleted_at 컬럼 없음).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const SELECT_COLS =
  'id, product_name, hs_no, list_no, inspection_no, inspection_valid_until, import_req_no, import_valid_until, created_at';

interface InspectionCert {
  id: string;
  product_name: string;
  hs_no: string | null;
  list_no: string | null;
  inspection_no: string | null;
  inspection_valid_until: string | null;
  import_req_no: string | null;
  import_valid_until: string | null;
  created_at: string | null;
}

interface FormState {
  product_name: string;
  hs_no: string;
  list_no: string;
  inspection_no: string;
  inspection_valid_until: string;
  import_req_no: string;
  import_valid_until: string;
}

const EMPTY_FORM: FormState = {
  product_name: '',
  hs_no: '',
  list_no: '',
  inspection_no: '',
  inspection_valid_until: '',
  import_req_no: '',
  import_valid_until: '',
};

type ValidityKind = 'valid' | 'expiring' | 'expired' | 'unknown';

function getValidityStatus(dateStr: string | null): ValidityKind {
  if (!dateStr) return 'unknown';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return 'expired';
  if (diffDays <= 90) return 'expiring';
  return 'valid';
}

function validityColor(kind: ValidityKind): string {
  if (kind === 'expired') return 'var(--danger)';
  if (kind === 'expiring') return 'var(--warning, #C97419)';
  return 'var(--ink)';
}

interface Props {
  companyId: string | null;
}

export function InspectionCertTab({ companyId }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ['inspection-certificates', companyId];

  const { data: rows = [], isLoading } = useQuery<InspectionCert[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () =>
      fetchAllRows<InspectionCert>(() =>
        supabase
          .from('inspection_certificates')
          .select(SELECT_COLS)
          .eq('company_id', companyId!)
          .order('product_name', { ascending: true }),
      ),
    staleTime: 30_000,
  });

  const [search, setSearch] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.product_name,
        r.list_no ?? '',
        r.inspection_no ?? '',
        r.hs_no ?? '',
        r.import_req_no ?? '',
      ]
        .join('|')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const allChecked =
    filtered.length > 0 && filtered.every((r) => checkedIds.has(r.id));

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  };

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  const handleSubmit = async () => {
    if (!companyId) return;
    if (!form.product_name.trim()) {
      showToast({ kind: 'error', text: '검사대상제품은 필수 입력입니다.' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('inspection_certificates')
        .insert({
          company_id: companyId,
          product_name: form.product_name.trim(),
          hs_no: form.hs_no.trim() || null,
          list_no: form.list_no.trim() || null,
          inspection_no: form.inspection_no.trim() || null,
          inspection_valid_until: form.inspection_valid_until || null,
          import_req_no: form.import_req_no.trim() || null,
          import_valid_until: form.import_valid_until || null,
        });
      if (error) throw error;
      showToast({ kind: 'success', text: '추가 완료' });
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '추가 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!companyId || checkedIds.size === 0) return;
    setBusyDelete(true);
    try {
      const ids = Array.from(checkedIds);
      const { error } = await supabase
        .from('inspection_certificates')
        .delete()
        .in('id', ids)
        .eq('company_id', companyId);
      if (error) throw error;
      showToast({ kind: 'success', text: `${ids.length}건 삭제 완료` });
      setCheckedIds(new Set());
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제품명 / 번호 검색"
          style={{
            flex: 1,
            minWidth: 240,
            height: 34,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid var(--line-strong)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 13,
            fontFamily: 'var(--font-kr)',
          }}
        />

        <button
          type="button"
          onClick={() => setSearch('')}
          className="btn-base"
          disabled={!search}
        >
          초기화
        </button>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="btn-base"
          disabled={checkedIds.size === 0}
          style={{ color: 'var(--danger)' }}
        >
          <Trash2 className="ico-sm" />
          <span>{checkedIds.size}건 삭제</span>
        </button>

        <button type="button" onClick={openAddModal} className="btn-base primary">
          <Plus className="ico-sm" />
          <span>추가</span>
        </button>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            불러오는 중…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            {search ? '검색 결과가 없습니다.' : '등록된 시험검사번호가 없습니다.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                minWidth: 1100,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <th style={thStyle('center', 44)}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  <th style={thStyle('left')}>검사대상제품</th>
                  <th style={thStyle('left', 110)}>HS_NO</th>
                  <th style={thStyle('left', 110)}>리스트번호</th>
                  <th style={thStyle('left', 150)}>시험검사번호</th>
                  <th style={thStyle('center', 120)}>검사유효기간</th>
                  <th style={thStyle('left', 130)}>수입요건번호</th>
                  <th style={thStyle('center', 120)}>수입유효기간</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const inspectStatus = getValidityStatus(
                    row.inspection_valid_until,
                  );
                  const importStatus = getValidityStatus(row.import_valid_until);
                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid var(--line)' }}
                    >
                      <td style={tdStyle('center')}>
                        <input
                          type="checkbox"
                          checked={checkedIds.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                        />
                      </td>
                      <td style={tdStyle('left')}>
                        <span style={{ fontWeight: 500 }}>
                          {row.product_name}
                        </span>
                      </td>
                      <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                        {row.hs_no ?? '—'}
                      </td>
                      <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                        {row.list_no ?? '—'}
                      </td>
                      <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                        {row.inspection_no ?? '—'}
                      </td>
                      <td
                        style={{
                          ...tdStyle('center'),
                          color: validityColor(inspectStatus),
                          fontWeight:
                            inspectStatus === 'expired' ||
                            inspectStatus === 'expiring'
                              ? 600
                              : 400,
                        }}
                      >
                        {row.inspection_valid_until ?? '—'}
                      </td>
                      <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                        {row.import_req_no ?? '—'}
                      </td>
                      <td
                        style={{
                          ...tdStyle('center'),
                          color: validityColor(importStatus),
                          fontWeight:
                            importStatus === 'expired' ||
                            importStatus === 'expiring'
                              ? 600
                              : 400,
                        }}
                      >
                        {row.import_valid_until ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="시험검사번호 추가"
        width={560}
        footer={
          <>
            <button
              type="button"
              className="btn-base"
              onClick={closeModal}
              disabled={submitting}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-base primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="ico-sm animate-spin" />
              ) : null}
              <span>{submitting ? '저장 중…' : '저장'}</span>
            </button>
          </>
        }
      >
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <Field label="검사대상제품 *" colSpan={2}>
            <input
              type="text"
              value={form.product_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_name: e.target.value }))
              }
              style={inputStyle}
              autoFocus
            />
          </Field>
          <Field label="HS_NO">
            <input
              type="text"
              value={form.hs_no}
              onChange={(e) => setForm((f) => ({ ...f, hs_no: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="리스트번호">
            <input
              type="text"
              value={form.list_no}
              onChange={(e) =>
                setForm((f) => ({ ...f, list_no: e.target.value }))
              }
              style={inputStyle}
            />
          </Field>
          <Field label="시험검사번호">
            <input
              type="text"
              value={form.inspection_no}
              onChange={(e) =>
                setForm((f) => ({ ...f, inspection_no: e.target.value }))
              }
              style={inputStyle}
            />
          </Field>
          <Field label="검사유효기간">
            <input
              type="date"
              value={form.inspection_valid_until}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  inspection_valid_until: e.target.value,
                }))
              }
              style={inputStyle}
            />
          </Field>
          <Field label="수입요건번호">
            <input
              type="text"
              value={form.import_req_no}
              onChange={(e) =>
                setForm((f) => ({ ...f, import_req_no: e.target.value }))
              }
              style={inputStyle}
            />
          </Field>
          <Field label="수입유효기간">
            <input
              type="date"
              value={form.import_valid_until}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  import_valid_until: e.target.value,
                }))
              }
              style={inputStyle}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="시험검사번호 삭제"
        body={`선택된 ${checkedIds.size}건을 정말 삭제할까요? 삭제 후 복구할 수 없습니다.`}
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={handleBulkDelete}
        busy={busyDelete}
      />
    </div>
  );
}

function Field({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        gridColumn: colSpan === 2 ? 'span 2' : undefined,
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--line-strong)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 13,
  fontFamily: 'var(--font-kr)',
  width: '100%',
};

function thStyle(
  align: 'left' | 'center' | 'right',
  width?: number,
): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--ink-2)',
    width,
  };
}

function tdStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    color: 'var(--ink)',
  };
}
