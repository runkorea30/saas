/**
 * 재고 실사 페이지 — 재고매입 > 재고실사
 *
 * 흐름: 실사 목록 → 새 실사 시작(스냅샷) → 수량 입력 → 확정(조정 트랜잭션)
 *
 * 핵심 규칙:
 *  - counted_qty = null → 장부와 동일(일치)로 간주, 확정 시 조정 트랜잭션 생성 안 함
 *  - counted_qty 입력 시 diff 도 함께 UPDATE (DB 트리거 없음)
 *  - 정렬: category ASC → name ASC
 *  - 카테고리 필터: select 드롭다운
 *
 * 🔴 company_id 는 useCompany() 에서만.
 * 🔴 fetchAllRows 경유.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Check, Plus, X } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useProducts } from '@/hooks/queries/useProducts';
import { calcCurrentStockByProduct } from '@/utils/calculations';
import { getCategoryLabel } from '@/constants/categories';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ── 타입 ──────────────────────────────────────

interface AuditHeader {
  id: string;
  name: string;
  status: 'draft' | 'confirmed';
  started_at: string | null;
  confirmed_at: string | null;
  notes: string | null;
}

interface AuditItem {
  id: string;
  product_id: string;
  snapshot_qty: number;
  counted_qty: number | null;
  diff: number | null;
  notes: string | null;
}

type FilterStatus = 'all' | 'diff' | 'uncounted';

// ── 쿼리 훅 ──────────────────────────────────

function useAuditList(companyId: string | null) {
  return useQuery<AuditHeader[]>({
    queryKey: ['audit-list', companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchAllRows<AuditHeader>(() =>
        supabase
          .from('inventory_audits')
          .select('id, name, status, started_at, confirmed_at, notes')
          .eq('company_id', companyId!)
          .order('created_at', { ascending: false }),
      ),
    staleTime: 30_000,
  });
}

function useAuditItems(auditId: string | null) {
  return useQuery<AuditItem[]>({
    queryKey: ['audit-items', auditId],
    enabled: Boolean(auditId),
    queryFn: () =>
      fetchAllRows<AuditItem>(() =>
        supabase
          .from('inventory_audit_items')
          .select('id, product_id, snapshot_qty, counted_qty, diff, notes')
          .eq('audit_id', auditId!),
      ),
    staleTime: 10_000,
  });
}

// ── 메인 컴포넌트 ──────────────────────────────

export function InventoryAuditPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const productsQuery = useProducts(companyId);
  const auditListQuery = useAuditList(companyId);

  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmConfirm, setConfirmConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAuditName, setNewAuditName] = useState('');

  const auditItemsQuery = useAuditItems(activeAuditId);
  const activeAudit = auditListQuery.data?.find((a) => a.id === activeAuditId) ?? null;
  const isConfirmed = activeAudit?.status === 'confirmed';

  const productMap = useMemo(() => {
    const m = new Map<string, { code: string; name: string; unit: string; category: string }>();
    for (const p of productsQuery.data ?? []) {
      m.set(p.id, { code: p.code, name: p.name, unit: p.unit, category: p.category });
    }
    return m;
  }, [productsQuery.data]);

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    for (const p of productsQuery.data ?? []) {
      if (p.category) cats.add(p.category);
    }
    return [...cats].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [productsQuery.data]);

  const mergedItems = useMemo(() => {
    return (auditItemsQuery.data ?? []).map((item) => ({
      ...item,
      product: productMap.get(item.product_id) ?? {
        code: '?',
        name: '알 수 없음',
        unit: 'EA',
        category: '',
      },
    }));
  }, [auditItemsQuery.data, productMap]);

  // 필터 + 검색 + 정렬 (category ASC → name ASC)
  const filteredItems = useMemo(() => {
    let list = mergedItems;

    if (filterCategory) {
      list = list.filter((i) => i.product.category === filterCategory);
    }

    if (filterStatus === 'diff') {
      list = list.filter(
        (i) => i.counted_qty !== null && i.diff !== null && i.diff !== 0,
      );
    } else if (filterStatus === 'uncounted') {
      list = list.filter((i) => i.counted_qty === null);
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          i.product.code.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      const catCmp = a.product.category.localeCompare(b.product.category, 'ko');
      if (catCmp !== 0) return catCmp;
      return a.product.name.localeCompare(b.product.name, 'ko');
    });
  }, [mergedItems, filterStatus, filterCategory, searchText]);

  // 미입력 = 일치로 간주
  const stats = useMemo(() => {
    const total = mergedItems.length;
    const uncounted = mergedItems.filter((i) => i.counted_qty === null).length;
    const diffItems = mergedItems.filter(
      (i) => i.counted_qty !== null && i.diff !== null && i.diff !== 0,
    );
    const diffCount = diffItems.length;
    const diffPlus = diffItems
      .filter((i) => (i.diff ?? 0) > 0)
      .reduce((s, i) => s + (i.diff ?? 0), 0);
    const diffMinus = diffItems
      .filter((i) => (i.diff ?? 0) < 0)
      .reduce((s, i) => s + (i.diff ?? 0), 0);
    return { total, uncounted, diffCount, diffPlus, diffMinus };
  }, [mergedItems]);

  // ── 새 실사 생성 ──────────────────────────────

  const handleCreateAudit = async () => {
    if (!companyId || !newAuditName.trim()) return;
    setBusy(true);
    try {
      const stockMap = await calcCurrentStockByProduct(companyId);

      const { data: audit, error: auditErr } = await supabase
        .from('inventory_audits')
        .insert({
          company_id: companyId,
          name: newAuditName.trim(),
          status: 'draft',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (auditErr || !audit) throw auditErr ?? new Error('실사 생성 실패');

      const products = productsQuery.data ?? [];
      const items = products.map((p) => ({
        audit_id: audit.id,
        company_id: companyId,
        product_id: p.id,
        snapshot_qty: stockMap.get(p.id)?.current ?? 0,
      }));

      for (let i = 0; i < items.length; i += 100) {
        const { error } = await supabase
          .from('inventory_audit_items')
          .insert(items.slice(i, i + 100));
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ['audit-list', companyId] });
      setActiveAuditId(audit.id);
      setShowNewForm(false);
      setNewAuditName('');
      showToast({
        kind: 'success',
        text: `실사 시작: ${newAuditName.trim()} (${items.length}개 제품)`,
      });
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '실사 생성 실패' });
    } finally {
      setBusy(false);
    }
  };

  // ── 실사 수량 저장 (counted_qty + diff 동시 갱신) ─────

  const handleCountedQtyChange = async (itemId: string, raw: string) => {
    const val =
      raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw)));
    if (raw.trim() !== '' && !Number.isFinite(val)) return;
    const { error } = await supabase
      .from('inventory_audit_items')
      .update({ counted_qty: val, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) {
      showToast({ kind: 'error', text: '저장 실패: ' + error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['audit-items', activeAuditId] });
  };

  const handleNotesChange = async (itemId: string, notes: string) => {
    await supabase
      .from('inventory_audit_items')
      .update({ notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    queryClient.invalidateQueries({ queryKey: ['audit-items', activeAuditId] });
  };

  // ── 실사 확정 ──────────────────────────────────
  // counted_qty = null 항목은 일치로 간주 → 조정 트랜잭션 생성 안 함

  const handleConfirmAudit = async () => {
    if (!companyId || !activeAuditId) return;
    setBusy(true);
    try {
      const diffItems = mergedItems.filter(
        (i) => i.counted_qty !== null && i.diff !== null && i.diff !== 0,
      );

      for (const item of diffItems) {
        const { error } = await supabase.from('inventory_transactions').insert({
          company_id: companyId,
          product_id: item.product_id,
          type: (item.diff ?? 0) > 0 ? 'adjustment_in' : 'adjustment_out',
          quantity: Math.abs(item.diff!),
          transaction_date: new Date().toISOString(),
          memo: `재고실사 조정 (${activeAudit?.name ?? ''})`,
        });
        if (error) throw error;
      }

      await supabase
        .from('inventory_audits')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeAuditId);

      await queryClient.invalidateQueries({ queryKey: ['audit-list', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-stock', companyId] });
      showToast({
        kind: 'success',
        text: `실사 확정 완료 — 조정 ${diffItems.length}건 재고 반영`,
      });
      setConfirmConfirm(false);
      setActiveAuditId(null);
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '확정 실패' });
    } finally {
      setBusy(false);
    }
  };

  // ── 실사 삭제 ──────────────────────────────────

  const handleDeleteAudit = async () => {
    if (!activeAuditId) return;
    setBusy(true);
    try {
      await supabase.from('inventory_audits').delete().eq('id', activeAuditId);
      await queryClient.invalidateQueries({ queryKey: ['audit-list', companyId] });
      setActiveAuditId(null);
      setConfirmDelete(false);
      showToast({ kind: 'success', text: '실사가 삭제되었습니다.' });
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '삭제 실패' });
    } finally {
      setBusy(false);
    }
  };

  // ── 렌더링 ────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh' }}>
      <main style={{ padding: '20px 32px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            재고매입 › 재고실사
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeAuditId && (
                <button
                  type="button"
                  className="btn-base"
                  onClick={() => {
                    setActiveAuditId(null);
                    setFilterStatus('all');
                    setFilterCategory('');
                    setSearchText('');
                  }}
                  style={{ height: 32, fontSize: 12.5 }}
                >
                  <ChevronLeft size={14} /> 목록
                </button>
              )}
              <h1 className="disp" style={{ fontSize: 26, fontWeight: 500, margin: 0 }}>
                {activeAudit ? activeAudit.name : '재고 실사'}
              </h1>
              {activeAudit && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: isConfirmed ? 'var(--success-wash)' : 'var(--warning-wash)',
                    color: isConfirmed ? 'var(--success)' : 'var(--warning)',
                  }}
                >
                  {isConfirmed ? '확정완료' : '진행중'}
                </span>
              )}
            </div>

            {!activeAuditId && (
              <button
                type="button"
                className="btn-base primary"
                onClick={() => setShowNewForm(true)}
                style={{ height: 32, fontSize: 12.5 }}
                disabled={busy || productsQuery.isLoading}
              >
                <Plus size={14} /> 새 실사 시작
              </button>
            )}

            {activeAuditId && !isConfirmed && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-base"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  style={{ height: 32, fontSize: 12.5, color: 'var(--danger)' }}
                >
                  <X size={14} /> 삭제
                </button>
                <button
                  type="button"
                  className="btn-base primary"
                  onClick={() => setConfirmConfirm(true)}
                  disabled={busy}
                  style={{ height: 32, fontSize: 12.5 }}
                >
                  <Check size={14} /> 실사 확정
                </button>
              </div>
            )}
          </div>
        </header>

        {showNewForm && !activeAuditId && (
          <div
            style={{
              padding: 14,
              marginBottom: 16,
              border: '1px solid var(--line)',
              borderRadius: 10,
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              type="text"
              autoFocus
              value={newAuditName}
              onChange={(e) => setNewAuditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateAudit();
                if (e.key === 'Escape') setShowNewForm(false);
              }}
              placeholder="실사명 입력 (예: 2026년 6월 정기실사)"
              style={{
                flex: 1,
                height: 34,
                padding: '0 12px',
                border: '1px solid var(--line-strong)',
                borderRadius: 6,
                fontSize: 13,
                background: 'var(--surface)',
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              className="btn-base primary"
              onClick={() => void handleCreateAudit()}
              disabled={busy || !newAuditName.trim()}
              style={{ height: 34, fontSize: 12.5 }}
            >
              {busy ? '생성 중…' : '시작'}
            </button>
            <button
              type="button"
              className="btn-base"
              onClick={() => setShowNewForm(false)}
              style={{ height: 34, fontSize: 12.5 }}
            >
              취소
            </button>
          </div>
        )}

        {!activeAuditId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {auditListQuery.isLoading && (
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>불러오는 중…</div>
            )}
            {(auditListQuery.data ?? []).length === 0 && !auditListQuery.isLoading && (
              <div
                style={{
                  padding: 40,
                  textAlign: 'center',
                  color: 'var(--ink-3)',
                  fontSize: 13,
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: 'var(--surface)',
                }}
              >
                실사 이력이 없습니다. [새 실사 시작]으로 시작하세요.
              </div>
            )}
            {(auditListQuery.data ?? []).map((audit) => (
              <button
                key={audit.id}
                type="button"
                onClick={() => setActiveAuditId(audit.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 18px',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    flexShrink: 0,
                    background:
                      audit.status === 'confirmed'
                        ? 'var(--success-wash)'
                        : 'var(--warning-wash)',
                    color:
                      audit.status === 'confirmed' ? 'var(--success)' : 'var(--warning)',
                  }}
                >
                  {audit.status === 'confirmed' ? '확정' : '진행중'}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{audit.name}</span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    marginLeft: 'auto',
                    flexShrink: 0,
                  }}
                >
                  {audit.started_at
                    ? new Date(audit.started_at).toLocaleDateString('ko-KR')
                    : ''}
                  {audit.confirmed_at
                    ? ` → 확정 ${new Date(audit.confirmed_at).toLocaleDateString('ko-KR')}`
                    : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {activeAuditId && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {([
                {
                  label: '전체 품목',
                  value: `${stats.total}개`,
                  sub: `미입력 ${stats.uncounted}개 (일치로 간주)`,
                },
                {
                  label: '차이 발생',
                  value: `${stats.diffCount}개`,
                  tone: stats.diffCount > 0 ? 'danger' : 'success',
                },
                { label: '재고 초과 (+)', value: `+${stats.diffPlus}`, tone: 'info' },
                {
                  label: '재고 부족 (−)',
                  value: `${stats.diffMinus}`,
                  tone: stats.diffMinus < 0 ? 'danger' : undefined,
                },
              ] as { label: string; value: string; sub?: string; tone?: 'danger' | 'success' | 'info' }[]).map(
                ({ label, value, sub, tone }) => (
                  <div
                    key={label}
                    style={{
                      padding: '12px 16px',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      background: 'var(--surface)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
                      {label}
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 18,
                        color:
                          tone === 'danger'
                            ? 'var(--danger)'
                            : tone === 'success'
                              ? 'var(--success)'
                              : tone === 'info'
                                ? 'var(--info)'
                                : 'var(--ink)',
                      }}
                    >
                      {value}
                    </div>
                    {sub && (
                      <div
                        style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}
                      >
                        {sub}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {([
                { key: 'all' as FilterStatus, label: '전체' },
                { key: 'diff' as FilterStatus, label: `차이 항목 (${stats.diffCount})` },
                { key: 'uncounted' as FilterStatus, label: `미입력 (${stats.uncounted})` },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterStatus(key)}
                  className={filterStatus === key ? 'btn-base primary' : 'btn-base'}
                  style={{ height: 30, fontSize: 12, padding: '0 12px' }}
                >
                  {label}
                </button>
              ))}

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  height: 30,
                  padding: '0 8px',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">전체 분류</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="제품명 / 코드 검색"
                style={{
                  marginLeft: 'auto',
                  height: 30,
                  padding: '0 10px',
                  width: 180,
                  border: '1px solid var(--line-strong)',
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>

            {!isConfirmed && (
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                  marginBottom: 10,
                  lineHeight: 1.6,
                }}
              >
                💡 장부와 일치하는 제품은 실사수량을 <strong>비워두면</strong> 됩니다.
                수량을 입력한 경우에만 차이가 계산되고 확정 시 재고가 조정됩니다.
              </div>
            )}

            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <colgroup>
                  <col style={{ width: 130 }} />
                  <col style={{ width: 90 }} />
                  <col />
                  <col style={{ width: 44 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: 'var(--surface-2, #f5f5f5)' }}>
                    {[
                      { label: '분류', align: 'left' as const },
                      { label: '제품코드', align: 'center' as const },
                      { label: '제품명', align: 'left' as const },
                      { label: '단위', align: 'center' as const },
                      { label: '장부재고', align: 'right' as const },
                      { label: '실사수량', align: 'center' as const },
                      { label: '차이', align: 'center' as const },
                      { label: '비고', align: 'left' as const },
                    ].map(({ label, align }) => (
                      <th
                        key={label}
                        style={{
                          padding: '7px 6px',
                          textAlign: align,
                          fontWeight: 600,
                          fontSize: 11.5,
                          borderBottom: '1px solid var(--line)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditItemsQuery.isLoading ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}
                      >
                        불러오는 중…
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{ padding: 30, textAlign: 'center', color: 'var(--ink-3)' }}
                      >
                        항목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const hasCounted = item.counted_qty !== null;
                      const diff = hasCounted ? item.diff : null;
                      const diffColor =
                        diff === null
                          ? 'var(--ink-3)'
                          : diff === 0
                            ? 'var(--success)'
                            : diff > 0
                              ? 'var(--info)'
                              : 'var(--danger)';
                      const rowBg =
                        hasCounted && diff !== null && diff !== 0
                          ? diff > 0
                            ? 'var(--info-wash, #EFF6FF)'
                            : 'var(--danger-wash)'
                          : idx % 2 === 0
                            ? 'var(--surface)'
                            : 'var(--surface-2, #f9f9f9)';

                      return (
                        <tr
                          key={item.id}
                          style={{
                            background: rowBg,
                            borderBottom: '1px solid var(--line)',
                          }}
                        >
                          <td
                            style={{
                              padding: '5px 6px',
                              fontSize: 11,
                              color: 'var(--ink-2)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 130,
                            }}
                          >
                            {getCategoryLabel(item.product.category)}
                          </td>
                          <td
                            style={{
                              padding: '5px 6px',
                              textAlign: 'center',
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: 'var(--ink-3)',
                            }}
                          >
                            {item.product.code}
                          </td>
                          <td style={{ padding: '5px 6px', fontWeight: 500 }}>
                            {item.product.name}
                          </td>
                          <td
                            style={{
                              padding: '5px 6px',
                              textAlign: 'center',
                              fontSize: 11,
                              color: 'var(--ink-3)',
                            }}
                          >
                            {item.product.unit}
                          </td>
                          <td
                            style={{
                              padding: '5px 6px',
                              textAlign: 'right',
                              fontWeight: 600,
                              fontFamily: 'var(--font-num)',
                            }}
                          >
                            {item.snapshot_qty.toLocaleString('ko-KR')}
                          </td>
                          <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                            {isConfirmed ? (
                              <span
                                style={{
                                  fontWeight: 600,
                                  color:
                                    item.counted_qty === null ? 'var(--ink-3)' : 'var(--ink)',
                                }}
                              >
                                {item.counted_qty?.toLocaleString('ko-KR') ?? '—'}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                defaultValue={item.counted_qty ?? ''}
                                placeholder="—"
                                onBlur={(e) =>
                                  void handleCountedQtyChange(item.id, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter')
                                    (e.target as HTMLInputElement).blur();
                                }}
                                style={{
                                  width: 76,
                                  height: 26,
                                  padding: '0 6px',
                                  textAlign: 'right',
                                  border: `1px solid ${
                                    !hasCounted
                                      ? 'var(--line)'
                                      : diff === 0
                                        ? 'var(--success)'
                                        : 'var(--warning)'
                                  }`,
                                  borderRadius: 5,
                                  fontSize: 12.5,
                                  outline: 'none',
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                }}
                              />
                            )}
                          </td>
                          <td
                            style={{
                              padding: '5px 6px',
                              textAlign: 'center',
                              fontWeight: 700,
                              color: diffColor,
                              fontSize: 12.5,
                            }}
                          >
                            {diff === null
                              ? '—'
                              : diff === 0
                                ? '✓'
                                : `${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}`}
                          </td>
                          <td style={{ padding: '3px 4px' }}>
                            {isConfirmed ? (
                              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                                {item.notes ?? ''}
                              </span>
                            ) : (
                              <input
                                type="text"
                                defaultValue={item.notes ?? ''}
                                placeholder="비고"
                                onBlur={(e) =>
                                  void handleNotesChange(item.id, e.target.value)
                                }
                                style={{
                                  width: '100%',
                                  height: 24,
                                  padding: '0 5px',
                                  border: '1px solid var(--line)',
                                  borderRadius: 4,
                                  fontSize: 11.5,
                                  outline: 'none',
                                  background: 'transparent',
                                  color: 'var(--ink)',
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmConfirm}
        onClose={() => setConfirmConfirm(false)}
        title="실사 확정"
        body={
          <>
            수량을 입력한 항목 중 차이가 있는{' '}
            <strong>{stats.diffCount}개 항목</strong>의 재고를 조정합니다.
            <br />
            미입력 항목({stats.uncounted}개)은 장부와 동일한 것으로 간주합니다.
            <br />
            확정 후에는 수정이 불가능합니다. 진행하시겠습니까?
          </>
        }
        confirmLabel="확정"
        onConfirm={() => void handleConfirmAudit()}
        busy={busy}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="실사 삭제"
        body="진행 중인 실사를 삭제합니다. 입력한 수량이 모두 사라집니다."
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={() => void handleDeleteAudit()}
        busy={busy}
      />
    </div>
  );
}
