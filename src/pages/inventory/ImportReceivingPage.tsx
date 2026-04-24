/**
 * 수입/매입 페이지 Phase 1 — 수동 입력 + 계산 엔진 + 입고확정.
 *
 * 구조: PageHeader · HeaderForm · SummaryBar · RowsTable · 하단 액션 바
 *       + 운송비 0 / 합계 차이 / 초기화 ConfirmDialog
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §2: 모든 계산은 src/utils/inventory.ts 순수 함수로만.
 * 🟠 Row auto-adjust 규칙: 사용자가 adjustedQuantity 를 수동 편집하지 않았다면
 *    (= 현재 값이 이전 quantity/unit 기반 default 와 동일), quantity/unit 변경 시
 *    adjustedQuantity 가 새 default 로 자동 추종. 수동 편집하면 이후 자동 추종 안 함.
 *    Phase 2 에서 PDF 업로드 + 자동 파싱 예정.
 */
import { useMemo, useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { useProducts } from '@/hooks/queries/useProducts';
import { useCreateImportWithLots } from '@/hooks/queries/useCreateImportWithLots';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type {
  ImportInvoiceHeader,
  ImportRow,
  ImportRowInput,
} from '@/types/import';
import {
  computeAdjustedQuantityDefault,
  computeCostKrw,
  computeInvoiceActualTotalUsd,
  computeLineTotalKrw,
  computeShippingAllocationUsd,
  computeSourceUnitPriceUsd,
  computeUnitPriceUsd,
  hasSignificantTotalDiff,
  normalizeSourceCode,
} from '@/utils/inventory';
import { ImportHeaderForm } from '@/components/feature/import/ImportHeaderForm';
import { ImportSummaryBar } from '@/components/feature/import/ImportSummaryBar';
import { ImportRowsTable } from '@/components/feature/import/ImportRowsTable';

// ───────────────────────────────────────────────────────────

function todayLocalDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function createEmptyRow(): ImportRowInput {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `row_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    sourceCode: '',
    quantity: 0,
    unit: 'DZ',
    adjustedQuantity: 0,
    totalUsd: 0,
  };
}

const DEFAULT_HEADER: ImportInvoiceHeader = {
  invoiceNumber: '',
  supplierName: 'Angelus Shoe Polish Co.',
  invoiceDate: '',
  exchangeRate: 1450,
  shippingCostUsd: 0,
  pdfTotalUsd: 0,
  notes: '',
};

// ───────────────────────────────────────────────────────────

export function ImportReceivingPage() {
  const { companyId, isLoading: companyLoading } = useCompany();
  const productsQuery = useProducts(companyId);
  const createMut = useCreateImportWithLots(companyId);
  const { showToast } = useToast();

  const [header, setHeader] = useState<ImportInvoiceHeader>(() => ({
    ...DEFAULT_HEADER,
    invoiceDate: todayLocalDateStr(),
  }));
  const [rowInputs, setRowInputs] = useState<ImportRowInput[]>(() => [
    createEmptyRow(),
  ]);

  const [confirmShipping, setConfirmShipping] = useState(false);
  const [confirmDiff, setConfirmDiff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // 제품 코드 매칭 맵 (convertedCode = products.code).
  const products = productsQuery.data ?? [];
  const productByCode = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of products) map.set(p.code, { id: p.id, name: p.name });
    return map;
  }, [products]);

  // 행별 enrichment + 계산. totalUsd 는 행마다 독립, actualTotal 은 전체 합.
  const actualTotalUsd = useMemo(
    () => computeInvoiceActualTotalUsd(rowInputs),
    [rowInputs],
  );

  const enrichedRows: ImportRow[] = useMemo(() => {
    return rowInputs.map((r): ImportRow => {
      const converted = r.sourceCode.trim()
        ? normalizeSourceCode(r.sourceCode.trim())
        : '';
      const match = converted ? (productByCode.get(converted) ?? null) : null;
      const sourceUnit = computeSourceUnitPriceUsd(r.totalUsd, r.quantity);
      const unitPrice = computeUnitPriceUsd(r.totalUsd, r.adjustedQuantity);
      const shippingAlloc = computeShippingAllocationUsd(
        r.totalUsd,
        actualTotalUsd,
        header.shippingCostUsd,
      );
      const costKrw = computeCostKrw(
        unitPrice,
        shippingAlloc,
        r.adjustedQuantity,
        header.exchangeRate,
      );
      const lineTotal = computeLineTotalKrw(r.adjustedQuantity, costKrw);
      return {
        ...r,
        convertedCode: converted,
        productId: match?.id ?? null,
        productName: match?.name ?? '',
        status: match ? 'matched' : 'unmatched',
        sourceUnitPriceUsd: sourceUnit,
        unitPriceUsd: unitPrice,
        shippingAllocatedUsd: shippingAlloc,
        costKrw,
        lineTotalKrw: lineTotal,
      };
    });
  }, [
    rowInputs,
    productByCode,
    actualTotalUsd,
    header.shippingCostUsd,
    header.exchangeRate,
  ]);

  // 요약 — "유효 행" 정의: sourceCode 입력이 있는 행.
  const summary = useMemo(() => {
    const relevant = enrichedRows.filter((r) => r.sourceCode.trim().length > 0);
    const total = relevant.length;
    const matched = relevant.filter((r) => r.status === 'matched').length;
    const unmatched = total - matched;
    const totalKrw = enrichedRows.reduce((s, r) => s + r.lineTotalKrw, 0);
    const diffUsd =
      header.pdfTotalUsd > 0 ? header.pdfTotalUsd - actualTotalUsd : 0;
    const significantDiff = hasSignificantTotalDiff(
      header.pdfTotalUsd,
      actualTotalUsd,
    );
    return {
      total,
      matched,
      unmatched,
      actualTotalUsd,
      diffUsd,
      significantDiff,
      totalKrw,
      pdfTotalUsd: header.pdfTotalUsd,
    };
  }, [enrichedRows, actualTotalUsd, header.pdfTotalUsd]);

  // ───── Row 조작 ─────
  const addRow = () => setRowInputs((rs) => [...rs, createEmptyRow()]);

  const removeRow = (id: string) =>
    setRowInputs((rs) => (rs.length <= 1 ? [createEmptyRow()] : rs.filter((r) => r.id !== id)));

  const updateRow = (id: string, patch: Partial<ImportRowInput>) => {
    setRowInputs((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const next: ImportRowInput = { ...r, ...patch };
        // quantity / unit 변경 시 adjustedQuantity 자동 추종 여부 판단.
        if ('quantity' in patch || 'unit' in patch) {
          const prevDefault = computeAdjustedQuantityDefault(r.quantity, r.unit);
          const wasAuto =
            r.adjustedQuantity === prevDefault || r.adjustedQuantity === 0;
          if (wasAuto) {
            next.adjustedQuantity = computeAdjustedQuantityDefault(
              next.quantity,
              next.unit,
            );
          }
        }
        return next;
      }),
    );
  };

  // ───── 제출 가능 여부 ─────
  const validSubmitRows = useMemo(
    () =>
      enrichedRows.filter(
        (r) =>
          r.sourceCode.trim() &&
          r.quantity > 0 &&
          r.adjustedQuantity > 0 &&
          r.totalUsd > 0 &&
          r.status === 'matched' &&
          r.productId,
      ),
    [enrichedRows],
  );

  const headerValid =
    header.invoiceNumber.trim().length > 0 &&
    header.invoiceDate.length > 0 &&
    header.exchangeRate > 0 &&
    header.shippingCostUsd >= 0;

  const canSubmit =
    Boolean(companyId) &&
    !companyLoading &&
    !createMut.isPending &&
    headerValid &&
    summary.unmatched === 0 &&
    validSubmitRows.length > 0;

  // ───── 제출 플로우 (사전 확인 체이닝) ─────
  const handleSubmitClick = () => {
    if (!canSubmit) return;
    if (header.shippingCostUsd === 0) {
      setConfirmShipping(true);
      return;
    }
    if (summary.significantDiff) {
      setConfirmDiff(true);
      return;
    }
    performSubmit();
  };

  const onConfirmShipping = () => {
    setConfirmShipping(false);
    if (summary.significantDiff) {
      setConfirmDiff(true);
      return;
    }
    performSubmit();
  };

  const onConfirmDiff = () => {
    setConfirmDiff(false);
    performSubmit();
  };

  const performSubmit = () => {
    const rowsToSubmit = validSubmitRows;
    createMut.mutate(
      { header, rows: rowsToSubmit },
      {
        onSuccess: () => {
          showToast({
            kind: 'success',
            text: `${rowsToSubmit.length}건 입고 완료`,
          });
          // 행은 초기화, 헤더는 유지 (연속 입력 편의).
          setRowInputs([createEmptyRow()]);
        },
        onError: (e) => {
          showToast({ kind: 'error', text: e.message });
        },
      },
    );
  };

  // ───── 초기화 ─────
  const onConfirmReset = () => {
    setRowInputs([createEmptyRow()]);
    setConfirmReset(false);
  };

  const busy = createMut.isPending;

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
        {/* Page header */}
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
            재고매입 › 수입/매입
          </div>
          <h1
            className="disp"
            style={{
              fontSize: 26,
              fontWeight: 500,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            수입/매입
          </h1>
        </header>

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

        <ImportHeaderForm value={header} onChange={setHeader} disabled={busy} />

        <ImportSummaryBar
          total={summary.total}
          matched={summary.matched}
          unmatched={summary.unmatched}
          pdfTotalUsd={summary.pdfTotalUsd}
          actualTotalUsd={summary.actualTotalUsd}
          diffUsd={summary.diffUsd}
          significantDiff={summary.significantDiff}
          totalKrw={summary.totalKrw}
        />

        <ImportRowsTable
          rows={enrichedRows}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onAddRow={addRow}
          disabled={busy}
        />

        {/* 하단 액션 바 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 14,
            gap: 10,
          }}
        >
          <button
            type="button"
            className="btn-base"
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            style={{ height: 34, fontSize: 12.5 }}
          >
            초기화
          </button>
          <button
            type="button"
            className="btn-base primary"
            onClick={handleSubmitClick}
            disabled={!canSubmit}
            title={
              !companyId
                ? '회사 정보 로딩 중'
                : !headerValid
                  ? '헤더 필수 항목을 입력하세요'
                  : validSubmitRows.length === 0
                    ? '수량/합계/입고수량을 모두 입력한 행이 필요합니다'
                    : summary.unmatched > 0
                      ? `미매칭 행 ${summary.unmatched}건을 확인하세요`
                      : ''
            }
            style={{ height: 34, fontSize: 12.5, minWidth: 180 }}
          >
            {busy
              ? '처리 중…'
              : `입고확정 (${validSubmitRows.length}건)`}
          </button>
        </div>
      </main>

      {/* 운송비 0 확인 */}
      <ConfirmDialog
        open={confirmShipping}
        onClose={() => setConfirmShipping(false)}
        title="운송비 확인"
        body={
          <>
            운송비가 <strong>$0.00</strong> 입니다. 그대로 진행할까요?
            <br />
            진행 시 운송비 배분은 행별로 $0 으로 계산됩니다.
          </>
        }
        confirmLabel="진행"
        onConfirm={onConfirmShipping}
        busy={busy}
      />

      {/* 합계 차이 확인 */}
      <ConfirmDialog
        open={confirmDiff}
        onClose={() => setConfirmDiff(false)}
        title="합계 차이 확인"
        body={
          <>
            인보이스 합계($
            {summary.pdfTotalUsd.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            ) 와 실제 합계($
            {summary.actualTotalUsd.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            ) 가 <strong>$
              {Math.abs(summary.diffUsd).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>{' '}
            차이납니다. 계속 진행할까요?
          </>
        }
        confirmLabel="진행"
        onConfirm={onConfirmDiff}
        busy={busy}
      />

      {/* 초기화 확인 */}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="행 초기화"
        body="모든 행을 비웁니다. 헤더(Invoice # / 날짜 / 환율 등)는 유지됩니다."
        confirmLabel="초기화"
        confirmVariant="danger"
        onConfirm={onConfirmReset}
        busy={busy}
      />
    </div>
  );
}
