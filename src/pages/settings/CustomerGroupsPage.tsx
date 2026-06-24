/**
 * 거래처 그룹 관리 페이지 — 설정 > 거래처 그룹.
 *
 * - 여러 거래처를 묶어 세금계산서·입금을 통합 관리.
 * - 월 차감액(예: 한가람문구 시스템이용료)을 그룹 단위로 보관 → 추후 미수금 페이지에서 활용.
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만.
 * 🔴 CLAUDE.md §5: 서버 조회는 fetchAllRows 경유.
 */
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { compareCompanyName } from '@/utils/koreanSort';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { CustomerGroup } from '@/types/customers';

// ───────────────────────────────────────────────────────────
// 페이지 내부 타입
// ───────────────────────────────────────────────────────────

interface CustomerLite {
  id: string;
  name: string;
  group_id: string | null;
  is_active: boolean;
}

interface GroupWithMembers extends CustomerGroup {
  members: CustomerLite[]; // 페이지 전용 합성 타입 (CustomerGroup 본체에는 members 없음)
}

interface EditingState {
  group: CustomerGroup | null; // null = 신규 생성
  name: string;
  billing_name: string;
  monthly_deduction: string; // 입력 편의를 위해 string 으로 보관, 저장 시 number 변환
  deduction_note: string;
  selectedMemberIds: Set<string>;
}

const emptyEditing = (): EditingState => ({
  group: null,
  name: '',
  billing_name: '',
  monthly_deduction: '',
  deduction_note: '',
  selectedMemberIds: new Set(),
});

// ───────────────────────────────────────────────────────────
// 쿼리: 그룹 + 멤버 동시 로딩
// ───────────────────────────────────────────────────────────

function useGroupsWithMembers(companyId: string | null) {
  return useQuery<{
    groups: GroupWithMembers[];
    allCustomers: CustomerLite[];
  }>({
    queryKey: ['customer-groups', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const [groupRows, customerRows] = await Promise.all([
        fetchAllRows<CustomerGroup>(() =>
          supabase
            .from('customer_groups')
            .select(
              'id, company_id, name, billing_name, monthly_deduction, deduction_note, created_at, updated_at',
            )
            .eq('company_id', companyId!),
        ),
        fetchAllRows<CustomerLite>(() =>
          supabase
            .from('customers')
            .select('id, name, group_id, is_active')
            .eq('company_id', companyId!)
            .is('deleted_at', null),
        ),
      ]);

      const sortedGroups = [...groupRows].sort((a, b) =>
        compareCompanyName(a.name, b.name),
      );
      const sortedCustomers = [...customerRows].sort((a, b) =>
        compareCompanyName(a.name, b.name),
      );

      const groups: GroupWithMembers[] = sortedGroups.map((g) => ({
        ...g,
        members: sortedCustomers.filter((c) => c.group_id === g.id),
      }));

      return { groups, allCustomers: sortedCustomers };
    },
    staleTime: 60_000,
  });
}

// ───────────────────────────────────────────────────────────
// 페이지
// ───────────────────────────────────────────────────────────

export function CustomerGroupsPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading, error } = useGroupsWithMembers(companyId);
  const groups = data?.groups ?? [];
  const allCustomers = data?.allCustomers ?? [];

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupWithMembers | null>(null);

  const totalGroupedCustomers = useMemo(
    () => groups.reduce((sum, g) => sum + g.members.length, 0),
    [groups],
  );
  const totalUngrouped = allCustomers.length - totalGroupedCustomers;

  // ───── Mutation: 저장 ─────
  const saveMutation = useMutation({
    mutationFn: async (state: EditingState) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      const payload = {
        company_id: companyId,
        name: state.name.trim(),
        billing_name: state.billing_name.trim(),
        monthly_deduction: Number(state.monthly_deduction) || 0,
        deduction_note: state.deduction_note.trim() || null,
      };

      let savedId: string;
      if (state.group) {
        const { data: updated, error: updErr } = await supabase
          .from('customer_groups')
          .update(payload)
          .eq('id', state.group.id)
          .eq('company_id', companyId)
          .select('id')
          .single();
        if (updErr) throw updErr;
        savedId = updated.id;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('customer_groups')
          .insert(payload)
          .select('id')
          .single();
        if (insErr) throw insErr;
        savedId = inserted.id;
      }

      // 멤버 동기화
      const previousMemberIds = state.group
        ? allCustomers.filter((c) => c.group_id === state.group!.id).map((c) => c.id)
        : [];
      const selectedIds = Array.from(state.selectedMemberIds);
      const toAttach = selectedIds.filter((id) => !previousMemberIds.includes(id));
      const toDetach = previousMemberIds.filter((id) => !selectedIds.includes(id));

      if (toAttach.length > 0) {
        const { error: attachErr } = await supabase
          .from('customers')
          .update({ group_id: savedId })
          .in('id', toAttach)
          .eq('company_id', companyId);
        if (attachErr) throw attachErr;
      }
      if (toDetach.length > 0) {
        const { error: detachErr } = await supabase
          .from('customers')
          .update({ group_id: null })
          .in('id', toDetach)
          .eq('company_id', companyId);
        if (detachErr) throw detachErr;
      }
    },
    onSuccess: (_, state) => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      showToast({
        kind: 'success',
        text: state.group ? '그룹을 수정했습니다.' : '그룹을 생성했습니다.',
      });
      setEditing(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '저장에 실패했습니다.';
      showToast({ kind: 'error', text: msg });
    },
  });

  // ───── Mutation: 삭제 ─────
  const deleteMutation = useMutation({
    mutationFn: async (group: GroupWithMembers) => {
      if (!companyId) throw new Error('회사 정보가 없습니다.');
      if (group.members.length > 0) {
        const { error: detachErr } = await supabase
          .from('customers')
          .update({ group_id: null })
          .eq('group_id', group.id)
          .eq('company_id', companyId);
        if (detachErr) throw detachErr;
      }
      const { error: delErr } = await supabase
        .from('customer_groups')
        .delete()
        .eq('id', group.id)
        .eq('company_id', companyId);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      showToast({ kind: 'success', text: '그룹을 삭제했습니다.' });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.';
      showToast({ kind: 'error', text: msg });
    },
  });

  const openCreate = () => {
    setEditing(emptyEditing());
  };

  const openEdit = (group: GroupWithMembers) => {
    setEditing({
      group,
      name: group.name,
      billing_name: group.billing_name,
      monthly_deduction: String(group.monthly_deduction || ''),
      deduction_note: group.deduction_note ?? '',
      selectedMemberIds: new Set(group.members.map((m) => m.id)),
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '20px 32px 80px',
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 페이지 헤더 */}
        <header style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-num)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            설정 › 거래처 그룹
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="disp"
              style={{
                fontSize: 26,
                fontWeight: 500,
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              거래처 그룹
            </h1>
            <div
              style={{
                display: 'flex',
                gap: 18,
                flex: 1,
                flexWrap: 'wrap',
                paddingBottom: 4,
              }}
            >
              <SummaryItem label="그룹 수" value={`${groups.length}개`} />
              <SummaryItem
                label="그룹 소속 거래처"
                value={`${totalGroupedCustomers}곳`}
              />
              <SummaryItem
                label="독립 거래처"
                value={`${totalUngrouped}곳`}
                tone="muted"
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={openCreate}
                disabled={!companyId || isLoading}
                className="btn-base primary"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Plus size={13} /> 새 그룹 추가
              </button>
            </div>
          </div>
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              margin: '8px 0 0',
              lineHeight: 1.6,
            }}
          >
            여러 거래처가 같은 법인으로 묶이거나, 세금계산서 발행처가 다른
            경우 그룹으로 관리하면 미수금이 통합 집계됩니다. 월 차감액은 매월
            세금계산서 발행 후 자동으로 잔액에서 차감됩니다.
          </p>
        </header>

        {/* 에러 배너 */}
        {error && (
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
            데이터 로딩 실패: {(error as Error).message}
          </div>
        )}

        {/* 로딩 / 빈 상태 / 그룹 목록 */}
        {companyLoading || isLoading ? (
          <EmptyBox label="불러오는 중…" />
        ) : groups.length === 0 ? (
          <EmptyBox label="등록된 그룹이 없습니다. ‘새 그룹 추가’ 버튼으로 시작하세요." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 14,
            }}
          >
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onEdit={() => openEdit(g)}
                onDelete={() => setDeleteTarget(g)}
              />
            ))}
          </div>
        )}
      </main>

      {/* 생성/수정 모달 */}
      {editing && (
        <GroupEditModal
          state={editing}
          allCustomers={allCustomers}
          groups={groups}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => saveMutation.mutate(editing)}
          busy={saveMutation.isPending}
        />
      )}

      {/* 삭제 확인 */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          busy={deleteMutation.isPending}
          confirmLabel="삭제"
          confirmVariant="danger"
          title={`‘${deleteTarget.name}’ 그룹 삭제`}
          body={
            deleteTarget.members.length > 0
              ? `이 그룹을 삭제하면 소속 ${deleteTarget.members.length}개 거래처가 독립 거래처로 전환됩니다. 거래처 자체는 삭제되지 않습니다.`
              : '이 그룹을 삭제합니다. 되돌릴 수 없습니다.'
          }
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 그룹 카드
// ───────────────────────────────────────────────────────────

function GroupCard({
  group,
  onEdit,
  onDelete,
}: {
  group: GroupWithMembers;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div
            className="disp"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 4,
            }}
          >
            {group.name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-kr)',
            }}
          >
            세금계산서 발행명: {group.billing_name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <IconBtn label="수정" onClick={onEdit}>
            <Pencil size={13} strokeWidth={1.8} />
          </IconBtn>
          <IconBtn label="삭제" onClick={onDelete} tone="danger">
            <Trash2 size={13} strokeWidth={1.8} />
          </IconBtn>
        </div>
      </div>

      {group.monthly_deduction > 0 && (
        <div
          style={{
            padding: '8px 10px',
            background: 'var(--brand-wash)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--brand)',
            lineHeight: 1.5,
          }}
        >
          <div
            className="num"
            style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            ₩{group.monthly_deduction.toLocaleString('ko-KR')} / 월 차감
          </div>
          {group.deduction_note && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>
              {group.deduction_note}
            </div>
          )}
        </div>
      )}

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            color: 'var(--ink-3)',
            marginBottom: 6,
            fontFamily: 'var(--font-num)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <Users size={12} strokeWidth={1.8} />
          소속 거래처 {group.members.length}곳
        </div>
        {group.members.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            아직 멤버가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {group.members.map((m) => (
              <span
                key={m.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 999,
                  fontSize: 11.5,
                  color: m.is_active ? 'var(--ink)' : 'var(--ink-3)',
                }}
                title={m.is_active ? '' : '비활성 거래처'}
              >
                {m.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  tone?: 'danger';
}) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--ink-2)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--line)',
        borderRadius: 6,
        cursor: 'pointer',
        color,
      }}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// 생성/수정 모달
// ───────────────────────────────────────────────────────────

function GroupEditModal({
  state,
  allCustomers,
  groups,
  onChange,
  onClose,
  onSave,
  busy,
}: {
  state: EditingState;
  allCustomers: CustomerLite[];
  groups: GroupWithMembers[];
  onChange: (next: EditingState) => void;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const [memberQuery, setMemberQuery] = useState('');

  // 거래처 → 현재 소속 그룹명 맵 (다른 그룹 안내용)
  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const filteredCustomers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCustomers, memberQuery]);

  const toggleMember = (id: string) => {
    const next = new Set(state.selectedMemberIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...state, selectedMemberIds: next });
  };

  const canSave =
    state.name.trim().length > 0 &&
    state.billing_name.trim().length > 0 &&
    !busy;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={state.group ? '그룹 수정' : '새 그룹 추가'}
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
            onClick={onSave}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="그룹명 (표시용)" required>
          <input
            type="text"
            value={state.name}
            onChange={(e) => onChange({ ...state, name: e.target.value })}
            placeholder="예: 알파문구"
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        <Field label="세금계산서 발행명" required>
          <input
            type="text"
            value={state.billing_name}
            onChange={(e) =>
              onChange({ ...state, billing_name: e.target.value })
            }
            placeholder="예: (주)알파문구"
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        <Field
          label="월 차감액 (원, VAT 포함)"
          hint="매월 미수금에서 자동 차감되는 고정 금액. 없으면 0."
        >
          <input
            type="number"
            inputMode="numeric"
            value={state.monthly_deduction}
            onChange={(e) =>
              onChange({ ...state, monthly_deduction: e.target.value })
            }
            placeholder="0"
            min={0}
            disabled={busy}
            style={inputStyle}
          />
        </Field>

        <Field label="차감 메모" hint="차감 사유를 기록 (예: 시스템이용료)">
          <textarea
            value={state.deduction_note}
            onChange={(e) =>
              onChange({ ...state, deduction_note: e.target.value })
            }
            placeholder="선택 입력"
            rows={2}
            disabled={busy}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
          />
        </Field>

        <Field label={`소속 거래처 (${state.selectedMemberIds.size}곳 선택)`}>
          <input
            type="search"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="거래처명 검색"
            disabled={busy}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--surface-2)',
            }}
          >
            {filteredCustomers.length === 0 ? (
              <div
                style={{
                  padding: '12px 14px',
                  fontSize: 12,
                  color: 'var(--ink-3)',
                }}
              >
                검색 결과가 없습니다.
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const checked = state.selectedMemberIds.has(c.id);
                const otherGroupName =
                  c.group_id && c.group_id !== state.group?.id
                    ? groupNameById.get(c.group_id)
                    : null;
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      borderBottom: '1px solid var(--line)',
                      fontSize: 12.5,
                      background: checked ? 'var(--brand-wash)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(c.id)}
                      disabled={busy}
                    />
                    <span
                      style={{
                        flex: 1,
                        color: c.is_active ? 'var(--ink)' : 'var(--ink-3)',
                      }}
                    >
                      {c.name}
                      {!c.is_active && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10.5,
                            color: 'var(--ink-3)',
                          }}
                        >
                          (비활성)
                        </span>
                      )}
                    </span>
                    {otherGroupName && (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--warning, var(--ink-3))',
                          fontStyle: 'italic',
                        }}
                      >
                        현재: {otherGroupName}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          <p
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              margin: '6px 0 0',
              lineHeight: 1.5,
            }}
          >
            이미 다른 그룹에 속한 거래처를 선택하면 자동으로 새 그룹으로 이동합니다.
          </p>
        </Field>
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────
// 작은 조각들
// ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

function EmptyBox({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '40px 16px',
        textAlign: 'center',
        background: 'var(--surface)',
        border: '1px dashed var(--line)',
        borderRadius: 12,
        color: 'var(--ink-3)',
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'muted';
}) {
  const color = tone === 'muted' ? 'var(--ink-3)' : 'var(--ink)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}
