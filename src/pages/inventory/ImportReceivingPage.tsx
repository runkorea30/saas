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

type TabKey = 'verification' | 'customs' | 'receiving' | 'portal';

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
  const { companyId, company, isLoading: companyLoading } = useCompany();
  const productsQuery = useProducts(companyId);
  const createMut = useCreateImportWithLots(companyId);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('verification');

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

  // ───── 거래처 포털 수입 안내 설정 ─────
  const [noticeStatus, setNoticeStatus] = useState<'' | ImportNoticeStatus>('');
  const [noticeDate, setNoticeDate] = useState<string>('');
  const [noticeProducts, setNoticeProducts] = useState<ImportNoticeProduct[]>([]);
  const [noticeProductInput, setNoticeProductInput] = useState('');
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeParsingPdf, setNoticeParsingPdf] = useState(false);
  // 상태별 자유 텍스트 — 거래처 포털 카드 스텝퍼 아래/헤더에 그대로 노출됨.
  const [noticeOrderDate, setNoticeOrderDate] = useState('');
  const [noticeShipDate, setNoticeShipDate] = useState('');
  const [noticeCustomsDate, setNoticeCustomsDate] = useState('');
  const [noticeArrivalText, setNoticeArrivalText] = useState('');

  // 해상운송 전용 상태 (페덱스와 동일 구조, 별도 컬럼).
  const [noticeTab, setNoticeTab] = useState<'fedex' | 'sea'>('fedex');
  const [noticeSeaStatus, setNoticeSeaStatus] = useState<'' | ImportNoticeStatus>('');
  const [noticeSeaProducts, setNoticeSeaProducts] = useState<ImportNoticeProduct[]>([]);
  const [noticeSeaOrderDate, setNoticeSeaOrderDate] = useState('');
  const [noticeSeaShipDate, setNoticeSeaShipDate] = useState('');
  const [noticeSeaCustomsDate, setNoticeSeaCustomsDate] = useState('');
  const [noticeSeaArrivalText, setNoticeSeaArrivalText] = useState('');

  // 안내 설정에 자동 첨부된 인보이스 PDF (항공/해상 별). document_files 테이블에서 조회.
  //  category:
  //   - 'import_notice_invoice_air' → 항공(페덱스) 슬롯
  //   - 'import_notice_invoice_sea' → 해상 슬롯
  //  InvoiceUploadCard 의 "입고처리로 이관" 흐름에서 자동 upsert 됨.
  type NoticeInvoiceFile = {
    file_name: string;
    file_path: string;
    file_size: number | null;
    uploaded_at: string | null;
  };
  const [noticeInvoiceAir, setNoticeInvoiceAir] = useState<NoticeInvoiceFile | null>(null);
  const [noticeInvoiceSea, setNoticeInvoiceSea] = useState<NoticeInvoiceFile | null>(null);
  // 안내 첨부 인보이스 재조회 트리거. 이관 완료 시 부모 onFill 콜백에서 +1 하여
  //  사용자가 이미 portal 탭에 있어 activeTab 이 안 바뀌는 경우에도 useEffect 재실행.
  const [noticeInvoiceReloadKey, setNoticeInvoiceReloadKey] = useState(0);

  // 안내 설정 탭 진입 시 첨부된 인보이스 PDF 정보 조회.
  //  사용자 흐름: 인보이스 검증 → 이관 → activeTab 자동으로 receiving 이동 → 사용자가
  //  나중에 안내 설정 탭 클릭 시 이 useEffect 가 트리거되어 최신 첨부 반영.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[notice-invoice] useEffect', { companyId, activeTab, noticeInvoiceReloadKey });
    if (!companyId) {
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] SKIP: companyId is null/empty');
      return;
    }
    if (activeTab !== 'portal') {
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] SKIP: activeTab is not portal, current =', activeTab);
      return;
    }
    let cancelled = false;
    void (async () => {
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] fetching document_files…');
      const { data, error } = await supabase
        .from('document_files')
        .select('category, file_name, file_path, file_size, uploaded_at')
        .eq('company_id', companyId)
        .in('category', ['import_notice_invoice_air', 'import_notice_invoice_sea']);
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] response', { error, dataLength: data?.length, data });
      if (cancelled) {
        // eslint-disable-next-line no-console
        console.log('[notice-invoice] SKIP setState — cancelled=true BEFORE state update');
        return;
      }
      const air = data?.find((d) => d.category === 'import_notice_invoice_air') ?? null;
      const sea = data?.find((d) => d.category === 'import_notice_invoice_sea') ?? null;
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] parsed', { airFound: !!air, seaFound: !!sea, air, sea });
      const airVal = air
        ? {
            file_name: air.file_name,
            file_path: air.file_path,
            file_size: air.file_size,
            uploaded_at: air.uploaded_at,
          }
        : null;
      const seaVal = sea
        ? {
            file_name: sea.file_name,
            file_path: sea.file_path,
            file_size: sea.file_size,
            uploaded_at: sea.uploaded_at,
          }
        : null;
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] calling setNoticeInvoiceAir with', airVal);
      setNoticeInvoiceAir(airVal);
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] calling setNoticeInvoiceSea with', seaVal);
      setNoticeInvoiceSea(seaVal);
      // eslint-disable-next-line no-console
      console.log('[notice-invoice] setState calls returned');
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, activeTab, noticeInvoiceReloadKey]);

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
        const restored = (data.transfer_rows as unknown as ImportRowInput[]) ?? [];
        if (restored.length === 0) return;
        // 첫 행이 비어있는 초기 상태일 때만 복원 — 사용자 편집 보존.
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

  // company 로드/갱신 시 폼 초기값 동기화.
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

  // ───── 활성 탭 상태 alias — UI 와 핸들러에서 단일 흐름으로 처리. ─────
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

  // 제품 코드 매칭 맵 (convertedCode = products.code).
  // Map key 도 normalizeSourceCode 로 정규화 — DB 에 대문자 코드가 있어도
  // 소문자 입력으로 매칭되도록 양방향 방어. (예: DB "720pt105" ↔ 입력 "720PT105")
  const products = productsQuery.data ?? [];
  const productByCode = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of products) map.set(normalizeSourceCode(p.code), { id: p.id, name: p.name });
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
          // 이관본도 클리어 — 다음 새로고침 때 빈 상태로 시작.
          // 🔴 PostgrestBuilder thenable — await 로 실행 보장.
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

  // ───── 초기화 ─────
  const onConfirmReset = () => {
    setRowInputs([createEmptyRow()]);
    setConfirmReset(false);
  };

  const busy = createMut.isPending;

  // ───── 수입 안내 핸들러 — 활성 탭(페덱스/해상운송)에 대해서만 동작. ─────
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
    const next = [...activeProducts, { code: found.code, name: found.name }];
    void mutateProducts(next);
    setNoticeProductInput('');
  };

  /**
   * 인보이스 PDF 업로드 → Claude 파싱 → products.code 매칭 → 안내 제품 목록 추가.
   * 🟠 parseInvoicePDF 는 item_code 에서 이미 하이픈을 제거해 반환한다.
   * 🟡 이미 추가된 제품은 건너뛰고, 매칭 실패 코드는 토스트로 안내.
   */
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
      // eslint-disable-next-line no-console
      console.error('[import-notice.pdf]', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : 'PDF 파싱 중 오류가 발생했습니다.',
      });
    } finally {
      setNoticeParsingPdf(false);
    }
  };

  // 🔴 products 는 저장 버튼과 완전히 분리 — 모든 변경(추가/삭제/PDF 파싱/전체삭제)
  //    시점마다 즉시 targeted UPDATE. 이렇게 하지 않으면 사용자가 페이지 hydration
  //    (useEffect 로 company 값을 state 에 복사) 완료 전에 다른 필드만 편집하고
  //    "저장" 을 누르는 경우, 저장 payload 에 들어간 초기값 [] 이 DB 를 wipe.
  //    (실제 발생 이력 2회 — 08:20 UTC 재현.)
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
      console.error('[import-notice.persistProducts]', error);
      showToast({
        kind: 'error',
        text: `제품 목록 저장 실패: ${error.message}`,
      });
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ['current-company'] });
    return true;
  };

  // 낙관적 UI: state 를 먼저 갱신, 저장 실패 시 롤백.
  const mutateProducts = async (next: ImportNoticeProduct[]) => {
    const prev = activeProducts;
    const seaTab = isSea;
    setActiveProducts(next);
    const ok = await persistProducts(next, seaTab);
    if (!ok) {
      // 롤백 — 다른 탭으로 이동한 후여도 원래 탭의 setter 를 직접 부름.
      if (seaTab) setNoticeSeaProducts(prev);
      else setNoticeProducts(prev);
    }
  };

  // "전체 삭제" 버튼: 확인 후 즉시 저장까지 원자적으로.
  //  현재 활성 탭 (페덱스/해상) 의 products 컬럼만 빈 배열로 UPDATE.
  const handleClearAll = async () => {
    if (!companyId) return;
    if (activeProducts.length === 0) return;
    const ok = window.confirm(
      `${isSea ? '해상운송' : '페덱스'} 탭의 제품 목록 ${activeProducts.length}개를 모두 삭제하고 즉시 저장합니다.\n\n되돌릴 수 없습니다. 진행할까요?`,
    );
    if (!ok) return;
    setNoticeSaving(true);
    try {
      const persisted = await persistProducts([], isSea);
      if (persisted) {
        setActiveProducts([]);
        showToast({ kind: 'success', text: '전체 삭제 후 저장되었습니다.' });
      }
    } finally {
      setNoticeSaving(false);
    }
  };

  const handleNoticeSave = async () => {
    if (!companyId) return;
    setNoticeSaving(true);
    try {
      // 🔴 import_notice_products / import_notice_sea_products 는 이 payload 에
      //    포함하지 않음. products 는 add/remove/PDF/전체삭제 시 즉시 targeted
      //    UPDATE 로 persistProducts() 를 통해 별도 저장. 이 함수에 포함시키면
      //    사용자가 hydration 완료 전에 다른 필드만 편집하고 저장할 때 초기값
      //    [] 이 DB 를 wipe 하는 사고가 재발 (2회 확인됨).
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
      // eslint-disable-next-line no-console
      console.error('[import-notice.save]', e);
      showToast({
        kind: 'error',
        text: e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.',
      });
    } finally {
      setNoticeSaving(false);
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

        {/* 탭 헤더 — 스크롤 시 TopNav(h-14, z-20) 바로 아래에 sticky 로 붙는다.
            long product list 를 스크롤 해도 탭 전환이 항상 가능하도록. */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 16,
            borderBottom: '1px solid var(--line)',
            position: 'sticky',
            top: 56,
            zIndex: 10,
            background: 'var(--bg)',
            paddingTop: 8,
            marginTop: -8,
          }}
        >
          <TabButton
            active={activeTab === 'verification'}
            onClick={() => setActiveTab('verification')}
            label="인보이스 검증"
          />
          <TabButton
            active={activeTab === 'customs'}
            onClick={() => setActiveTab('customs')}
            label="통관서류"
          />
          <TabButton
            active={activeTab === 'receiving'}
            onClick={() => setActiveTab('receiving')}
            label="입고 처리"
          />
          <TabButton
            active={activeTab === 'portal'}
            onClick={() => setActiveTab('portal')}
            label="거래처 안내 설정"
          />
        </div>

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

        {activeTab === 'verification' && (
          <InvoiceUploadCard
            companyId={companyId}
            disabled={busy}
            products={productsQuery.data}
            onFill={(rows, headerPatch) => {
              setRowInputs(rows.length > 0 ? rows : [createEmptyRow()]);
              setHeader((h) => ({ ...h, ...headerPatch }));
              setActiveTab('receiving');
              // portal 탭이 이미 열려있어 activeTab 변화가 없어도 재조회되도록 강제 트리거.
              setNoticeInvoiceReloadKey((k) => k + 1);
              showToast({
                kind: 'success',
                text: `${rows.length}개 행이 입력 폼에 채워졌습니다. [입고 처리] 탭에서 검수 후 [입고확정] 을 눌러 주세요.`,
              });
            }}
          />
        )}

        {activeTab === 'customs' && <CustomsDocTab />}

        {activeTab === 'receiving' && (
          <>
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

        {/* 상단 액션 바 — 테이블 위 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 14,
            marginBottom: 10,
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

        <ImportRowsTable
          rows={enrichedRows}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onAddRow={addRow}
          disabled={busy}
        />

            <RecentInvoicesSection companyId={companyId} />
          </>
        )}

        {/* ───── 거래처 포털 수입 안내 설정 ───── */}
        {activeTab === 'portal' && (
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 16,
            marginTop: 24,
          }}
        >
          <h3
            style={{
              margin: '0 0 14px',
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            📦 거래처 포털 수입 안내 설정
          </h3>

          {/* 페덱스 / 해상운송 탭 — 각 탭은 독립된 컬럼 세트로 저장됨. */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: '1px solid var(--line)',
              marginBottom: 14,
            }}
          >
            {(
              [
                { key: 'fedex' as const, label: '✈️ 페덱스' },
                { key: 'sea' as const, label: '🚢 해상운송' },
              ]
            ).map((t) => {
              const on = noticeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setNoticeTab(t.key)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: on ? 600 : 500,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${on ? 'var(--brand)' : 'transparent'}`,
                    color: on ? 'var(--brand)' : 'var(--ink-3)',
                    cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* 첨부된 인보이스 PDF (자동 반영) — 항공/해상 각 슬롯. 인보이스 검증 카드의
              "입고처리로 이관" 클릭 시 document_files 에 자동 upsert 됨. */}
          {(() => {
            const rec = isSea ? noticeInvoiceSea : noticeInvoiceAir;
            const publicUrl = rec
              ? supabase.storage
                  .from('documents')
                  .getPublicUrl(rec.file_path).data.publicUrl
              : null;
            // eslint-disable-next-line no-console
            console.log('[notice-invoice] render', {
              isSea,
              noticeTab,
              noticeInvoiceAir,
              noticeInvoiceSea,
              rec,
              publicUrl,
              publicUrlType: typeof publicUrl,
              publicUrlTruthy: !!publicUrl,
              condition: !!(rec && publicUrl),
            });
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  marginBottom: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>인보이스 PDF</span>
                {rec ? (
                  <>
                    <a
                      href={publicUrl ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--brand)', fontWeight: 500 }}
                    >
                      {rec.file_name}
                    </a>
                    {rec.file_size != null && (
                      <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
                        ({Math.max(1, Math.round(rec.file_size / 1024))}KB)
                      </span>
                    )}
                    {rec.uploaded_at && (
                      <span style={{ color: 'var(--ink-3)', fontSize: 11.5, marginLeft: 'auto' }}>
                        {new Date(rec.uploaded_at).toLocaleDateString('ko-KR')} 첨부
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'var(--ink-3)' }}>
                    아직 첨부된 인보이스가 없습니다. 인보이스 검증에서 "입고처리로 이관" 시 자동으로 반영됩니다.
                  </span>
                )}
              </div>
            );
          })()}

          {/* 상태 선택 (현재 탭 기준) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {(['주문완료', '운송중', '통관진행중', '도착예정'] as const).map((s) => {
              const active = activeStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveStatus(s)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${active ? 'var(--brand)' : 'var(--line-strong)'}`,
                    background: active ? 'var(--brand)' : 'var(--surface)',
                    color: active ? '#fff' : 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* 상태별 자유 텍스트 — 거래처 포털 카드에 스텝퍼 날짜/헤더 문구로 표시됨. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 14,
            }}
          >
            {[
              {
                label: '주문완료 날짜',
                value: activeOrderDate,
                set: setActiveOrderDate,
                placeholder: '예: 2026-06-22',
                width: 200,
              },
              {
                label: '운송중 날짜',
                value: activeShipDate,
                set: setActiveShipDate,
                placeholder: '예: 2026-06-25',
                width: 200,
              },
              {
                label: '통관진행중 날짜',
                value: activeCustomsDate,
                set: setActiveCustomsDate,
                placeholder: '예: 2026-07-10',
                width: 200,
              },
              {
                label: '도착예정 문구',
                value: activeArrivalText,
                set: setActiveArrivalText,
                placeholder: '예: 7월 15일 도착예정',
                width: 280,
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    width: 96,
                    flexShrink: 0,
                  }}
                >
                  {row.label}
                </span>
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => row.set(e.target.value)}
                  placeholder={row.placeholder}
                  style={{
                    border: '1px solid var(--line-strong)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 12.5,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                    width: row.width,
                  }}
                />
              </div>
            ))}
            {/* 도착예정일 (date 컬럼) — companies.import_notice_date. 페덱스 탭에서만 노출. */}
            {!isSea && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    width: 96,
                    flexShrink: 0,
                  }}
                >
                  도착예정일
                </span>
                <input
                  type="text"
                  value={noticeDate}
                  onChange={(e) => setNoticeDate(e.target.value)}
                  placeholder="예: 2026-07-15"
                  style={{
                    border: '1px solid var(--line-strong)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 12.5,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                    width: 200,
                  }}
                />
                {noticeDate && (
                  <button
                    type="button"
                    onClick={() => setNoticeDate('')}
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                    title="비우기"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 제품 목록 */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: 11.5,
                color: 'var(--ink-3)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              표시할 제품 (코드 입력)
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={noticeProductInput}
                onChange={(e) => setNoticeProductInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNoticeProduct();
                  }
                }}
                placeholder="제품코드 입력 후 Enter"
                style={{
                  border: '1px solid var(--line-strong)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 12.5,
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  outline: 'none',
                  width: 200,
                }}
              />
              <button
                type="button"
                onClick={handleAddNoticeProduct}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid var(--line-strong)',
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                }}
              >
                추가
              </button>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid var(--line-strong)',
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  cursor: noticeParsingPdf ? 'not-allowed' : 'pointer',
                  opacity: noticeParsingPdf ? 0.55 : 1,
                  pointerEvents: noticeParsingPdf ? 'none' : 'auto',
                }}
                title="인보이스 PDF 를 업로드해 제품을 자동 추가"
              >
                {noticeParsingPdf ? '파싱 중…' : '📄 인보이스 PDF'}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleNoticePdfUpload(f);
                    e.target.value = '';
                  }}
                  disabled={noticeParsingPdf}
                />
              </label>
              {activeProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearAll()}
                  disabled={noticeSaving}
                  style={{
                    marginLeft: 'auto',
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--danger, #ef4444)',
                    background: 'var(--surface)',
                    color: 'var(--danger, #ef4444)',
                    cursor: noticeSaving ? 'not-allowed' : 'pointer',
                    opacity: noticeSaving ? 0.55 : 1,
                  }}
                >
                  {noticeSaving ? '삭제 중…' : '전체 삭제'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activeProducts.map((p) => (
                <span
                  key={p.code}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    fontSize: 11.5,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 999,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-num)',
                      color: 'var(--ink-3)',
                    }}
                  >
                    {p.code}
                  </span>
                  <span style={{ color: 'var(--ink)' }}>{p.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = activeProducts.filter(
                        (x) => x.code !== p.code,
                      );
                      void mutateProducts(next);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--ink-3)',
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
              {activeProducts.length === 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  추가된 제품 없음
                </span>
              )}
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            type="button"
            onClick={handleNoticeSave}
            disabled={noticeSaving || !companyId}
            style={{
              padding: '8px 18px',
              fontSize: 12.5,
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              background: 'var(--brand)',
              color: '#fff',
              cursor: noticeSaving || !companyId ? 'not-allowed' : 'pointer',
              opacity: noticeSaving || !companyId ? 0.55 : 1,
            }}
          >
            {noticeSaving ? '저장 중…' : '저장'}
          </button>
        </section>
        )}
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

// ───────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        background: 'transparent',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--ink)'
          : '2px solid transparent',
        marginBottom: '-1px',
        cursor: 'pointer',
        fontFamily: 'var(--font-kr)',
      }}
    >
      {label}
    </button>
  );
}
