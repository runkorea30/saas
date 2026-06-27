/**
 * 모바일 재고실사 — /mobile/audit
 *
 * 흐름: 실사 목록 → 새 실사 시작 → 수량 입력(1개씩 세로 카드) → 확정
 *
 * 핵심 규칙:
 *  - counted_qty = null → 일치로 간주, 확정 시 조정 안 함
 *  - diff 는 DB generated column — 클라이언트 write 안 함
 *  - 정렬: category ASC → name ASC
 *  - 카테고리 select 필터
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useProducts } from '@/hooks/queries/useProducts';
import { calcCurrentStockByProduct } from '@/utils/calculations';
import { getCategoryLabel } from '@/constants/categories';
import { useToast } from '@/components/ui/Toast';
import { RefreshButton } from '../components/RefreshButton';

// ── 타입 ──────────────────────────────────────

interface AuditHeader {
  id: string;
  name: string;
  status: 'draft' | 'confirmed';
  started_at: string | null;
  confirmed_at: string | null;
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
          .select('id, name, status, started_at, confirmed_at')
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

// ── 컴포넌트 ──────────────────────────────────

export function AuditPage() {
  const { companyId } = useCompany();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const productsQuery = useProducts(companyId);
  const auditListQuery = useAuditList(companyId);

  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAuditName, setNewAuditName] = useState('');
  const [confirmMode, setConfirmMode] = useState<null | 'confirm' | 'delete'>(null);

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

  const mergedItems = useMemo(
    () =>
      (auditItemsQuery.data ?? []).map((item) => ({
        ...item,
        product: productMap.get(item.product_id) ?? {
          code: '?',
          name: '알 수 없음',
          unit: 'EA',
          category: '',
        },
      })),
    [auditItemsQuery.data, productMap],
  );

  const filteredItems = useMemo(() => {
    let list = mergedItems;
    if (filterCategory) list = list.filter((i) => i.product.category === filterCategory);
    if (filterStatus === 'diff')
      list = list.filter(
        (i) => i.counted_qty !== null && i.diff !== null && i.diff !== 0,
      );
    if (filterStatus === 'uncounted')
      list = list.filter((i) => i.counted_qty === null);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          i.product.code.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const c = a.product.category.localeCompare(b.product.category, 'ko');
      return c !== 0 ? c : a.product.name.localeCompare(b.product.name, 'ko');
    });
  }, [mergedItems, filterStatus, filterCategory, searchText]);

  const stats = useMemo(() => {
    const total = mergedItems.length;
    const uncounted = mergedItems.filter((i) => i.counted_qty === null).length;
    const diffItems = mergedItems.filter(
      (i) => i.counted_qty !== null && i.diff !== null && i.diff !== 0,
    );
    return { total, uncounted, diffCount: diffItems.length };
  }, [mergedItems]);

  // ── 액션 ──

  const handleCreateAudit = async () => {
    if (!companyId || !newAuditName.trim()) return;
    setBusy(true);
    try {
      const stockMap = await calcCurrentStockByProduct(companyId);
      const { data: audit, error } = await supabase
        .from('inventory_audits')
        .insert({
          company_id: companyId,
          name: newAuditName.trim(),
          status: 'draft',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error || !audit) throw error ?? new Error('생성 실패');

      const products = productsQuery.data ?? [];
      const items = products.map((p) => ({
        audit_id: audit.id,
        company_id: companyId,
        product_id: p.id,
        snapshot_qty: stockMap.get(p.id)?.current ?? 0,
      }));
      for (let i = 0; i < items.length; i += 100) {
        const { error: ie } = await supabase
          .from('inventory_audit_items')
          .insert(items.slice(i, i + 100));
        if (ie) throw ie;
      }
      await queryClient.invalidateQueries({ queryKey: ['audit-list', companyId] });
      setActiveAuditId(audit.id);
      setShowNewForm(false);
      setNewAuditName('');
      showToast({ kind: 'success', text: `실사 시작 (${items.length}개 제품)` });
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '생성 실패' });
    } finally {
      setBusy(false);
    }
  };

  const handleCountedQtyChange = async (itemId: string, raw: string) => {
    const val =
      raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw)));
    if (raw.trim() !== '' && !Number.isFinite(val)) return;
    const { error } = await supabase
      .from('inventory_audit_items')
      .update({ counted_qty: val, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) {
      showToast({ kind: 'error', text: '저장 실패' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['audit-items', activeAuditId] });
  };

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
      showToast({ kind: 'success', text: `확정 완료 — 조정 ${diffItems.length}건` });
      setConfirmMode(null);
      setActiveAuditId(null);
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '확정 실패' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAudit = async () => {
    if (!activeAuditId) return;
    setBusy(true);
    try {
      await supabase.from('inventory_audits').delete().eq('id', activeAuditId);
      await queryClient.invalidateQueries({ queryKey: ['audit-list', companyId] });
      setActiveAuditId(null);
      setConfirmMode(null);
      showToast({ kind: 'success', text: '삭제 완료' });
    } catch (e) {
      showToast({ kind: 'error', text: e instanceof Error ? e.message : '삭제 실패' });
    } finally {
      setBusy(false);
    }
  };

  // ── 렌더링 ──

  return (
    <div>
      <header className="m-page-header" style={{ paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeAuditId ? (
            <button
              type="button"
              className="m-back-btn"
              onClick={() => {
                setActiveAuditId(null);
                setFilterStatus('all');
                setFilterCategory('');
                setSearchText('');
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 20,
                color: 'var(--m-text)',
                padding: '0 4px',
              }}
            >
              ‹
            </button>
          ) : null}
          <h1 className="m-page-title">
            {activeAudit ? activeAudit.name : '재고 실사'}
          </h1>
          {activeAudit && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 999,
                background: isConfirmed
                  ? 'var(--m-success-wash, #f0fdf4)'
                  : 'var(--m-warning-wash, #fffbeb)',
                color: isConfirmed
                  ? 'var(--m-success, #22c55e)'
                  : 'var(--m-warning, #f59e0b)',
              }}
            >
              {isConfirmed ? '확정' : '진행중'}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {!activeAuditId && (
            <RefreshButton
              onClick={() => {
                auditListQuery.refetch();
              }}
              refreshing={auditListQuery.isFetching}
            />
          )}
        </div>
      </header>

      <div style={{ padding: '8px 12px 80px' }}>
        {!activeAuditId && (
          <>
            {!showNewForm ? (
              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                disabled={busy || productsQuery.isLoading}
                style={{
                  width: '100%',
                  height: 44,
                  marginBottom: 12,
                  border: '1px dashed var(--m-border)',
                  borderRadius: 10,
                  background: 'var(--m-surface)',
                  color: 'var(--m-primary)',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + 새 실사 시작
              </button>
            ) : (
              <div
                style={{
                  padding: 12,
                  marginBottom: 12,
                  border: '1px solid var(--m-border)',
                  borderRadius: 10,
                  background: 'var(--m-surface)',
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
                  placeholder="실사명 (예: 2026년 6월 정기실사)"
                  style={{
                    width: '100%',
                    height: 36,
                    padding: '0 10px',
                    marginBottom: 8,
                    border: '1px solid var(--m-border-strong)',
                    borderRadius: 8,
                    fontSize: 13,
                    background: 'var(--m-surface)',
                    color: 'var(--m-text)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void handleCreateAudit()}
                    disabled={busy || !newAuditName.trim()}
                    style={{
                      flex: 1,
                      height: 36,
                      border: 'none',
                      borderRadius: 8,
                      background: 'var(--m-primary)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: busy || !newAuditName.trim() ? 0.6 : 1,
                    }}
                  >
                    {busy ? '생성 중…' : '시작'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewForm(false)}
                    style={{
                      height: 36,
                      padding: '0 16px',
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      background: 'var(--m-surface)',
                      color: 'var(--m-text)',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            {auditListQuery.isLoading ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--m-text-secondary)',
                  fontSize: 13,
                  padding: 20,
                }}
              >
                불러오는 중…
              </div>
            ) : (auditListQuery.data ?? []).length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--m-text-secondary)',
                  fontSize: 13,
                  padding: 32,
                }}
              >
                실사 이력이 없습니다.
              </div>
            ) : (
              (auditListQuery.data ?? []).map((audit) => (
                <button
                  key={audit.id}
                  type="button"
                  onClick={() => setActiveAuditId(audit.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    marginBottom: 8,
                    border: '1px solid var(--m-border)',
                    borderRadius: 10,
                    background: 'var(--m-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 999,
                      flexShrink: 0,
                      background:
                        audit.status === 'confirmed'
                          ? 'var(--m-success-wash, #f0fdf4)'
                          : 'var(--m-warning-wash, #fffbeb)',
                      color:
                        audit.status === 'confirmed'
                          ? 'var(--m-success, #22c55e)'
                          : 'var(--m-warning, #f59e0b)',
                    }}
                  >
                    {audit.status === 'confirmed' ? '확정' : '진행중'}
                  </span>
                  <span
                    style={{ fontWeight: 600, fontSize: 13, color: 'var(--m-text)' }}
                  >
                    {audit.name}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      color: 'var(--m-text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {audit.started_at
                      ? new Date(audit.started_at).toLocaleDateString('ko-KR')
                      : ''}
                  </span>
                </button>
              ))
            )}
          </>
        )}

        {activeAuditId && (
          <>
            <div
              style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
            >
              {[
                {
                  label: '전체',
                  value: stats.total,
                  sub: `미입력 ${stats.uncounted}`,
                  danger: false,
                },
                {
                  label: '차이',
                  value: stats.diffCount,
                  danger: stats.diffCount > 0,
                },
              ].map(({ label, value, sub, danger }) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    padding: '10px 12px',
                    border: `1px solid ${
                      danger ? 'var(--m-danger, #ef4444)' : 'var(--m-border)'
                    }`,
                    borderRadius: 10,
                    background: 'var(--m-surface)',
                  }}
                >
                  <div style={{ fontSize: 10.5, color: 'var(--m-text-secondary)' }}>
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: danger ? 'var(--m-danger, #ef4444)' : 'var(--m-text)',
                    }}
                  >
                    {value}
                  </div>
                  {sub && (
                    <div style={{ fontSize: 10, color: 'var(--m-text-secondary)' }}>
                      {sub}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 8,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {(
                [
                  { key: 'all' as FilterStatus, label: '전체' },
                  { key: 'diff' as FilterStatus, label: `차이(${stats.diffCount})` },
                  { key: 'uncounted' as FilterStatus, label: `미입력(${stats.uncounted})` },
                ]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterStatus(key)}
                  style={{
                    flexShrink: 0,
                    height: 28,
                    padding: '0 12px',
                    borderRadius: 999,
                    border: `1px solid ${
                      filterStatus === key ? 'var(--m-primary)' : 'var(--m-border)'
                    }`,
                    background:
                      filterStatus === key
                        ? 'var(--m-primary)'
                        : 'var(--m-surface)',
                    color: filterStatus === key ? '#fff' : 'var(--m-text)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  flexShrink: 0,
                  height: 28,
                  padding: '0 6px',
                  border: '1px solid var(--m-border)',
                  borderRadius: 999,
                  fontSize: 12,
                  background: 'var(--m-surface)',
                  color: 'var(--m-text)',
                  outline: 'none',
                }}
              >
                <option value="">전체 분류</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="제품명 / 코드 검색"
              style={{
                width: '100%',
                height: 32,
                padding: '0 10px',
                marginBottom: 10,
                border: '1px solid var(--m-border-strong)',
                borderRadius: 8,
                fontSize: 12.5,
                background: 'var(--m-surface)',
                color: 'var(--m-text)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {!isConfirmed && (
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--m-text-secondary)',
                  marginBottom: 10,
                  lineHeight: 1.5,
                  padding: '8px 12px',
                  background: 'var(--m-surface-2)',
                  borderRadius: 8,
                }}
              >
                💡 장부와 일치하면 수량 입력 생략 가능
              </div>
            )}

            {auditItemsQuery.isLoading ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--m-text-secondary)',
                  padding: 20,
                }}
              >
                불러오는 중…
              </div>
            ) : (
              filteredItems.map((item) => {
                const hasCounted = item.counted_qty !== null;
                const diff = hasCounted ? item.diff : null;
                const diffColor =
                  diff === null
                    ? 'var(--m-text-secondary)'
                    : diff === 0
                      ? 'var(--m-success, #22c55e)'
                      : diff > 0
                        ? 'var(--m-info, #3b82f6)'
                        : 'var(--m-danger, #ef4444)';
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 6,
                      border: `1px solid ${
                        hasCounted && diff !== null && diff !== 0
                          ? diff > 0
                            ? 'var(--m-info, #3b82f6)'
                            : 'var(--m-danger, #ef4444)'
                          : 'var(--m-border)'
                      }`,
                      borderRadius: 10,
                      background: 'var(--m-surface)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--m-text-secondary)',
                            marginBottom: 2,
                          }}
                        >
                          {getCategoryLabel(item.product.category)} · {item.product.code}
                        </div>
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            color: 'var(--m-text)',
                          }}
                        >
                          {item.product.name}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--m-text-secondary)' }}>
                          장부재고
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>
                          {item.snapshot_qty.toLocaleString('ko-KR')} {item.product.unit}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--m-text-secondary)',
                          flexShrink: 0,
                        }}
                      >
                        실사수량
                      </div>
                      {isConfirmed ? (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 15,
                            color:
                              item.counted_qty === null
                                ? 'var(--m-text-secondary)'
                                : 'var(--m-text)',
                          }}
                        >
                          {item.counted_qty?.toLocaleString('ko-KR') ?? '—'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          defaultValue={item.counted_qty ?? ''}
                          placeholder="빈칸=일치"
                          onBlur={(e) =>
                            void handleCountedQtyChange(item.id, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          style={{
                            width: 100,
                            height: 36,
                            padding: '0 10px',
                            textAlign: 'right',
                            border: `1.5px solid ${
                              !hasCounted
                                ? 'var(--m-border)'
                                : diff === 0
                                  ? 'var(--m-success, #22c55e)'
                                  : 'var(--m-warning, #f59e0b)'
                            }`,
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            outline: 'none',
                            background: 'var(--m-surface)',
                            color: 'var(--m-text)',
                          }}
                        />
                      )}
                      {hasCounted && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 14,
                            fontWeight: 700,
                            color: diffColor,
                          }}
                        >
                          {diff === null
                            ? '—'
                            : diff === 0
                              ? '✓'
                              : `${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {!isConfirmed && (
              <div
                style={{
                  position: 'sticky',
                  bottom: 60,
                  display: 'flex',
                  gap: 8,
                  padding: '10px 0',
                  background: 'var(--m-bg)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setConfirmMode('delete')}
                  disabled={busy}
                  style={{
                    height: 42,
                    padding: '0 16px',
                    flexShrink: 0,
                    border: '1px solid var(--m-danger, #ef4444)',
                    borderRadius: 10,
                    background: 'var(--m-surface)',
                    color: 'var(--m-danger, #ef4444)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMode('confirm')}
                  disabled={busy}
                  style={{
                    flex: 1,
                    height: 42,
                    border: 'none',
                    borderRadius: 10,
                    background: 'var(--m-primary)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  실사 확정
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirmMode && (
        <>
          <div
            onClick={() => setConfirmMode(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 200,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: 16,
              right: 16,
              bottom: 80,
              zIndex: 201,
              background: 'var(--m-surface)',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              {confirmMode === 'confirm' ? '실사 확정' : '실사 삭제'}
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--m-text-secondary)',
                marginBottom: 16,
              }}
            >
              {confirmMode === 'confirm'
                ? `차이 항목 ${stats.diffCount}건을 재고 조정합니다. 미입력 항목은 일치로 간주합니다. 확정 후 수정 불가.`
                : '진행 중인 실사를 삭제합니다. 입력한 수량이 모두 사라집니다.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmMode(null)}
                style={{
                  flex: 1,
                  height: 40,
                  border: '1px solid var(--m-border)',
                  borderRadius: 10,
                  background: 'var(--m-surface)',
                  color: 'var(--m-text)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() =>
                  void (confirmMode === 'confirm'
                    ? handleConfirmAudit()
                    : handleDeleteAudit())
                }
                disabled={busy}
                style={{
                  flex: 1,
                  height: 40,
                  border: 'none',
                  borderRadius: 10,
                  background:
                    confirmMode === 'confirm'
                      ? 'var(--m-primary)'
                      : 'var(--m-danger, #ef4444)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? '처리 중…' : confirmMode === 'confirm' ? '확정' : '삭제'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
