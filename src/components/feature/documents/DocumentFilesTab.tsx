/**
 * 문서 파일 업로드/목록 탭 — 수입면장/엔젤러스인보이스/화학물질관련/기타서류 공용.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 파일은 base64 data URI 형태로 `document_files.file_path` 컬럼에 저장.
 *    목록 조회 시 base64 본문은 제외(SELECT_LIST) — 다운로드 시점에 행 단위로 별도 조회.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { DocFileCategory } from '@/pages/documents/DocumentsPage';

const CATEGORY_LABELS: Record<DocFileCategory, string> = {
  import_declaration: '수입면장',
  angelus_invoice: '엔젤러스인보이스',
  chemical: '화학물질관련',
  other: '기타서류',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SELECT_LIST =
  'id, file_name, file_size, mime_type, memo, uploaded_at, created_at';

interface DocumentFileRow {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  memo: string | null;
  uploaded_at: string | null;
  created_at: string | null;
}

interface Props {
  companyId: string | null;
  category: DocFileCategory;
}

export function DocumentFilesTab({ companyId, category }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [memo, setMemo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentFileRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const queryKey = ['document-files', companyId, category];

  const { data: rows = [], isLoading } = useQuery<DocumentFileRow[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () => {
      return await fetchAllRows<DocumentFileRow>(() =>
        supabase
          .from('document_files')
          .select(SELECT_LIST)
          .eq('company_id', companyId!)
          .eq('category', category)
          .order('uploaded_at', { ascending: false, nullsFirst: false }),
      );
    },
    staleTime: 30_000,
  });

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
        category,
        file_name: file.name,
        file_path: base64,
        file_size: file.size,
        mime_type: file.type || null,
        memo: memo.trim() || null,
        uploaded_at: new Date().toISOString(),
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

  const handleDownload = async (row: DocumentFileRow) => {
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

      const a = document.createElement('a');
      a.href = data.file_path;
      a.download = data.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '다운로드 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !companyId) return;
    setBusyDelete(true);
    try {
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
          <span>{uploading ? '업로드 중…' : '파일 업로드'}</span>
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
          카테고리: <strong>{CATEGORY_LABELS[category]}</strong> · 최대 10MB
        </div>
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
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            업로드된 파일이 없습니다.
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <th style={thStyle('left')}>파일명</th>
                <th style={thStyle('right', 100)}>크기</th>
                <th style={thStyle('left', 240)}>메모</th>
                <th style={thStyle('left', 140)}>업로드일</th>
                <th style={thStyle('center', 140)}>작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <td style={tdStyle('left')}>{row.file_name}</td>
                  <td
                    style={{
                      ...tdStyle('right'),
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--ink-2)',
                    }}
                  >
                    {fmtSize(row.file_size)}
                  </td>
                  <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                    {row.memo ?? '—'}
                  </td>
                  <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                    {fmtDate(row.uploaded_at ?? row.created_at)}
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
                        onClick={() => handleDownload(row)}
                        title="다운로드"
                        className="btn-base"
                        style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                      >
                        <Download size={12} />
                        다운로드
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
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
        )}
      </div>

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

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
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
