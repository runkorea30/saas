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
import { ChevronLeft, ChevronRight, Download, FileText, Trash2 } from 'lucide-react';
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
// 엑셀 행 빌더 — 국세청 전자세금계산서 일괄발급 양식 (총 62 컬럼: A~BJ)
// ───────────────────────────────────────────────────────────
//
// 컬럼 매핑 (1행 = 1 세금계산서):
//   A:invoice_type  B:작성일자(YYYYMMDD)  C:공급자 등록번호  D:종사업장(빈칸)
//   E:공급자 상호  F~J: 빈칸(성명/주소/업태/종목/이메일)
//   K:공급받는자 등록번호  L:종사업장(빈칸)  M:공급받는자 상호
//   N:성명(ceo_name)  O:사업장주소  P:업태  Q:종목  R:이메일1  S:이메일2(빈칸)
//   T:공급가액 합계  U:세액 합계  V:비고(빈칸)
//   W:일자1(말일 2자리)  X:품목1("가죽공예 용품")  Y~AA: 빈칸(규격1/수량1/단가1)
//   AB:공급가액1  AC:세액1  AD:품목비고1(빈칸)
//   AE~AM(9칸): 품목2 빈칸  AN~AV(9칸): 품목3 빈칸  AW~BE(9칸): 품목4 빈칸
//   BF:현금  BG:수표  BH:어음  BI:외상미수금  (모두 빈칸)
//   BJ:영수(01)/청구(02) → payment_type
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
    // 품목2 AE~AM (9칸)
    '', '', '', '', '', '', '', '', '',
    // 품목3 AN~AV (9칸)
    '', '', '', '', '', '', '', '', '',
    // 품목4 AW~BE (9칸)
    '', '', '', '', '', '', '', '', '',
    // 결제정보 BF~BI (4칸: 현금/수표/어음/외상미수금)
    '', '', '', '',
    // BJ: 영수(01)/청구(02)
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
  const summary = useMemo(() => {
    const issuedRows = rows.filter((r) => r.invoice !== null);
    const supplyTotal = issuedRows.reduce((s, r) => s + r.supply_amount, 0);
    const vatTotal = issuedRows.reduce((s, r) => s + r.vat_amount, 0);
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
        onSuccess: ({ inserted, skipped, failed, errors }) => {
          setBulkConfirmOpen(false);
          if (failed > 0) {
            const head = errors[0] ?? '';
            const tail = errors.length > 1 ? ` 외 ${errors.length - 1}건` : '';
            showToast({
              kind: 'error',
              text: `${inserted}건 발행 / ${failed}건 실패 — ${head}${tail}`,
            });
            return;
          }
          const skipNote = skipped > 0 ? ` (이미 발행 ${skipped}건 스킵)` : '';
          showToast({
            kind: 'success',
            text: `${inserted}건의 세금계산서를 발행했습니다${skipNote}`,
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

  // 엑셀 다운로드 — 국세청 전자세금계산서 일괄발급 양식 (62컬럼)
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

    const aoa = issuedRows.map((r) =>
      buildExcelRow(r, r.invoice!, supplier.name, supplier.business_number!, issueDateNum, dayStr),
    );

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '세금계산서');
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
  const hasUnissuedRows = summary.unissuedCount > 0;

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
            <button
              type="button"
              onClick={() => setBulkConfirmOpen(true)}
              disabled={!hasUnissuedRows || bulkMut.isPending}
              className="border border-[var(--line)] rounded-md bg-[var(--surface)] hover:bg-[var(--surface-2)] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ height: 32, padding: '0 12px', fontSize: 12.5 }}
            >
              <FileText size={13} strokeWidth={1.8} />
              이달 전체 생성 {hasUnissuedRows ? `(${summary.unissuedCount})` : ''}
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
                <Th align="center">상태</Th>
                <Th align="center" width={120}>작업</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
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
                    colSpan={8}
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
                          {fmtWon(row.supply_amount)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'var(--font-num)' }}>
                          {fmtWon(row.vat_amount)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'var(--font-num)', fontWeight: 500 }}>
                          {fmtWon(row.total_amount)}
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
        title="세금계산서 일괄 생성"
        body={
          <>
            미발행 <strong>{summary.unissuedCount}건</strong>의 세금계산서를 생성합니다.
            <br />
            이미 발행된 건은 스킵됩니다. 계속하시겠습니까?
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
