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
import {
  Plus,
  Trash2,
  Download,
  X,
  ExternalLink,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import type { Database } from '@/types/database';
import { isWithinExpiryMonths } from '@/utils/dateThresholds';
import { useCompany } from '@/hooks/useCompany';

const THRESHOLD_MONTH_OPTIONS = [1, 2, 3, 6] as const;
type ThresholdField =
  | 'inspection_expiry_threshold_months'
  | 'import_expiry_threshold_months';

type InspectionUpdate =
  Database['mochicraft_demo']['Tables']['inspection_certificates']['Update'];

const INSPECTION_SELECT =
  'id, product_name, hs_no, inspection_no, inspection_valid_until, import_req_no, import_valid_until, application_file_url, application_file_name, application_uploaded_at, google_drive_file_id, google_drive_synced_at, created_at';

const ALLOWED_FILE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface InspectionCert {
  id: string;
  product_name: string;
  hs_no: string | null;
  inspection_no: string | null;
  inspection_valid_until: string | null;
  import_req_no: string | null;
  import_valid_until: string | null;
  application_file_url: string | null;
  application_file_name: string | null;
  application_uploaded_at: string | null;
  google_drive_file_id: string | null;
  google_drive_synced_at: string | null;
  created_at: string | null;
}

type EditableField =
  | 'product_name'
  | 'hs_no'
  | 'inspection_no'
  | 'inspection_valid_until'
  | 'import_req_no'
  | 'import_valid_until';

/**
 * 필드별 임계값(개월) 이내면 danger 색상, 그 외엔 기본 잉크.
 */
function validityColorForField(
  dateStr: string | null,
  thresholdMonths: number,
): string {
  if (!dateStr) return 'var(--ink-3)';
  return isWithinExpiryMonths(dateStr, thresholdMonths)
    ? 'var(--danger)'
    : 'var(--ink)';
}

function isNearExpiry(
  dateStr: string | null,
  thresholdMonths: number,
): boolean {
  if (!dateStr) return false;
  return isWithinExpiryMonths(dateStr, thresholdMonths);
}

/** 클릭 정렬 대상 컬럼 (6종 데이터 컬럼). 신청서/체크박스는 제외. */
type SortField = EditableField;
type SortState = { field: SortField; dir: 'asc' | 'desc' };
/** 날짜 컬럼 — ISO 문자열 사전식 비교로 날짜 순서 일치. 나머지는 localeCompare. */
const DATE_SORT_FIELDS = new Set<SortField>([
  'inspection_valid_until',
  'import_valid_until',
]);

/**
 * 두 행을 정렬 기준으로 비교. null/빈값은 정렬 방향과 무관하게 항상 맨 뒤.
 */
function compareInspection(
  a: InspectionCert,
  b: InspectionCert,
  sort: SortState,
): number {
  const av = ((a[sort.field] as string | null) ?? '').trim();
  const bv = ((b[sort.field] as string | null) ?? '').trim();
  if (!av && !bv) return 0;
  if (!av) return 1; // null 맨 뒤
  if (!bv) return -1;
  let cmp: number;
  if (DATE_SORT_FIELDS.has(sort.field)) {
    // ISO 날짜 문자열은 사전식 비교가 곧 날짜 순서.
    cmp = av < bv ? -1 : Number(av > bv);
  } else {
    cmp = av.localeCompare(bv, 'ko');
  }
  return sort.dir === 'asc' ? cmp : -cmp;
}

interface Props {
  companyId: string | null;
}

export function InspectionCertTab({ companyId }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const inspectionMonths = company?.inspection_expiry_threshold_months ?? 3;
  const importMonths = company?.import_expiry_threshold_months ?? 1;
  const [savingThreshold, setSavingThreshold] = useState<ThresholdField | null>(
    null,
  );

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
  const [sort, setSort] = useState<SortState | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  /** 헤더 클릭 — 같은 컬럼이면 방향 토글, 다른 컬럼이면 오름차순부터. */
  const handleSort = (field: SortField) => {
    setSort((prev) =>
      prev?.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' },
    );
  };
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

  // 검색 결과 위에 정렬 적용 (sort 없으면 쿼리 기본순서 = product_name asc 유지).
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => compareInspection(a, b, sort));
  }, [filtered, sort]);

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
      await queryClient.invalidateQueries({
        queryKey: ['inspection-expiry-alerts', companyId],
      });
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
      await queryClient.invalidateQueries({
        queryKey: ['inspection-expiry-alerts', companyId],
      });
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

  const handleUpload = async (record: InspectionCert, file: File) => {
    if (!companyId) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast({ kind: 'error', text: '파일 크기는 최대 20MB입니다.' });
      return;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      showToast({ kind: 'error', text: 'Excel, PDF, Word 파일만 업로드 가능합니다.' });
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'file';
    const safeName = `${Date.now()}.${ext}`;
    const filePath = `inspection-applications/${companyId}/${record.id}/${safeName}`;
    try {
      if (record.application_file_url) {
        await supabase.storage.from('documents').remove([record.application_file_url]);
      }
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true,
          // 🔴 재업로드 시 CDN 캐시 만료 전 옛 파일이 다운로드되는 버그 방지.
          cacheControl: '0',
        });
      if (uploadError) {
        const msg = /bucket|not found|does not exist/i.test(uploadError.message)
          ? '파일 저장소가 준비되지 않았습니다. 관리자에게 문의하세요.'
          : `업로드 실패: ${uploadError.message}`;
        showToast({ kind: 'error', text: msg });
        return;
      }
      const { error: updateError } = await supabase
        .from('inspection_certificates')
        .update({
          application_file_url: filePath,
          application_file_name: file.name,
          application_uploaded_at: new Date().toISOString(),
        } as InspectionUpdate)
        .eq('id', record.id)
        .eq('company_id', companyId);
      if (updateError) throw updateError;
      showToast({ kind: 'success', text: '업로드 완료' });
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ['inspection-expiry-alerts', companyId],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '업로드 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const handleDownload = async (record: InspectionCert) => {
    if (!record.application_file_url || !record.application_file_name) return;
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(record.application_file_url);
      if (error || !data) {
        showToast({ kind: 'error', text: '다운로드 실패' });
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.application_file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '다운로드 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const handleDeleteFile = async (record: InspectionCert) => {
    if (!companyId) return;
    if (!window.confirm('신청서 파일을 삭제하시겠습니까?')) return;
    try {
      if (record.application_file_url) {
        await supabase.storage.from('documents').remove([record.application_file_url]);
      }
      const { error } = await supabase
        .from('inspection_certificates')
        .update({
          application_file_url: null,
          application_file_name: null,
          application_uploaded_at: null,
          google_drive_file_id: null,
          google_drive_synced_at: null,
        } as InspectionUpdate)
        .eq('id', record.id)
        .eq('company_id', companyId);
      if (error) throw error;
      showToast({ kind: 'success', text: '파일 삭제 완료' });
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ['inspection-expiry-alerts', companyId],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const [gdriveBusyId, setGdriveBusyId] = useState<string | null>(null);
  const [gdriveMode, setGdriveMode] = useState<'open' | 'sync' | null>(null);

  const openSheetInNewTab = (fileId: string) => {
    window.open(
      `https://docs.google.com/spreadsheets/d/${fileId}/edit`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleOpenSheet = async (record: InspectionCert) => {
    if (!companyId) return;
    if (record.google_drive_file_id) {
      openSheetInNewTab(record.google_drive_file_id);
      return;
    }
    if (!record.application_file_url || !record.application_file_name) {
      showToast({ kind: 'error', text: '먼저 파일을 업로드해 주세요' });
      return;
    }
    setGdriveBusyId(record.id);
    setGdriveMode('open');
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(record.application_file_url);
      if (error || !data) {
        showToast({ kind: 'error', text: '파일 로드 실패' });
        return;
      }
      const buffer = await data.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const res = await fetch('/api/gdrive-open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cert_id: record.id,
          file_name: record.application_file_name,
          file_base64: base64,
          company_id: companyId,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { fileId?: string; error?: string }
        | null;
      if (!res.ok || !body?.fileId) {
        showToast({
          kind: 'error',
          text: body?.error ?? `요청 실패 (${res.status})`,
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      openSheetInNewTab(body.fileId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '시트 열기 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setGdriveBusyId(null);
      setGdriveMode(null);
    }
  };

  const handleSyncSheet = async (record: InspectionCert) => {
    if (!companyId) return;
    if (!record.google_drive_file_id) {
      showToast({
        kind: 'info',
        text: '먼저 "시트 열기"를 눌러 드라이브에 업로드해 주세요',
      });
      return;
    }
    setGdriveBusyId(record.id);
    setGdriveMode('sync');
    try {
      const res = await fetch('/api/gdrive-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cert_id: record.id }),
      });
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; synced_at?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        showToast({
          kind: 'error',
          text: body?.error ?? `요청 실패 (${res.status})`,
        });
        return;
      }
      showToast({ kind: 'success', text: '동기화 완료' });
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '동기화 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setGdriveBusyId(null);
      setGdriveMode(null);
    }
  };

  const handleThresholdChange = async (
    field: ThresholdField,
    next: number,
  ) => {
    if (!companyId || !company) return;
    const prev = company[field];
    if (prev === next) return;
    setSavingThreshold(field);
    try {
      // 🟠 컴퓨티드 키([field]) 는 string 으로 widening 되므로 companies Update 타입에
      //    맞춰 명시 캐스팅. field 타입 자체가 ThresholdField 리터럴 유니온이라 안전.
      const payload = { [field]: next } as
        Database['mochicraft_demo']['Tables']['companies']['Update'];
      const { error } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', companyId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['current-company'] });
      const label =
        field === 'inspection_expiry_threshold_months'
          ? '검사유효기간 임박 기준'
          : '수입유효기간 임박 기준';
      showToast({
        kind: 'success',
        text: `${label}을 ${next}개월로 저장했습니다.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setSavingThreshold(null);
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
      await queryClient.invalidateQueries({
        queryKey: ['inspection-expiry-alerts', companyId],
      });
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

        <ThresholdSelect
          label="검사유효기간 임박"
          value={inspectionMonths}
          disabled={savingThreshold !== null}
          onChange={(v) =>
            handleThresholdChange('inspection_expiry_threshold_months', v)
          }
        />
        <ThresholdSelect
          label="수입유효기간 임박"
          value={importMonths}
          disabled={savingThreshold !== null}
          onChange={(v) =>
            handleThresholdChange('import_expiry_threshold_months', v)
          }
        />

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
                  <SortHeader label="검사대상제품" field="product_name" align="left" sort={sort} onSort={handleSort} />
                  <SortHeader label="HS_NO" field="hs_no" align="left" width={120} sort={sort} onSort={handleSort} />
                  <SortHeader label="시험검사번호" field="inspection_no" align="left" width={180} sort={sort} onSort={handleSort} />
                  <SortHeader label="검사유효기간" field="inspection_valid_until" align="center" width={130} sort={sort} onSort={handleSort} />
                  <SortHeader label="수입요건번호" field="import_req_no" align="left" width={180} sort={sort} onSort={handleSort} />
                  <SortHeader label="수입유효기간" field="import_valid_until" align="center" width={130} sort={sort} onSort={handleSort} />
                  <th style={thStyle('left', 200)}>신청서</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
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
                        thresholdMonths={inspectionMonths}
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
                        thresholdMonths={importMonths}
                      />
                    </td>
                    <td style={cellTdStyle('left')}>
                      <ApplicationFileCell
                        record={row}
                        onUpload={handleUpload}
                        onDownload={handleDownload}
                        onDelete={handleDeleteFile}
                        onOpenSheet={handleOpenSheet}
                        onSyncSheet={handleSyncSheet}
                        gdriveBusy={
                          gdriveBusyId === row.id ? gdriveMode : null
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 통관 코드 매핑 */}
      <CustomsMappingSection companyId={companyId} />
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
  thresholdMonths,
}: CellSharedProps & { thresholdMonths: number }) {
  const isEditing = editingCell?.id === row.id && editingCell?.field === field;
  const value = (row[field] as string | null) ?? '';
  const near = isNearExpiry(value || null, thresholdMonths);

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
        color: validityColorForField(value || null, thresholdMonths),
        fontWeight: near ? 600 : 400,
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

interface ApplicationFileCellProps {
  record: InspectionCert;
  onUpload: (record: InspectionCert, file: File) => void | Promise<void>;
  onDownload: (record: InspectionCert) => void | Promise<void>;
  onDelete: (record: InspectionCert) => void | Promise<void>;
  onOpenSheet: (record: InspectionCert) => void | Promise<void>;
  onSyncSheet: (record: InspectionCert) => void | Promise<void>;
  /** 이 record 에 대해 진행 중인 gdrive 작업 종류. null 이면 유휴. */
  gdriveBusy: 'open' | 'sync' | null;
}

function ApplicationFileCell({
  record,
  onUpload,
  onDownload,
  onDelete,
  onOpenSheet,
  onSyncSheet,
  gdriveBusy,
}: ApplicationFileCellProps) {
  const [hover, setHover] = useState(false);

  if (record.application_file_url && record.application_file_name) {
    const isExcel = isExcelFileName(record.application_file_name);
    const openBusy = gdriveBusy === 'open';
    const syncBusy = gdriveBusy === 'sync';
    const anyBusy = gdriveBusy !== null;
    const disabledReason = !isExcel ? '엑셀 파일만 지원합니다' : undefined;

    return (
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            title={record.application_file_name}
            style={{
              fontSize: 12,
              maxWidth: 110,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--ink-2)',
              flex: 1,
            }}
          >
            {record.application_file_name}
          </span>
          <button
            type="button"
            onClick={() => onOpenSheet(record)}
            disabled={!isExcel || anyBusy}
            title={
              disabledReason ??
              (record.google_drive_file_id
                ? '구글 스프레드시트로 열기'
                : '구글 스프레드시트로 변환·업로드 후 열기')
            }
            style={{
              ...iconBtnStyle(
                isExcel ? 'var(--info)' : 'var(--ink-3)',
              ),
              opacity: !isExcel ? 0.4 : anyBusy ? 0.6 : 1,
              cursor: !isExcel || anyBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {openBusy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ExternalLink size={13} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onSyncSheet(record)}
            disabled={!isExcel || anyBusy}
            title={
              disabledReason ??
              (record.google_drive_file_id
                ? '드라이브에서 최신 내용을 가져와 덮어쓰기'
                : '먼저 시트 열기를 눌러주세요')
            }
            style={{
              ...iconBtnStyle(
                isExcel ? 'var(--info)' : 'var(--ink-3)',
              ),
              opacity: !isExcel ? 0.4 : anyBusy ? 0.6 : 1,
              cursor: !isExcel || anyBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {syncBusy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDownload(record)}
            title="다운로드"
            style={iconBtnStyle('var(--ink-2)')}
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(record)}
            title="삭제"
            style={{
              ...iconBtnStyle('var(--danger)'),
              visibility: hover ? 'visible' : 'hidden',
            }}
          >
            <X size={13} />
          </button>
        </div>
        {record.google_drive_synced_at && (
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-kr)',
            }}
            title={record.google_drive_synced_at}
          >
            최근 동기화: {formatRelativeKst(record.google_drive_synced_at)}
          </span>
        )}
      </div>
    );
  }

  return (
    <label style={{ cursor: 'pointer', display: 'inline-block' }}>
      <input
        type="file"
        accept=".xlsx,.xls,.pdf,.doc,.docx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(record, file);
          e.target.value = '';
        }}
      />
      <span
        style={{
          fontSize: 12,
          padding: '3px 10px',
          border: '1px solid var(--line-strong)',
          borderRadius: 4,
          color: 'var(--ink-2)',
          background: 'var(--surface)',
          cursor: 'pointer',
        }}
      >
        + 업로드
      </span>
    </label>
  );
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color,
    cursor: 'pointer',
    padding: 0,
  };
}

function isExcelFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // 큰 버퍼(수 MB) 대응: 32KB 청크 단위 문자열 조립 후 btoa.
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * 🔴 프로젝트 원칙: toISOString().slice() 금지. getFullYear/getMonth/getDate 로 KST 기준 상대 시간 산출.
 */
function formatRelativeKst(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  // 30일 이상은 KST 절대 날짜 표시.
  const kst = new Date(then.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

/** 클릭 정렬 헤더 — 활성 컬럼에 방향 화살표(▲▼) 표시. */
function SortHeader({
  label,
  field,
  align,
  width,
  sort,
  onSort,
}: {
  label: string;
  field: SortField;
  align: 'left' | 'center' | 'right';
  width?: number;
  sort: SortState | null;
  onSort: (field: SortField) => void;
}) {
  const active = sort?.field === field;
  const arrow = active ? (sort?.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      style={{ ...thStyle(align, width), cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(field)}
      title="클릭하여 정렬"
    >
      {label}
      <span style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}>
        {arrow}
      </span>
    </th>
  );
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

/**
 * 임박 기준 select — 라벨 + 개월 옵션(1/2/3/6).
 */
function ThresholdSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--ink-2)',
        fontFamily: 'var(--font-kr)',
      }}
    >
      <span>{label}:</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          height: 34,
          padding: '0 10px',
          borderRadius: 8,
          border: '1px solid var(--line-strong)',
          background: 'var(--surface)',
          color: 'var(--ink)',
          fontSize: 13,
          fontFamily: 'var(--font-kr)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {THRESHOLD_MONTH_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}개월
          </option>
        ))}
      </select>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 코드 매핑 관리 섹션 (InspectionCertTab 하단에 렌더링)
// ─────────────────────────────────────────────────────────────────────────────

interface MappingRow {
  id: string;
  code_prefix: string;
  code_examples: string | null;
  product_category: string;
  hs_code: string;
  import_req_no: string;
  origin_serial: string;
  sort_order: number;
}

type MappingField = 'code_prefix' | 'code_examples' | 'product_category' | 'hs_code' | 'import_req_no' | 'origin_serial';

type CustomsMappingUpdate =
  Database['mochicraft_demo']['Tables']['customs_code_mappings']['Update'];

const MAPPING_SELECT = 'id, code_prefix, code_examples, product_category, hs_code, import_req_no, origin_serial, sort_order';

interface MappingSectionProps {
  companyId: string | null;
}

function CustomsMappingSection({ companyId }: MappingSectionProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const qKey = ['customs-mappings', companyId];

  const { data: mRows = [], isLoading } = useQuery<MappingRow[]>({
    queryKey: qKey,
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customs_code_mappings')
        .select(MAPPING_SELECT)
        .eq('company_id', companyId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MappingRow[];
    },
    staleTime: 30_000,
  });

  const [editingCell, setEditingCell] = useState<{ id: string; field: MappingField } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  function startEdit(id: string, field: MappingField, value: string) {
    setEditingCell({ id, field });
    setEditingValue(value);
  }

  async function saveEdit() {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const trimmed = editingValue.trim();
    if (field === 'code_prefix' && !trimmed) {
      showToast({ kind: 'error', text: '코드 prefix는 필수입니다.' });
      return;
    }
    // 🟠 컴퓨티드 키([field])는 string 으로 widening 되므로 명시적 캐스팅 필요
    //    (InspectionCert saveEdit 와 동일 패턴).
    const payload = {
      [field]: trimmed,
      updated_at: new Date().toISOString(),
    } as CustomsMappingUpdate;
    const { error } = await supabase
      .from('customs_code_mappings')
      .update(payload)
      .eq('id', id);
    if (error) {
      showToast({ kind: 'error', text: `저장 실패: ${error.message}` });
    } else {
      queryClient.invalidateQueries({ queryKey: qKey });
    }
    setEditingCell(null);
  }

  function cancelEdit() {
    setEditingCell(null);
  }

  async function addRow() {
    if (!companyId) return;
    const maxOrder = mRows.length > 0 ? Math.max(...mRows.map((r) => r.sort_order)) : 0;
    const { data, error } = await supabase
      .from('customs_code_mappings')
      .insert({ company_id: companyId, code_prefix: '???', sort_order: maxOrder + 10 })
      .select(MAPPING_SELECT)
      .single();
    if (error) {
      showToast({ kind: 'error', text: `추가 실패: ${error.message}` });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: qKey });
    if (data) {
      setEditingCell({ id: (data as MappingRow).id, field: 'code_prefix' });
      setEditingValue((data as MappingRow).code_prefix);
    }
  }

  async function deleteRows(ids: string[]) {
    const { error } = await supabase
      .from('customs_code_mappings')
      .delete()
      .in('id', ids);
    if (error) {
      showToast({ kind: 'error', text: `삭제 실패: ${error.message}` });
    } else {
      queryClient.invalidateQueries({ queryKey: qKey });
    }
  }

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const allChecked = mRows.length > 0 && mRows.every((r) => checkedIds.has(r.id));

  const COLS: { field: MappingField; label: string; width?: number; align?: 'center' | 'left' }[] = [
    { field: 'code_prefix',      label: 'Prefix\n(앞 3자리)', width: 80,  align: 'center' },
    { field: 'code_examples',    label: '해당 코드 예시',      width: 180              },
    { field: 'product_category', label: '제품분류',            width: 160              },
    { field: 'hs_code',          label: 'HS Code',             width: 130, align: 'center' },
    { field: 'import_req_no',    label: '수입요건번호',         width: 170              },
    { field: 'origin_serial',    label: 'C/O Serial No',      width: 110, align: 'center' },
  ];

  const thS = (align: 'left' | 'center' = 'left', w?: number): React.CSSProperties => ({
    padding: '7px 10px', textAlign: align, fontWeight: 600, fontSize: 12,
    borderBottom: '1px solid var(--line)', whiteSpace: 'pre-line',
    width: w ? `${w}px` : undefined, background: 'var(--surface-2, var(--surface))',
  });

  const tdS = (align: 'left' | 'center' = 'left'): React.CSSProperties => ({
    padding: '5px 8px', textAlign: align, fontSize: 12,
  });

  return (
    <div style={{ marginTop: 32, borderTop: '2px solid var(--line)', paddingTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>통관 코드 매핑 관리</span>
          <span style={{ fontSize: 12, color: 'var(--ink-2)', marginLeft: 10 }}>
            아이템 코드 앞 3자리 기준으로 통관 정보를 자동 매핑합니다
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {checkedIds.size > 0 && (
            <button
              type="button"
              className="btn-base"
              onClick={async () => {
                await deleteRows([...checkedIds]);
                setCheckedIds(new Set());
              }}
              style={{ height: 30, fontSize: 12, padding: '0 12px', color: 'var(--danger)' }}
            >
              삭제 ({checkedIds.size})
            </button>
          )}
          <button
            type="button"
            className="btn-base primary"
            onClick={addRow}
            style={{ height: 30, fontSize: 12, padding: '0 14px' }}
          >
            + 추가
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', padding: 12 }}>로딩 중…</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thS('center', 36)}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => {
                      if (allChecked) setCheckedIds(new Set());
                      else setCheckedIds(new Set(mRows.map((r) => r.id)));
                    }}
                  />
                </th>
                {COLS.map((c) => (
                  <th key={c.field} style={thS(c.align ?? 'left', c.width)}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mRows.map((row, idx) => (
                <tr key={row.id} style={{
                  background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2, var(--surface))',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <td style={tdS('center')}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(row.id)}
                      onChange={() => {
                        const next = new Set(checkedIds);
                        if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                        setCheckedIds(next);
                      }}
                    />
                  </td>
                  {COLS.map((c) => {
                    const isEditing = editingCell?.id === row.id && editingCell?.field === c.field;
                    const val = String(row[c.field] ?? '');
                    return (
                      <td
                        key={c.field}
                        style={{ ...tdS(c.align ?? 'left'), cursor: 'text' }}
                        onClick={() => !isEditing && startEdit(row.id, c.field, val)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            style={{
                              width: '100%', border: '1px solid var(--accent, #2563eb)',
                              borderRadius: 4, padding: '2px 6px', fontSize: 12,
                              fontFamily: c.field === 'code_prefix' || c.field === 'hs_code' || c.field === 'import_req_no'
                                ? 'monospace' : undefined,
                            }}
                          />
                        ) : (
                          <span style={{
                            display: 'block', minHeight: 20,
                            fontFamily: c.field === 'code_prefix' || c.field === 'hs_code' || c.field === 'import_req_no'
                              ? 'monospace' : undefined,
                            color: val ? 'var(--ink)' : 'var(--ink-3)',
                          }}>
                            {val || '—'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {mRows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 1} style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
                    매핑 데이터가 없습니다. [+ 추가] 버튼으로 등록하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
