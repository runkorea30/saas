/**
 * 통합조회(엔젤러스인보이스) 엑셀(.xlsx) 생성기.
 *
 * 🟠 CLAUDE.md §8: 같은 로직 여러 파일에 복사 금지 — 통합조회 팝업 전용 서식을 유틸로 분리.
 *
 * 서식 스펙:
 *  - 시트명: 조회한 품코드
 *  - Row 1(헤더): 인보이스번호 | Ship Date | 파일명 | 연관 수입면장 | 코드 | 제품명 | 수량 | 단가 | 금액
 *           (회색 FFD9D9D9 배경 / 굵게 / 가운데)
 *  - Row 2~N: 라인 데이터 flat 나열 (인보이스별 소계 없음)
 *  - Row N+1: "합계" 행 — 수량/금액 합계만 (단가 비움), 굵게 + 상단 이중선
 *  - 전 영역 thin border, 숫자열 우측정렬, 단가/금액 numFmt "$"#,##0.00
 */
import ExcelJS from 'exceljs';

/** 통합조회 라인 한 줄. */
export interface CombinedXlsxLine {
  invoiceNo: string;
  shipDate: string;
  fileName: string;
  /** 연관 수입면장 파일명(없으면 빈 문자열). */
  declFileName: string;
  code: string;
  name: string;
  qty: number | null;
  amount: number | null;
}

const HEADER_FILL = 'FFD9D9D9';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY_FMT = '"$"#,##0.00';

const HEADERS = [
  '인보이스번호',
  'Ship Date',
  '파일명',
  '연관 수입면장',
  '코드',
  '제품명',
  '수량',
  '단가',
  '금액',
] as const;

/** 엑셀에 유효한 시트명으로 정제(금지문자 제거 + 31자 제한). */
function safeSheetName(code: string): string {
  const cleaned = code.replace(/[\\/?*[\]:]/g, '').trim();
  return (cleaned || '통합조회').slice(0, 31);
}

/** 다운로드 시점(KST) 기준 yyyyMMdd — toISOString 금지, getFullYear/getMonth/getDate 사용. */
function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const allThin: Partial<ExcelJS.Borders> = {
  top: thin,
  bottom: thin,
  left: thin,
  right: thin,
};

/**
 * 통합조회 라인들을 서식 포함 xlsx 로 다운로드.
 * @param code 조회 품코드(시트명·파일명에 사용)
 * @param lines flat 라인 목록(화면 표시 순서 그대로)
 */
export async function exportCombinedInvoiceXlsx(
  code: string,
  lines: CombinedXlsxLine[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safeSheetName(code));

  // 헤더 행
  const headerRow = ws.addRow([...HEADERS]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = allThin;
  });

  // 데이터 행 (단가 = 금액 ÷ 수량, 수량 0/null 이면 빈칸)
  let qtySum = 0;
  let amountSum = 0;
  for (const l of lines) {
    const qty = l.qty ?? null;
    const amount = l.amount ?? null;
    const unit = qty && amount != null ? amount / qty : null;
    if (qty != null) qtySum += qty;
    if (amount != null) amountSum += amount;

    const row = ws.addRow([
      l.invoiceNo || '—',
      l.shipDate || '—',
      l.fileName || '—',
      l.declFileName || '—',
      l.code || '—',
      l.name || '—',
      qty ?? '',
      unit ?? '',
      amount ?? '',
    ]);
    row.eachCell((cell, col) => {
      cell.border = allThin;
      if (col >= 7) cell.alignment = { horizontal: 'right' };
      if (col === 8 || col === 9) cell.numFmt = MONEY_FMT;
    });
  }

  // 합계 행 — 수량/금액만, 단가 비움
  const totalRow = ws.addRow([
    '합계',
    '',
    '',
    '',
    '',
    '',
    qtySum,
    '',
    amountSum,
  ]);
  totalRow.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.border = {
      ...allThin,
      top: { style: 'double', color: { argb: 'FF666666' } },
    };
    if (col >= 7) cell.alignment = { horizontal: 'right' };
    if (col === 9) cell.numFmt = MONEY_FMT;
  });

  // 열 너비 자동 조정 (파일명·수입면장·제품명은 넉넉하게)
  const widths = [14, 12, 42, 42, 12, 30, 8, 12, 14];
  ws.columns.forEach((c, i) => {
    c.width = widths[i] ?? 12;
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `통합조회_${code || '전체'}_${todayStamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
