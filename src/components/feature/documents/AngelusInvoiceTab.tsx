/**
 * 엔젤러스 인보이스 탭 — PO 참조번호 기준으로 그룹화 + 서브타입 배지.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 doc_subtype 자동분류는 참고용, 사람이 배지 클릭 → 수동 확정(subtype_confirmed=true).
 * 🟠 수동 업로드(source='manual'): base64 저장. 자동 수집(source='email_auto'): Storage 경로 저장.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileUp,
  Loader2,
  Trash2,
  Sparkles,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STORAGE_BUCKET = 'documents';

const SELECT_LIST =
  'id, file_name, file_size, mime_type, memo, uploaded_at, created_at, source, email_from, email_received_at, extracted_doc_no, doc_subtype, subtype_confirmed, related_po_reference, extracted_metadata, file_path';

type Subtype = 'proforma' | 'revised' | 'final' | 'unknown';

const SUBTYPE_LABEL: Record<Subtype, string> = {
  proforma: '확인용',
  revised: '수정본',
  final: '최종본',
  unknown: '미분류',
};

const SUBTYPE_COLOR: Record<Subtype, string> = {
  proforma: '#94a3b8',
  revised: '#f59e0b',
  final: '#10b981',
  unknown: '#94a3b8',
};

interface AngelusRow {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  memo: string | null;
  uploaded_at: string | null;
  created_at: string | null;
  source: string | null;
  email_from: string | null;
  email_received_at: string | null;
  extracted_doc_no: string | null;
  doc_subtype: string | null;
  subtype_confirmed: boolean | null;
  related_po_reference: string | null;
  extracted_metadata: unknown;
  file_path: string;
}

interface Props {
  companyId: string | null;
}

export function AngelusInvoiceTab({ companyId }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [memo, setMemo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AngelusRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const queryKey = ['document-files', companyId, 'angelus_invoice'];

  const { data: rows = [], isLoading } = useQuery<AngelusRow[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () =>
      await fetchAllRows<AngelusRow>(() =>
        supabase
          .from('document_files')
          .select(SELECT_LIST)
          .eq('company_id', companyId!)
          .eq('category', 'angelus_invoice')
          .order('email_received_at', {
            ascending: false,
            nullsFirst: false,
          }),
      ),
    staleTime: 30_000,
  });

  const { groups, unassigned } = useMemo(() => groupByPo(rows), [rows]);

  const knownPoRefs = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => r.related_po_reference)
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [rows],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !companyId) return;

    if (file.size > MAX_FILE_SIZE) {
      showToast({ kind: 'error', text: '10MB 이하 파일만 업로드 가능합니다.' });
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
      });

      const { error } = await supabase.from('document_files').insert({
        company_id: companyId,
        category: 'angelus_invoice',
        file_name: file.name,
        file_path: base64,
        file_size: file.size,
        mime_type: file.type || null,
        memo: memo.trim() || null,
        uploaded_at: new Date().toISOString(),
        source: 'manual',
      });

      if (error) throw error;
      showToast({ kind: 'success', text: '업로드 완료' });
      setMemo('');
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '업로드 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (row: AngelusRow) => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('document_files')
        .select('file_path, file_name')
        .eq('id', row.id)
        .eq('company_id', companyId)
        .single();
      if (error) throw error;
      if (!data?.file_path) throw new Error('파일 데이터 없음');

      if (data.file_path.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = data.file_path;
        a.download = data.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const { data: blob, error: dlErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(data.file_path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? '다운로드 실패');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '다운로드 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !companyId) return;
    setBusyDelete(true);
    try {
      if (
        deleteTarget.source === 'email_auto' &&
        !deleteTarget.file_path.startsWith('data:')
      ) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([deleteTarget.file_path]);
      }
      const { error } = await supabase
        .from('document_files')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('company_id', companyId);
      if (error) throw error;
      showToast({ kind: 'success', text: '삭제 완료' });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setBusyDelete(false);
    }
  };

  const handleSubtypeChange = async (row: AngelusRow, next: Subtype) => {
    if (!companyId) return;
    try {
      const { error } = await supabase
        .from('document_files')
        .update({ doc_subtype: next, subtype_confirmed: true })
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '변경 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const handlePoRefChange = async (row: AngelusRow, next: string) => {
    if (!companyId) return;
    const trimmed = next.trim();
    try {
      const { error } = await supabase
        .from('document_files')
        .update({ related_po_reference: trimmed || null })
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PO 연결 실패';
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
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <label
          className="btn-base primary"
          style={{
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? (
            <Loader2 className="ico-sm animate-spin" />
          ) : (
            <FileUp className="ico-sm" />
          )}
          <span>{uploading ? '업로드 중…' : '수동 업로드'}</span>
          <input
            type="file"
            onChange={handleFileChange}
            disabled={uploading || !companyId}
            style={{ display: 'none' }}
          />
        </label>

        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모 (선택)"
          disabled={uploading}
          style={{
            flex: 1,
            minWidth: 200,
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

        <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          <Sparkles
            size={12}
            style={{
              display: 'inline',
              marginRight: 4,
              color: 'var(--accent, #6b7cff)',
            }}
          />
          엔젤러스 이메일은 자동 수집됩니다 · 최대 10MB
        </div>
      </div>

      {isLoading ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 13,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 13,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          업로드된 인보이스가 없습니다.
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <GroupBlock
              key={g.poRef}
              title={`PO ${g.poRef}`}
              rows={g.items}
              knownPoRefs={knownPoRefs}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
              onSubtypeChange={handleSubtypeChange}
              onPoRefChange={handlePoRefChange}
            />
          ))}
          {unassigned.length > 0 && (
            <GroupBlock
              title="미분류 (PO 참조번호 없음)"
              rows={unassigned}
              knownPoRefs={knownPoRefs}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
              onSubtypeChange={handleSubtypeChange}
              onPoRefChange={handlePoRefChange}
              muted
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="파일 삭제"
        body={
          <span>
            <strong>{deleteTarget?.file_name}</strong> 파일을 정말 삭제할까요?
            <br />
            삭제된 파일은 복구할 수 없습니다.
          </span>
        }
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        busy={busyDelete}
      />
    </div>
  );
}

function GroupBlock({
  title,
  rows,
  knownPoRefs,
  onDownload,
  onDelete,
  onSubtypeChange,
  onPoRefChange,
  muted,
}: {
  title: string;
  rows: AngelusRow[];
  knownPoRefs: string[];
  onDownload: (row: AngelusRow) => void;
  onDelete: (row: AngelusRow) => void;
  onSubtypeChange: (row: AngelusRow, next: Subtype) => void;
  onPoRefChange: (row: AngelusRow, next: string) => void;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        opacity: muted ? 0.9 : 1,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--line)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>{title}</span>
        <span style={{ color: 'var(--ink-3)', fontWeight: 500, fontSize: 12 }}>
          · {rows.length}건
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr
            style={{
              background: 'var(--surface)',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <th style={thStyle('left')}>파일명</th>
            <th style={thStyle('left', 130)}>인보이스번호</th>
            <th style={thStyle('center', 110)}>종류</th>
            <th style={thStyle('left', 140)}>PO 참조</th>
            <th style={thStyle('left', 160)}>수신일시</th>
            <th style={thStyle('center', 140)}>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={tdStyle('left')}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {row.source === 'email_auto' && (
                    <Sparkles
                      size={12}
                      style={{ color: 'var(--accent, #6b7cff)' }}
                    />
                  )}
                  <span>{row.file_name}</span>
                </div>
              </td>
              <td
                style={{
                  ...tdStyle('left'),
                  color: 'var(--ink-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.extracted_doc_no ?? '—'}
              </td>
              <td style={tdStyle('center')}>
                <SubtypeBadge
                  value={(row.doc_subtype as Subtype | null) ?? 'unknown'}
                  confirmed={Boolean(row.subtype_confirmed)}
                  onChange={(next) => onSubtypeChange(row, next)}
                />
              </td>
              <td style={tdStyle('left')}>
                <PoRefEditor
                  value={row.related_po_reference ?? ''}
                  suggestions={knownPoRefs}
                  onChange={(next) => onPoRefChange(row, next)}
                />
              </td>
              <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                {fmtDateTime(
                  row.email_received_at ??
                    row.uploaded_at ??
                    row.created_at,
                )}
              </td>
              <td style={tdStyle('center')}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onDownload(row)}
                    title="다운로드"
                    className="btn-base"
                    style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                  >
                    <Download size={12} />
                    다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    title="삭제"
                    className="btn-base"
                    style={{
                      height: 28,
                      padding: '0 10px',
                      fontSize: 12,
                      color: 'var(--danger)',
                    }}
                  >
                    <Trash2 size={12} />
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubtypeBadge({
  value,
  confirmed,
  onChange,
}: {
  value: Subtype;
  confirmed: boolean;
  onChange: (next: Subtype) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = SUBTYPE_COLOR[value];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          padding: '3px 8px',
          fontSize: 11,
          fontWeight: confirmed ? 700 : 500,
          color: '#fff',
          background: color,
          border: 'none',
          borderRadius: 6,
          opacity: confirmed ? 1 : 0.65,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'var(--font-kr)',
        }}
      >
        {confirmed && <CheckCircle2 size={10} />}
        {SUBTYPE_LABEL[value]}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 4,
            zIndex: 20,
            minWidth: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {(Object.keys(SUBTYPE_LABEL) as Subtype[]).map((k) => (
            <button
              type="button"
              key={k}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(k);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '5px 8px',
                fontSize: 12,
                background: k === value ? 'var(--surface-2)' : 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                color: 'var(--ink)',
                fontFamily: 'var(--font-kr)',
              }}
            >
              {SUBTYPE_LABEL[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PoRefEditor({
  value,
  suggestions,
  onChange,
}: {
  value: string;
  suggestions: string[];
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 6px',
          fontSize: 12,
          color: value ? 'var(--ink)' : 'var(--ink-3)',
          background: 'transparent',
          border: '1px dashed var(--line-strong)',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'var(--font-kr)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Link2 size={10} />
        {value || '연결'}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <input
        list="angelus-po-refs"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChange(draft);
            setEditing(false);
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        onBlur={() => {
          onChange(draft);
          setEditing(false);
        }}
        style={{
          width: 110,
          height: 26,
          padding: '0 6px',
          fontSize: 12,
          border: '1px solid var(--line-strong)',
          borderRadius: 6,
          fontFamily: 'var(--font-kr)',
        }}
      />
      <datalist id="angelus-po-refs">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function groupByPo(rows: AngelusRow[]): {
  groups: Array<{ poRef: string; items: AngelusRow[] }>;
  unassigned: AngelusRow[];
} {
  const map = new Map<string, AngelusRow[]>();
  const unassigned: AngelusRow[] = [];
  for (const row of rows) {
    const po = row.related_po_reference?.trim();
    if (!po) {
      unassigned.push(row);
      continue;
    }
    const list = map.get(po) ?? [];
    list.push(row);
    map.set(po, list);
  }
  const groups = Array.from(map.entries())
    .map(([poRef, items]) => ({
      poRef,
      items: [...items].sort((a, b) => {
        const ta = a.email_received_at ?? a.uploaded_at ?? a.created_at ?? '';
        const tb = b.email_received_at ?? b.uploaded_at ?? b.created_at ?? '';
        return ta.localeCompare(tb);
      }),
    }))
    .sort((a, b) => {
      const la =
        a.items[a.items.length - 1]?.email_received_at ??
        a.items[a.items.length - 1]?.uploaded_at ??
        '';
      const lb =
        b.items[b.items.length - 1]?.email_received_at ??
        b.items[b.items.length - 1]?.uploaded_at ??
        '';
      return lb.localeCompare(la);
    });
  return { groups, unassigned };
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

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
