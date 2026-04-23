/**
 * 제품리스트 페이지 — 재고매입 > 제품리스트.
 *
 * 구조: PageHeader · FilterBar · SplitLayout(List | divider | Detail)
 *       + 생성/수정 모달 · 삭제 확인 다이얼로그 · Toast
 *
 * 🔴 CLAUDE.md §1: company_id는 useCompany() 훅에서만.
 * 🔴 CLAUDE.md §5: 서버 조회/변경은 useProducts/useCreate/useUpdate/useDelete 경유.
 * 🟠 재고 섹션 숨김 (inventory_lots 데이터 부재, Q6). calcCurrentStock 호출 금지.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  type Product,
  type ProductCreateInput,
} from '@/hooks/queries/useProducts';
import {
  ProductFilterBar,
  type ProductActiveFilter,
} from '@/components/feature/products/ProductFilterBar';
import { ProductListTable } from '@/components/feature/products/ProductListTable';
import { ProductDetailPane } from '@/components/feature/products/ProductDetailPane';
import { ProductForm } from '@/components/feature/products/ProductForm';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toast, type ToastMsg } from '@/components/ui/Toast';

/** 편집 대상: 'new' = 신규 생성 모달, Product = 수정 모달, null = 닫힘. */
type EditTarget = 'new' | Product | null;

export function ProductsPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const productsQuery = useProducts(companyId);
  const createMut = useCreateProduct(companyId);
  const updateMut = useUpdateProduct(companyId);
  const deleteMut = useDeleteProduct(companyId);

  // ───── 필터 상태 ─────
  const [query, setQuery] = useState('');
  const [categorySel, setCategorySel] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<ProductActiveFilter>('all');

  // ───── 선택/체크 상태 ─────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // ───── CRUD 상태 ─────
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  // ───── 스플릿 (공용 훅) ─────
  const {
    leftPercent,
    onDragStart: startSplitDrag,
    containerRef: splitRef,
  } = useResizableSplit({ pageKey: 'products', defaultLeftPercent: 58 });

  // ───── 필터링 ─────
  const products = productsQuery.data ?? [];

  // 현재 로드된 제품에서 등장한 카테고리만 option 으로.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeFilter === 'active' && !p.is_active) return false;
      if (activeFilter === 'inactive' && p.is_active) return false;
      if (categorySel.length && !categorySel.includes(p.category)) return false;
      if (q) {
        const inCode = p.code.toLowerCase().includes(q);
        const inName = p.name.toLowerCase().includes(q);
        if (!inCode && !inName) return false;
      }
      return true;
    });
  }, [products, activeFilter, categorySel, query]);

  // ───── 요약 ─────
  const summary = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.is_active).length;
    const categories = new Set(products.map((p) => p.category)).size;
    return { total, active, categories };
  }, [products]);

  // ───── 선택 동기화 ─────
  useEffect(() => {
    if (!selectedId || !filtered.find((p) => p.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selectedProduct = filtered.find((p) => p.id === selectedId) ?? null;

  // ───── 체크박스 전체 ─────
  const allIds = filtered.map((p) => p.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => checked[id]);
  const someChecked = allIds.some((id) => checked[id]);
  const toggleAll = () => {
    setChecked((c) => {
      const next = { ...c };
      if (allChecked) allIds.forEach((id) => delete next[id]);
      else allIds.forEach((id) => (next[id] = true));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setChecked((c) => {
      const next = { ...c };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const resetFilters = () => {
    setQuery('');
    setCategorySel([]);
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
          setSelectedId(created.id);
          setToast({ kind: 'success', text: `「${created.name}」 제품을 추가했습니다` });
        },
        onError: (e) => {
          setToast({ kind: 'error', text: e.message });
        },
      });
    } else if (editTarget && typeof editTarget !== 'string') {
      updateMut.mutate(
        { id: editTarget.id, changes: values },
        {
          onSuccess: (updated) => {
            setEditTarget(null);
            setSelectedId(updated.id);
            setToast({ kind: 'success', text: `「${updated.name}」 제품을 저장했습니다` });
          },
          onError: (e) => {
            setToast({ kind: 'error', text: e.message });
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
        if (selectedId === target.id) setSelectedId(null);
        setToast({ kind: 'success', text: `「${target.name}」 제품을 삭제했습니다` });
      },
      onError: (e) => {
        setToast({ kind: 'error', text: e.message });
      },
    });
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
            <div style={{ display: 'flex', gap: 6 }}>
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
          categorySel={categorySel}
          onCategoryChange={setCategorySel}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          categoryOptions={categoryOptions}
          totalFiltered={filtered.length}
          totalAll={products.length}
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

        <div
          ref={splitRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `calc(${leftPercent}% - 3px) 6px calc(${100 - leftPercent}% - 3px)`,
            alignItems: 'start',
            gap: 0,
          }}
        >
          <ProductListTable
            products={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            checked={checked}
            onToggleChecked={toggleOne}
            onToggleAllChecked={toggleAll}
            allChecked={allChecked}
            someChecked={someChecked}
            isLoading={isLoading}
            onResetFilters={resetFilters}
          />

          {/* 스플릿 핸들 */}
          <div
            onMouseDown={startSplitDrag}
            title="드래그해서 크기 조절"
            style={{
              alignSelf: 'stretch',
              cursor: 'col-resize',
              position: 'relative',
              userSelect: 'none',
              minHeight: 240,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--line)',
                transform: 'translateX(-0.5px)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 4,
                height: 32,
                borderRadius: 3,
                background: 'var(--line-strong)',
                transition: 'background .15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'var(--brand)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'var(--line-strong)')
              }
            />
          </div>

          <ProductDetailPane
            product={selectedProduct}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        </div>
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
            knownCategories={categoryOptions}
            onSubmit={handleSubmit}
            onCancel={closeEdit}
            busy={createMut.isPending || updateMut.isPending}
          />
        )}
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

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
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
