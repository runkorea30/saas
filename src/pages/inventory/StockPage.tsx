/**
 * 재고현황 페이지 — 재고매입 > 재고현황.
 *
 * 구조: PageHeader · FilterBar · (lots 0건 시) 안내 배너 · SplitLayout(List | divider | Detail)
 *       + 기초재고 투입 모달 · 중복 투입 ConfirmDialog
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §2: 현재재고/상태 분류는 calculations.ts 단일 진입점.
 * 🟠 CTA "기초재고 투입": 헤더·Detail Pane 두 곳. 헤더는 선택된 행 없으면 disabled.
 * 🟡 기본 정렬: 제품코드(code) 오름차순 — 필터/리패치 후에도 동일 순서 유지.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Package, Plus, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCompany } from '@/hooks/useCompany';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { useProducts, type Product } from '@/hooks/queries/useProducts';
import { useInventoryStock } from '@/hooks/queries/useInventoryStock';
import { useInventoryDetail } from '@/hooks/queries/useInventoryDetail';
import { useCreateOpeningLot } from '@/hooks/queries/useCreateOpeningLot';
import { useCreateAdjustment } from '@/hooks/queries/useCreateAdjustment';
import { classifyStockStatus } from '@/utils/calculations';
import {
  StockFilterBar,
  type StockFilterValue,
} from '@/components/feature/inventory/StockFilterBar';
import {
  StockListTable,
  type StockRow,
} from '@/components/feature/inventory/StockListTable';
import { StockDetailPane } from '@/components/feature/inventory/StockDetailPane';
import {
  OpeningStockForm,
  type OpeningStockFormValues,
} from '@/components/feature/inventory/OpeningStockForm';
import {
  AdjustmentForm,
  type AdjustmentFormValues,
} from '@/components/feature/inventory/AdjustmentForm';
import {
  StockExcelUploadModal,
  type StockDiffRow,
} from '@/components/feature/inventory/StockExcelUploadModal';
import { getCategoryLabel } from '@/constants/categories';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

export function StockPage() {
  const { companyId, isLoading: companyLoading } = useCompany();

  // 데이터
  const productsQuery = useProducts(companyId);
  const stockQuery = useInventoryStock(companyId);

  // 필터 상태
  const [query, setQuery] = useState('');
  const [categorySel, setCategorySel] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<StockFilterValue>('all');

  // 선택 / 조정 상태
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [pendingValues, setPendingValues] =
    useState<OpeningStockFormValues | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<Product | null>(null);
  /** 재고조정 모달 대상 — null 이면 닫힘. */
  const [adjustmentTarget, setAdjustmentTarget] = useState<Product | null>(null);

  // 엑셀 업로드 상태
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelDiffs, setExcelDiffs] = useState<StockDiffRow[]>([]);
  const [excelWarnings, setExcelWarnings] = useState<string[]>([]);
  const [excelApplying, setExcelApplying] = useState(false);
  const [excelAppliedCount, setExcelAppliedCount] = useState(0);

  const { showToast } = useToast();
  const createMut = useCreateOpeningLot(companyId);
  const adjustMut = useCreateAdjustment(companyId);

  // 스플릿 (공용 훅)
  const {
    leftPercent,
    onDragStart: startSplitDrag,
    containerRef: splitRef,
  } = useResizableSplit({ pageKey: 'inventory-stock', defaultLeftPercent: 58 });

  // ───── 데이터 머지 ─────
  const products = productsQuery.data ?? [];
  const stockByProduct = stockQuery.data?.stockByProduct;

  const rows: StockRow[] = useMemo(() => {
    return products.map<StockRow>((p) => {
      const s = stockByProduct?.get(p.id);
      const current = s?.current ?? 0;
      return {
        ...p,
        current_stock: current,
        opening_qty: s?.opening ?? 0,
        sold_this_year: s?.soldThisYear ?? 0,
        last_movement_at: s?.lastMovementAt ?? null,
        status: classifyStockStatus(current),
      };
    });
  }, [products, stockByProduct]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  // ───── 필터 + 정렬 ─────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (stockFilter !== 'all' && r.status !== stockFilter) return false;
      if (categorySel.length && !categorySel.includes(r.category)) return false;
      if (q) {
        const inCode = r.code.toLowerCase().includes(q);
        const inName = r.name.toLowerCase().includes(q);
        if (!inCode && !inName) return false;
      }
      return true;
    });
    // 제품코드(code) 오름차순 고정 — 한/영/숫자 혼재 대응 localeCompare(ko).
    list.sort((a, b) => a.code.localeCompare(b.code, 'ko'));
    return list;
  }, [rows, stockFilter, categorySel, query]);

  // ───── 요약 ─────
  const summary = useMemo(() => {
    let out = 0;
    let low = 0;
    let normal = 0;
    for (const r of rows) {
      if (r.status === 'out') out++;
      else if (r.status === 'low') low++;
      else normal++;
    }
    return { total: rows.length, out, low, normal };
  }, [rows]);

  // ───── 선택 동기화 ─────
  useEffect(() => {
    if (!selectedId || !filtered.find((p) => p.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selectedRow = filtered.find((r) => r.id === selectedId) ?? null;
  const detailQuery = useInventoryDetail(companyId, selectedId);

  const resetFilters = () => {
    setQuery('');
    setCategorySel([]);
    setStockFilter('all');
  };

  const isLoading =
    companyLoading || productsQuery.isLoading || stockQuery.isLoading;

  // ───── 기초재고 투입 플로우 ─────
  const openAdjust = (p: Product) => {
    setAdjustTarget(p);
    setPendingValues(null);
  };
  const closeAdjust = () => {
    if (createMut.isPending) return;
    setAdjustTarget(null);
    setPendingValues(null);
  };

  /** opening lot 가 이미 있는지 — 중복 투입 확인 트리거. */
  const hasExistingOpening = (productId: string): boolean => {
    return (stockByProduct?.get(productId)?.opening ?? 0) > 0;
  };

  const performInsert = (target: Product, values: OpeningStockFormValues) => {
    createMut.mutate(
      { product_id: target.id, ...values },
      {
        onSuccess: () => {
          setAdjustTarget(null);
          setPendingValues(null);
          setDuplicateConfirm(null);
          showToast({
            kind: 'success',
            text: `「${target.name}」 기초재고 ${values.quantity.toLocaleString('ko-KR')}${target.unit} 등록 완료`,
          });
        },
        onError: (e) => {
          showToast({ kind: 'error', text: e.message });
        },
      },
    );
  };

  const handleFormSubmit = (values: OpeningStockFormValues) => {
    if (!adjustTarget) return;
    if (hasExistingOpening(adjustTarget.id)) {
      // 중복 확인 → 나중에 performInsert.
      setPendingValues(values);
      setDuplicateConfirm(adjustTarget);
      return;
    }
    performInsert(adjustTarget, values);
  };

  const confirmDuplicate = () => {
    if (!duplicateConfirm || !pendingValues) return;
    performInsert(duplicateConfirm, pendingValues);
  };
  const cancelDuplicate = () => {
    if (createMut.isPending) return;
    setDuplicateConfirm(null);
    setPendingValues(null);
  };

  // ───── 재고조정 플로우 ─────
  const openAdjustment = (p: Product) => setAdjustmentTarget(p);
  const closeAdjustment = () => {
    if (adjustMut.isPending) return;
    setAdjustmentTarget(null);
  };

  // ───── 엑셀 다운로드/업로드 ─────
  /** 화면과 동일한 정렬(코드 오름차순)로 xlsx 다운로드. */
  const handleDownloadExcel = () => {
    const sorted = [...products].sort((a, b) =>
      a.code.localeCompare(b.code, 'ko'),
    );
    const header = ['제품코드', '제품명', '분류', '단위', '현재재고'];
    const body = sorted.map((p) => [
      p.code,
      p.name,
      getCategoryLabel(p.category),
      p.unit,
      stockByProduct?.get(p.id)?.current ?? 0,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    // 컬럼 너비 (xlsx CE 지원).
    ws['!cols'] = [
      { wch: 14 },
      { wch: 36 },
      { wch: 12 },
      { wch: 8 },
      { wch: 12 },
    ];
    // freeze panes (CE 에서 미지원 가능 — 지원 시 1행 고정).
    ws['!freeze'] = { xSplit: '0', ySplit: '1' } as never;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '재고현황');
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, `재고현황_${y}${m}${d}.xlsx`);
  };

  /** 파일 선택 → 파싱 → diff 계산 → 모달 오픈. */
  const handleFileSelected = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('워크시트가 비어 있습니다.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: '',
        raw: false,
      });

      const byCode = new Map<string, Product>();
      for (const p of products) byCode.set(String(p.code).trim(), p);

      const diffs: StockDiffRow[] = [];
      const warnings: string[] = [];

      rows.forEach((r, idx) => {
        const rowNo = idx + 2; // 헤더가 1행 → 데이터는 2행부터
        const codeRaw = r['제품코드'];
        const code = codeRaw == null ? '' : String(codeRaw).trim();
        if (!code) {
          warnings.push(`${rowNo}행: 제품코드 비어 있음`);
          return;
        }
        const product = byCode.get(code);
        if (!product) {
          warnings.push(`${rowNo}행: 제품코드 "${code}" 매칭 안 됨`);
          return;
        }
        const newRaw = r['현재재고'];
        const newNum = Number(
          typeof newRaw === 'string' ? newRaw.replace(/,/g, '') : newRaw,
        );
        if (!Number.isFinite(newNum)) {
          warnings.push(`${rowNo}행 (${code}): 현재재고가 숫자가 아님`);
          return;
        }
        if (newNum < 0) {
          warnings.push(`${rowNo}행 (${code}): 음수 재고 불가 (${newNum})`);
          return;
        }
        const intNew = Math.round(newNum);
        const oldStock = stockByProduct?.get(product.id)?.current ?? 0;
        const delta = intNew - oldStock;
        if (delta === 0) return;
        diffs.push({ product, oldStock, newStock: intNew, delta });
      });

      setExcelDiffs(diffs);
      setExcelWarnings(warnings);
      setExcelAppliedCount(0);
      setExcelOpen(true);
    } catch (err) {
      showToast({
        kind: 'error',
        text: `엑셀 파싱 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      });
    }
  };

  /** diff 를 순차 RPC 로 적용. opening lot 경합 회피. */
  const handleApplyExcel = async () => {
    if (excelApplying || excelDiffs.length === 0) return;
    setExcelApplying(true);
    setExcelAppliedCount(0);
    const memoDate = new Date().toISOString().slice(0, 10);
    const memo = `엑셀 재고조정 (${memoDate})`;
    const nowIso = new Date().toISOString();
    const failures: string[] = [];

    for (let i = 0; i < excelDiffs.length; i++) {
      const d = excelDiffs[i];
      try {
        await adjustMut.mutateAsync({
          product_id: d.product.id,
          quantity: d.delta,
          memo,
          transaction_date: nowIso,
        });
        setExcelAppliedCount(i + 1);
      } catch (err) {
        failures.push(
          `${d.product.code}: ${err instanceof Error ? err.message : '오류'}`,
        );
      }
    }

    setExcelApplying(false);
    setExcelOpen(false);
    if (failures.length === 0) {
      showToast({
        kind: 'success',
        text: `엑셀 재고조정 ${excelDiffs.length}건 완료`,
      });
    } else {
      showToast({
        kind: 'error',
        text: `${excelDiffs.length - failures.length}건 성공, ${failures.length}건 실패: ${failures.slice(0, 3).join(' / ')}${failures.length > 3 ? ' …' : ''}`,
      });
    }
  };

  const handleAdjustmentSubmit = (values: AdjustmentFormValues) => {
    if (!adjustmentTarget) return;
    const signed =
      values.direction === 'decrease' ? -values.quantity : values.quantity;
    adjustMut.mutate(
      {
        product_id: adjustmentTarget.id,
        quantity: signed,
        memo: values.memo,
        transaction_date: values.transaction_date,
      },
      {
        onSuccess: () => {
          const dirSign = values.direction === 'decrease' ? '-' : '+';
          showToast({
            kind: 'success',
            text: `「${adjustmentTarget.name}」 재고 ${dirSign}${values.quantity.toLocaleString('ko-KR')}${adjustmentTarget.unit} 조정 완료`,
          });
          setAdjustmentTarget(null);
        },
        onError: (e) => {
          showToast({ kind: 'error', text: e.message });
        },
      },
    );
  };

  const anyError = productsQuery.error || stockQuery.error;
  const showEmptyLotsBanner =
    stockQuery.data?.lotsCount === 0 && !stockQuery.isLoading;

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
            재고매입 › 재고현황
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
              재고현황
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
              <SummaryItem label="총 상품" value={`${summary.total}개`} />
              <SummaryItem
                label="정상"
                value={`${summary.normal}`}
                tone="success"
              />
              <SummaryItem label="부족" value={`${summary.low}`} tone="warning" />
              <SummaryItem label="품절" value={`${summary.out}`} tone="danger" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={products.length === 0 || !stockByProduct}
                title="현재 재고를 엑셀로 다운로드"
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Download size={13} /> 엑셀 다운로드
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!stockByProduct}
                title="엑셀로 일괄 재고조정"
                className="btn-base"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Upload size={13} /> 엑셀 업로드
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelected(f);
                  // 같은 파일 재선택 가능하도록 리셋
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => selectedRow && openAdjust(selectedRow)}
                disabled={!selectedRow}
                title={
                  !selectedRow ? '좌측에서 제품을 선택하세요' : '기초재고 투입'
                }
                className="btn-base primary"
                style={{ height: 32, fontSize: 12.5 }}
              >
                <Plus size={13} /> 기초재고 투입
              </button>
            </div>
          </div>
        </header>

        <StockFilterBar
          query={query}
          onQueryChange={setQuery}
          categorySel={categorySel}
          onCategoryChange={setCategorySel}
          stockFilter={stockFilter}
          onStockFilterChange={setStockFilter}
          categoryOptions={categoryOptions}
          totalFiltered={filtered.length}
          totalAll={rows.length}
        />

        {/* 안내 배너 (lots 0건일 때만) */}
        {showEmptyLotsBanner && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: 'var(--info-wash)',
              color: 'var(--info)',
              border: '1px solid var(--info)',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 12,
            }}
          >
            <Package size={14} strokeWidth={1.8} />
            <span>
              재고 데이터가 없어 매출 수량만 반영된 추정치입니다 — [기초재고 투입] 으로 실재고를 등록하세요.
            </span>
          </div>
        )}

        {anyError && (
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
            재고 데이터 로딩 실패: {anyError.message}
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
          <StockListTable
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
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

          <StockDetailPane
            product={selectedRow}
            stock={
              selectedRow
                ? {
                    current: selectedRow.current_stock,
                    opening: selectedRow.opening_qty,
                    soldThisYear: selectedRow.sold_this_year,
                    status: selectedRow.status,
                  }
                : null
            }
            detail={detailQuery.data}
            isDetailLoading={detailQuery.isLoading}
            onOpenAdjust={openAdjust}
            onOpenAdjustment={openAdjustment}
          />
        </div>
      </main>

      {/* 기초재고 투입 모달 */}
      <Modal
        open={adjustTarget !== null}
        onClose={closeAdjust}
        title="기초재고 투입"
        width={480}
      >
        {adjustTarget && (
          <OpeningStockForm
            product={adjustTarget}
            onSubmit={handleFormSubmit}
            onCancel={closeAdjust}
            busy={createMut.isPending}
          />
        )}
      </Modal>

      {/* 재고조정 모달 */}
      <Modal
        open={adjustmentTarget !== null}
        onClose={closeAdjustment}
        title="재고조정"
        width={480}
      >
        {adjustmentTarget && (
          <AdjustmentForm
            product={adjustmentTarget}
            currentOpeningQty={
              stockByProduct?.get(adjustmentTarget.id)?.opening ?? 0
            }
            onSubmit={handleAdjustmentSubmit}
            onCancel={closeAdjustment}
            busy={adjustMut.isPending}
          />
        )}
      </Modal>

      {/* 엑셀 업로드 미리보기 */}
      <StockExcelUploadModal
        open={excelOpen}
        diffs={excelDiffs}
        warnings={excelWarnings}
        applying={excelApplying}
        appliedCount={excelAppliedCount}
        onApply={handleApplyExcel}
        onClose={() => {
          if (excelApplying) return;
          setExcelOpen(false);
        }}
      />

      {/* 중복 투입 확인 */}
      <ConfirmDialog
        open={duplicateConfirm !== null}
        onClose={cancelDuplicate}
        title="기초재고 중복 투입"
        body={
          duplicateConfirm ? (
            <>
              「<strong>{duplicateConfirm.name}</strong>」 제품은 기초재고가 이미
              등록되어 있습니다. 추가 투입하시겠습니까?
            </>
          ) : null
        }
        confirmLabel="추가 투입"
        onConfirm={confirmDuplicate}
        busy={createMut.isPending}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'success' | 'warning';
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'success'
        ? 'var(--success)'
        : tone === 'warning'
          ? 'var(--warning)'
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
