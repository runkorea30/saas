/**
 * 모바일 수입/매입 — 데스크톱 OPS ImportReceivingPage 와 동일 기능.
 *
 * 3탭 구조 (데스크톱과 동일):
 *  1) 인보이스 검증 — PDF 업로드 → Claude 파싱 → 행 채움
 *  2) 입고 처리   — Header 폼 + 행 테이블 + 요약 + 입고확정 + 최근 인보이스
 *  3) 거래처 안내 — 페덱스/해상운송 sub-tab + 상태/날짜/제품 + 저장
 *
 * 🔴 CLAUDE.md §1: company_id useCompany().
 * 🔴 CLAUDE.md §2: 모든 계산은 src/utils/inventory.ts 순수 함수.
 * 🔴 CLAUDE.md §5: useCreateImportWithLots / useProducts / useRecentImportInvoices 재사용.
 *
 * 🟠 데스크톱 컴포넌트(ImportHeaderForm, ImportSummaryBar, ImportRowsTable,
 *    InvoiceUploadCard, RecentInvoicesSection, ConfirmDialog) 그대로 재사용 —
 *    OPS 코드 0 줄 수정. 모바일 셸(헤더/탭/패딩)만 새로 작성.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCompany } from '@/hooks/useCompany';
import type { ImportNoticeProduct, ImportNoticeStatus } from '@/hooks/useCompany';
import type { Json } from '@/types/database';
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
import { InvoiceUploadCard } from '@/components/feature/import/InvoiceUploadCard';
import { RecentInvoicesSection } from '@/components/feature/import/RecentInvoicesSection';
import { CustomsDocTab } from '@/components/feature/import/CustomsDocTab';
import { parseInvoicePDF } from '@/utils/invoiceParser';
import { RefreshButton } from '../components/RefreshButton';

type TabKey = 'verification' | 'customs' | 'receiving' | 'portal';

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

export function ImportPage() {
  const { companyId, company, isLoading: companyLoading } = useCompany();
  const productsQuery = useProducts(companyId);
  const createMut = useCreateImportWithLots(companyId);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('verification');

  // 새로고침 — products + import-invoices(RecentInvoicesSection) + current-company
  const refreshing = productsQuery.isFetching;
  const handleRefresh = () => {
    void productsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['import-invoices', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['current-company'] });
  };

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

  // 거래처 안내 상태 (페덱스 + 해상운송)
  const [noticeStatus, setNoticeStatus] = useState<'' | ImportNoticeStatus>('');
  const [noticeDate, setNoticeDate] = useState('');
  const [noticeProducts, setNoticeProducts] = useState<ImportNoticeProduct[]>([]);
  const [noticeProductInput, setNoticeProductInput] = useState('');
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeParsingPdf, setNoticeParsingPdf] = useState(false);
  const [noticeOrderDate, setNoticeOrderDate] = useState('');
  const [noticeShipDate, setNoticeShipDate] = useState('');
  const [noticeCustomsDate, setNoticeCustomsDate] = useState('');
  const [noticeArrivalText, setNoticeArrivalText] = useState('');

  const [noticeTab, setNoticeTab] = useState<'fedex' | 'sea'>('fedex');
  const [noticeSeaStatus, setNoticeSeaStatus] = useState<'' | ImportNoticeStatus>('');
  const [noticeSeaProducts, setNoticeSeaProducts] = useState<ImportNoticeProduct[]>([]);
  const [noticeSeaOrderDate, setNoticeSeaOrderDate] = useState('');
  const [noticeSeaShipDate, setNoticeSeaShipDate] = useState('');
  const [noticeSeaCustomsDate, setNoticeSeaCustomsDate] = useState('');
  const [noticeSeaArrivalText, setNoticeSeaArrivalText] = useState('');

  useEffect(() => {
    if (!company) return;
    setNoticeStatus(company.import_notice_status ?? '');
    setNoticeDate(company.import_notice_date ?? '');
    setNoticeProducts(company.import_notice_products ?? []);
    setNoticeOrderDate(company.import_notice_order_date ?? '');
    setNoticeShipDate(company.import_notice_ship_date ?? '');
    setNoticeCustomsDate(company.import_notice_customs_date ?? '');
    setNoticeArrivalText(company.import_notice_arrival_text ?? '');
    setNoticeSeaStatus(company.import_notice_sea_status ?? '');
    setNoticeSeaProducts(company.import_notice_sea_products ?? []);
    setNoticeSeaOrderDate(company.import_notice_sea_order_date ?? '');
    setNoticeSeaShipDate(company.import_notice_sea_ship_date ?? '');
    setNoticeSeaCustomsDate(company.import_notice_sea_customs_date ?? '');
    setNoticeSeaArrivalText(company.import_notice_sea_arrival_text ?? '');
  }, [company]);

  // 인보이스 검증 → 입고처리 이관본 복원 (companyId 로드 시 1회).
  // rowInputs 가 초기 빈 상태일 때만 덮어씀 — 사용자가 이미 편집 중이면 보존.
  const [transferLoaded, setTransferLoaded] = useState(false);
  useEffect(() => {
    if (!companyId || transferLoaded) return;
    setTransferLoaded(true);

    void supabase
      .from('invoice_verifications')
      .select('transfer_rows, invoice_no, invoice_date')
      .eq('company_id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const restored =
          (data.transfer_rows as unknown as ImportRowInput[]) ?? [];
        if (restored.length === 0) return;
        const untouched =
          rowInputs.length === 1 && !rowInputs[0].sourceCode.trim();
        if (!untouched) return;
        setRowInputs(restored);
        setHeader((h) => ({
          ...h,
          invoiceNumber: data.invoice_no ?? h.invoiceNumber,
          invoiceDate: data.invoice_date || h.invoiceDate,
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const isSea = noticeTab === 'sea';
  const activeStatus = isSea ? noticeSeaStatus : noticeStatus;
  const setActiveStatus = isSea ? setNoticeSeaStatus : setNoticeStatus;
  const activeOrderDate = isSea ? noticeSeaOrderDate : noticeOrderDate;
  const setActiveOrderDate = isSea ? setNoticeSeaOrderDate : setNoticeOrderDate;
  const activeShipDate = isSea ? noticeSeaShipDate : noticeShipDate;
  const setActiveShipDate = isSea ? setNoticeSeaShipDate : setNoticeShipDate;
  const activeCustomsDate = isSea ? noticeSeaCustomsDate : noticeCustomsDate;
  const setActiveCustomsDate = isSea ? setNoticeSeaCustomsDate : setNoticeCustomsDate;
  const activeArrivalText = isSea ? noticeSeaArrivalText : noticeArrivalText;
  const setActiveArrivalText = isSea ? setNoticeSeaArrivalText : setNoticeArrivalText;
  const activeProducts = isSea ? noticeSeaProducts : noticeProducts;
  const setActiveProducts = isSea ? setNoticeSeaProducts : setNoticeProducts;

  const products = productsQuery.data ?? [];
  const productByCode = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of products) map.set(p.code, { id: p.id, name: p.name });
    return map;
  }, [products]);

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
  }, [rowInputs, productByCode, actualTotalUsd, header.shippingCostUsd, header.exchangeRate]);

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

  const addRow = () => setRowInputs((rs) => [...rs, createEmptyRow()]);
  const removeRow = (id: string) =>
    setRowInputs((rs) =>
      rs.length <= 1 ? [createEmptyRow()] : rs.filter((r) => r.id !== id),
    );
  const updateRow = (id: string, patch: Partial<ImportRowInput>) => {
    setRowInputs((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const next: ImportRowInput = { ...r, ...patch };
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
          setRowInputs([createEmptyRow()]);
          // 이관본도 클리어 — 다음 새로고침 때 빈 상태로 시작.
          if (companyId) {
            void (async () => {
              const { error } = await supabase
                .from('invoice_verifications')
                .update({
                  transfer_rows: [] as unknown as Json,
                  transfer_saved_at: null,
                })
                .eq('company_id', companyId);
              if (error) {
                // eslint-disable-next-line no-console
                console.error('[transfer_rows.clear]', error);
              }
            })();
          }
        },
        onError: (e) => {
          showToast({ kind: 'error', text: e.message });
        },
      },
    );
  };

  const onConfirmReset = () => {
    setRowInputs([createEmptyRow()]);
    setConfirmReset(false);
  };

  const busy = createMut.isPending;

  const handleAddNoticeProduct = () => {
    const q = noticeProductInput.trim().toUpperCase();
    if (!q) return;
    const found = products.find((p) => p.code.toUpperCase() === q);
    if (!found) {
      showToast({ kind: 'error', text: `제품 코드 "${q}"를 찾을 수 없습니다.` });
      return;
    }
    if (activeProducts.some((p) => p.code === found.code)) {
      showToast({ kind: 'info', text: '이미 추가된 제품입니다.' });
      return;
    }
    void mutateProducts([...activeProducts, { code: found.code, name: found.name }]);
    setNoticeProductInput('');
  };

  const handleNoticePdfUpload = async (file: File) => {
    if (!/\.pdf$/i.test(file.name)) {
      showToast({ kind: 'error', text: 'PDF 파일만 업로드 가능합니다.' });
      return;
    }
    setNoticeParsingPdf(true);
    try {
      const parsed = await parseInvoicePDF(file);
      const matched: ImportNoticeProduct[] = [];
      const unmatched: string[] = [];
      const seen = new Set(activeProducts.map((p) => p.code));
      for (const row of parsed.rows) {
        const code = row.item_code.trim();
        if (!code) continue;
        const product = products.find(
          (p) => p.code.toUpperCase() === code.toUpperCase(),
        );
        if (!product) {
          unmatched.push(code);
          continue;
        }
        if (seen.has(product.code)) continue;
        seen.add(product.code);
        matched.push({ code: product.code, name: product.name });
      }
      if (matched.length > 0) {
        void mutateProducts([...activeProducts, ...matched]);
      }
      const parts: string[] = [`${matched.length}개 제품 추가됨`];
      if (unmatched.length > 0) {
        const sample = unmatched.slice(0, 5).join(', ');
        const ellipsis = unmatched.length > 5 ? ' …' : '';
        parts.push(`매칭 실패 ${unmatched.length}개: ${sample}${ellipsis}`);
      }
      showToast({
        kind: matched.length > 0 ? 'success' : 'info',
        text: parts.join(' · '),
      });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : 'PDF 파싱 중 오류가 발생했습니다.',
      });
    } finally {
      setNoticeParsingPdf(false);
    }
  };

  // 🔴 products 는 mutation 시점마다 즉시 targeted UPDATE — desktop
  //    ImportReceivingPage 와 동일 규칙. 아래 save payload 에도 products 는 절대
  //    포함시키지 말 것 (hydration race 로 DB wipe 재발 방지).
  const persistProducts = async (
    nextProducts: ImportNoticeProduct[],
    seaTab: boolean,
  ): Promise<boolean> => {
    if (!companyId) return false;
    const updateData = seaTab
      ? { import_notice_sea_products: nextProducts as unknown as Json }
      : { import_notice_products: nextProducts as unknown as Json };
    const { error } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', companyId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[mobile-import-notice.persistProducts]', error);
      showToast({
        kind: 'error',
        text: `제품 목록 저장 실패: ${error.message}`,
      });
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ['current-company'] });
    return true;
  };

  const mutateProducts = async (next: ImportNoticeProduct[]) => {
    const prev = activeProducts;
    const seaTab = isSea;
    setActiveProducts(next);
    const ok = await persistProducts(next, seaTab);
    if (!ok) {
      if (seaTab) setNoticeSeaProducts(prev);
      else setNoticeProducts(prev);
    }
  };

  const handleNoticeSave = async () => {
    if (!companyId) return;
    setNoticeSaving(true);
    try {
      // 🔴 products 필드 절대 미포함 — persistProducts() 로만 별도 저장.
      const updateData = isSea
        ? {
            import_notice_sea_status: noticeSeaStatus || null,
            import_notice_sea_order_date: noticeSeaOrderDate || null,
            import_notice_sea_ship_date: noticeSeaShipDate || null,
            import_notice_sea_customs_date: noticeSeaCustomsDate || null,
            import_notice_sea_arrival_text: noticeSeaArrivalText || null,
          }
        : {
            import_notice_status: noticeStatus || null,
            import_notice_date: noticeDate || null,
            import_notice_order_date: noticeOrderDate || null,
            import_notice_ship_date: noticeShipDate || null,
            import_notice_customs_date: noticeCustomsDate || null,
            import_notice_arrival_text: noticeArrivalText || null,
          };
      const { error } = await supabase
        .from('companies')
        .update(updateData)
        .eq('id', companyId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['current-company'] });
      showToast({ kind: 'success', text: '저장되었습니다.' });
    } catch (e) {
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.',
      });
    } finally {
      setNoticeSaving(false);
    }
  };

  return (
    <div>
      {/* 페이지 헤더 */}
      <header className="m-page-header" style={{ paddingBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="m-page-title">수입/매입</h1>
          <div style={{ flex: 1 }} />
          <RefreshButton onClick={handleRefresh} refreshing={refreshing} />
        </div>
        <div className="m-tab-row">
          <button
            type="button"
            className="m-tab"
            aria-pressed={activeTab === 'verification'}
            onClick={() => setActiveTab('verification')}
          >
            인보이스 검증
          </button>
          <button
            type="button"
            className="m-tab"
            aria-pressed={activeTab === 'customs'}
            onClick={() => setActiveTab('customs')}
          >
            통관서류
          </button>
          <button
            type="button"
            className="m-tab"
            aria-pressed={activeTab === 'receiving'}
            onClick={() => setActiveTab('receiving')}
          >
            입고 처리
          </button>
          <button
            type="button"
            className="m-tab"
            aria-pressed={activeTab === 'portal'}
            onClick={() => setActiveTab('portal')}
          >
            거래처 안내
          </button>
        </div>
      </header>

      {productsQuery.error && (
        <div
          style={{
            margin: '10px 16px',
            padding: '10px 12px',
            background: 'var(--m-danger)' + '11',
            color: 'var(--m-danger)',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          제품 목록 로딩 실패: {productsQuery.error.message}
        </div>
      )}

      <div style={{ padding: '10px 12px 16px' }}>
        {/* 데스크톱 컴포넌트가 자체 OPS 스타일로 렌더 — wrapper 가로 스크롤 */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {activeTab === 'verification' && (
            <InvoiceUploadCard
              companyId={companyId}
              disabled={busy}
              products={productsQuery.data}
              onFill={(rows, headerPatch) => {
                setRowInputs(rows.length > 0 ? rows : [createEmptyRow()]);
                setHeader((h) => ({ ...h, ...headerPatch }));
                setActiveTab('receiving');
                showToast({
                  kind: 'success',
                  text: `${rows.length}개 행 입력 완료. [입고 처리] 탭에서 검수 후 [입고확정] 을 눌러 주세요.`,
                });
              }}
            />
          )}

          {activeTab === 'customs' && <CustomsDocTab />}

          {activeTab === 'receiving' && (
            <>
              <ImportHeaderForm
                value={header}
                onChange={setHeader}
                disabled={busy}
              />
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={busy}
                  style={mobileBtnStyle(false, busy)}
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={!canSubmit}
                  style={mobileBtnStyle(true, !canSubmit)}
                >
                  {busy ? '처리 중…' : `입고확정 (${validSubmitRows.length}건)`}
                </button>
              </div>

              <div style={{ marginTop: 16 }}>
                <RecentInvoicesSection companyId={companyId} />
              </div>
            </>
          )}

          {activeTab === 'portal' && (
            <PortalSection
              noticeTab={noticeTab}
              setNoticeTab={setNoticeTab}
              isSea={isSea}
              activeStatus={activeStatus}
              setActiveStatus={setActiveStatus}
              activeOrderDate={activeOrderDate}
              setActiveOrderDate={setActiveOrderDate}
              activeShipDate={activeShipDate}
              setActiveShipDate={setActiveShipDate}
              activeCustomsDate={activeCustomsDate}
              setActiveCustomsDate={setActiveCustomsDate}
              activeArrivalText={activeArrivalText}
              setActiveArrivalText={setActiveArrivalText}
              noticeDate={noticeDate}
              setNoticeDate={setNoticeDate}
              activeProducts={activeProducts}
              onRemoveProduct={(code) => {
                void mutateProducts(activeProducts.filter((x) => x.code !== code));
              }}
              noticeProductInput={noticeProductInput}
              setNoticeProductInput={setNoticeProductInput}
              noticeParsingPdf={noticeParsingPdf}
              onAddProduct={handleAddNoticeProduct}
              onClearProducts={() => {
                if (activeProducts.length === 0) return;
                const ok = window.confirm(
                  `${isSea ? '해상운송' : '페덱스'} 탭의 제품 목록 ${activeProducts.length}개를 모두 삭제하고 즉시 저장합니다.\n\n되돌릴 수 없습니다. 진행할까요?`,
                );
                if (ok) void mutateProducts([]);
              }}
              onUploadPdf={handleNoticePdfUpload}
              onSave={handleNoticeSave}
              saving={noticeSaving}
              companyId={companyId}
            />
          )}
        </div>
      </div>

      {/* Confirm 다이얼로그 — 데스크톱과 동일 동작 */}
      <ConfirmDialog
        open={confirmShipping}
        onClose={() => setConfirmShipping(false)}
        title="운송비 확인"
        body={
          <>
            운송비가 <strong>$0.00</strong> 입니다. 그대로 진행할까요?
          </>
        }
        confirmLabel="진행"
        onConfirm={onConfirmShipping}
        busy={busy}
      />
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
            ) 가 $
            {Math.abs(summary.diffUsd).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            차이납니다. 계속 진행할까요?
          </>
        }
        confirmLabel="진행"
        onConfirm={onConfirmDiff}
        busy={busy}
      />
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

// ───────────────────────────────────────────────────────────
// 거래처 안내 섹션 (모바일 컴팩트)
// ───────────────────────────────────────────────────────────

interface PortalSectionProps {
  noticeTab: 'fedex' | 'sea';
  setNoticeTab: (v: 'fedex' | 'sea') => void;
  isSea: boolean;
  activeStatus: '' | ImportNoticeStatus;
  setActiveStatus: (v: '' | ImportNoticeStatus) => void;
  activeOrderDate: string;
  setActiveOrderDate: (v: string) => void;
  activeShipDate: string;
  setActiveShipDate: (v: string) => void;
  activeCustomsDate: string;
  setActiveCustomsDate: (v: string) => void;
  activeArrivalText: string;
  setActiveArrivalText: (v: string) => void;
  noticeDate: string;
  setNoticeDate: (v: string) => void;
  activeProducts: ImportNoticeProduct[];
  onRemoveProduct: (code: string) => void;
  noticeProductInput: string;
  setNoticeProductInput: (v: string) => void;
  noticeParsingPdf: boolean;
  onAddProduct: () => void;
  onClearProducts: () => void;
  onUploadPdf: (file: File) => void;
  onSave: () => void;
  saving: boolean;
  companyId: string | null;
}

function PortalSection(p: PortalSectionProps) {
  const STATUSES: ImportNoticeStatus[] = ['주문완료', '운송중', '통관진행중', '도착예정'];
  return (
    <section className="m-card" style={{ padding: 14 }}>
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--m-text)',
        }}
      >
        📦 거래처 포털 수입 안내 설정
      </h3>

      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--m-border)',
          marginBottom: 12,
        }}
      >
        {(
          [
            { key: 'fedex' as const, label: '✈️ 페덱스' },
            { key: 'sea' as const, label: '🚢 해상운송' },
          ]
        ).map((t) => {
          const on = p.noticeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => p.setNoticeTab(t.key)}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: on ? 600 : 500,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--m-primary)' : 'transparent'}`,
                color: on ? 'var(--m-primary)' : 'var(--m-text-secondary)',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {STATUSES.map((s) => {
          const active = p.activeStatus === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => p.setActiveStatus(s)}
              style={statusPillStyle(active)}
            >
              {s}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => p.setActiveStatus('')}
          style={statusPillStyle(!p.activeStatus, true)}
        >
          숨기기
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {[
          {
            label: '주문완료 날짜',
            value: p.activeOrderDate,
            set: p.setActiveOrderDate,
            ph: '예: 2026-06-22',
          },
          {
            label: '운송중 날짜',
            value: p.activeShipDate,
            set: p.setActiveShipDate,
            ph: '예: 2026-06-25',
          },
          {
            label: '통관진행중 날짜',
            value: p.activeCustomsDate,
            set: p.setActiveCustomsDate,
            ph: '예: 2026-07-10',
          },
          {
            label: '도착예정 문구',
            value: p.activeArrivalText,
            set: p.setActiveArrivalText,
            ph: '예: 7월 15일 도착예정',
          },
        ].map((row) => (
          <div key={row.label}>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                color: 'var(--m-text-secondary)',
                marginBottom: 3,
              }}
            >
              {row.label}
            </label>
            <input
              type="text"
              value={row.value}
              onChange={(e) => row.set(e.target.value)}
              placeholder={row.ph}
              style={mobileInputStyle}
            />
          </div>
        ))}
        {!p.isSea && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                color: 'var(--m-text-secondary)',
                marginBottom: 3,
              }}
            >
              도착예정일 (companies.import_notice_date)
            </label>
            <input
              type="text"
              value={p.noticeDate}
              onChange={(e) => p.setNoticeDate(e.target.value)}
              placeholder="예: 2026-07-15"
              style={mobileInputStyle}
            />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--m-text-secondary)',
            marginBottom: 4,
          }}
        >
          표시할 제품 (코드 입력 후 Enter)
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={p.noticeProductInput}
            onChange={(e) => p.setNoticeProductInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                p.onAddProduct();
              }
            }}
            placeholder="제품코드"
            style={{ ...mobileInputStyle, flex: 1 }}
          />
          <button type="button" onClick={p.onAddProduct} style={mobileBtnStyle(false, false)}>
            추가
          </button>
          <label
            style={{
              ...mobileBtnStyle(false, p.noticeParsingPdf),
              display: 'inline-flex',
              alignItems: 'center',
            }}
            title="인보이스 PDF 자동 추가"
          >
            {p.noticeParsingPdf ? '파싱…' : '📄 PDF'}
            <input
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) p.onUploadPdf(f);
                e.target.value = '';
              }}
              disabled={p.noticeParsingPdf}
            />
          </label>
          {p.activeProducts.length > 0 && (
            <button
              type="button"
              onClick={p.onClearProducts}
              style={{
                ...mobileBtnStyle(false, false),
                border: '1px solid var(--m-danger, #ef4444)',
                color: 'var(--m-danger, #ef4444)',
                marginLeft: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              전체 삭제
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.activeProducts.map((it) => (
            <span
              key={it.code}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                fontSize: 11,
                background: 'var(--m-surface-2)',
                border: '1px solid var(--m-border)',
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  fontFamily: 'Inter Tight, system-ui, sans-serif',
                  color: 'var(--m-text-secondary)',
                }}
              >
                {it.code}
              </span>
              <span style={{ color: 'var(--m-text)' }}>{it.name}</span>
              <button
                type="button"
                onClick={() => p.onRemoveProduct(it.code)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--m-text-secondary)',
                  padding: 0,
                  marginLeft: 2,
                  fontSize: 11,
                }}
                title="제거"
              >
                ✕
              </button>
            </span>
          ))}
          {p.activeProducts.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}>
              추가된 제품 없음
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={p.onSave}
        disabled={p.saving || !p.companyId}
        style={mobileBtnStyle(true, p.saving || !p.companyId)}
      >
        {p.saving ? '저장 중…' : '저장'}
      </button>
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// 스타일
// ───────────────────────────────────────────────────────────

const mobileInputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--m-border-strong)',
  borderRadius: 6,
  fontSize: 12.5,
  background: 'var(--m-surface)',
  color: 'var(--m-text)',
  outline: 'none',
  boxSizing: 'border-box',
};

function mobileBtnStyle(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: '0 14px',
    border: `1px solid ${primary ? 'var(--m-primary)' : 'var(--m-border-strong)'}`,
    borderRadius: 6,
    background: primary
      ? disabled
        ? 'var(--m-surface-2)'
        : 'var(--m-primary)'
      : 'var(--m-surface)',
    color: primary
      ? disabled
        ? 'var(--m-text-secondary)'
        : '#ffffff'
      : 'var(--m-text)',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled && !primary ? 0.6 : 1,
  };
}

function statusPillStyle(active: boolean, neutral = false): React.CSSProperties {
  if (neutral) {
    return {
      padding: '5px 11px',
      fontSize: 11.5,
      borderRadius: 6,
      border: `1px solid ${active ? '#9CA3AF' : 'var(--m-border-strong)'}`,
      background: active ? '#E5E7EB' : 'var(--m-surface)',
      color: active ? '#4B5563' : 'var(--m-text-secondary)',
      cursor: 'pointer',
    };
  }
  return {
    padding: '5px 11px',
    fontSize: 11.5,
    borderRadius: 6,
    border: `1px solid ${active ? 'var(--m-primary)' : 'var(--m-border-strong)'}`,
    background: active ? 'var(--m-primary)' : 'var(--m-surface)',
    color: active ? '#ffffff' : 'var(--m-text)',
    cursor: 'pointer',
  };
}
