/**
 * 문서 파일 업로드/목록 탭 — 수입면장/화학물질관련/기타서류 공용.
 * 엔젤러스 인보이스는 그룹/타임라인 UI 가 필요해 별도 컴포넌트 사용.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 수동 업로드(source='manual'): 파일은 base64 data URI 로 `file_path` 에 저장.
 * 🟠 자동 수집(source='email_auto'): Storage `documents` 버킷에 업로드, `file_path` 는 버킷 경로.
 *    다운로드 시 file_path 가 "data:" 로 시작하면 base64, 아니면 Storage.download 사용.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Loader2, Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MatchDetailModal } from '@/components/feature/documents/MatchDetailModal';
import { CombinedMatchModal } from '@/components/feature/documents/CombinedMatchModal';
import { MultiChip } from '@/components/feature/orders/primitives';
import type { DocFileCategory } from '@/pages/documents/DocumentsPage';
import {
  parseSearchTerms,
  metaLineItemsMatch,
  matchedLineDetails,
  type MatchedLine,
} from '@/utils/lineItemSearch';

const CATEGORY_LABELS: Record<DocFileCategory, string> = {
  import_declaration: '수입면장',
  angelus_invoice: '엔젤러스인보이스',
  chemical: '화학물질관련',
  other: '기타서류',
};

/** 수입면장 검색 텍스트 입력형 검색 타입별 placeholder(연도별조회 제외). */
const DECL_TEXT_PLACEHOLDER: Record<'file_name' | 'doc_no' | 'product', string> =
  {
    file_name: '파일명 검색',
    doc_no: '신고번호 검색',
    product: '제품코드/명 검색 (쉼표·공백으로 여러 개)',
  };

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STORAGE_BUCKET = 'documents';

const SELECT_LIST =
  'id, file_name, file_size, mime_type, memo, uploaded_at, created_at, source, email_from, email_received_at, extracted_doc_no, extracted_doc_date, extracted_metadata, file_path';

interface DocumentFileRow {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  memo: string | null;
  uploaded_at: string | null;
  created_at: string | null;
  source: string | null;
  email_from: string | null;
  email_received_at: string | null;
  extracted_doc_no: string | null;
  extracted_doc_date: string | null;
  extracted_metadata: unknown;
  file_path: string;
}

interface Props {
  companyId: string | null;
  category: DocFileCategory;
}

/** (항목 19) 수입면장 간접검색이 참조하는 제품 인보이스(상세보기/다운로드용). */
interface ProductInvoice {
  no: string;
  meta: unknown;
  id: string;
  file_name: string;
  file_path: string;
}

/** extracted_metadata.ship_date (문자열) 우선, 없으면 '—'. */
function metaShipDate(meta: unknown): string {
  if (meta && typeof meta === 'object') {
    const s = (meta as { ship_date?: unknown }).ship_date;
    if (typeof s === 'string' && s.trim()) return s;
  }
  return '—';
}

/** 수입면장 row 의 매칭 제품 인보이스번호(없으면 ''). */
function matchedProductNo(meta: unknown): string {
  if (meta && typeof meta === 'object') {
    const v = (meta as { matched_product_invoice_no?: unknown })
      .matched_product_invoice_no;
    if (typeof v === 'string') return v.trim();
  }
  return '';
}

export function DocumentFilesTab({ companyId, category }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [memo, setMemo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentFileRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  // 항목 26: 검색 필터 기본값을 제품코드/명(product)으로.
  const [searchType, setSearchType] = useState<'file_name' | 'doc_no' | 'product'>(
    'product',
  );
  const [searchText, setSearchText] = useState('');
  // 항목 27: 연도 다중선택 필터(수입면장 신고일자 기준, OR). 빈 배열이면 전체.
  const [yearSel, setYearSel] = useState<string[]>([]);
  // (항목 19) 상세보기 팝업 — 매칭 제품 인보이스 + 매칭 라인.
  const [detailModal, setDetailModal] = useState<{
    inv: ProductInvoice;
    lines: MatchedLine[];
  } | null>(null);
  // 항목 28: 통합 조회 팝업 + ZIP 다운로드(수입면장 PDF).
  const [combinedOpen, setCombinedOpen] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  // Phase 5: 리스트 체크박스 선택(행 id) → 선택 항목 일괄 ZIP 다운로드.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const queryKey = ['document-files', companyId, category];

  const { data: rows = [], isLoading } = useQuery<DocumentFileRow[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () => {
      return await fetchAllRows<DocumentFileRow>(() =>
        supabase
          .from('document_files')
          .select(SELECT_LIST)
          .eq('company_id', companyId!)
          .eq('category', category)
          .order('uploaded_at', { ascending: false, nullsFirst: false }),
      );
    },
    staleTime: 30_000,
  });

  // 🟠 (항목 5·10) 수입면장 전용 — 매칭 제품 인보이스 원본(번호 + metadata).
  //   총액(항목 5 수입합계금액)과 line_items(항목 10 제품 간접검색)에 공용. 다른 카테고리에서는 조회 안 함.
  const isDeclaration = category === 'import_declaration';
  const { data: productInvoices = [], isFetched: productsFetched } = useQuery<
    ProductInvoice[]
  >({
    queryKey: ['angelus-product-invoices', companyId],
    enabled: Boolean(companyId) && isDeclaration,
    staleTime: 60_000,
    queryFn: async () => {
      const prodRows = await fetchAllRows<{
        id: string;
        file_name: string;
        file_path: string;
        extracted_doc_no: string | null;
        extracted_metadata: unknown;
      }>(() =>
        supabase
          .from('document_files')
          .select('id, file_name, file_path, extracted_doc_no, extracted_metadata')
          .eq('company_id', companyId!)
          .eq('category', 'angelus_invoice')
          .eq('doc_subtype', 'product'),
      );
      return prodRows
        .map((r) => ({
          no: r.extracted_doc_no?.trim() ?? '',
          meta: r.extracted_metadata,
          id: r.id,
          file_name: r.file_name,
          file_path: r.file_path,
        }))
        .filter((r) => r.no);
    },
  });

  // (항목 5) 인보이스번호 → total_usd 맵.
  const productTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of productInvoices) {
      const total = parseTotalUsd(r.meta);
      if (total != null) map.set(r.no, total);
    }
    return map;
  }, [productInvoices]);

  // (항목 19) 인보이스번호 → 제품 인보이스(상세보기/다운로드용).
  const productByNo = useMemo(() => {
    const map = new Map<string, ProductInvoice>();
    for (const r of productInvoices) map.set(r.no, r);
    return map;
  }, [productInvoices]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !companyId) return;

    if (file.size > MAX_FILE_SIZE) {
      showToast({ kind: 'error', text: '10MB 이하 파일만 업로드 가능합니다.' });
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
      });

      const { error } = await supabase.from('document_files').insert({
        company_id: companyId,
        category,
        file_name: file.name,
        file_path: base64,
        file_size: file.size,
        mime_type: file.type || null,
        memo: memo.trim() || null,
        uploaded_at: new Date().toISOString(),
        source: 'manual',
      });

      if (error) throw error;

      showToast({ kind: 'success', text: '업로드 완료' });
      setMemo('');
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '업로드 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (row: DocumentFileRow) => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('document_files')
        .select('file_path, file_name, source')
        .eq('id', row.id)
        .eq('company_id', companyId)
        .single();
      if (error) throw error;
      if (!data?.file_path) throw new Error('파일 데이터 없음');

      if (data.file_path.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = data.file_path;
        a.download = data.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const { data: blob, error: dlErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(data.file_path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? '다운로드 실패');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '다운로드 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  /** (항목 19) 파일 경로/이름으로 직접 다운로드(제품 인보이스 PDF). */
  const downloadByPath = async (filePath: string, fileName: string) => {
    try {
      if (filePath.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = filePath;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const { data: blob, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(filePath);
      if (error || !blob) throw new Error(error?.message ?? '다운로드 실패');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '다운로드 실패';
      showToast({ kind: 'error', text: msg });
    }
  };

  /** (항목 19) 수입면장 row 의 매칭 제품 인보이스 상세보기 팝업 열기. */
  const openDetail = (row: DocumentFileRow) => {
    const inv = productByNo.get(matchedProductNo(row.extracted_metadata));
    if (!inv) return;
    const lines = matchedLineDetails(inv.meta, parseSearchTerms(searchText));
    setDetailModal({ inv, lines });
  };

  /** 항목 28: 통합 조회 매칭 수입면장들의 PDF 를 하나의 ZIP 으로 다운로드. */
  const handleDownloadZip = async () => {
    if (zipBusy || combinedMatches.length === 0) return;
    setZipBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Set<string>();
      let added = 0;
      for (const m of combinedMatches) {
        const fp = m.row.file_path;
        if (!fp) continue;
        let blob: Blob | null = null;
        if (fp.startsWith('data:')) {
          blob = await (await fetch(fp)).blob();
        } else {
          const { data } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(fp);
          blob = data ?? null;
        }
        if (!blob) continue;
        let name =
          m.row.file_name || `${m.row.extracted_doc_no ?? 'declaration'}.pdf`;
        if (used.has(name)) name = `${m.row.extracted_doc_no ?? added}_${name}`;
        used.add(name);
        zip.file(name, blob);
        added += 1;
      }
      if (added === 0) {
        showToast({ kind: 'error', text: '다운로드할 PDF 를 찾지 못했습니다.' });
        return;
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `수입면장_검색결과_${added}건.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast({ kind: 'success', text: `ZIP 다운로드 완료 (${added}개 PDF)` });
    } catch (e) {
      showToast({
        kind: 'error',
        text: `ZIP 생성 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setZipBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !companyId) return;
    setBusyDelete(true);
    try {
      if (
        deleteTarget.source === 'email_auto' &&
        !deleteTarget.file_path.startsWith('data:')
      ) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([deleteTarget.file_path]);
      }
      const { error } = await supabase
        .from('document_files')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('company_id', companyId);
      if (error) throw error;
      showToast({ kind: 'success', text: '삭제 완료' });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setBusyDelete(false);
    }
  };

  const showMetaColumns = category === 'import_declaration';
  const showSearchBar = category === 'import_declaration';

  // 🟠 연도별조회용 선택지 — 실제 데이터에 존재하는 연도만 desc 정렬.
  const availableYears = useMemo(() => {
    if (!showSearchBar) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const y = r.extracted_doc_date?.slice(0, 4);
      if (y && /^\d{4}$/.test(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows, showSearchBar]);

  const filteredRows = useMemo(() => {
    if (!showSearchBar) return rows;
    // Phase 5: 기본 정렬 = 신고일자(extracted_doc_date) 오름차순, 값 없는 건 뒤로.
    const byDateAsc = [...rows].sort((a, b) => {
      const da = a.extracted_doc_date ?? '';
      const db = b.extracted_doc_date ?? '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
    // 항목 27: 연도 다중선택(OR, 신고일자 기준) 먼저 적용, 그 위에 검색(AND).
    const base = yearSel.length
      ? byDateAsc.filter((r) =>
          yearSel.includes((r.extracted_doc_date ?? '').slice(0, 4)),
        )
      : byDateAsc;
    const q = searchText.trim().toLowerCase();
    if (!q) return base;
    if (searchType === 'file_name') {
      return base.filter((r) => r.file_name.toLowerCase().includes(q));
    }
    if (searchType === 'product') {
      // (항목 10) 제품코드/명 → 매칭 제품 인보이스(line_items) 의 invoice_no 집합을 구하고,
      //   수입면장 중 matched_product_invoice_no 가 그 집합에 포함되는 건만 표시.
      //   매칭 정보 없는 수입면장은 검색 시에만 제외(검색어 없으면 위에서 전체 반환).
      const terms = parseSearchTerms(searchText);
      if (terms.length === 0) return base;
      const matchedNos = new Set<string>();
      for (const p of productInvoices) {
        if (metaLineItemsMatch(p.meta, terms)) matchedNos.add(p.no);
      }
      if (matchedNos.size === 0) return [];
      return base.filter((r) => {
        const no = matchedProductNo(r.extracted_metadata);
        return no.length > 0 && matchedNos.has(no);
      });
    }
    return base.filter((r) =>
      (r.extracted_doc_no ?? '').toLowerCase().includes(q),
    );
  }, [rows, showSearchBar, searchType, searchText, yearSel, productInvoices]);

  const hasActiveSearch =
    showSearchBar && (searchText.trim().length > 0 || yearSel.length > 0);

  // ───── Phase 5: 체크박스 선택 + 선택 항목 일괄 ZIP (수입면장 전용) ─────
  const visibleIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedVisibleCount = visibleIds.filter((id) =>
    selectedIds.has(id),
  ).length;

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });

  /** Phase 5: 체크박스로 선택된(현재 보이는) 수입면장 PDF 를 하나의 ZIP 으로 다운로드. */
  const handleDownloadSelectedZip = async () => {
    const targets = filteredRows.filter((r) => selectedIds.has(r.id));
    if (zipBusy || targets.length === 0) return;
    setZipBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Set<string>();
      let added = 0;
      for (const row of targets) {
        const fp = row.file_path;
        if (!fp) continue;
        let blob: Blob | null = null;
        if (fp.startsWith('data:')) {
          blob = await (await fetch(fp)).blob();
        } else {
          const { data } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(fp);
          blob = data ?? null;
        }
        if (!blob) continue;
        let name =
          row.file_name || `${row.extracted_doc_no ?? 'declaration'}.pdf`;
        if (used.has(name)) name = `${row.extracted_doc_no ?? added}_${name}`;
        used.add(name);
        zip.file(name, blob);
        added += 1;
      }
      if (added === 0) {
        showToast({ kind: 'error', text: '다운로드할 PDF 를 찾지 못했습니다.' });
        return;
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `수입면장_선택_${added}건.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast({ kind: 'success', text: `ZIP 다운로드 완료 (${added}개 PDF)` });
    } catch (e) {
      showToast({
        kind: 'error',
        text: `ZIP 생성 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setZipBusy(false);
    }
  };

  // 항목 28: 통합 조회 대상 — 제품 검색 + 연도필터로 매칭된 수입면장들(연결 제품 인보이스 라인 포함).
  const combinedMatches = useMemo(() => {
    if (!isDeclaration || searchType !== 'product') return [];
    const terms = parseSearchTerms(searchText);
    if (terms.length === 0) return [];
    const base = yearSel.length
      ? rows.filter((r) =>
          yearSel.includes((r.extracted_doc_date ?? '').slice(0, 4)),
        )
      : rows;
    const out: {
      row: DocumentFileRow;
      inv: ProductInvoice;
      lines: MatchedLine[];
    }[] = [];
    for (const r of base) {
      const no = matchedProductNo(r.extracted_metadata);
      if (!no) continue;
      const inv = productByNo.get(no);
      if (!inv) continue;
      const lines = matchedLineDetails(inv.meta, terms);
      if (lines.length) out.push({ row: r, inv, lines });
    }
    return out;
  }, [rows, isDeclaration, searchType, searchText, yearSel, productByNo]);

  const handleSearchTypeChange = (
    next: 'file_name' | 'doc_no' | 'product',
  ) => {
    setSearchType(next);
    setSearchText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <label
          className="btn-base primary"
          style={{
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? (
            <Loader2 className="ico-sm animate-spin" />
          ) : (
            <FileUp className="ico-sm" />
          )}
          <span>{uploading ? '업로드 중…' : '파일 업로드'}</span>
          <input
            type="file"
            onChange={handleFileChange}
            disabled={uploading || !companyId}
            style={{ display: 'none' }}
          />
        </label>

        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모 (선택)"
          disabled={uploading}
          style={{
            flex: 1,
            minWidth: 200,
            height: 34,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid var(--line-strong)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 13,
            fontFamily: 'var(--font-kr)',
          }}
        />

        <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          카테고리: <strong>{CATEGORY_LABELS[category]}</strong> · 최대 10MB
        </div>
      </div>

      {showSearchBar && (
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <select
            value={searchType}
            onChange={(e) =>
              handleSearchTypeChange(
                e.target.value as 'file_name' | 'doc_no' | 'product',
              )
            }
            style={{
              height: 34,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 13,
              fontFamily: 'var(--font-kr)',
            }}
          >
            <option value="file_name">파일명</option>
            <option value="doc_no">신고번호</option>
            <option value="product">제품코드/명</option>
          </select>

          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={DECL_TEXT_PLACEHOLDER[searchType]}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: 13,
              width: 240,
              fontFamily: 'var(--font-kr)',
            }}
          />

          <MultiChip
            label="연도"
            selected={yearSel}
            onChange={setYearSel}
            options={availableYears.map((y) => ({ id: y, label: `${y}년` }))}
          />

          {combinedMatches.length > 0 && (
            <button
              type="button"
              className="btn-base primary"
              onClick={() => setCombinedOpen(true)}
              style={{ height: 34 }}
            >
              통합 조회 ({combinedMatches.length}건)
            </button>
          )}

          <button
            type="button"
            className="btn-base"
            onClick={() => void handleDownloadSelectedZip()}
            disabled={zipBusy || selectedVisibleCount === 0}
            style={{
              height: 34,
              opacity: zipBusy || selectedVisibleCount === 0 ? 0.6 : 1,
            }}
          >
            {zipBusy
              ? 'ZIP 생성 중…'
              : `선택 항목 ZIP 다운로드 (${selectedVisibleCount})`}
          </button>

          {hasActiveSearch && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                setYearSel([]);
              }}
              className="btn-base"
            >
              초기화
            </button>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {hasActiveSearch
              ? `${filteredRows.length} / ${rows.length}건`
              : `${rows.length}건`}
          </div>
        </div>
      )}

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            불러오는 중…
          </div>
        ) : filteredRows.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            {hasActiveSearch
              ? '검색 결과가 없습니다.'
              : '업로드된 파일이 없습니다.'}
          </div>
        ) : (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {showMetaColumns && (
                  <th style={thStyle('center', 40)}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      title="전체 선택/해제"
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th style={thStyle('left')}>파일명</th>
                {showMetaColumns && (
                  <>
                    <th style={thStyle('left', 140)}>신고번호</th>
                    <th style={thStyle('left', 110)}>신고일자</th>
                    <th style={thStyle('center', 70)}>운송</th>
                    <th style={thStyle('right', 130)}>수입합계금액</th>
                  </>
                )}
                <th style={thStyle('right', 90)}>크기</th>
                <th style={thStyle('left', 200)}>메모/발신</th>
                <th style={thStyle('left', 140)}>
                  {showMetaColumns ? '수신일시' : '업로드일'}
                </th>
                <th style={thStyle('center', 140)}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isAuto = row.source === 'email_auto';
                const meta =
                  (row.extracted_metadata as {
                    transport_type?: string | null;
                    mawb_hawb?: string | null;
                  } | null) ?? null;
                const importKrw = showMetaColumns
                  ? computeImportTotalKrw(row.extracted_metadata, productTotals)
                  : null;
                return (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid var(--line)' }}
                  >
                    {showMetaColumns && (
                      <td style={{ ...tdStyle('center'), width: 40 }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                    )}
                    <td style={tdStyle('left')}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {isAuto && (
                          <Sparkles
                            size={12}
                            style={{ color: 'var(--accent, #6b7cff)' }}
                          />
                        )}
                        <span>{row.file_name}</span>
                      </div>
                    </td>
                    {showMetaColumns && (
                      <>
                        <td
                          style={{
                            ...tdStyle('left'),
                            color: 'var(--ink-2)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {row.extracted_doc_no ?? '—'}
                        </td>
                        <td
                          style={{
                            ...tdStyle('left'),
                            color: 'var(--ink-2)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {row.extracted_doc_date ?? '—'}
                        </td>
                        <td
                          style={{
                            ...tdStyle('center'),
                            color: 'var(--ink-2)',
                          }}
                        >
                          {renderTransport(meta?.transport_type ?? null)}
                        </td>
                        <td
                          style={{
                            ...tdStyle('right'),
                            color:
                              importKrw != null
                                ? 'var(--ink)'
                                : 'var(--ink-3)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                          title={importKrwTooltip(
                            row.extracted_metadata,
                            productTotals,
                          )}
                        >
                          {importKrwLabel(productsFetched, importKrw)}
                        </td>
                      </>
                    )}
                    <td
                      style={{
                        ...tdStyle('right'),
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--ink-2)',
                      }}
                    >
                      {fmtSize(row.file_size)}
                    </td>
                    <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                      {isAuto
                        ? (row.email_from ?? '자동 수집')
                        : (row.memo ?? '—')}
                    </td>
                    <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                      {fmtDateTime(
                        isAuto
                          ? (row.email_received_at ??
                              row.uploaded_at ??
                              row.created_at)
                          : (row.uploaded_at ?? row.created_at),
                      )}
                    </td>
                    <td style={tdStyle('center')}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {searchType === 'product' &&
                          productByNo.has(
                            matchedProductNo(row.extracted_metadata),
                          ) && (
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              title="매칭 제품 상세보기"
                              className="btn-base"
                              style={{
                                height: 28,
                                padding: '0 10px',
                                fontSize: 12,
                              }}
                            >
                              상세보기
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => handleDownload(row)}
                          title="다운로드"
                          className="btn-base"
                          style={{
                            height: 28,
                            padding: '0 10px',
                            fontSize: 12,
                          }}
                        >
                          <Download size={12} />
                          다운로드
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          title="삭제"
                          className="btn-base"
                          style={{
                            height: 28,
                            padding: '0 10px',
                            fontSize: 12,
                            color: 'var(--danger)',
                          }}
                        >
                          <Trash2 size={12} />
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="파일 삭제"
        body={
          <span>
            <strong>{deleteTarget?.file_name}</strong> 파일을 정말 삭제할까요?
            <br />
            삭제된 파일은 복구할 수 없습니다.
          </span>
        }
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        busy={busyDelete}
      />

      {detailModal && (
        <MatchDetailModal
          open
          onClose={() => setDetailModal(null)}
          fileName={detailModal.inv.file_name}
          docNo={detailModal.inv.no}
          shipDate={metaShipDate(detailModal.inv.meta)}
          lines={detailModal.lines}
          totalUsd={parseTotalUsd(detailModal.inv.meta)}
          onDownload={() =>
            downloadByPath(detailModal.inv.file_path, detailModal.inv.file_name)
          }
        />
      )}

      {combinedOpen && (
        <CombinedMatchModal
          open
          onClose={() => setCombinedOpen(false)}
          queryLabel={searchText.trim()}
          years={[...yearSel].sort()}
          entries={combinedMatches.map((m) => ({
            docNo: m.row.extracted_doc_no,
            shipDate: metaShipDate(m.inv.meta),
            fileName: m.row.file_name,
            lines: m.lines,
          }))}
          onDownloadZip={() => void handleDownloadZip()}
          zipBusy={zipBusy}
        />
      )}
    </div>
  );
}

function renderTransport(t: string | null): string {
  if (t === 'air') return '항공';
  if (t === 'sea') return '해상';
  return '—';
}

/** unknown 값을 유한 숫자로 파싱. 실패 시 null. */
function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** extracted_metadata.total_usd 파싱 (angelus 제품 인보이스). */
function parseTotalUsd(meta: unknown): number | null {
  if (!meta || typeof meta !== 'object') return null;
  return toNumOrNull((meta as { total_usd?: unknown }).total_usd);
}

/**
 * 수입합계금액(KRW) = round((제품_total_usd + 운임_usd) × 환율). (항목 5)
 *  · 제품_total_usd: 매칭 제품 인보이스(productTotals[matched_product_invoice_no])
 *  · 운임_usd: actual_freight_usd 우선, 없으면 declared_freight_usd
 *  · 매칭 인보이스번호/제품총액/환율 중 하나라도 없으면 null(=매칭정보 없음).
 */
function computeImportTotalKrw(
  meta: unknown,
  productTotals: Map<string, number> | undefined,
): number | null {
  if (!productTotals || !meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const prodNo =
    typeof m.matched_product_invoice_no === 'string'
      ? m.matched_product_invoice_no.trim()
      : '';
  if (!prodNo) return null;
  const productUsd = productTotals.get(prodNo);
  if (productUsd == null) return null;
  const freightUsd =
    toNumOrNull(m.actual_freight_usd) ?? toNumOrNull(m.declared_freight_usd);
  const fx = toNumOrNull(m.exchange_rate);
  if (freightUsd == null || fx == null) return null;
  return Math.round((productUsd + freightUsd) * fx);
}

/** KRW 표시. 로딩 중이면 '—', 계산 불가면 '매칭정보 없음'. */
function importKrwLabel(loaded: boolean, krw: number | null): string {
  if (!loaded) return '—';
  if (krw == null) return '매칭정보 없음';
  return `₩${krw.toLocaleString('ko-KR')}`;
}

/** 수입합계금액 계산 근거 툴팁 — 계산 가능할 때만 문자열, 아니면 undefined. */
function importKrwTooltip(
  meta: unknown,
  productTotals: Map<string, number> | undefined,
): string | undefined {
  if (computeImportTotalKrw(meta, productTotals) == null) return undefined;
  const m = meta as Record<string, unknown>;
  const prodNo = String(m.matched_product_invoice_no ?? '').trim();
  const productUsd = productTotals?.get(prodNo);
  const freightUsd =
    toNumOrNull(m.actual_freight_usd) ?? toNumOrNull(m.declared_freight_usd);
  const fx = toNumOrNull(m.exchange_rate);
  return `제품 인보이스 ${prodNo} ($${productUsd}) + 운임 $${freightUsd} × 환율 ${fx}`;
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

function thStyle(
  align: 'left' | 'center' | 'right',
  width?: number,
): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--ink-2)',
    width,
  };
}

function tdStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    color: 'var(--ink)',
  };
}
