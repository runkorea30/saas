/**
 * 세금계산서대장 페이지 — 재무 > 세금계산서.
 *
 * 사업자번호 단위 발행:
 *  - 독립 거래처: customer_id 사용
 *  - 그룹 소속 거래처들: customer_group_id 사용 (멤버 매출 합산)
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 에서만.
 * 🔴 CLAUDE.md §5: 모든 조회 fetchAllRows 경유 (훅 내부).
 * 🔴 금액: supply_amount = Math.floor(total/1.1) (훅 내부 splitAmounts).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/lib/supabase';
import {
  useTaxInvoiceRows,
  useCreateTaxInvoice,
  useCreateTaxInvoicesBulk,
  useDeleteTaxInvoice,
} from '@/hooks/useTaxInvoices';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { fmtWon } from '@/components/feature/orders/primitives';
import type { TaxInvoice, TaxInvoiceRow } from '@/types/taxInvoice';

// ───────────────────────────────────────────────────────────
// 공급자(자사) 정보 쿼리 — 엑셀 다운로드용
// ───────────────────────────────────────────────────────────

interface SupplierInfo {
  id: string;
  name: string;
  business_number: string | null;
}

function useSupplierCompany(companyId: string | null) {
  return useQuery<SupplierInfo | null>({
    queryKey: ['supplier-company', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, business_number')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });
}

// ───────────────────────────────────────────────────────────
// 국세청 전자세금계산서 일괄발급 엑셀 원서식 상수 (1~6행)
// ───────────────────────────────────────────────────────────
//
// Row 1-5: 안내문 (각 행 1셀)
// Row 6: 컬럼 헤더 (59셀 = A~BG)
// Row 7~ : 실제 데이터 (buildExcelRow 결과)
const HEADER_ROWS: (string | number)[][] = [
  ['엑셀 업로드 양식(전자세금계산서-일반(영세율)) - 100건 이하'],
  ["○ 필수항목(주황색)은 반드시 입력하셔야 합니다.\n     > 아래 '항목설명' 및 '올바른 예시' 시트를 참고하여 작성하시기 바랍니다."],
  ['○ 임의로 양식을 변경[행 또는 열 추가 삭제 등]하는 경우 발급시 오류가 발생할 수 있으므로, 정해진 양식으로 작성하시기 바랍니다\n     > 실제 업로드할 DATA는 7행부터 입력하여야 하며, 최대 100건까지 입력이 가능합니다.(100건 초과 자료는 처리 안되며, 발급은 최대 50건씩 처리가능합니다)'],
  ["     > 거래한 재화 또는 용역에 맞는 전자(세금)계산서 종류코드(01, 02)를 정확히 입력하셔야 합니다.\n     > 품목은 1건 이상 입력해야 합니다.\n     > 공급받는자 등록번호는 사업자등록번호, 주민등록번호를 입력할 수 있습니다. \n        외국인의 경우 공급받는자 등록번호(C열)에 '9999999999999'를 입력하시고, 비고란(N열)에  외국인등록번호 또는 여권번호를 입력하시기 바랍니다.\n     > 마지막 열(오른쪽 끝)의 '영수(01), 청구(02)'는 필수 항목이니 누락하지 마시기 바랍니다.(영수 : 대가를 받은 경우, 청구 : 대가를 아직 못 받은 경우)"],
  ["○ 처음 사용자께서는 '올바른 예시' 시트에 있는 내용을 복사ᆞ붙여넣기 하신 후 내용을 수정하시면 오류 없이 쉽게 발급하실 수 있습니다.\n     > 오류발생시 '잘못된 예시' 시트에 있는 내용들을 참고하시면 대표적인 오류 원인을 확인할 수 있습니다. \n○ 발급가능한 파일 확장자는 XLS, XLSX 입니다.\n○ 일괄발급에 도움을 받고자 하시면 국세상담센터(국번없이 126번→ 1번 → 2번)로 문의주시기 바랍니다."],
  [
    '전자(세금)계산서 종류\n(01:일반, 02:영세율)',
    '작성일자',
    '공급자 등록번호\n("-" 없이 입력)',
    '공급자\n 종사업장번호',
    '공급자 상호',
    '공급자 성명',
    '공급자 사업장주소',
    '공급자 업태',
    '공급자 종목',
    '공급자 이메일',
    '공급받는자 등록번호\n("-" 없이 입력)',
    '공급받는자 \n종사업장번호',
    '공급받는자 상호 ',
    '공급받는자 성명',
    '공급받는자 사업장주소',
    '공급받는자 업태',
    '공급받는자 종목',
    '공급받는자 이메일1',
    '공급받는자 이메일2',
    '공급가액\n합계',
    '세액\n합계',
    '비고',
    '일자1\n(2자리, 작성년월 제외)',
    '품목1',
    '규격1',
    '수량1',
    '단가1',
    '공급가액1',
    '세액1',
    '품목비고1',
    '일자2\n(2자리, 작성년월 제외)',
    '품목2',
    '규격2',
    '수량2',
    '단가2',
    '공급가액2',
    '세액2',
    '품목비고2',
    '일자3\n(2자리, 작성년월 제외)',
    '품목3',
    '규격3',
    '수량3',
    '단가3',
    '공급가액3',
    '세액3',
    '품목비고3',
    '일자4\n(2자리, 작성년월 제외)',
    '품목4',
    '규격4',
    '수량4',
    '단가4',
    '공급가액4',
    '세액4',
    '품목비고4',
    '현금',
    '수표',
    '어음',
    '외상미수금',
    '영수(01),\n청구(02)',
  ],
];

// ───────────────────────────────────────────────────────────
// 엑셀 행 빌더 — 데이터 1행 = 1 세금계산서 (총 59 컬럼: A~BG)
// ───────────────────────────────────────────────────────────
//
// 컬럼 매핑 (HEADER_ROWS Row 6 과 1:1 대응):
//   A:invoice_type  B:작성일자(YYYYMMDD)  C:공급자 등록번호  D:종사업장(빈칸)
//   E:공급자 상호  F~J: 빈칸(성명/주소/업태/종목/이메일)
//   K:공급받는자 등록번호  L:종사업장(빈칸)  M:공급받는자 상호
//   N:성명(ceo_name)  O:사업장주소  P:업태  Q:종목  R:이메일1  S:이메일2(빈칸)
//   T:공급가액 합계  U:세액 합계  V:비고(빈칸)
//   W:일자1(말일 2자리)  X:품목1("가죽공예 용품")  Y~AA: 빈칸(규격1/수량1/단가1)
//   AB:공급가액1  AC:세액1  AD:품목비고1(빈칸)
//   AE~AL(8칸): 품목2 빈칸  AM~AT(8칸): 품목3 빈칸  AU~BB(8칸): 품목4 빈칸
//   BC:현금  BD:수표  BE:어음  BF:외상미수금  (모두 빈칸)
//   BG:영수(01)/청구(02) → payment_type
function buildExcelRow(
  row: TaxInvoiceRow,
  invoice: TaxInvoice,
  supplierName: string,
  supplierBrnRaw: string,
  issueDateNum: number,
  dayStr: string,
): (string | number)[] {
  const buyerBrn = (row.subject.business_registration_number ?? '').replace(/-/g, '');
  const supplierBrn = supplierBrnRaw.replace(/-/g, '');

  return [
    invoice.invoice_type || '01',                  // A
    issueDateNum,                                  // B (숫자)
    supplierBrn,                                   // C
    '',                                            // D
    supplierName,                                  // E
    '', '', '', '', '',                            // F~J
    buyerBrn,                                      // K
    '',                                            // L
    row.subject.name,                              // M
    row.subject.ceo_name ?? '',                    // N
    row.subject.business_address ?? '',            // O
    row.subject.business_type ?? '',               // P
    row.subject.business_category ?? '',           // Q
    row.subject.tax_email ?? '',                   // R
    '',                                            // S
    invoice.supply_amount,                         // T (숫자)
    invoice.vat_amount,                            // U (숫자)
    '',                                            // V
    dayStr,                                        // W
    '가죽공예 용품',                                // X
    '', '', '',                                    // Y~AA
    invoice.supply_amount,                         // AB (숫자)
    invoice.vat_amount,                            // AC (숫자)
    '',                                            // AD
    // 품목2 AE~AL (8칸)
    '', '', '', '', '', '', '', '',
    // 품목3 AM~AT (8칸)
    '', '', '', '', '', '', '', '',
    // 품목4 AU~BB (8칸)
    '', '', '', '', '', '', '', '',
    // 결제정보 BC~BF (4칸: 현금/수표/어음/외상미수금)
    '', '', '', '',
    // BG: 영수(01)/청구(02)
    invoice.payment_type || '02',
  ];
}

// ───────────────────────────────────────────────────────────
// 페이지
// ───────────────────────────────────────────────────────────

export function TaxInvoicesPage() {
  const now = new Date();
  const { companyId } = useCompany();
  const { showToast } = useToast();

  // ───── 월 상태 ─────
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1~12

  // ───── 데이터 ─────
  const rowsQuery = useTaxInvoiceRows(companyId, year, month);
  const supplierQuery = useSupplierCompany(companyId);
  const createMut = useCreateTaxInvoice(companyId);
  const bulkMut = useCreateTaxInvoicesBulk(companyId);
  const deleteMut = useDeleteTaxInvoice(companyId);

  const rows = rowsQuery.data ?? [];

  // ───── 다이얼로그 상태 ─────
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaxInvoiceRow | null>(null);

  // ───── 파생 ─────
  //   🔴 KPI 합계는 저장된 tax_invoice 기준(발행된 실제 금액). fresh 매출과 다를 수 있음.
  const summary = useMemo(() => {
    const issuedRows = rows.filter((r) => r.invoice !== null);
    const supplyTotal = issuedRows.reduce(
      (s, r) => s + (r.invoice?.supply_amount ?? r.supply_amount),
      0,
    );
    const vatTotal = issuedRows.reduce(
      (s, r) => s + (r.invoice?.vat_amount ?? r.vat_amount),
      0,
    );
    return {
      issuedCount: issuedRows.length,
      supplyTotal,
      vatTotal,
      unissuedCount: rows.length - issuedRows.length,
    };
  }, [rows]);

  // 다음달 버튼: 현재 월 이상이면 disabled
  const canGoNext = useMemo(() => {
    const cur = now.getFullYear() * 12 + now.getMonth() + 1; // 1-based month
    const view = year * 12 + month;
    return view < cur;
  }, [year, month, now]);

  // ───── 액션 ─────
  const goPrevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };
  const goNextMonth = () => {
    if (!canGoNext) return;
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleCreateSingle = (row: TaxInvoiceRow) => {
    createMut.mutate(
      {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        year,
        month,
        total_amount: row.total_amount,
      },
      {
        onSuccess: () =>
          showToast({ kind: 'success', text: `${row.subject.name} 세금계산서 발행` }),
        onError: (e) =>
          showToast({
            kind: 'error',
            text: `발행 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
          }),
      },
    );
  };

  const handleBulkCreate = () => {
    bulkMut.mutate(
      { year, month, rows },
      {
        onSuccess: ({ inserted, updated, failed, errors }) => {
          setBulkConfirmOpen(false);
          if (failed > 0) {
            const head = errors[0] ?? '';
            const tail = errors.length > 1 ? ` 외 ${errors.length - 1}건` : '';
            showToast({
              kind: 'error',
              text: `신규 ${inserted} / 재생성 ${updated} / 실패 ${failed}건 — ${head}${tail}`,
            });
            return;
          }
          const parts: string[] = [];
          if (inserted > 0) parts.push(`신규 발행 ${inserted}건`);
          if (updated > 0) parts.push(`재생성 ${updated}건`);
          showToast({
            kind: 'success',
            text: parts.length > 0 ? parts.join(' · ') : '변경 사항이 없습니다',
          });
        },
        onError: (e) => {
          setBulkConfirmOpen(false);
          showToast({
            kind: 'error',
            text: `일괄 발행 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget?.invoice) return;
    deleteMut.mutate(deleteTarget.invoice.id, {
      onSuccess: () => {
        showToast({ kind: 'success', text: `${deleteTarget.subject.name} 세금계산서 삭제` });
        setDeleteTarget(null);
      },
      onError: (e) => {
        showToast({
          kind: 'error',
          text: `삭제 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`,
        });
      },
    });
  };

  // 엑셀 다운로드 — 국세청 전자세금계산서 일괄발급 원서식 (1~6행 헤더 + 7행~데이터)
  const handleExcelDownload = () => {
    const supplier = supplierQuery.data;
    if (!supplier) {
      showToast({ kind: 'error', text: '공급자 정보를 불러오지 못했습니다' });
      return;
    }
    if (!supplier.business_number) {
      showToast({ kind: 'error', text: '공급자 사업자등록번호가 등록되어 있지 않습니다' });
      return;
    }
    const issuedRows = rows.filter((r) => r.invoice !== null);
    if (issuedRows.length === 0) {
      showToast({ kind: 'info', text: '발행된 세금계산서가 없습니다' });
      return;
    }

    // 작성일자: 해당 연월 말일 (YYYYMMDD 숫자)
    const lastDay = new Date(year, month, 0).getDate();
    const issueDateNum = year * 10000 + month * 100 + lastDay;
    const dayStr = String(lastDay).padStart(2, '0');

    const dataRows = issuedRows.map((r) =>
      buildExcelRow(r, r.invoice!, supplier.name, supplier.business_number!, issueDateNum, dayStr),
    );

    // 1~6행 원서식 헤더 + 7행~ 실제 데이터
    const allRows = [...HEADER_ROWS, ...dataRows];

    const ws = XLSX.utils.aoa_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '엑셀업로드양식');
    XLSX.writeFile(
      wb,
      `세금계산서_${year}년${String(month).padStart(2, '0')}월.xlsx`,
    );

    showToast({
      kind: 'success',
      text: `${issuedRows.length}건의 세금계산서를 다운로드했습니다`,
    });
  };

  const isLoading = rowsQuery.isLoading;
  const hasIssuedRows = summary.issuedCount > 0;

  // ───────────────────────────────────────────────────────────
  // 렌더
  // ───────────────────────────────────────────────────────────

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
        {/* ───── 헤더 ───── */}
        <header className="flex items-end justify-between flex-wrap gap-3 mb-3">
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-num)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              재무 › 세금계산서
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
              세금계산서대장
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 월 네비 */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrevMonth}
                className="border border-[var(--line)] rounded-md bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center justify-center"
                style={{ height: 32, width: 32 }}
                aria-label="이전 달"
              >
                <ChevronLeft size={14} strokeWidth={1.8} />
              </button>
              <div
                style={{
                  height: 32,
                  minWidth: 110,
                  padding: '0 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-kr)',
                }}
              >
                {year}년 {month}월
              </div>
              <button
                type="button"
                onClick={goNextMonth}
                disabled={!canGoNext}
                className="border border-[var(--line)] rounded-md bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ height: 32, width: 32 }}
                aria-label="다음 달"
              >
                <ChevronRight size={14} strokeWidth={1.8} />
              </button>
            </div>

            {/* 액션 */}
            <a
              href="https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=search&searchInfo1084901104"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[var(--line)] rounded-md bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center gap-1.5 text-[var(--ink)] no-underline"
              style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}
            >
              <ExternalLink size={13} strokeWidth={1.8} />
              국세청 전자세금계산서 일괄 작성
            </a>
            <button
              type="button"
              onClick={() => setBulkConfirmOpen(true)}
              disabled={rows.length === 0 || bulkMut.isPending}
              className="border border-[var(--line)] rounded-md bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}
            >
              <FileText size={13} strokeWidth={1.8} />
              이달 전체 생성 {rows.length > 0 ? `(${rows.length})` : ''}
            </button>
            <button
              type="button"
              onClick={handleExcelDownload}
              disabled={!hasIssuedRows}
              className="border border-[var(--brand)] rounded-md bg-[var(--brand)] text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ height: 32, padding: '0 12px', fontSize: 12.5, color: '#FDFAF4' }}
            >
              <Download size={13} strokeWidth={1.8} />
              엑셀 다운로드
            </button>
          </div>
        </header>

        {/* ───── KPI ───── */}
        <div
          className="grid gap-3 mb-4"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          <Kpi label="발행 건수" value={`${summary.issuedCount}건`} />
          <Kpi label="공급가액 합계" value={`₩${fmtWon(summary.supplyTotal)}`} />
          <Kpi label="세액 합계" value={`₩${fmtWon(summary.vatTotal)}`} />
        </div>

        {/* ───── 에러 ───── */}
        {rowsQuery.error && (
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
            데이터 로딩 실패: {rowsQuery.error.message}
          </div>
        )}

        {/* ───── 테이블 ───── */}
        <div
          style={{
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <Th>거래처(상호)</Th>
                <Th>사업자번호</Th>
                <Th align="right">주문수</Th>
                <Th align="right">공급가액</Th>
                <Th align="right">세액</Th>
                <Th align="right">합계 (VAT포함)</Th>
                <Th align="right">매출</Th>
                <Th align="center">상태</Th>
                <Th align="center" width={120}>작업</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: '40px 16px',
                      textAlign: 'center',
                      color: 'var(--ink-3)',
                    }}
                  >
                    불러오는 중…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: '40px 16px',
                      textAlign: 'center',
                      color: 'var(--ink-3)',
                    }}
                  >
                    이번 달 발행 대상 거래처가 없습니다
                  </td>
                </tr>
              )}
              {!isLoading &&
                rows.map((row) => {
                  const issued = row.invoice !== null;
                  const rowColor = issued ? 'var(--ink)' : 'var(--ink-3)';
                  // 🔴 표시 규칙:
                  //   공급가/세액/합계 = 발행됐으면 tax_invoices 저장값, 아니면 fresh 미리보기.
                  //   매출 컬럼      = 항상 orders 기반 fresh 합계.
                  //   drift          = 발행됐고 저장값과 fresh 가 다른 경우 오렌지 하이라이트.
                  const shownSupply = row.invoice?.supply_amount ?? row.supply_amount;
                  const shownVat = row.invoice?.vat_amount ?? row.vat_amount;
                  const shownTotal = row.invoice?.total_amount ?? row.total_amount;
                  const salesTotal = row.total_amount;
                  const hasDrift = issued && shownTotal !== salesTotal;
                  return (
                    <tr
                      key={`${row.subjectType}:${row.subjectId}`}
                      style={{
                        borderTop: '1px solid var(--line)',
                        color: rowColor,
                      }}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <span>{row.subject.name}</span>
                          {row.subjectType === 'group' && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--info-wash)',
                                color: 'var(--info)',
                                fontFamily: 'var(--font-kr)',
                              }}
                            >
                              그룹
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <span style={{ fontFamily: 'var(--font-num)' }}>
                          {row.subject.business_registration_number}
                        </span>
                      </Td>
                      <Td align="right">{row.order_count}건</Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'var(--font-num)' }}>
                          {fmtWon(shownSupply)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'var(--font-num)' }}>
                          {fmtWon(shownVat)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 500 }}>
                          {fmtWon(shownTotal)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          style={{
                            fontFamily: 'var(--font-num)',
                            color: hasDrift ? 'var(--warning)' : 'var(--ink-3)',
                            fontWeight: hasDrift ? 600 : 400,
                          }}
                          title={
                            hasDrift
                              ? `발행 후 매출이 ${fmtWon(salesTotal - shownTotal)}원 변동 — 이달 전체 생성으로 재발행 필요`
                              : undefined
                          }
                        >
                          {fmtWon(salesTotal)}
                        </span>
                      </Td>
                      <Td align="center">
                        <StatusBadge issued={issued} />
                      </Td>
                      <Td align="center">
                        {issued ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="inline-flex items-center gap-1 border border-[var(--line)] rounded-md hover:bg-[var(--surface-2)]"
                            style={{
                              height: 26,
                              padding: '0 10px',
                              fontSize: 12,
                              color: 'var(--danger)',
                            }}
                          >
                            <Trash2 size={12} strokeWidth={1.8} />
                            삭제
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCreateSingle(row)}
                            disabled={createMut.isPending}
                            className="inline-flex items-center gap-1 border border-[var(--brand)] rounded-md hover:opacity-90 disabled:opacity-40"
                            style={{
                              height: 26,
                              padding: '0 10px',
                              fontSize: 12,
                              background: 'var(--brand)',
                              color: '#FDFAF4',
                            }}
                          >
                            <FileText size={12} strokeWidth={1.8} />
                            생성
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </main>

      {/* ───── 일괄 생성 확인 ───── */}
      <ConfirmDialog
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        title="세금계산서 이달 전체 생성"
        body={
          <>
            {year}년 {month}월 1일~말일 전체를 기준으로 총{' '}
            <strong>{rows.length}건</strong> 처리합니다.
            <br />
            신규 발행 <strong>{summary.unissuedCount}건</strong> · 기존 재생성{' '}
            <strong>{summary.issuedCount}건</strong>
            <br />
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              기존 발행 건은 최신 매출 합계로 덮어쓰기 됩니다.
            </span>
          </>
        }
        confirmLabel="생성"
        onConfirm={handleBulkCreate}
        busy={bulkMut.isPending}
      />

      {/* ───── 삭제 확인 ───── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="세금계산서 삭제"
        body={
          deleteTarget ? (
            <>
              <strong>{deleteTarget.subject.name}</strong> ({year}년 {month}월) 세금계산서를
              삭제합니다.
              <br />
              삭제 후 복구할 수 없습니다.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={handleDelete}
        busy={deleteMut.isPending}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 보조 컴포넌트
// ───────────────────────────────────────────────────────────

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        background: 'var(--surface)',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          letterSpacing: '0.04em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--ink)',
          fontFamily: 'var(--font-num)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
  width,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number;
}) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: align,
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--ink-3)',
        letterSpacing: '0.04em',
        borderBottom: '1px solid var(--line)',
        width,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td style={{ padding: '10px 12px', textAlign: align, verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}

function StatusBadge({ issued }: { issued: boolean }) {
  if (issued) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 500,
          background: 'var(--success-wash)',
          color: 'var(--success)',
          fontFamily: 'var(--font-kr)',
        }}
      >
        발행
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        background: 'var(--surface-2)',
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-kr)',
      }}
    >
      미발행
    </span>
  );
}
