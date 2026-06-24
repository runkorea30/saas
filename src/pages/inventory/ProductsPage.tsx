/**
 * 제품리스트 페이지 — 재고매입 > 제품리스트 (Phase A).
 *
 * 구조: PageHeader(+제품 추가) · FilterBar · 전체 폭 Table
 *       + 생성/수정 모달 · 삭제 확인 다이얼로그 · Toast
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany() 훅에서만.
 * 🔴 CLAUDE.md §5: 서버 조회/변경은 useProducts / useInventoryStock 경유.
 * 🟠 Phase A: 2분할 제거 → 전체 폭. 편집/삭제 진입점은 행 마지막 컬럼 아이콘 버튼.
 *    상세 펼침(Phase B), 컬럼 커스터마이징(Phase C)은 별도 PR.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { useCompany } from '@/hooks/useCompany';
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  type Product,
  type ProductCreateInput,
} from '@/hooks/queries/useProducts';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import {
  ProductFilterBar,
  type ProductActiveFilter,
} from '@/components/feature/products/ProductFilterBar';
import { ProductListTable } from '@/components/feature/products/ProductListTable';
import { ProductForm } from '@/components/feature/products/ProductForm';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  PRODUCT_CATEGORY_ALL,
  PRODUCT_CATEGORY_DEFAULT,
} from '@/constants/categories';

/** 편집 대상: 'new' = 신규 생성 모달, Product = 수정 모달, null = 닫힘. */
type EditTarget = 'new' | Product | null;

export function ProductsPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const productsQuery = useProducts(companyId);
  const stockQuery = useInventoryStock(companyId);
  const createMut = useCreateProduct(companyId);
  const updateMut = useUpdateProduct(companyId);
  const deleteMut = useDeleteProduct(companyId);
  const queryClient = useQueryClient();
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // ───── 일괄수정 ─────
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditFields, setBulkEditFields] = useState({
    category: '',
    unit: '',
    unit_price_usd: '',
    sell_price: '',
  });

  // ───── 노출 토글 (is_active) ─────
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // ───── 필터 상태 ─────
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORY_DEFAULT);
  const [stockLessThan, setStockLessThan] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProductActiveFilter>('all');

  // ───── 체크박스 상태 ─────
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // ───── CRUD 상태 ─────
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const { showToast } = useToast();

  // ───── 데이터 ─────
  const products = productsQuery.data ?? [];
  const stockByProduct = stockQuery.data?.stockByProduct;

  // 드롭다운 옵션: DB 에 등장한 distinct category. 빈 문자열도 보존(맨 뒤).
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category);
    const arr = Array.from(set);
    arr.sort((a, b) => {
      if (a === '' && b !== '') return 1; // 빈 문자열은 항상 맨 뒤
      if (a !== '' && b === '') return -1;
      return a.localeCompare(b, 'ko');
    });
    return arr;
  }, [products]);

  // 편집 모달에서 카테고리 preset 확장용 (기존 ProductForm이 이 prop을 요구).
  const knownCategories = useMemo(() => categoryOptions, [categoryOptions]);

  // ───── 필터 ─────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      // 검색
      if (q) {
        const inCode = p.code.toLowerCase().includes(q);
        const inName = p.name.toLowerCase().includes(q);
        if (!inCode && !inName) return false;
      }
      // 카테고리 (sentinel "__ALL__" 이면 통과)
      if (category !== PRODUCT_CATEGORY_ALL && p.category !== category) {
        return false;
      }
      // 활성/비활성
      if (activeFilter === 'active' && !p.is_active) return false;
      if (activeFilter === 'inactive' && p.is_active) return false;
      // 재고 N 미만
      if (stockLessThan != null) {
        const cur = stockByProduct?.get(p.id)?.current ?? 0;
        if (cur >= stockLessThan) return false;
      }
      return true;
    });
  }, [products, query, category, activeFilter, stockLessThan, stockByProduct]);

  // ───── 요약 ─────
  const summary = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter((p) => p.is_active).length;
    const categories = new Set(filtered.map((p) => p.category)).size;
    return { total, active, categories };
  }, [filtered]);

  // ───── 체크박스 자동 정리 ─────
  // 필터로 가려진 ID는 checked에서 제거. 변화 없으면 prev 그대로 반환해 추가 렌더 방지.
  useEffect(() => {
    setChecked((prev) => {
      const visibleIds = new Set(filtered.map((p) => p.id));
      const next: Record<string, boolean> = {};
      let mutated = false;
      for (const id of Object.keys(prev)) {
        if (visibleIds.has(id)) {
          next[id] = prev[id];
        } else {
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [filtered]);

  const toggleOneChecked = (id: string, next: boolean) => {
    setChecked((prev) => {
      const out = { ...prev };
      if (next) out[id] = true;
      else delete out[id];
      return out;
    });
  };

  const togglePageChecked = (next: boolean) => {
    setChecked((prev) => {
      if (next) {
        const out = { ...prev };
        for (const p of filtered) out[p.id] = true;
        return out;
      }
      const out = { ...prev };
      for (const p of filtered) delete out[p.id];
      return out;
    });
  };

  const selectedCount = Object.keys(checked).length;

  const resetFilters = () => {
    setQuery('');
    setCategory(PRODUCT_CATEGORY_DEFAULT);
    setStockLessThan(null);
    setActiveFilter('all');
  };

  const isLoading = companyLoading || productsQuery.isLoading;

  // ───── CRUD 핸들러 ─────
  const openCreate = () => setEditTarget('new');
  const openEdit = (p: Product) => setEditTarget(p);
  const closeEdit = () => {
    if (createMut.isPending || updateMut.isPending) return;
    setEditTarget(null);
  };

  const handleSubmit = (values: ProductCreateInput) => {
    if (editTarget === 'new') {
      createMut.mutate(values, {
        onSuccess: (created) => {
          setEditTarget(null);
          showToast({ kind: 'success', text: `「${created.name}」 제품을 추가했습니다` });
        },
        onError: (e) => {
          showToast({ kind: 'error', text: e.message });
        },
      });
    } else if (editTarget && typeof editTarget !== 'string') {
      updateMut.mutate(
        { id: editTarget.id, changes: values },
        {
          onSuccess: (updated) => {
            setEditTarget(null);
            showToast({ kind: 'success', text: `「${updated.name}」 제품을 저장했습니다` });
          },
          onError: (e) => {
            showToast({ kind: 'error', text: e.message });
          },
        },
      );
    }
  };

  const openDelete = (p: Product) => setDeleteTarget(p);
  const closeDelete = () => {
    if (deleteMut.isPending) return;
    setDeleteTarget(null);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    deleteMut.mutate(target.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        showToast({ kind: 'success', text: `「${target.name}」 제품을 삭제했습니다` });
      },
      onError: (e) => {
        showToast({ kind: 'error', text: e.message });
      },
    });
  };

  /**
   * 일괄 soft-delete — 체크된 제품의 deleted_at 을 NOW() 로 갱신.
   * 🟠 useDeleteProduct 는 단건 mutation 이라 여기서는 supabase 를 직접 호출하고
   *    동일한 ['products', companyId] 키를 무효화한다.
   */
  const handleBulkDelete = async () => {
    if (selectedCount === 0 || !companyId || isBulkDeleting) return;
    const ids = Object.keys(checked);
    const confirmed = window.confirm(
      `선택한 ${ids.length}개 제품을 삭제하시겠습니까?\n\n삭제된 제품은 복구할 수 없습니다.`,
    );
    if (!confirmed) return;
    setIsBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
        .eq('company_id', companyId)
        .is('deleted_at', null);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['products', companyId] });
      setChecked({});
      showToast({
        kind: 'success',
        text: `${ids.length}개 제품을 삭제했습니다`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[products.bulk-delete]', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '삭제 중 오류가 발생했습니다.',
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  /** 일괄수정 — 입력된 필드만 UPDATE. 빈 입력은 변경하지 않음. */
  const handleBulkEdit = async () => {
    if (selectedCount === 0 || !companyId || isBulkEditing) return;
    const ids = Object.keys(checked);

    type ProductUpdate = Database['mochicraft_demo']['Tables']['products']['Update'];
    const updateData: ProductUpdate = {};
    if (bulkEditFields.category.trim()) {
      updateData.category = bulkEditFields.category.trim();
    }
    if (bulkEditFields.unit.trim()) {
      updateData.unit = bulkEditFields.unit.trim();
    }
    if (bulkEditFields.unit_price_usd.trim()) {
      const v = parseFloat(bulkEditFields.unit_price_usd);
      if (Number.isFinite(v)) updateData.unit_price_usd = v;
    }
    if (bulkEditFields.sell_price.trim()) {
      const v = parseInt(bulkEditFields.sell_price, 10);
      if (Number.isFinite(v)) updateData.sell_price = v;
    }

    if (Object.keys(updateData).length === 0) {
      showToast({
        kind: 'error',
        text: '수정할 항목을 1개 이상 입력해주세요.',
      });
      return;
    }

    const confirmed = window.confirm(
      `선택한 ${ids.length}개 제품의 정보를 일괄 수정하시겠습니까?`,
    );
    if (!confirmed) return;

    setIsBulkEditing(true);
    try {
      const { error } = await supabase
        .from('products')
        .update(updateData)
        .in('id', ids)
        .eq('company_id', companyId)
        .is('deleted_at', null);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['products', companyId] });
      setChecked({});
      setBulkEditOpen(false);
      setBulkEditFields({
        category: '',
        unit: '',
        unit_price_usd: '',
        sell_price: '',
      });
      showToast({
        kind: 'success',
        text: `${ids.length}개 제품을 수정했습니다`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[products.bulk-edit]', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '수정 중 오류가 발생했습니다.',
      });
    } finally {
      setIsBulkEditing(false);
    }
  };

  /** is_active 일괄 토글 — true=노출, false=노출금지. */
  const setBulkActive = async (active: boolean) => {
    if (selectedCount === 0 || !companyId || isTogglingActive) return;
    const ids = Object.keys(checked);
    const confirmed = active
      ? window.confirm(
          `선택한 ${ids.length}개 제품을 거래처에 다시 노출하시겠습니까?`,
        )
      : window.confirm(
          `선택한 ${ids.length}개 제품을 거래처에 노출하지 않도록 설정하시겠습니까?\n\n주문 불가, 품절/재고부족 목록에도 표시되지 않습니다.`,
        );
    if (!confirmed) return;
    setIsTogglingActive(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: active })
        .in('id', ids)
        .eq('company_id', companyId)
        .is('deleted_at', null);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['products', companyId] });
      setChecked({});
      showToast({
        kind: 'success',
        text: active
          ? `${ids.length}개 제품을 노출 활성화했습니다`
          : `${ids.length}개 제품을 노출금지로 설정했습니다`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[products.toggle-active]', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '설정 중 오류가 발생했습니다.',
      });
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main
        style={{
          flex: 1,
          padding: '20px 32px 80px',
          maxWidth: 1720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 페이지 헤더 */}
        <header style={{ marginBottom: 14 }}>
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
            재고매입 › 제품리스트
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
              제품리스트
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
              <SummaryItem label="총 제품" value={`${summary.total}개`} />
              <SummaryItem
                label="활성"
                value={`${summary.active}`}
                tone="success"
              />
              <SummaryItem
                label="카테고리"
                value={`${summary.categories}종`}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {selectedCount > 0 && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', marginRight: 2 }}>
                    {selectedCount}개 선택
                  </span>
                  <button
                    type="button"
                    onClick={() => setBulkEditOpen(true)}
                    disabled={isBulkEditing}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 30,
                      padding: '0 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      border: '1.5px solid #6B1F2A',
                      background: '#FFFFFF',
                      color: '#6B1F2A',
                      cursor: isBulkEditing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ✏️ 일괄수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkActive(false)}
                    disabled={isTogglingActive}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 30,
                      padding: '0 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      border: '1.5px solid #f59e0b',
                      background: '#FFFFFF',
                      color: '#f59e0b',
                      cursor: isTogglingActive ? 'not-allowed' : 'pointer',
                    }}
                  >
                    🚫 노출금지
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkActive(true)}
                    disabled={isTogglingActive}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 30,
                      padding: '0 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      border: '1.5px solid #22c55e',
                      background: '#FFFFFF',
                      color: '#22c55e',
                      cursor: isTogglingActive ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ✅ 노출
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 30,
                      padding: '0 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      border: '1.5px solid #ef4444',
                      background: isBulkDeleting ? '#fef2f2' : '#FFFFFF',
                      color: '#ef4444',
                      cursor: isBulkDeleting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    🗑 {isBulkDeleting ? '삭제 중…' : '삭제'}
                  </button>
                </>
              )}
              <button
                type="button"
                disabled
                title="다음 라운드에서 지원 예정"
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Download size={13} /> 엑셀 내보내기
              </button>
              <button
                type="button"
                className="btn-base primary"
                onClick={openCreate}
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Plus size={13} /> 제품 추가
              </button>
            </div>
          </div>
        </header>

        <ProductFilterBar
          query={query}
          onQueryChange={setQuery}
          category={category}
          onCategoryChange={setCategory}
          categoryOptions={categoryOptions}
          stockLessThan={stockLessThan}
          onStockLessThanChange={setStockLessThan}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          totalFiltered={filtered.length}
          totalAll={products.length}
          onReset={resetFilters}
          selectedCount={selectedCount}
        />

        {/* 에러 배너 */}
        {productsQuery.error && (
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
            제품 목록 로딩 실패: {productsQuery.error.message}
          </div>
        )}

        <ProductListTable
          products={filtered}
          isLoading={isLoading}
          onResetFilters={resetFilters}
          stockByProduct={stockByProduct}
          onEditClick={openEdit}
          onDeleteClick={openDelete}
          checked={checked}
          onToggleChecked={toggleOneChecked}
          onTogglePageChecked={togglePageChecked}
        />
      </main>

      {/* 생성/수정 모달 */}
      <Modal
        open={editTarget !== null}
        onClose={closeEdit}
        title={editTarget === 'new' ? '제품 추가' : '제품 수정'}
        width={540}
      >
        {editTarget !== null && (
          <ProductForm
            initial={editTarget === 'new' ? null : editTarget}
            knownCategories={knownCategories}
            onSubmit={handleSubmit}
            onCancel={closeEdit}
            busy={createMut.isPending || updateMut.isPending}
          />
        )}
      </Modal>

      {/* 일괄수정 모달 */}
      <Modal
        open={bulkEditOpen}
        onClose={() => {
          if (isBulkEditing) return;
          setBulkEditOpen(false);
        }}
        title="일괄 수정"
        width={400}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
            {selectedCount}개 제품 · 입력한 항목만 변경됩니다
          </p>

          <BulkEditField label="분류">
            <input
              type="text"
              value={bulkEditFields.category}
              onChange={(e) =>
                setBulkEditFields((p) => ({ ...p, category: e.target.value }))
              }
              placeholder="변경할 분류명 입력"
              style={bulkEditInputStyle}
            />
          </BulkEditField>

          <BulkEditField label="단위">
            <select
              value={bulkEditFields.unit}
              onChange={(e) =>
                setBulkEditFields((p) => ({ ...p, unit: e.target.value }))
              }
              style={{ ...bulkEditInputStyle, background: '#FFFFFF' }}
            >
              <option value="">변경 안 함</option>
              <option value="EA">EA</option>
              <option value="DZ">DZ</option>
              <option value="SET">SET</option>
              <option value="BOX">BOX</option>
            </select>
          </BulkEditField>

          <BulkEditField label="USD 단가">
            <input
              type="number"
              step="0.01"
              value={bulkEditFields.unit_price_usd}
              onChange={(e) =>
                setBulkEditFields((p) => ({
                  ...p,
                  unit_price_usd: e.target.value,
                }))
              }
              placeholder="예: 21.06"
              style={bulkEditInputStyle}
            />
          </BulkEditField>

          <BulkEditField label="판매가 (원)">
            <input
              type="number"
              value={bulkEditFields.sell_price}
              onChange={(e) =>
                setBulkEditFields((p) => ({
                  ...p,
                  sell_price: e.target.value,
                }))
              }
              placeholder="예: 8700"
              style={bulkEditInputStyle}
            />
          </BulkEditField>

          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              marginTop: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setBulkEditOpen(false)}
              disabled={isBulkEditing}
              className="btn-base"
              style={{ height: 32, fontSize: 12.5 }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleBulkEdit}
              disabled={isBulkEditing}
              style={{
                height: 32,
                padding: '0 16px',
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 600,
                border: 'none',
                background: '#6B1F2A',
                color: '#FFFFFF',
                cursor: isBulkEditing ? 'not-allowed' : 'pointer',
                opacity: isBulkEditing ? 0.6 : 1,
              }}
            >
              {isBulkEditing ? '수정 중…' : '수정하기'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={closeDelete}
        title="제품 삭제"
        body={
          deleteTarget ? (
            <>
              「<strong>{deleteTarget.name}</strong>」 제품을 삭제하시겠습니까?
              <br />
              기존 주문에서는 계속 표시됩니다.
            </>
          ) : null
        }
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        busy={deleteMut.isPending}
      />
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
  tone?: 'danger' | 'success';
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'success'
        ? 'var(--success)'
        : 'var(--ink)';
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

// ───────────────────────────────────────────────────────────
// 일괄수정 모달용 헬퍼

const bulkEditInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-strong)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

function BulkEditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: 12,
          color: 'var(--ink-3)',
          display: 'block',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
