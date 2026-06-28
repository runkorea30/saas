/**
 * KB국민은행 거래내역 XLS 파서.
 *
 * 두 가지 포맷 자동 감지:
 *   - 포맷 A (개인계좌): header row index 4
 *     컬럼: 거래일시, 적요, 보낸분/받는분, 송금메모, 출금액, 입금액, 잔액, 거래점, 구분
 *   - 포맷 B (사업자계좌): header row index 6 (row[6][0] === 'No')
 *     컬럼: No, 거래일시, 보낸분/받는분, 출금액, 입금액, 잔액, 내통장표시, 메모, 적요, 처리점, 구분
 *
 * 🟡 합계 행(보낸분 or 적요 === '합계') 자동 제거.
 * 🟡 출금/입금 둘 다 0 인 행 제거.
 */
import * as XLSX from 'xlsx';

export interface ParsedBankRow {
  /** ISO datetime string. */
  transaction_date: string;
  counterpart: string;
  memo: string;
  description: string;
  withdrawal: number;
  deposit: number;
}

export interface ParsedBankFile {
  rows: ParsedBankRow[];
  account_number: string | null;
  format: 'A' | 'B';
}

function parseDateVal(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'number') {
    // Excel serial date (days since 1900-01-01, with 1900-leap-year bug offset).
    const ms = (val - 25569) * 86400 * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof val === 'string') {
    // KB 형식: "2026.06.25 19:31:28"
    const normalized = val.replace(/\./g, '-').replace(' ', 'T');
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  // fallback — 호출자가 알아서 처리.
  return new Date().toISOString();
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    if (!cleaned) return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function parseBankXls(file: File): Promise<ParsedBankFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: '',
          raw: true,
        });

        // 포맷 감지 — 포맷 B 는 raw[6][0] === 'No'
        const sixthRow = raw[6];
        const isFormatB =
          Array.isArray(sixthRow) && toStr(sixthRow[0]).toLowerCase() === 'no';
        const headerRow = isFormatB ? 6 : 4;

        // 계좌번호 추출 — 두 포맷 모두 raw[1][1] 또는 raw[1][0] 부근에 표시됨.
        // 안전하게 [1] 행의 셀들에서 계좌번호 패턴(숫자-숫자-숫자) 추출.
        let account_number: string | null = null;
        const meta = (raw[1] ?? []) as unknown[];
        for (const cell of meta) {
          const s = toStr(cell);
          if (/^\d{3,}-\d{2,}-\d{4,}/.test(s)) {
            account_number = s.split(/\s/)[0];
            break;
          }
        }

        const dataRows = raw.slice(headerRow + 1);
        const rows: ParsedBankRow[] = [];

        for (const r of dataRows) {
          if (!Array.isArray(r) || r.length === 0) continue;

          if (isFormatB) {
            // 포맷 B: No, 거래일시(1), 보낸분(2), 출금(3), 입금(4), 잔액(5), 내통장(6), 메모(7), 적요(8)
            const dateCell = r[1];
            if (!dateCell) continue;
            const withdrawal = toNum(r[3]);
            const deposit = toNum(r[4]);
            if (withdrawal === 0 && deposit === 0) continue;
            const counterpart = toStr(r[2]);
            const description = toStr(r[8]);
            if (counterpart === '합계' || description === '합계') continue;
            rows.push({
              transaction_date: parseDateVal(dateCell),
              counterpart,
              memo: toStr(r[7]),
              description,
              withdrawal,
              deposit,
            });
          } else {
            // 포맷 A: 거래일시(0), 적요(1), 보낸분(2), 송금메모(3), 출금(4), 입금(5)
            const dateCell = r[0];
            if (!dateCell) continue;
            const withdrawal = toNum(r[4]);
            const deposit = toNum(r[5]);
            if (withdrawal === 0 && deposit === 0) continue;
            const counterpart = toStr(r[2]);
            const description = toStr(r[1]);
            if (counterpart === '합계' || description === '합계') continue;
            rows.push({
              transaction_date: parseDateVal(dateCell),
              counterpart,
              memo: toStr(r[3]),
              description,
              withdrawal,
              deposit,
            });
          }
        }

        resolve({
          rows,
          account_number,
          format: isFormatB ? 'B' : 'A',
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
