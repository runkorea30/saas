/**
 * 시험검사번호 탭 — inspection_certificates 인라인 편집 CRUD.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 셀 클릭 → input 으로 변환, blur/Enter 시 저장, Escape 시 취소.
 * 🟠 추가 버튼: 빈 행 INSERT 후 첫 셀(product_name) 자동 편집.
 * 🟠 삭제: 체크된 행 일괄 hard delete.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import type { Database } from '@/types/database';

type InspectionUpdate =
  Database['mochicraft_demo']['Tables']['inspection_certificates']['Update'];

const INSPECTION_SELECT =
  'id, product_name, hs_no, inspection_no, inspection_valid_until, import_req_no, import_valid_until, created_at';

interface InspectionCert {
  id: string;
  product_name: string;
  hs_no: string | null;
  inspection_no: string | null;
  inspection_valid_until: string | null;
  import_req_no: string | null;
  import_valid_until: string | null;
  created_at: string | null;
}

type EditableField =
  | 'product_name'
  | 'hs_no'
  | 'inspection_no'
  | 'inspection_valid_until'
  | 'import_req_no'
  | 'import_valid_until';

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
  if (kind === 'valid') return 'var(--success, var(--ink))';
  return 'var(--ink-3)';
}

interface Props {
  companyId: string | null;
}

export function InspectionCertTab({ companyId }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ['inspection-certs', companyId];

  const { data: rows = [], isLoading } = useQuery<InspectionCert[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () =>
      fetchAllRows<InspectionCert>(() =>
        supabase
          .from('inspection_certificates')
          .select(INSPECTION_SELECT)
          .eq('company_id', companyId!)
          .order('product_name', { ascending: true }),
      ),
    staleTime: 30_000,
  });

  const [search, setSearch] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: EditableField;
  } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.product_name,
        r.hs_no ?? '',
        r.inspection_no ?? '',
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

  const startEdit = (id: string, field: EditableField, initial: string) => {
    setEditingCell({ id, field });
    setEditingValue(initial);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveEdit = async () => {
    if (!editingCell || !companyId) return;
    const { id, field } = editingCell;
    const trimmed = editingValue.trim();
    const original = rows.find((r) => r.id === id);
    if (!original) {
      cancelEdit();
      return;
    }
    const prevValue = (original[field] as string | null) ?? '';
    if ((trimmed || '') === (prevValue || '')) {
      cancelEdit();
      return;
    }
    if (field === 'product_name' && !trimmed) {
      showToast({ kind: 'error', text: '검사대상제품은 비울 수 없습니다.' });
      cancelEdit();
      return;
    }
    try {
      // 🟠 Supabase 자동생성 Update 타입 사용 — 컴퓨티드 키([field])는 string 으로 widening 되므로
      //    명시적 캐스팅 필요. product_name 의 공백 체크는 line 150 에서 처리됨.
      const payload = {
        [field]: trimmed || null,
        updated_at: new Date().toISOString(),
      } as InspectionUpdate;
      const { error } = await supabase
        .from('inspection_certificates')
        .update(payload)
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      cancelEdit();
    }
  };

  const handleAdd = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('inspection_certificates')
        .insert({ company_id: companyId, product_name: '새 제품' })
        .select(INSPECTION_SELECT)
        .single();
      if (error) throw error;
      if (!data) return;
      await queryClient.invalidateQueries({ queryKey });
      // 새 행의 product_name 자동 편집.
      setTimeout(() => {
        setEditingCell({ id: data.id, field: 'product_name' });
        setEditingValue(data.product_name ?? '새 제품');
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '추가 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const handleDelete = async () => {
    if (!companyId || checkedIds.size === 0) return;
    if (!window.confirm(`선택된 ${checkedIds.size}건을 삭제하시겠습니까?`))
      return;
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
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패';
      showToast({ kind: 'error', text: msg });
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
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제품명 / 번호 검색"
          style={{
            height: 34,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid var(--line-strong)',
            fontSize: 13,
            background: 'var(--surface)',
            color: 'var(--ink)',
            width: 240,
            fontFamily: 'var(--font-kr)',
          }}
        />

        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="btn-base"
          >
            초기화
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={handleDelete}
          className="btn-base"
          disabled={checkedIds.size === 0}
          style={{
            color: checkedIds.size > 0 ? 'var(--danger)' : undefined,
            borderColor:
              checkedIds.size > 0 ? 'var(--danger)' : undefined,
          }}
        >
          <Trash2 className="ico-sm" />
          <span>{checkedIds.size > 0 ? `${checkedIds.size}건 삭제` : '삭제'}</span>
        </button>

        <button
          type="button"
          onClick={handleAdd}
          className="btn-base primary"
        >
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
          <EmptyRow text="불러오는 중…" />
        ) : filtered.length === 0 ? (
          <EmptyRow
            text={
              search
                ? '검색 결과가 없습니다.'
                : '등록된 시험검사번호가 없습니다. "추가" 버튼으로 첫 행을 만들어보세요.'
            }
          />
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
                  <th style={thStyle('left', 120)}>HS_NO</th>
                  <th style={thStyle('left', 180)}>시험검사번호</th>
                  <th style={thStyle('center', 130)}>검사유효기간</th>
                  <th style={thStyle('left', 180)}>수입요건번호</th>
                  <th style={thStyle('center', 130)}>수입유효기간</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
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
                    <td style={cellTdStyle('left')}>
                      <EditableTextCell
                        row={row}
                        field="product_name"
                        editingCell={editingCell}
                        editingValue={editingValue}
                        setEditingValue={setEditingValue}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                        weight={500}
                      />
                    </td>
                    <td style={cellTdStyle('left')}>
                      <EditableTextCell
                        row={row}
                        field="hs_no"
                        editingCell={editingCell}
                        editingValue={editingValue}
                        setEditingValue={setEditingValue}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                      />
                    </td>
                    <td style={cellTdStyle('left')}>
                      <EditableTextCell
                        row={row}
                        field="inspection_no"
                        editingCell={editingCell}
                        editingValue={editingValue}
                        setEditingValue={setEditingValue}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                      />
                    </td>
                    <td style={cellTdStyle('center')}>
                      <EditableDateCell
                        row={row}
                        field="inspection_valid_until"
                        editingCell={editingCell}
                        editingValue={editingValue}
                        setEditingValue={setEditingValue}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                      />
                    </td>
                    <td style={cellTdStyle('left')}>
                      <EditableTextCell
                        row={row}
                        field="import_req_no"
                        editingCell={editingCell}
                        editingValue={editingValue}
                        setEditingValue={setEditingValue}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                      />
                    </td>
                    <td style={cellTdStyle('center')}>
                      <EditableDateCell
                        row={row}
                        field="import_valid_until"
                        editingCell={editingCell}
                        editingValue={editingValue}
                        setEditingValue={setEditingValue}
                        startEdit={startEdit}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface CellSharedProps {
  row: InspectionCert;
  field: EditableField;
  editingCell: { id: string; field: EditableField } | null;
  editingValue: string;
  setEditingValue: (v: string) => void;
  startEdit: (id: string, field: EditableField, initial: string) => void;
  saveEdit: () => void;
  cancelEdit: () => void;
}

function EditableTextCell({
  row,
  field,
  editingCell,
  editingValue,
  setEditingValue,
  startEdit,
  saveEdit,
  cancelEdit,
  weight,
}: CellSharedProps & { weight?: number }) {
  const isEditing = editingCell?.id === row.id && editingCell?.field === field;
  const value = (row[field] as string | null) ?? '';

  if (isEditing) {
    return (
      <input
        type="text"
        value={editingValue}
        autoFocus
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveEdit();
          if (e.key === 'Escape') cancelEdit();
        }}
        style={inlineInputStyle}
      />
    );
  }

  return (
    <div
      onClick={() => startEdit(row.id, field, value)}
      title="클릭하여 편집"
      style={{
        cursor: 'text',
        minHeight: 24,
        padding: '2px 6px',
        borderRadius: 4,
        color: value ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: weight,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = 'var(--surface-2)')
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {value || '—'}
    </div>
  );
}

function EditableDateCell({
  row,
  field,
  editingCell,
  editingValue,
  setEditingValue,
  startEdit,
  saveEdit,
  cancelEdit,
}: CellSharedProps) {
  const isEditing = editingCell?.id === row.id && editingCell?.field === field;
  const value = (row[field] as string | null) ?? '';
  const status = getValidityStatus(value || null);

  if (isEditing) {
    return (
      <input
        type="date"
        value={editingValue}
        autoFocus
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveEdit();
          if (e.key === 'Escape') cancelEdit();
        }}
        style={inlineInputStyle}
      />
    );
  }

  return (
    <div
      onClick={() => startEdit(row.id, field, value)}
      title="클릭하여 편집"
      style={{
        cursor: 'text',
        minHeight: 24,
        padding: '2px 6px',
        borderRadius: 4,
        color: validityColor(status),
        fontWeight:
          status === 'expired' || status === 'expiring' ? 600 : 400,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = 'var(--surface-2)')
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {value || '—'}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        color: 'var(--ink-3)',
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

const inlineInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  border: '1px solid var(--info)',
  borderRadius: 4,
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontSize: 13,
  fontFamily: 'var(--font-kr)',
  outline: 'none',
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

function cellTdStyle(
  align: 'left' | 'center' | 'right',
): React.CSSProperties {
  // 인라인 셀은 패딩 줄여서 input 이 들어와도 행 높이 안정.
  return {
    padding: '6px 8px',
    textAlign: align,
    color: 'var(--ink)',
    verticalAlign: 'middle',
  };
}
