/**
 * 주문서 엑셀 파싱 — Angelus 발주 시트 포맷 가정.
 *
 * 🟠 헤더 행 자동 감지: 첫 셀(또는 어느 셀) 값이 'CODE' 인 행을 헤더로 인정. 보통 7~8행이지만 위치 가변.
 * 🟠 데이터 필터: CODE 가 비어있거나 'TOTAL' 문자열이면 제외.
 * 🟡 CODE 정규화: 숫자형이어도 String 으로. 하이픈은 제거(`720-01-001` → `72001001`).
 * 🟡 UNIT 정규화: 'DZ'/'EA' 외에는 'DZ' 기본값.
 *
 * SheetJS Community Edition 사용 (이미 package.json 에 ^0.18.5).
 */
import * as XLSX from 'xlsx';

export interface OrderSheetRow {
  /** 하이픈 제거된 정규화 코드. */
  code: string;
  description: string;
  unit: 'DZ' | 'EA';
  price: number;
  qty: number;
  amount: number;
}

type Cell = string | number | boolean | null | undefined;

export async function parseOrderSheet(file: File): Promise<OrderSheetRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('워크시트가 비어 있습니다.');

  // 시트를 2D 배열로 읽어 헤더 행을 직접 탐색.
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  const headerInfo = findHeaderRow(aoa);
  if (!headerInfo) {
    throw new Error("주문서에서 'CODE' 헤더 행을 찾지 못했습니다.");
  }

  const { rowIdx, colIndex } = headerInfo;
  const out: OrderSheetRow[] = [];
  for (let i = rowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const codeRaw = row[colIndex.code];
    const code = normalizeCode(codeRaw);
    if (!code) continue;
    if (code.toUpperCase() === 'TOTAL') continue;
    const descCell = row[colIndex.description];
    const unitCell = row[colIndex.unit];
    const priceCell = row[colIndex.price];
    const qtyCell = row[colIndex.qty];
    const amountCell = row[colIndex.amount];
    out.push({
      code,
      description: String(descCell ?? '').trim(),
      unit: normalizeUnit(unitCell),
      price: toNumber(priceCell),
      qty: toNumber(qtyCell),
      amount: toNumber(amountCell),
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────

interface ColIndex {
  code: number;
  description: number;
  unit: number;
  price: number;
  qty: number;
  amount: number;
}

interface HeaderInfo {
  rowIdx: number;
  colIndex: ColIndex;
}

const ALIASES = {
  code: ['CODE', '코드', '제품코드'],
  description: ['DESCRIPTION', 'DESC', '품명', '설명'],
  unit: ['UNIT', 'U/M', '단위'],
  price: ['PRICE', '단가'],
  qty: ['QTY', 'QUANTITY', 'QTY SHPD', '수량'],
  amount: ['AMOUNT', '금액', '합계'],
} as const;

function findHeaderRow(aoa: Cell[][]): HeaderInfo | null {
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const upper = row.map((c) => String(c ?? '').trim().toUpperCase());
    if (!upper.some((s) => s === 'CODE')) continue;
    // 후보 헤더 행 — 각 컬럼 인덱스 매핑.
    const findCol = (aliases: readonly string[]): number =>
      upper.findIndex((s) => aliases.some((a) => s === a.toUpperCase()));
    const code = findCol(ALIASES.code);
    const description = findCol(ALIASES.description);
    const unit = findCol(ALIASES.unit);
    const price = findCol(ALIASES.price);
    const qty = findCol(ALIASES.qty);
    const amount = findCol(ALIASES.amount);
    if (code < 0) continue;
    return {
      rowIdx: r,
      colIndex: {
        code,
        description: description < 0 ? code + 1 : description,
        unit: unit < 0 ? code + 2 : unit,
        price: price < 0 ? code + 3 : price,
        qty: qty < 0 ? code + 4 : qty,
        amount: amount < 0 ? code + 5 : amount,
      },
    };
  }
  return null;
}

function normalizeCode(v: Cell): string {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  return s.replace(/-/g, '');
}

function normalizeUnit(v: Cell): 'DZ' | 'EA' {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'EA' ? 'EA' : 'DZ';
}

function toNumber(v: Cell): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const cleaned = String(v).replace(/[,\s$]/g, '').trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
