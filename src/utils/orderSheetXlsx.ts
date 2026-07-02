/**
 * ORDER SHEET (발주서) XLSX 생성기 — V1 서식 브랜딩 적용.
 *
 * 🟠 데스크톱 / 모바일 발주서 페이지 두 곳에서 동일 서식을 공유하기 위해 유틸로 분리.
 * 🟠 CLAUDE.md §8: 같은 로직 여러 파일에 복사 금지.
 *
 * 서식 스펙:
 *  - Row 1: A1:D1 "ORDER SHEET" (Arial 16 Bold White / Navy 1B3A6B / left·center / medium)
 *           E1:F1 "DATE: {YYYY-MM-DD}" (Arial 10 White / Navy / right·center / medium)
 *  - Row 2: A2:F2 "RUNKOREA" (Arial 9 Bold White / Navy / left·center / medium)
 *  - Row 3: A3:F3 "ZIPCODE : 16348" (Arial 9 White / Navy)
 *  - Row 4: A4:F4 주소 (Arial 9 White / Navy)
 *  - Row 5: A5:F5 "Tel : ..." (Arial 9 White / Navy)
 *  - Row 6: A6:F6 스페이서 (Navy 배경, 높이 5.1)
 *  - Row 7: 헤더 CODE / DESCRIPTION / UNIT / PRICE / QTY / AMOUNT
 *           (Arial 10 Bold White / 중간파랑 2E5FA3 / thin border)
 *  - Row 8~N: 데이터 (Arial 9 검정 / thin border / zebra: 홀수 흰색, 짝수 EFF4FB)
 *           F열은 수식 =D{row}*E{row}, result 값 함께 저장.
 *  - Row N+1: TOTAL 합계 (A:E 병합, "TOTAL" / F열 =SUM(F8:FN))
 *           (Arial 11 Bold Navy text / 연한파랑 DDEAF8 / top medium border)
 *
 * 브라우저 다운로드는 순수 Blob + anchor 방식 (file-saver 등 신규 의존성 추가 없음).
 */
import ExcelJS from 'exceljs';

/** 다운로드에 들어갈 한 줄 데이터. */
export interface OrderSheetLine {
  code: string;
  /** 미국 공급사 발주서 — 영문명 우선. */
  name: string;
  /** 'DZ' | 'EA' 예상이지만 표시만 하는 값이라 문자열로 받는다. */
  unit: string;
  /** 단가(USD). null 대신 '' 허용. */
  price: number | '';
  qty: number;
  /** 이미 qty * price 계산된 값 (표시 힌트 · 실제 셀은 수식). */
  amount: number;
}

const NAVY = 'FF1B3A6B';
const MID_BLUE = 'FF2E5FA3';
const LIGHT_BLUE = 'FFDDEAF8';
const ZEBRA_BLUE = 'FFEFF4FB';
const WHITE = 'FFFFFFFF';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 브라우저에서 워크북을 다운로드시키는 헬퍼. */
async function triggerDownload(
  workbook: ExcelJS.Workbook,
  fileName: string,
): Promise<void> {
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * V1 서식이 적용된 ORDER SHEET XLSX 파일을 생성해 브라우저에서 다운로드시킨다.
 */
export async function downloadOrderSheetXlsx(params: {
  lines: OrderSheetLine[];
  /** DATE 헤더 및 파일명에 쓰이는 날짜 문자열 (YYYY-MM-DD). */
  dateStr: string;
  fileName: string;
}): Promise<void> {
  const { lines, dateStr, fileName } = params;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ORDER SHEET');

  // ── 열 너비 ──
  ws.columns = [
    { width: 14 }, // A
    { width: 49 }, // B
    { width: 7 }, // C
    { width: 8.43 }, // D (기본값)
    { width: 7 }, // E
    { width: 13 }, // F
  ];

  const mediumSide = { style: 'medium' as const };
  const thinSide = { style: 'thin' as const };
  const mediumBorder = {
    top: mediumSide,
    bottom: mediumSide,
    left: mediumSide,
    right: mediumSide,
  };
  const thinBorder = {
    top: thinSide,
    bottom: thinSide,
    left: thinSide,
    right: thinSide,
  };
  const solidFill = (argb: string): ExcelJS.FillPattern => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  });
  const arial = (size: number, bold: boolean, color: string) => ({
    name: 'Arial',
    size,
    bold,
    color: { argb: color },
  });

  // ── Row 1: 타이틀 ──
  ws.mergeCells('A1:D1');
  ws.mergeCells('E1:F1');
  const a1 = ws.getCell('A1');
  a1.value = 'ORDER SHEET';
  a1.font = arial(16, true, WHITE);
  a1.fill = solidFill(NAVY);
  a1.alignment = { horizontal: 'left', vertical: 'middle' };
  a1.border = mediumBorder;
  const e1 = ws.getCell('E1');
  e1.value = `DATE: ${dateStr}`;
  e1.font = arial(10, false, WHITE);
  e1.fill = solidFill(NAVY);
  e1.alignment = { horizontal: 'right', vertical: 'middle' };
  e1.border = mediumBorder;
  ws.getRow(1).height = 27.95;

  // ── Row 2~5: 회사 정보 (전부 A:F 병합, Arial 9, Navy 배경) ──
  const infoRows: Array<[string, boolean]> = [
    ['RUNKOREA', true],
    ['ZIPCODE : 16348', false],
    [
      '92, Gyeongsudaero 1081beongil, Jangangu, Suwonsi, Gyeonggido, Republic of Korea',
      false,
    ],
    ['Tel : 01089811434', false],
  ];
  infoRows.forEach(([text, bold], idx) => {
    const rowIdx = idx + 2;
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    const c = ws.getCell(`A${rowIdx}`);
    c.value = text;
    c.font = arial(9, bold, WHITE);
    c.fill = solidFill(NAVY);
    c.alignment = { horizontal: 'left', vertical: 'middle' };
    c.border = mediumBorder;
    ws.getRow(rowIdx).height = 15;
  });

  // ── Row 6: 스페이서 (Navy 배경, 테두리 없음, 높이 5.1) ──
  ws.mergeCells('A6:F6');
  const a6 = ws.getCell('A6');
  a6.value = '';
  a6.fill = solidFill(NAVY);
  ws.getRow(6).height = 5.1;

  // ── Row 7: 테이블 헤더 ──
  const headers = ['CODE', 'DESCRIPTION', 'UNIT', 'PRICE', 'QTY', 'AMOUNT'];
  const headerRow = ws.getRow(7);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = arial(10, true, WHITE);
    c.fill = solidFill(MID_BLUE);
    c.border = thinBorder;
  });
  // 정렬: A,B left / C,E center / D,F right
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  headerRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
  headerRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  headerRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
  headerRow.height = 20.1;

  // ── Row 8~N: 데이터 ──
  const dataStartRow = 8;
  lines.forEach((line, i) => {
    const rowIdx = dataStartRow + i;
    const row = ws.getRow(rowIdx);
    row.height = 15;

    // zebra: 짝수 index(0,2,...)는 흰색, 홀수 index(1,3,...)는 연한 파랑
    const zebra = i % 2 === 0 ? WHITE : ZEBRA_BLUE;
    const priceNum = typeof line.price === 'number' ? line.price : 0;
    const amountCalc = Number((priceNum * line.qty).toFixed(2));

    const cellDefs: Array<{
      col: number;
      value: ExcelJS.CellValue;
      align: 'left' | 'center' | 'right';
      numFmt?: string;
    }> = [
      { col: 1, value: line.code, align: 'left' },
      { col: 2, value: line.name, align: 'left' },
      { col: 3, value: line.unit, align: 'center' },
      {
        col: 4,
        value: typeof line.price === 'number' ? line.price : null,
        align: 'right',
        numFmt: '#,##0.00',
      },
      { col: 5, value: line.qty, align: 'center', numFmt: '0' },
      {
        col: 6,
        value: { formula: `D${rowIdx}*E${rowIdx}`, result: amountCalc },
        align: 'right',
        numFmt: '#,##0.00',
      },
    ];
    for (const def of cellDefs) {
      const c = row.getCell(def.col);
      c.value = def.value;
      c.font = arial(9, false, 'FF000000');
      c.fill = solidFill(zebra);
      c.alignment = { horizontal: def.align, vertical: 'middle' };
      c.border = thinBorder;
      if (def.numFmt) c.numFmt = def.numFmt;
    }
  });

  // ── Row N+1: TOTAL 합계 ──
  const totalRow = dataStartRow + lines.length;
  ws.mergeCells(`A${totalRow}:E${totalRow}`);
  const totalLabel = ws.getCell(`A${totalRow}`);
  totalLabel.value = 'TOTAL';
  totalLabel.font = arial(11, true, NAVY);
  totalLabel.fill = solidFill(LIGHT_BLUE);
  totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
  totalLabel.border = { top: mediumSide };

  const totalSum = ws.getCell(`F${totalRow}`);
  const sumResult = Number(
    lines
      .reduce((acc, l) => {
        const p = typeof l.price === 'number' ? l.price : 0;
        return acc + p * l.qty;
      }, 0)
      .toFixed(2),
  );
  totalSum.value = {
    formula: `SUM(F${dataStartRow}:F${totalRow - 1})`,
    result: sumResult,
  };
  totalSum.font = arial(11, true, NAVY);
  totalSum.fill = solidFill(LIGHT_BLUE);
  totalSum.alignment = { horizontal: 'right', vertical: 'middle' };
  totalSum.border = { top: mediumSide };
  totalSum.numFmt = '#,##0.00';
  ws.getRow(totalRow).height = 21.95;

  await triggerDownload(wb, fileName);
}
