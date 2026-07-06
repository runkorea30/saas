/**
 * 설정 > 거래처 포털 공지사항 (게시판 관리).
 *
 * portal_notices 테이블 기반 다건 CRUD.
 *  - 목록: is_pinned DESC → created_at DESC. 게시/숨김, 고정 배지 표시.
 *  - 새 공지 작성 / 수정: Modal 폼.
 *  - 게시·숨김 토글, 고정 토글: 즉시 UPDATE.
 *  - 삭제: ConfirmDialog(danger). "숨김" 과 명확히 구분.
 *
 * 🔴 CLAUDE.md §1: companyId 는 useCompany() 경유.
 * 🟠 portal_notices 는 자동생성 database.ts 타입에 아직 미반영 → 로컬 인터페이스 + as any 우회.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin, PinOff, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface PortalNotice {
  id: string;
  company_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

export function PortalNoticePage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const listQ = useQuery<PortalNotice[]>({
    queryKey: ['portal-notices-admin', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await untypedSupabase
        .from('portal_notices')
        .select('*')
        .eq('company_id', companyId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PortalNotice[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['portal-notices-admin', companyId] });
    // 파트너 포털 NoticePanel 쿼리도 즉시 갱신.
    qc.invalidateQueries({ queryKey: ['portal-notices', companyId] });
  };

  const createMut = useMutation({
    mutationFn: async (input: { title: string; body: string }) => {
      const { error } = await untypedSupabase.from('portal_notices').insert({
        company_id: companyId,
        title: input.title,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      showToast({ kind: 'success', text: '공지사항을 등록했습니다.' });
    },
    onError: (e: Error) => showToast({ kind: 'error', text: e.message }),
  });

  const updateMut = useMutation({
    mutationFn: async (input: {
      id: string;
      changes: Partial<Pick<PortalNotice, 'title' | 'body' | 'is_active' | 'is_pinned'>>;
    }) => {
      const { error } = await untypedSupabase
        .from('portal_notices')
        .update(input.changes)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => showToast({ kind: 'error', text: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedSupabase
        .from('portal_notices')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      showToast({ kind: 'success', text: '공지사항을 삭제했습니다.' });
    },
    onError: (e: Error) => showToast({ kind: 'error', text: e.message }),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PortalNotice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PortalNotice | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (n: PortalNotice) => {
    setEditing(n);
    setFormOpen(true);
  };
  const closeForm = () => {
    if (createMut.isPending || updateMut.isPending) return;
    setFormOpen(false);
    setEditing(null);
  };

  const handleFormSubmit = async (values: { title: string; body: string }) => {
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, changes: values });
      showToast({ kind: 'success', text: '공지사항을 수정했습니다.' });
    } else {
      await createMut.mutateAsync(values);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const rows = listQ.data ?? [];

  return (
    <div style={{ maxWidth: 880, margin: '32px auto', padding: '0 24px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div>
          <h2
            className="disp"
            style={{
              fontSize: 22,
              fontWeight: 500,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            거래처 포털 공지사항
          </h2>
          <p
            style={{
              fontSize: 12.5,
              color: 'var(--ink-3)',
              margin: '6px 0 0',
              lineHeight: 1.55,
            }}
          >
            여기서 등록한 공지가 거래처 포털에 게시됩니다. 상단 고정 공지는 항상 최상단에 노출됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-base primary"
          style={{ height: 34, fontSize: 13, whiteSpace: 'nowrap' }}
        >
          <Plus size={14} strokeWidth={1.8} /> 새 공지 작성
        </button>
      </header>

      {listQ.isLoading && (
        <div style={{ padding: 32, color: 'var(--ink-3)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {listQ.error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-wash)',
            color: 'var(--danger)',
            borderRadius: 8,
            fontSize: 12.5,
            marginBottom: 12,
          }}
        >
          공지사항을 불러오지 못했습니다: {listQ.error.message}
        </div>
      )}

      {!listQ.isLoading && rows.length === 0 && (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 13,
            background: 'var(--surface)',
            border: '1px dashed var(--line)',
            borderRadius: 10,
          }}
        >
          등록된 공지사항이 없습니다. 우측 상단 [새 공지 작성] 버튼으로 첫 공지를 등록하세요.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((n) => (
            <NoticeRow
              key={n.id}
              notice={n}
              onEdit={() => openEdit(n)}
              onTogglePin={() =>
                updateMut.mutate({ id: n.id, changes: { is_pinned: !n.is_pinned } })
              }
              onToggleActive={() =>
                updateMut.mutate({ id: n.id, changes: { is_active: !n.is_active } })
              }
              onDelete={() => setConfirmDelete(n)}
              busy={updateMut.isPending}
            />
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? '공지사항 수정' : '새 공지 작성'}
        width={560}
      >
        <NoticeForm
          initial={editing}
          onSubmit={handleFormSubmit}
          onCancel={closeForm}
          busy={createMut.isPending || updateMut.isPending}
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => {
          if (deleteMut.isPending) return;
          setConfirmDelete(null);
        }}
        title="공지사항 삭제"
        body={
          confirmDelete ? (
            <>
              「<strong>{confirmDelete.title}</strong>」 공지를 완전히 제거합니다.
              <br />
              되돌릴 수 없습니다. 잠시 감추기만 원하시면 대신 <strong>[숨김]</strong> 버튼을 사용하세요.
            </>
          ) : null
        }
        confirmLabel="완전 삭제"
        confirmVariant="danger"
        onConfirm={async () => {
          if (!confirmDelete) return;
          await deleteMut.mutateAsync(confirmDelete.id);
          setConfirmDelete(null);
        }}
        busy={deleteMut.isPending}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function NoticeRow({
  notice,
  onEdit,
  onTogglePin,
  onToggleActive,
  onDelete,
  busy,
}: {
  notice: PortalNotice;
  onEdit: () => void;
  onTogglePin: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const dim = !notice.is_active;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 14px',
        background: 'var(--surface)',
        border: `1px solid ${notice.is_pinned ? 'var(--brand)' : 'var(--line)'}`,
        borderRadius: 10,
        opacity: dim ? 0.6 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          {notice.is_pinned && (
            <span
              className="chip"
              style={{
                background: 'var(--brand-wash, var(--surface-2))',
                color: 'var(--brand)',
                fontSize: 10.5,
                padding: '2px 8px',
                borderRadius: 999,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Pin size={10} strokeWidth={2} /> 고정
            </span>
          )}
          <span
            className="chip"
            style={{
              background: notice.is_active ? 'var(--success-wash)' : 'var(--surface-2)',
              color: notice.is_active ? 'var(--success)' : 'var(--ink-3)',
              fontSize: 10.5,
              padding: '2px 8px',
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            {notice.is_active ? '게시중' : '숨김'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-num)' }}>
            {fmtDate(notice.created_at)}
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink)',
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={notice.title}
        >
          {notice.title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            whiteSpace: 'pre-line',
          }}
        >
          {notice.body}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <IconAction
          label={notice.is_pinned ? '고정 해제' : '상단 고정'}
          onClick={onTogglePin}
          disabled={busy}
          icon={notice.is_pinned ? <PinOff size={14} strokeWidth={1.8} /> : <Pin size={14} strokeWidth={1.8} />}
        />
        <IconAction
          label={notice.is_active ? '포털에서 숨김' : '다시 게시'}
          onClick={onToggleActive}
          disabled={busy}
          icon={notice.is_active ? <EyeOff size={14} strokeWidth={1.8} /> : <Eye size={14} strokeWidth={1.8} />}
        />
        <IconAction
          label="수정"
          onClick={onEdit}
          disabled={busy}
          icon={<Pencil size={14} strokeWidth={1.8} />}
        />
        <IconAction
          label="완전 삭제"
          onClick={onDelete}
          disabled={busy}
          icon={<Trash2 size={14} strokeWidth={1.8} />}
          danger
        />
      </div>
    </div>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 30,
        height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--line)',
        borderRadius: 8,
        background: 'var(--surface)',
        color: danger ? 'var(--danger)' : 'var(--ink-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all .12s',
      }}
    >
      {icon}
    </button>
  );
}

function NoticeForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: PortalNotice | null;
  onSubmit: (values: { title: string; body: string }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !busy;

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), body: body.trim() });
  };

  return (
    <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
          제목
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 7월 출고 일정 안내"
          autoFocus
          style={{
            height: 36,
            padding: '0 12px',
            border: '1px solid var(--line)',
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
            color: 'var(--ink)',
            background: 'var(--surface-2)',
            fontFamily: 'var(--font-kr)',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
          본문
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="거래처에게 전달할 공지 내용을 입력하세요."
          rows={8}
          style={{
            padding: '10px 12px',
            border: '1px solid var(--line)',
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
            color: 'var(--ink)',
            background: 'var(--surface-2)',
            resize: 'vertical',
            lineHeight: 1.6,
            fontFamily: 'var(--font-kr)',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          className="btn-base"
          style={{ height: 34, fontSize: 12.5 }}
          disabled={busy}
        >
          취소
        </button>
        <button
          type="submit"
          className="btn-base primary"
          style={{ height: 34, fontSize: 12.5 }}
          disabled={!canSubmit}
        >
          {busy ? '저장 중…' : initial ? '수정 저장' : '등록'}
        </button>
      </div>
    </form>
  );
}
