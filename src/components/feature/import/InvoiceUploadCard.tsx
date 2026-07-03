/**
 * 인보이스 자동 입고 카드 — ImportReceivingPage 상단에 마운트.
 *
 * 흐름: 주문서(엑셀) + 인보이스(PDF) 업로드 → [비교 시작] → 4상태 분류 결과 표 →
 *       [입고처리로 이관] 으로 부모의 rowInputs/header 교체 + DB transfer_rows 저장.
 *
 * 🔴 Claude API 호출은 Vercel Serverless 함수(`api/analyze-invoice.ts`) 를 거친다.
 *    브라우저 번들에는 키가 전혀 실리지 않음 (서버 전용 `ANTHROPIC_API_KEY`).
 * 🟠 검수/USD단가/환율/저장은 모두 부모 페이지의 기존 14컬럼 테이블에 위임.
 *    이 카드는 "파싱 + 비교 + 이관(transfer_rows 저장)" 만 담당.
 * 🟡 BO(백오더): 인보이스에 qty_shipped=0 으로 나오거나, 주문서에만 있는 항목.
 *    "입고처리로 이관" 시 BO 행은 제외 — 실입고 0 인 행을 만들지 않음.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, X } from 'lucide-react';
import {
  parseOrderSheet,
  type OrderSheetRow,
} from '@/utils/orderSheetParser';
import {
  parseInvoicePDF,
  type InvoiceParsed,
  type InvoiceParsedRow,
} from '@/utils/invoiceParser';
import type { ImportRowInput, ImportInvoiceHeader } from '@/types/import';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import type { Json } from '@/types/database';

// 주문서/인보이스/OPS 제품 코드 간 매칭용 정규화.
// 공백·하이픈 제거 + 소문자 통일. (leading-zero 는 제거하지 않음 — 다른 SKU 가 충돌할 수 있음.)
function normalizeCode(code: string | number | null | undefined): string {
  if (code === null || code === undefined) return '';
  return String(code).trim().replace(/-/g, '').replace(/\s/g, '').toLowerCase();
}

// ───── 비교 결과 타입 ─────

export type CompareStatus =
  | 'match'         // 일치 — 코드·수량·단가 모두 동일
  | 'match_prefix'  // 일치(코드보정) — 인보이스 코드가 주문서 코드의 유일한 접두사라 자동 보정
  | 'qty_diff'      // 수량불일치 — 코드는 같은데 수량 다름
  | 'amount_diff'   // 금액불일치 — 코드·수량 같지만 단가 다름
  | 'order_only'    // 주문서만 — 주문 있고 인보이스에 없음 (구 backorder)
  | 'invoice_only'  // 인보이스만 — 주문은 없고 인보이스만 존재
  | 'unknown';      // 미확인 — OPS products 에 등록되지 않은 코드

interface ComparisonRow {
  id: string; // 안정적 React key + 편집 핸들러 식별자 (코드 변경되어도 유지)
  code: string;
  originalCode: string; // 파싱 직후 원본 코드 (편집 감지용)
  orderCode: string; // 주문서 원본 코드 — order_only 행에서 인보이스 코드로 병합 재매칭용
  description: string;
  unit: 'DZ' | 'EA';
  orderQty: number;
  originalOrderQty: number; // 편집 감지용 (재매칭 시 리셋)
  invoiceQty: number;
  originalInvoiceQty: number; // 현재 매칭 기준 원본 수량 (재매칭 시 리셋)
  orderPrice?: number;   // 주문서 단가 (없으면 undefined → 금액 비교 스킵)
  originalOrderPrice?: number; // 편집 감지용
  invoicePrice: number;  // 인보이스 단가
  originalInvoicePrice: number; // 편집 감지 + 재검증 기준
  amount: number;        // 인보이스 금액 (totalUsd 채움 용도)
  isInOps: boolean;      // OPS products 에 코드가 존재하는지
  category: string;      // 정렬용 OPS 카테고리
  status: CompareStatus;
}

function calcStatus(
  orderQty: number,
  invoiceQty: number,
  invoicePrice: number,
  orderPrice: number | undefined,
  isInOps: boolean,
): CompareStatus {
  if (!isInOps) return 'unknown';
  if (orderQty === 0 && invoiceQty > 0) return 'invoice_only';
  if (invoiceQty === 0 && orderQty > 0) return 'order_only';
  if (orderQty !== invoiceQty) return 'qty_diff';
  if (orderPrice !== undefined && Math.abs(invoicePrice - orderPrice) > 0.01) {
    return 'amount_diff';
  }
  return 'match';
}

// ───── Props ─────

interface Props {
  /** 현재 회사 ID — DB 저장/로드 키. null/undefined 시 DB 동작 스킵. */
  companyId: string | null | undefined;
  /** 비교 결과를 기존 행 입력 폼으로 옮길 때 호출. */
  onFill: (rows: ImportRowInput[], headerPatch: Partial<ImportInvoiceHeader>) => void;
  disabled?: boolean;
  /** OPS products 목록. 매칭된 코드의 한글 제품명을 표시하는 데 사용. */
  products?: ReadonlyArray<{ code: string; name: string; category: string }>;
}

type Tab = 'all' | CompareStatus;

// '금액불일치' 는 테마 토큰에 별도 orange 가 없어 hex 직접 지정 (amber 와 구분).
const STATUS_META: Record<
  CompareStatus,
  { label: string; color: string; bg: string }
> = {
  match:        { label: '일치',       color: 'var(--success)', bg: 'var(--success-wash)' },
  match_prefix: { label: '일치(코드보정)', color: 'var(--success)', bg: 'var(--success-wash)' },
  qty_diff:     { label: '수량불일치', color: 'var(--warning)', bg: 'var(--warning-wash)' },
  amount_diff:  { label: '금액불일치', color: '#C8590E',         bg: '#FAE3D2' },
  order_only:   { label: '주문서만',   color: 'var(--danger)',  bg: 'var(--danger-wash)' },
  invoice_only: { label: '인보이스만', color: 'var(--info)',    bg: 'var(--info-wash)' },
  unknown:      { label: '미확인',     color: 'var(--ink-3)',   bg: 'var(--surface-2)' },
};

// ───────────────────────────────────────────────────────────

const INVOICE_STORAGE_BUCKET = 'documents';

/**
 * 인보이스 PDF 를 Storage 에 업로드하고 그 경로를 반환한다.
 * 경로 컨벤션: `{companyId}/invoice-verifications/{timestamp}-{fileNameSafe}.pdf`
 *  - timestamp 로 유일성 확보
 *  - filename 에 한글/공백 있어도 안전하도록 별도 정규화
 */
async function uploadInvoicePdf(
  companyId: string,
  file: File,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]+/g, '_');
  const path = `${companyId}/invoice-verifications/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(INVOICE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf',
    });
  if (error) throw error;
  return path;
}

/** 기존 Storage 경로의 파일을 조용히 삭제 (실패해도 흐름 안 막음). */
async function removeInvoicePdfSilently(path: string): Promise<void> {
  try {
    await supabase.storage.from(INVOICE_STORAGE_BUCKET).remove([path]);
  } catch {
    /* 이미 없어졌거나 권한 문제여도 UI 방해하지 않음 */
  }
}

/** 항공/해상 안내 설정의 인보이스 첨부 category 값. */
type NoticeInvoiceCategory =
  | 'import_notice_invoice_air'
  | 'import_notice_invoice_sea';

function noticeCategoryFor(mode: 'air' | 'sea'): NoticeInvoiceCategory {
  return mode === 'sea' ? 'import_notice_invoice_sea' : 'import_notice_invoice_air';
}

/**
 * 입고처리 이관 시 호출: 현재 인보이스 PDF 를 거래처 안내 설정에 첨부.
 *  1) 원본 인보이스 파일(sourcePath) 을 안내용 별도 경로로 Storage 복사
 *     (원본은 세션 리셋 시 삭제될 수 있어 안내용은 독립 라이프사이클 필요)
 *  2) 같은 (company_id, category) 의 기존 document_files 레코드가 있으면 그 Storage 파일 삭제 + DB 레코드 삭제
 *  3) 새 레코드 INSERT
 *
 * category: 'import_notice_invoice_air' | 'import_notice_invoice_sea'
 */
async function attachInvoiceToNotice(params: {
  companyId: string;
  mode: 'air' | 'sea';
  sourcePath: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
}): Promise<void> {
  const { companyId, mode, sourcePath, fileName, fileSize, mimeType } = params;
  const category = noticeCategoryFor(mode);
  const destPath = `${companyId}/import-notice-invoices/${mode}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.\-_]+/g, '_')}`;

  // 1) 안내용 경로로 복사 (원본은 세션 관리 대상이라 별도로 유지).
  const { error: copyError } = await supabase.storage
    .from(INVOICE_STORAGE_BUCKET)
    .copy(sourcePath, destPath);
  if (copyError) throw copyError;

  // 2) 기존 안내 첨부 조회 → Storage 파일 삭제 → DB 레코드 삭제 (덮어쓰기 정책).
  const { data: existing } = await supabase
    .from('document_files')
    .select('id, file_path')
    .eq('company_id', companyId)
    .eq('category', category);
  if (existing && existing.length > 0) {
    const oldPaths = existing.map((r) => r.file_path).filter(Boolean);
    if (oldPaths.length > 0) {
      await supabase.storage.from(INVOICE_STORAGE_BUCKET).remove(oldPaths).catch(() => undefined);
    }
    await supabase
      .from('document_files')
      .delete()
      .eq('company_id', companyId)
      .eq('category', category);
  }

  // 3) 새 레코드 INSERT.
  const { error: insertError } = await supabase.from('document_files').insert({
    company_id: companyId,
    category,
    file_name: fileName,
    file_path: destPath,
    file_size: fileSize ?? null,
    mime_type: mimeType ?? 'application/pdf',
  });
  if (insertError) throw insertError;
}

export function InvoiceUploadCard({ companyId, onFill, disabled, products }: Props) {
  const { showToast } = useToast();
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  /**
   * Storage 에 업로드된 인보이스 PDF 의 경로 (documents 버킷).
   * DB(`invoice_verifications.invoice_file_path`) 와 동기화. "입고처리로 이관" 시
   * 거래처 안내 설정으로 이 경로를 복사·연결하는 데 사용.
   */
  const [invoiceFilePath, setInvoiceFilePath] = useState<string | null>(null);
  /**
   * 입고처리 이관 시 이 인보이스 PDF 를 거래처 안내 설정의 어느 슬롯(항공/해상) 에
   * 첨부할지. 이관 버튼 옆 라디오로 선택. 기본은 페덱스=항공.
   */
  const [shippingMode, setShippingMode] = useState<'air' | 'sea'>('air');
  const [parsing, setParsing] = useState(false);
  // 이관 버튼 클릭 후 document_files INSERT 가 커밋될 때까지 대기 중인지.
  //  이 값이 true 인 동안 버튼 비활성 + '이관 중...' 표시 → 사용자가 안내 탭으로
  //  일찍 이동해 stale 조회를 하는 일을 방지.
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{
    rows: ComparisonRow[];
    /** 원본 주문서 행 — 코드 편집 시 재매칭 소스. */
    orderRows: OrderSheetRow[];
    /** 원본 인보이스 행 — 코드 편집 시 재매칭 소스. */
    invoiceRows: InvoiceParsedRow[];
    invoiceNo: string;
    invoiceDate: string;
  } | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  // 현재 포커스된 input 의 rowId — 코드/수량 셀 포커스 하이라이트용
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);
  // DB 자동 저장 useEffect 가 마운트 직후/DB 복원 직후에 한 번 트리거되는 것을 막기 위함.
  const skipNextAutoSave = useRef(true);

  // 정규화된 OPS 제품코드 → 한글명 맵. (인보이스/주문서의 영문명을 한글로 치환)
  const productNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products ?? []) {
      const key = normalizeCode(p.code);
      if (key && p.name) map.set(key, p.name);
    }
    return map;
  }, [products]);

  // 정규화된 OPS 코드 → category 맵
  const productCategoryByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products ?? []) {
      const key = normalizeCode(p.code);
      if (key) map.set(key, p.category ?? '');
    }
    return map;
  }, [products]);

  const canCompare =
    Boolean(orderFile && invoiceFile) &&
    !parsing &&
    !disabled &&
    Boolean(products && products.length > 0);

  // ── DB 저장 ──
  const saveToDb = async (
    data: {
      rows: ComparisonRow[];
      orderRows: OrderSheetRow[];
      invoiceRows: InvoiceParsedRow[];
      invoiceNo: string;
      invoiceDate: string;
    },
    currentTab: string,
    orderFileName?: string,
    invoiceFileName?: string,
    invoiceFilePathArg?: string | null,
  ) => {
    if (!companyId) return;
    setDbSaving(true);
    try {
      await supabase
        .from('invoice_verifications')
        .upsert(
          {
            company_id: companyId,
            invoice_no: data.invoiceNo,
            invoice_date: data.invoiceDate,
            comparison_rows: data.rows as unknown as Json,
            order_rows: data.orderRows as unknown as Json,
            invoice_rows: data.invoiceRows as unknown as Json,
            order_file_name: orderFileName ?? null,
            invoice_file_name: invoiceFileName ?? null,
            invoice_file_path: invoiceFilePathArg ?? null,
            last_tab: currentTab,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        );
    } catch { /* ignore — 저장 실패해도 UI 방해 안 함 */ }
    finally { setDbSaving(false); }
  };

  // ── DB 복원 (companyId 로드 시 1회) ──
  useEffect(() => {
    if (!companyId || dbLoaded) return;
    setDbLoaded(true);

    void supabase
      .from('invoice_verifications')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        // 복원으로 인한 setComparison/setTab 으로 자동저장 useEffect 가 다시 트리거되어
        // 방금 로드한 데이터를 그대로 재저장하는 것을 막음.
        skipNextAutoSave.current = true;
        setComparison({
          rows: (data.comparison_rows as unknown as ComparisonRow[]) ?? [],
          orderRows: (data.order_rows as unknown as OrderSheetRow[]) ?? [],
          invoiceRows: (data.invoice_rows as unknown as InvoiceParsedRow[]) ?? [],
          invoiceNo: data.invoice_no ?? '',
          invoiceDate: data.invoice_date ?? '',
        });
        setTab((data.last_tab as Tab) ?? 'all');
        // 파일명 복원 (File 객체 자체는 복원 불가 — 표시 목적)
        if (data.order_file_name) setOrderFile({ name: data.order_file_name } as File);
        if (data.invoice_file_name) setInvoiceFile({ name: data.invoice_file_name } as File);
        // Storage 경로 복원 — 입고처리로 이관 시 참조.
        setInvoiceFilePath(data.invoice_file_path ?? null);
      });
  }, [companyId, dbLoaded]);

  // ── products 로드 완료 시 unknown 행 자동 재매칭 ──
  // DB 복원 직후엔 products 가 비어있어 모두 unknown 으로 들어올 수 있음.
  // products 가 채워지는 순간 1회 스캔해 매칭 가능한 행은 정상 상태로 전환.
  useEffect(() => {
    if (!products || products.length === 0) return;
    if (!comparison) return;
    const hasUnknown = comparison.rows.some((r) => r.status === 'unknown');
    if (!hasUnknown) return;

    const reMatched = comparison.rows.map((r) => {
      if (r.status !== 'unknown') return r;
      const normCode = normalizeCode(r.code);
      const opsName = productNameByCode.get(normCode);
      if (opsName === undefined) return r;
      return {
        ...r,
        description: opsName || r.description,
        isInOps: true,
        category: productCategoryByCode.get(normCode) ?? r.category,
        status: calcStatus(r.orderQty, r.invoiceQty, r.invoicePrice, r.orderPrice, true),
      };
    });

    const changed = reMatched.some((r, i) => r.status !== comparison.rows[i].status);
    if (!changed) return;

    setComparison((prev) => (prev ? { ...prev, rows: reMatched } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // ── comparison/tab 변경 시 DB 자동 저장 ──
  useEffect(() => {
    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }
    if (!comparison || !companyId) return;
    void saveToDb(
      comparison,
      tab,
      orderFile?.name,
      invoiceFile?.name,
      invoiceFilePath,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison, tab]);

  const handleCompare = async () => {
    if (!orderFile || !invoiceFile) return;
    setError(null);
    setParsing(true);
    try {
      // 주문서 소스 결정.
      //  - 실제 File 이면 파싱 (사용자가 직접 업로드한 경우)
      //  - File 이 아니면 (Task 3 발주서 자동입고 · DB 복원 케이스) 이미 파싱된
      //    comparison.orderRows 를 그대로 재사용. 이 경로에서는 orderFile 이
      //    { name: string } 형태의 표시용 스텁이라 .arrayBuffer() 가 없다.
      let orderRows: OrderSheetRow[];
      if (orderFile instanceof File) {
        orderRows = await parseOrderSheet(orderFile);
      } else if (comparison && comparison.orderRows.length > 0) {
        orderRows = comparison.orderRows;
      } else {
        throw new Error(
          '주문서 데이터가 없습니다. 주문서를 다시 업로드하거나 발주서를 다시 다운로드해 주세요.',
        );
      }

      // 인보이스도 동일한 분기: File 이면 파싱, 아니면 DB 복원된 invoiceRows 재사용.
      let invoice: InvoiceParsed;
      if (invoiceFile instanceof File) {
        // 파싱 (Claude 프록시) 과 Storage 업로드를 병렬로 수행.
        //  Storage 업로드는 나중에 "입고처리로 이관" 시 거래처 안내 설정으로
        //  실제 PDF 를 넘겨주기 위해 필요. 이전 세션의 파일이 있으면 새 파일 업로드 성공
        //  후 별도로 삭제 (성공 순서 보장 · 실패 시에도 새 파일이 잃어지지 않도록).
        const previousPath = invoiceFilePath;
        const [parsedInvoice, uploadedPath] = await Promise.all([
          parseInvoicePDF(invoiceFile),
          companyId ? uploadInvoicePdf(companyId, invoiceFile) : Promise.resolve<string | null>(null),
        ]);
        invoice = parsedInvoice;
        if (uploadedPath) {
          setInvoiceFilePath(uploadedPath);
          if (previousPath && previousPath !== uploadedPath) {
            void removeInvoicePdfSilently(previousPath);
          }
        }
      } else if (comparison && comparison.invoiceRows.length > 0) {
        invoice = {
          invoice_no: comparison.invoiceNo,
          invoice_date: comparison.invoiceDate,
          rows: comparison.invoiceRows,
        };
      } else {
        throw new Error('인보이스 데이터가 없습니다. 인보이스를 다시 업로드해 주세요.');
      }

      const rows = compareOrderInvoice(orderRows, invoice, productNameByCode, productCategoryByCode);
      setComparison({
        rows,
        orderRows,
        invoiceRows: invoice.rows,
        invoiceNo: invoice.invoice_no,
        invoiceDate: invoice.invoice_date,
      });
      setTab('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  };

  const counts = useMemo(() => {
    const rows = comparison?.rows ?? [];
    // `matched` 파생값 — "일치로 취급하는 상태"의 합 (요약 박스에서 사용).
    // match_prefix (일치(코드보정))가 추가되면서 요약이 이걸 불일치로 오집계하던 버그
    // 재발 방지 목적. 앞으로 "일치 취급" 상태가 늘면 여기만 확장하면 된다.
    const c: Record<CompareStatus, number> & {
      all: number;
      matched: number;
      edited: number;
      invoiceTotal: number;
      orderTotal: number;
      diffTotal: number;
    } = {
      all: rows.length,
      matched: 0,
      edited: 0,
      invoiceTotal: 0,
      orderTotal: 0,
      diffTotal: 0,
      match: 0,
      match_prefix: 0,
      qty_diff: 0,
      amount_diff: 0,
      order_only: 0,
      invoice_only: 0,
      unknown: 0,
    };
    for (const r of rows) {
      c[r.status]++;
      const iPriceEdited = Math.abs(r.invoicePrice - r.originalInvoicePrice) > 0.001;
      const oQtyEdited = r.orderQty !== r.originalOrderQty;
      const oPriceEdited =
        r.originalOrderPrice !== undefined &&
        Math.abs((r.orderPrice ?? 0) - (r.originalOrderPrice ?? 0)) > 0.001;
      if (
        r.invoiceQty !== r.originalInvoiceQty ||
        r.code !== r.originalCode ||
        iPriceEdited || oQtyEdited || oPriceEdited
      ) {
        c.edited++;
      }
      c.invoiceTotal += r.invoicePrice * r.invoiceQty;
      c.orderTotal += (r.orderPrice ?? r.invoicePrice) * r.orderQty;
    }
    c.matched = c.match + c.match_prefix;
    c.invoiceTotal = parseFloat(c.invoiceTotal.toFixed(2));
    c.orderTotal = parseFloat(c.orderTotal.toFixed(2));
    c.diffTotal = parseFloat((c.invoiceTotal - c.orderTotal).toFixed(2));
    return c;
  }, [comparison]);

  const handleQtyChange = (rowId: string, newQty: number) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const safeQty = Number.isFinite(newQty) ? Math.max(0, Math.floor(newQty)) : 0;
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          invoiceQty: safeQty,
          status: calcStatus(
            row.orderQty,
            safeQty,
            row.invoicePrice,
            row.orderPrice,
            row.isInOps,
          ),
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  const handleOrderQtyChange = (rowId: string, newQty: number) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const safeQty = Number.isFinite(newQty) ? Math.max(0, Math.floor(newQty)) : 0;
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          orderQty: safeQty,
          status: calcStatus(
            safeQty,
            row.invoiceQty,
            row.invoicePrice,
            row.orderPrice,
            row.isInOps,
          ),
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  const handleOrderPriceChange = (rowId: string, newPrice: number) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const safePrice = Number.isFinite(newPrice) && newPrice >= 0 ? newPrice : 0;
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          orderPrice: safePrice,
          status: calcStatus(
            row.orderQty,
            row.invoiceQty,
            row.invoicePrice,
            safePrice,
            row.isInOps,
          ),
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  const handlePriceChange = (rowId: string, newPrice: number) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const safePrice = Number.isFinite(newPrice) && newPrice >= 0 ? newPrice : 0;
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        const newAmount = parseFloat((safePrice * row.invoiceQty).toFixed(2));
        return {
          ...row,
          invoicePrice: safePrice,
          amount: newAmount,
          status: calcStatus(
            row.orderQty,
            row.invoiceQty,
            safePrice,
            row.orderPrice,
            row.isInOps,
          ),
        };
      });
      return { ...prev, rows: nextRows };
    });
  };

  const handleDeleteRow = (rowId: string) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.filter((row) => row.id !== rowId);
      return { ...prev, rows: nextRows };
    });
  };

  const handleAddRow = () => {
    const newRow: ComparisonRow = {
      id: makeId(),
      code: '',
      originalCode: '',
      orderCode: '',
      description: '',
      unit: 'DZ',
      orderQty: 0,
      originalOrderQty: 0,
      orderPrice: undefined,
      originalOrderPrice: undefined,
      invoiceQty: 0,
      originalInvoiceQty: 0,
      invoicePrice: 0,
      originalInvoicePrice: 0,
      amount: 0,
      isInOps: false,
      category: '',
      status: 'invoice_only',
    };
    setComparison((prev) => {
      if (!prev) return prev;
      return { ...prev, rows: [newRow, ...prev.rows] };
    });
    setTab('all');
  };

  // 코드 셀 입력 변경 — 화면 표시만 즉시 반영 (재매칭은 blur 에서).
  const handleCodeChange = (rowId: string, rawCode: string) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.map((row) =>
        row.id === rowId ? { ...row, code: rawCode } : row,
      );
      return { ...prev, rows: nextRows };
    });
  };

  // 코드 셀 blur — 사용자 편집 반영 후 전체 재매칭.
  //  기존엔 편집된 행만 국소적으로 다시 매칭했으나, 이 방식으로는
  //  invoice_only 행에서 code 를 order_only 행의 orderCode 와 일치하도록 고쳐도
  //  두 행이 하나로 합쳐지지 않았다. rebuildComparisonFromEdits 로 orderRows /
  //  invoiceRows 를 재구성해 처음부터 다시 매칭하면 병합 · 상태 재판정이 자동 처리됨.
  const handleCodeBlur = (rowId: string, rawNewCode: string) => {
    setComparison((prev) => {
      if (!prev) return prev;
      const newCode = rawNewCode.trim();
      const editedRows = prev.rows.map((row) =>
        row.id === rowId ? { ...row, code: newCode } : row,
      );
      const rebuilt = rebuildComparisonFromEdits(
        {
          rows: editedRows,
          invoiceNo: prev.invoiceNo,
          invoiceDate: prev.invoiceDate,
        },
        productNameByCode,
        productCategoryByCode,
      );
      return {
        ...prev,
        rows: rebuilt.rows,
        orderRows: rebuilt.orderRows,
        invoiceRows: rebuilt.invoiceRows,
      };
    });
  };

  // 주문서 코드 셀 편집 핸들러는 UI 방향 정정(invoice_only 쪽 힌트) 이후 참조처가 사라져
  // 삭제. 로직적으로는 handleCodeChange/handleCodeBlur 가 code 필드를 통해 양방향 편집을
  // 모두 처리한다. rebuildComparisonFromEdits 의 fallback 이 order_only 행에서 code 편집
  // 시 편집 값을 orderRows 로 흘려보내는 안전망 역할.

  const visibleRows = useMemo(() => {
    if (!comparison) return [];
    if (tab === 'all') return comparison.rows;
    return comparison.rows.filter((r) => r.status === tab);
  }, [comparison, tab]);

  const handleFill = async () => {
    if (!comparison) return;
    // '주문서만' 행 제외 — 실제로 입고할 수 있는 행만.
    const fillable = comparison.rows.filter(
      (r) => r.status !== 'order_only' && r.invoiceQty > 0,
    );
    const rows: ImportRowInput[] = fillable.map((r) => ({
      id: makeId(),
      // 접두사 자동 보정된 행은 주문서(긴) 코드를 소스로 넘겨 입고처리 매칭 보장.
      // orderCode 가 있으면 그걸, 없으면 인보이스 원본 code.
      sourceCode: r.orderCode || r.code,
      quantity: r.invoiceQty,
      unit: r.unit,
      adjustedQuantity: r.unit === 'DZ' ? r.invoiceQty * 12 : r.invoiceQty,
      totalUsd: parseFloat((r.invoicePrice * r.invoiceQty).toFixed(2)),
    }));
    // 이관된 행을 DB 에 보존 — 새로고침 후에도 입고처리 폼이 복원됨.
    // 🔴 PostgrestBuilder 는 thenable — .then()/await 없으면 fetch 가 발송되지 않는다.
    //    async IIFE 안에서 await 해 요청 실행을 보장.
    if (companyId) {
      void (async () => {
        const { error } = await supabase
          .from('invoice_verifications')
          .update({
            transfer_rows: rows as unknown as Json,
            transfer_saved_at: new Date().toISOString(),
          })
          .eq('company_id', companyId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[transfer_rows.save]', error);
        }
      })();

      // 🟠 인보이스 PDF 가 실제로 Storage 에 업로드된 상태라면(invoiceFilePath 존재)
      //    거래처 안내 설정(항공/해상) 에 자동 첨부. 원본은 세션과 함께 남기고
      //    안내용 별도 경로로 복사 → document_files 에 UPSERT (기존 것은 덮어쓰기).
      //
      //    🔴 반드시 onFill 전에 await — onFill 이 부모의 activeTab 을 'receiving' 으로
      //    바꾸면서 안내 탭의 document_files 조회 useEffect 가 이미 fire 되어 지나갔을 수 있어,
      //    fire-and-forget 로 넘기면 사용자가 안내 탭을 봤을 때 아직 INSERT 가 안 된 상태로
      //    "아직 첨부된 인보이스가 없습니다" 로 보이는 타이밍 레이스가 생긴다.
      if (invoiceFilePath && invoiceFile && invoiceFile.name) {
        const fileName = invoiceFile.name;
        const fileSize = invoiceFile instanceof File ? invoiceFile.size : null;
        const mimeType = invoiceFile instanceof File ? invoiceFile.type : 'application/pdf';
        setAttaching(true);
        try {
          await attachInvoiceToNotice({
            companyId,
            mode: shippingMode,
            sourcePath: invoiceFilePath,
            fileName,
            fileSize,
            mimeType,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[attachInvoiceToNotice]', e);
          // onFill 이 곧바로 activeTab='receiving' 으로 전환해 InvoiceUploadCard 가 언마운트되므로
          // setError 는 사용자에게 도달하지 않는다. 전역 토스트로 알린다.
          showToast({
            kind: 'error',
            text: `거래처 안내 설정에 인보이스 첨부 실패: ${e instanceof Error ? e.message : String(e)}`,
          });
          // 첨부 실패해도 사용자가 입고 처리 폼으로 이동은 계속할 수 있게 onFill 은 그대로 진행.
        } finally {
          setAttaching(false);
        }
      }

      // 거래처 안내 설정 태그 목록 자동 동기화 — 이번 이관 세트의 제품 중
      //  아직 태그에 없는 것만 append. 삭제/덮어쓰기 없음(race-free RPC 사용).
      //  실패해도 이관 자체는 진행. products prop 이 비어있으면 스킵.
      try {
        const tagItems: Array<{ code: string; name: string }> = [];
        const seenCodes = new Set<string>();
        for (const r of rows) {
          const rawCode = r.sourceCode?.trim();
          if (!rawCode) continue;
          const normCode = normalizeCode(rawCode);
          if (!normCode || seenCodes.has(normCode)) continue;
          const name = productNameByCode.get(normCode);
          if (!name) {
            // eslint-disable-next-line no-console
            console.warn('[notice-tag-sync] products 매칭 실패로 스킵:', rawCode);
            continue;
          }
          seenCodes.add(normCode);
          tagItems.push({ code: rawCode, name });
        }
        if (tagItems.length > 0) {
          const { error: rpcErr } = await supabase.rpc(
            'append_import_notice_products' as never,
            {
              p_company_id: companyId,
              p_items: tagItems as unknown as Json,
              p_is_sea: shippingMode === 'sea',
            } as never,
          );
          if (rpcErr) {
            // eslint-disable-next-line no-console
            console.error('[notice-tag-sync] RPC error', rpcErr);
            showToast({
              kind: 'error',
              text: `거래처 안내 태그 동기화 실패: ${rpcErr.message}`,
            });
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[notice-tag-sync] unexpected', e);
      }
    }
    onFill(rows, {
      invoiceNumber: comparison.invoiceNo,
      invoiceDate: comparison.invoiceDate,
    });
  };

  const handleReset = () => {
    // 자동 저장 useEffect 가 comparison=null 로 빈 행을 저장하는 것을 막고, DB 행을 삭제.
    skipNextAutoSave.current = true;
    setOrderFile(null);
    setInvoiceFile(null);
    setComparison(null);
    setError(null);
    setTab('all');
    // 세션 리셋 시 세션 소유의 Storage 원본 인보이스 파일도 함께 삭제.
    // 이미 안내 설정 쪽으로 이관됐다면 그건 별도 경로로 복사돼 있어 영향 없음.
    const orphanedPath = invoiceFilePath;
    setInvoiceFilePath(null);
    if (orphanedPath) void removeInvoicePdfSilently(orphanedPath);
    if (companyId) {
      // 🔴 PostgrestBuilder thenable — await 로 실행 보장.
      void (async () => {
        const { error } = await supabase
          .from('invoice_verifications')
          .delete()
          .eq('company_id', companyId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[invoice_verifications.delete]', error);
        }
      })();
    }
  };

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 16,
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2
          className="disp"
          style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}
        >
          인보이스 자동 입고
        </h2>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          주문서(엑셀) + 인보이스(PDF) 업로드 → 비교 → 입고처리로 이관
        </span>
      </header>

      {/* Drop zones */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        <FileSlot
          label="주문서 (XLSX)"
          icon="excel"
          accept=".xlsx,.xls"
          file={orderFile}
          onChange={setOrderFile}
          disabled={parsing || disabled}
        />
        <FileSlot
          label="인보이스 (PDF)"
          icon="pdf"
          accept=".pdf"
          file={invoiceFile}
          onChange={setInvoiceFile}
          disabled={parsing || disabled}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            className="btn-base primary"
            onClick={handleCompare}
            disabled={!canCompare}
            style={{ height: 38, fontSize: 12.5, minWidth: 120 }}
          >
            {parsing ? '분석 중…' : '비교 시작'}
          </button>
          {(!products || products.length === 0) && (
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              제품 목록 로딩 중…
            </span>
          )}
          {(orderFile || invoiceFile || comparison) && (
            <button
              type="button"
              className="btn-base"
              onClick={handleReset}
              disabled={parsing}
              style={{ height: 28, fontSize: 11.5 }}
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-wash)',
            color: 'var(--danger)',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      )}

      {comparison && (
        <>
          {/* 요약 + 탭 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--ink-2)',
                marginRight: 8,
              }}
            >
              Invoice #
              <strong style={{ color: 'var(--ink)', marginLeft: 4 }}>
                {comparison.invoiceNo || '—'}
              </strong>
              <span style={{ marginLeft: 10 }}>
                date{' '}
                <strong style={{ color: 'var(--ink)' }}>
                  {comparison.invoiceDate || '—'}
                </strong>
              </span>
            </span>
            <TabButton
              active={tab === 'all'}
              onClick={() => setTab('all')}
              label={`전체 ${counts.all}`}
            />
            <TabButton
              active={tab === 'qty_diff'}
              onClick={() => setTab('qty_diff')}
              label={`수량불일치 ${counts.qty_diff}`}
              tone="warning"
            />
            <TabButton
              active={tab === 'amount_diff'}
              onClick={() => setTab('amount_diff')}
              label={`금액불일치 ${counts.amount_diff}`}
              tone="warning"
            />
            <TabButton
              active={tab === 'order_only'}
              onClick={() => setTab('order_only')}
              label={`주문서만 ${counts.order_only}`}
              tone="danger"
            />
            <TabButton
              active={tab === 'invoice_only'}
              onClick={() => setTab('invoice_only')}
              label={`인보이스만 ${counts.invoice_only}`}
            />
            <TabButton
              active={tab === 'unknown'}
              onClick={() => setTab('unknown')}
              label={`미확인 ${counts.unknown}`}
            />
            {counts.edited > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11.5,
                  color: 'var(--warning)',
                  fontWeight: 500,
                }}
              >
                {counts.edited}건 수정됨
              </span>
            )}
            {dbSaving && (
              <span
                style={{
                  marginLeft: counts.edited > 0 ? 8 : 'auto',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                }}
              >
                저장 중…
              </span>
            )}
          </div>

          {/* 금액 합계 요약 바 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '1 1 140px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '8px 14px',
                background: 'var(--surface)',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 3 }}>
                인보이스 합계
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-num)' }}>
                ${counts.invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div
              style={{
                flex: '1 1 140px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '8px 14px',
                background: 'var(--surface)',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 3 }}>
                주문서 합계
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-num)' }}>
                ${counts.orderTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div
              style={{
                flex: '1 1 140px',
                border: `1px solid ${counts.diffTotal === 0 ? 'var(--line)' : 'var(--warning)'}`,
                borderRadius: 8,
                padding: '8px 14px',
                background: counts.diffTotal === 0 ? 'var(--surface)' : 'var(--warning-wash)',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 3 }}>
                차이 (인보이스 − 주문서)
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  fontFamily: 'var(--font-num)',
                  color:
                    counts.diffTotal === 0
                      ? 'var(--ink)'
                      : counts.diffTotal > 0
                        ? 'var(--danger)'
                        : 'var(--success)',
                }}
              >
                {counts.diffTotal === 0
                  ? '—'
                  : `${counts.diffTotal > 0 ? '+' : ''}$${Math.abs(counts.diffTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </div>
            </div>

            <div
              style={{
                flex: '1 1 140px',
                border: `1px solid ${counts.matched === counts.all ? 'var(--success)' : 'var(--line)'}`,
                borderRadius: 8,
                padding: '8px 14px',
                background: counts.matched === counts.all ? 'var(--success-wash)' : 'var(--surface)',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 3 }}>
                검증 현황
              </div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {counts.matched === counts.all ? (
                  <span style={{ color: 'var(--success)' }}>✅ 전체 일치</span>
                ) : (
                  <span style={{ color: 'var(--danger)' }}>
                    불일치 {counts.all - counts.matched}건
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        marginLeft: 6,
                      }}
                    >
                      / 전체 {counts.all}건
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 결과 테이블 */}
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '120px minmax(200px, 1fr) 60px 80px 80px 100px 90px 70px 100px 28px',
                  gap: 10,
                  padding: '8px 12px',
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--font-num)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  minWidth: 760,
                }}
              >
                <span>제품코드</span>
                <span>제품명</span>
                <span style={{ textAlign: 'center' }}>단위</span>
                <span style={{ textAlign: 'right' }}>주문수량</span>
                <span style={{ textAlign: 'right' }}>주문단가</span>
                <span style={{ textAlign: 'right' }}>인보이스</span>
                <span style={{ textAlign: 'right' }}>단가(USD)</span>
                <span style={{ textAlign: 'right' }}>차이</span>
                <span style={{ textAlign: 'center' }}>상태</span>
                <span />
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {visibleRows.length === 0 ? (
                  <div
                    style={{
                      padding: 20,
                      textAlign: 'center',
                      color: 'var(--ink-3)',
                      fontSize: 12.5,
                    }}
                  >
                    표시할 행이 없습니다.
                  </div>
                ) : (
                  visibleRows.map((r) => {
                    const meta = STATUS_META[r.status];
                    const diff = r.invoiceQty - r.orderQty;
                    const diffColor =
                      diff === 0
                        ? 'var(--ink-3)'
                        : diff > 0
                          ? 'var(--success)'
                          : 'var(--danger)';
                    const qtyEdited = r.invoiceQty !== r.originalInvoiceQty;
                    const codeEdited =
                      normalizeCode(r.code) !== normalizeCode(r.originalCode);
                    const priceEdited =
                      Math.abs(r.invoicePrice - r.originalInvoicePrice) > 0.001;
                    const orderQtyEdited = r.orderQty !== r.originalOrderQty;
                    const orderPriceEdited =
                      r.originalOrderPrice !== undefined &&
                      r.orderPrice !== undefined &&
                      Math.abs((r.orderPrice ?? 0) - (r.originalOrderPrice ?? 0)) > 0.001;
                    const rowEdited =
                      qtyEdited || codeEdited || priceEdited || orderQtyEdited || orderPriceEdited;
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            '120px minmax(200px, 1fr) 60px 80px 80px 100px 90px 70px 100px 28px',
                          gap: 10,
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--line)',
                          fontSize: 12.5,
                          alignItems: 'center',
                          minWidth: 760,
                          background:
                            focusedId === r.id ||
                            focusedId === r.id + '_qty' ||
                            focusedId === r.id + '_price' ||
                            focusedId === r.id + '_oqty' ||
                            focusedId === r.id + '_oprice'
                              ? 'var(--accent-wash, #EFF6FF)'
                              : rowEdited
                                ? 'var(--warning-wash)'
                                : undefined,
                        }}
                      >
                        {/* 인보이스만 행: 인보이스 PDF 파싱 시 코드가 잘리는 경우가 있어
                            (예: 72204000soft → 72204000S) 사용자가 여기서 주문서의 원본 코드로
                            바로잡도록 힌트 UI 표시. blur 시 rebuildComparisonFromEdits 로 재매칭. */}
                        {r.status === 'invoice_only' ? (
                          <div>
                            <input
                              type="text"
                              value={r.code}
                              onChange={(e) => handleCodeChange(r.id, e.target.value)}
                              onBlur={(e) => {
                                handleCodeBlur(r.id, e.target.value);
                                setFocusedId(null);
                              }}
                              onFocus={(e) => {
                                e.currentTarget.select();
                                setFocusedId(r.id);
                              }}
                              placeholder="주문서 코드 입력 후 Enter"
                              title={
                                codeEdited
                                  ? `원본 코드: ${r.originalCode}`
                                  : '주문서의 제품코드를 입력하면 해당 행과 자동 병합됩니다'
                              }
                              className="num"
                              style={{
                                // 🔴 정상 동작하는 수량/단가 인풋과 완전히 동일한 배경/글자색 조합
                                //    (--surface + --ink) 사용. 이 조합은 모든 테마(라이트/다크/커피)
                                //    에서 대비 확보됨:
                                //     - 라이트: #FDFAF4 배경 + #23201C 글자
                                //     - 다크:   #1A1A1A 배경 + #E8E8E6 글자
                                //     - 커피:   #3A3A38 배경 + #F1EFE8 글자
                                //    focused 시에도 accent-wash(밝은 파랑 #EFF6FF 고정) 로 바꾸지
                                //    않는다 — 다크 테마에서 흰 배경/흰 글자 충돌 재발 방지.
                                //    포커스 표시는 border color 변경(warning → accent) 으로만.
                                width: '100%',
                                height: 26,
                                padding: '0 6px',
                                border: `1px solid ${
                                  focusedId === r.id
                                    ? 'var(--accent, #2563eb)'
                                    : 'var(--warning)'
                                }`,
                                borderRadius: 4,
                                background: 'var(--surface)',
                                color: 'var(--ink)',
                                fontSize: 12.5,
                                outline: 'none',
                              }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.3 }}>
                              ↑ 주문서 코드로 수정
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={r.code}
                            onChange={(e) =>
                              handleCodeChange(r.id, e.target.value)
                            }
                            onBlur={(e) => {
                              handleCodeBlur(r.id, e.target.value);
                              setFocusedId(null);
                            }}
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setFocusedId(r.id);
                            }}
                            title={
                              codeEdited
                                ? `원본 코드: ${r.originalCode}`
                                : undefined
                            }
                            className="num"
                            style={{
                              // 🔴 수량/단가 인풋과 동일한 --surface/--ink 조합. 모든 테마에서 대비 확보.
                              //    focused 시 배경은 그대로 두고 border color 만 accent 로 표시.
                              width: '100%',
                              height: 26,
                              padding: '0 6px',
                              border: `1px solid ${
                                focusedId === r.id
                                  ? 'var(--accent, #2563eb)'
                                  : codeEdited
                                    ? 'var(--warning)'
                                    : 'var(--line)'
                              }`,
                              borderRadius: 4,
                              background: 'var(--surface)',
                              color: 'var(--ink)',
                              fontSize: 12.5,
                              outline: 'none',
                            }}
                          />
                        )}
                        <span
                          style={{
                            color: 'var(--ink)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={r.description}
                        >
                          {r.description || '—'}
                        </span>
                        <span
                          style={{
                            textAlign: 'center',
                            color: 'var(--ink-3)',
                            fontSize: 11.5,
                          }}
                        >
                          {r.unit}
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {(() => {
                            const orderQtyEdited = r.orderQty !== r.originalOrderQty;
                            return (
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={r.orderQty}
                                onChange={(e) => handleOrderQtyChange(r.id, Number(e.target.value))}
                                onFocus={(e) => {
                                  e.currentTarget.select();
                                  setFocusedId(r.id + '_oqty');
                                }}
                                onBlur={() => setFocusedId(null)}
                                title={orderQtyEdited ? `원본: ${r.originalOrderQty.toLocaleString('ko-KR')}` : undefined}
                                className="num"
                                style={{
                                  width: 68,
                                  height: 26,
                                  padding: '0 6px',
                                  textAlign: 'right',
                                  border: `1px solid ${
                                    focusedId === r.id + '_oqty'
                                      ? 'var(--accent, #2563eb)'
                                      : orderQtyEdited
                                        ? 'var(--warning)'
                                        : 'var(--line)'
                                  }`,
                                  borderRadius: 4,
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                  fontSize: 12.5,
                                  outline: 'none',
                                }}
                              />
                            );
                          })()}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {(() => {
                            const orderPriceEdited =
                              r.originalOrderPrice !== undefined &&
                              r.orderPrice !== undefined &&
                              Math.abs((r.orderPrice ?? 0) - (r.originalOrderPrice ?? 0)) > 0.001;
                            return (
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={r.orderPrice ?? 0}
                                onChange={(e) => handleOrderPriceChange(r.id, Number(e.target.value))}
                                onFocus={(e) => {
                                  e.currentTarget.select();
                                  setFocusedId(r.id + '_oprice');
                                }}
                                onBlur={() => setFocusedId(null)}
                                title={orderPriceEdited ? `원본: $${(r.originalOrderPrice ?? 0).toFixed(2)}` : undefined}
                                className="num"
                                style={{
                                  width: 68,
                                  height: 26,
                                  padding: '0 6px',
                                  textAlign: 'right',
                                  border: `1px solid ${
                                    focusedId === r.id + '_oprice'
                                      ? 'var(--accent, #2563eb)'
                                      : orderPriceEdited
                                        ? 'var(--warning)'
                                        : 'var(--line)'
                                  }`,
                                  borderRadius: 4,
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                  fontSize: 12.5,
                                  outline: 'none',
                                }}
                              />
                            );
                          })()}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={r.invoiceQty}
                            onChange={(e) =>
                              handleQtyChange(r.id, Number(e.target.value))
                            }
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setFocusedId(r.id + '_qty');
                            }}
                            onBlur={() => setFocusedId(null)}
                            title={
                              qtyEdited
                                ? `원본: ${r.originalInvoiceQty.toLocaleString('ko-KR')}`
                                : undefined
                            }
                            className="num"
                            style={{
                              width: 72,
                              height: 26,
                              padding: '0 6px',
                              textAlign: 'right',
                              border: `1px solid ${
                                focusedId === r.id + '_qty'
                                  ? 'var(--accent, #2563eb)'
                                  : qtyEdited
                                    ? 'var(--warning)'
                                    : 'var(--line)'
                              }`,
                              borderRadius: 4,
                              background: 'var(--surface)',
                              color: 'var(--ink)',
                              fontWeight: 500,
                              fontSize: 12.5,
                              outline: 'none',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={r.invoicePrice}
                            onChange={(e) => handlePriceChange(r.id, Number(e.target.value))}
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setFocusedId(r.id + '_price');
                            }}
                            onBlur={() => setFocusedId(null)}
                            title={priceEdited ? `원본: $${r.originalInvoicePrice.toFixed(2)}` : undefined}
                            className="num"
                            style={{
                              width: 80,
                              height: 26,
                              padding: '0 6px',
                              textAlign: 'right',
                              border: `1px solid ${
                                focusedId === r.id + '_price'
                                  ? 'var(--accent, #2563eb)'
                                  : priceEdited
                                    ? 'var(--warning)'
                                    : 'var(--line)'
                              }`,
                              borderRadius: 4,
                              background: 'var(--surface)',
                              color: 'var(--ink)',
                              fontWeight: 500,
                              fontSize: 12,
                              outline: 'none',
                            }}
                          />
                        </div>
                        <span
                          className="num"
                          style={{
                            textAlign: 'right',
                            color: diffColor,
                            fontWeight: 600,
                          }}
                        >
                          {diff === 0
                            ? '—'
                            : `${diff > 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}`}
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <span
                            className="chip"
                            title={
                              r.status === 'match_prefix'
                                ? `PDF 파싱 코드 "${r.originalCode}" 가 주문서 "${r.orderCode}" 의 접두사라 자동 보정되었습니다.`
                                : undefined
                            }
                            style={{
                              color: meta.color,
                              background: meta.bg,
                              fontSize: 10.5,
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(r.id)}
                          title="이 행 삭제"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 24,
                            height: 24,
                            border: 'none',
                            borderRadius: 4,
                            background: 'transparent',
                            color: 'var(--ink-3)',
                            cursor: 'pointer',
                            padding: 0,
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'var(--danger-wash)';
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)';
                          }}
                        >
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 액션 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-base"
              onClick={handleAddRow}
              style={{ height: 32, fontSize: 12.5 }}
            >
              + 행 추가
            </button>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* 인보이스 PDF 를 안내 설정 어느 슬롯에 붙일지 라디오. 실제 파일이 없어도
                  라디오는 노출 (사용자가 실수 방지용으로 늘 선택하는 습관). */}
              <div
                role="radiogroup"
                aria-label="배송 방식"
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  fontSize: 12,
                  color: 'var(--ink-2)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="ship-mode"
                    value="air"
                    checked={shippingMode === 'air'}
                    onChange={() => setShippingMode('air')}
                  />
                  <span>항공(페덱스)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="ship-mode"
                    value="sea"
                    checked={shippingMode === 'sea'}
                    onChange={() => setShippingMode('sea')}
                  />
                  <span>해상</span>
                </label>
              </div>
              <button
                type="button"
                className="btn-base"
                onClick={handleReset}
                style={{ height: 32, fontSize: 12.5 }}
              >
                취소
              </button>
              <button
                type="button"
                className="btn-base primary"
                onClick={() => void handleFill()}
                disabled={
                  attaching ||
                  comparison.rows.filter(
                    (r) => r.status !== 'order_only' && r.invoiceQty > 0,
                  ).length === 0
                }
                style={{ height: 32, fontSize: 12.5 }}
              >
                {attaching
                  ? '이관 중…'
                  : `입고처리로 이관 (${comparison.rows.filter(
                      (r) => r.status !== 'order_only' && r.invoiceQty > 0,
                    ).length}건)`}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────
// helpers / subcomponents
// ───────────────────────────────────────────────────────────

function FileSlot({
  label,
  icon,
  accept,
  file,
  onChange,
  disabled,
}: {
  label: string;
  icon: 'excel' | 'pdf';
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const Icon = icon === 'excel' ? FileSpreadsheet : FileText;
  return (
    <label
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        border: `1px dashed ${dragOver ? 'var(--brand)' : 'var(--line-strong)'}`,
        borderRadius: 8,
        background: dragOver ? 'var(--brand-wash)' : 'var(--surface-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        minHeight: 56,
        transition: 'background .12s, border-color .12s',
      }}
    >
      <Icon
        size={20}
        color={file ? 'var(--brand)' : 'var(--ink-3)'}
        strokeWidth={1.6}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: file ? 'var(--ink)' : 'var(--ink-3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={file?.name}
        >
          {file ? file.name : '클릭 또는 드래그로 선택'}
        </div>
      </div>
      {file && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange(null);
          }}
          aria-label="파일 제거"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--ink-3)',
            padding: 2,
          }}
        >
          <X size={14} />
        </button>
      )}
      <input
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function TabButton({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: 'warning' | 'danger';
}) {
  const accent =
    tone === 'warning'
      ? 'var(--warning)'
      : tone === 'danger'
        ? 'var(--danger)'
        : 'var(--brand)';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        padding: '0 10px',
        border: `1px solid ${active ? accent : 'var(--line)'}`,
        background: active ? `${accent}1a` : 'var(--surface)',
        color: active ? accent : 'var(--ink-2)',
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `row_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

// ───────────────────────────────────────────────────────────
// 비교 로직
// ───────────────────────────────────────────────────────────

/**
 * 사용자 인라인 편집(코드/수량/단가)이 반영된 rows 로부터
 * orderRows / invoiceRows 데이터 세트를 재구성하고, compareOrderInvoice 를
 * 처음부터 다시 실행해 매칭·상태를 재계산한다.
 *
 * - order_only 행에서 orderCode 를 인보이스 코드와 일치하게 편집 → 병합
 * - invoice_only 행에서 code 를 주문 코드와 일치하게 편집 → 병합
 * - 코드는 같아도 수량/단가 다르면 qty_diff / amount_diff 자동 표시
 * - 매칭 상대가 없으면 그대로 order_only / invoice_only 유지 (에러 아님)
 */
function rebuildComparisonFromEdits(
  edited: {
    rows: ComparisonRow[];
    invoiceNo: string;
    invoiceDate: string;
  },
  productNameByCode: ReadonlyMap<string, string>,
  productCategoryByCode: ReadonlyMap<string, string>,
): {
  rows: ComparisonRow[];
  orderRows: OrderSheetRow[];
  invoiceRows: InvoiceParsedRow[];
} {
  const revisedOrderRows: OrderSheetRow[] = [];
  const revisedInvoiceRows: InvoiceParsedRow[] = [];

  for (const row of edited.rows) {
    // 주문 데이터 존재: invoice_only 가 아닌 경우.
    // order_only 행에서 사용자가 (인보이스 코드 셀 힌트가 없는 상태로) 좌측 코드 셀을
    // 직접 편집한 경우엔 편집이 code 필드에 들어가고 orderCode 는 원본 그대로 남을 수
    // 있어, orderCode 가 비어있거나 편집이 code 쪽에 있는 경우 code 를 fallback 으로.
    if (row.status !== 'invoice_only') {
      const orderCode = row.orderCode || row.code;
      if (orderCode) {
        const price = row.orderPrice ?? 0;
        revisedOrderRows.push({
          code: orderCode,
          description: row.description,
          unit: row.unit,
          qty: row.orderQty,
          price,
          amount: Number((price * row.orderQty).toFixed(2)),
        });
      }
    }
    // 인보이스 데이터 존재: order_only 가 아니고 code 가 채워진 상태.
    if (row.status !== 'order_only' && row.code) {
      revisedInvoiceRows.push({
        item_code: row.code,
        description: row.description,
        unit: row.unit,
        qty_shipped: row.invoiceQty,
        price: row.invoicePrice,
        amount: row.amount,
      });
    }
  }

  const invoice: InvoiceParsed = {
    invoice_no: edited.invoiceNo,
    invoice_date: edited.invoiceDate,
    rows: revisedInvoiceRows,
  };
  const rows = compareOrderInvoice(
    revisedOrderRows,
    invoice,
    productNameByCode,
    productCategoryByCode,
  );
  return { rows, orderRows: revisedOrderRows, invoiceRows: revisedInvoiceRows };
}

function compareOrderInvoice(
  orders: OrderSheetRow[],
  invoice: InvoiceParsed,
  productNameByCode: ReadonlyMap<string, string> = new Map(),
  productCategoryByCode: ReadonlyMap<string, string> = new Map(),
): ComparisonRow[] {
  // 정규화된 코드 → 주문 행. (대소문자/공백/하이픈 차이로 매칭 누락되던 문제 해결)
  const orderByCode = new Map<string, OrderSheetRow>();
  const orderEntries: Array<{ norm: string; row: OrderSheetRow }> = [];
  for (const o of orders) {
    const norm = normalizeCode(o.code);
    orderByCode.set(norm, o);
    orderEntries.push({ norm, row: o });
  }

  const seen = new Set<string>();
  const out: ComparisonRow[] = [];

  // 접두사 자동 매칭 최소 길이 — PDF 파싱에서 뒷글자가 잘리는 경우 대응.
  // 짧은 코드 오매칭 방지용 하한. 실제 유니크 조건이 더 강한 안전장치.
  const PREFIX_MIN_LEN = 4;

  // 인보이스 기준 1차 패스
  for (const inv of invoice.rows) {
    const normInv = normalizeCode(inv.item_code);
    let ord = orderByCode.get(normInv);
    let prefixMatched = false;
    let matchedNorm = normInv;

    // 완전 일치 실패 시 접두사 fallback:
    //  - 인보이스 코드가 주문서 코드의 접두사이고 (인보이스가 더 짧음)
    //  - 아직 소비되지 않은 주문서 후보가 정확히 1개일 때만
    //  - 최소 길이 하한(PREFIX_MIN_LEN) 이상
    //  - 예: PDF 파싱 "72204000s" ← 주문서 "72204000soft"
    if (!ord && normInv.length >= PREFIX_MIN_LEN) {
      const candidates = orderEntries.filter(
        (e) =>
          !seen.has(e.norm) &&
          e.norm.length > normInv.length &&
          e.norm.startsWith(normInv),
      );
      if (candidates.length === 1) {
        ord = candidates[0].row;
        matchedNorm = candidates[0].norm;
        prefixMatched = true;
      }
    }
    seen.add(matchedNorm);

    // OPS 한글 제품명 우선, 없으면 인보이스/주문서 영문명.
    // 접두사 매칭 시엔 주문서(긴) 코드 기준으로 lookup — 인보이스(짧은) 코드는 OPS 에 없을 것.
    const opsLookupCode = prefixMatched ? matchedNorm : normInv;
    const opsName = productNameByCode.get(opsLookupCode);
    const isInOps = opsName !== undefined;
    const desc = opsName || inv.description || ord?.description || '';

    const orderQty = ord?.qty ?? 0;
    const orderPrice = ord?.price;
    const invoiceQty = inv.qty_shipped;
    const invoicePrice = inv.price || ord?.price || 0;

    let status = calcStatus(orderQty, invoiceQty, invoicePrice, orderPrice, isInOps);
    // 접두사 매칭이면서 수량/단가까지 모두 일치 → 'match_prefix' 로 표시(뱃지 라벨 구분).
    // 수량/단가 불일치가 있으면 그쪽이 우선(문제 가시성 유지).
    if (prefixMatched && status === 'match') status = 'match_prefix';

    out.push({
      id: makeId(),
      code: inv.item_code,
      originalCode: inv.item_code,
      orderCode: ord?.code ?? '',
      description: desc,
      unit: (ord?.unit ?? inv.unit) as 'DZ' | 'EA',
      orderQty,
      originalOrderQty: orderQty,
      invoiceQty,
      originalInvoiceQty: invoiceQty,
      orderPrice,
      originalOrderPrice: orderPrice,
      invoicePrice,
      originalInvoicePrice: invoicePrice,
      amount: inv.amount,
      isInOps,
      category: productCategoryByCode.get(opsLookupCode) ?? '',
      status,
    });
  }

  // 주문서에만 있고 인보이스 전무 (Claude 가 BO 항목까지 포함 못 한 경우의 안전망)
  for (const ord of orders) {
    const normOrd = normalizeCode(ord.code);
    if (seen.has(normOrd)) continue;
    const opsName = productNameByCode.get(normOrd);
    const isInOps = opsName !== undefined;
    out.push({
      id: makeId(),
      code: ord.code,
      originalCode: ord.code,
      orderCode: ord.code,
      description: opsName || ord.description,
      unit: ord.unit,
      orderQty: ord.qty,
      originalOrderQty: ord.qty,
      invoiceQty: 0,
      originalInvoiceQty: 0,
      orderPrice: ord.price,
      originalOrderPrice: ord.price,
      invoicePrice: 0,
      originalInvoicePrice: 0,
      amount: 0,
      isInOps,
      category: productCategoryByCode.get(normOrd) ?? '',
      status: calcStatus(ord.qty, 0, 0, ord.price, isInOps),
    });
  }

  // 정렬: 불일치 상태 우선 → 제품분류 → 제품명 → 코드 (안정)
  const STATUS_PRIORITY: Record<CompareStatus, number> = {
    qty_diff:     0,  // 수량불일치
    amount_diff:  1,  // 금액불일치
    order_only:   2,  // 주문서만
    invoice_only: 3,  // 인보이스만
    unknown:      4,  // 미확인
    match:        5,  // 일치 — 맨 아래
    match_prefix: 5,  // 일치(코드보정) — match 와 동일 우선순위
  };
  out.sort((a, b) => {
    const statusCmp = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusCmp !== 0) return statusCmp;
    const catCmp = a.category.localeCompare(b.category, 'ko');
    if (catCmp !== 0) return catCmp;
    const descCmp = a.description.localeCompare(b.description, 'ko');
    if (descCmp !== 0) return descCmp;
    return a.code.localeCompare(b.code);
  });
  return out;
}
