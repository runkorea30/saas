/**
 * KB국민은행 엑셀 파일 파싱 + 자동매칭 로직.
 *
 * 🟠 CLAUDE.md §2: 모든 비즈니스 계산은 calculations.ts. 이 파일은 파싱/매칭만.
 * 🟡 SheetJS(xlsx) 사용. cp949 (codepage: 949) 인코딩 처리.
 */
import * as XLSX from 'xlsx';
import type { BankMapping, BankExcludeKeyword } from '@/types/database';

export interface ParsedBankRow {
  transaction_date: string;   // 'YYYY-MM-DD'
  depositor_name: string;     // 보낸분/받는분
  amount: number;             // 입금액 (양수)
  description: string;        // 적요
}

export interface MatchedBankRow extends ParsedBankRow {
  matched_customer_id: string | null;
  matched_customer_name: string | null;
  auto_excluded: boolean;
  suggested_match_type: '자동' | '매핑' | null;
}

/**
 * KB국민은행 엑셀(.xls/.xlsx) 파싱.
 *
 * 헤더 컬럼 순서:
 *   거래일시(0) | 적요(1) | 보낸분/받는분(2) | 송금메모(3) | 출금액(4) | 입금액(5) | 잔액(6) | 거래점(7) | 구분(8)
 *
 * 입금 조건: 입금액(col5) > 0 인 행만 처리. 출금 행은 무시.
 */
export function parseKBBank(file: File): Promise<ParsedBankRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', codepage: 949 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: '',
        }) as unknown[][];

        // 헤더행 탐색: '거래일시' 또는 '거래일' 포함 행
        let headerIdx = rows.findIndex((r) =>
          r.some((c) => String(c).includes('거래일시') || String(c).includes('거래일'))
        );
        if (headerIdx === -1) headerIdx = 4;

        const result: ParsedBankRow[] = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          const dateRaw = String(row[0] ?? '').trim();
          const desc = String(row[1] ?? '').trim();
          const depositor = String(row[2] ?? '').trim();
          const deposit = parseAmount(row[5]);

          if (!dateRaw || deposit <= 0) continue;

          const dateStr = normalizeDate(dateRaw);
          if (!dateStr) continue;

          result.push({
            transaction_date: dateStr,
            depositor_name: depositor || desc,
            amount: deposit,
            description: desc,
          });
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsArrayBuffer(file);
  });
}

function parseAmount(val: unknown): number {
  if (!val) return 0;
  const n = Number(String(val).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : Math.round(n);
}

function normalizeDate(raw: string): string | null {
  // '2026.06.24 18:07:45' → '2026-06-24'
  // '2026-06-24' → '2026-06-24'
  const m = raw.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * 자동매칭 적용.
 *
 * 우선순위:
 *   1. 제외 키워드 포함 → auto_excluded = true
 *   2. bank_mappings.bank_name 이 depositor 에 포함 → 매핑 매칭
 *   3. customers.name fuzzy (특수문자/법인접두사 제거 후 부분일치) → 자동 매칭
 *
 * fuzzy 정규화:
 *   ㈜ () 주식회사 (주) 공백 제거 + 소문자 변환
 *   depositor 가 정규화 cust명 포함, 또는 cust명 4자 prefix 가 depositor 에 포함
 */
export function applyAutoMatch(
  rows: ParsedBankRow[],
  mappings: BankMapping[],
  excludeKeywords: BankExcludeKeyword[],
  customers: { id: string; name: string }[]
): MatchedBankRow[] {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[㈜()주식회사\(\)\s]/g, '').replace(/\s+/g, '');

  return rows.map((row) => {
    const dep = row.depositor_name.toLowerCase();
    const depNorm = normalize(row.depositor_name);

    // 1. 제외 키워드
    if (excludeKeywords.some((k) => dep.includes(k.keyword.toLowerCase()))) {
      return {
        ...row,
        matched_customer_id: null,
        matched_customer_name: null,
        auto_excluded: true,
        suggested_match_type: null,
      };
    }

    // 2. bank_mappings 룰 (부분일치)
    const mapping = mappings.find((m) =>
      dep.includes(m.bank_name.toLowerCase())
    );
    if (mapping) {
      return {
        ...row,
        matched_customer_id: mapping.customer_id,
        matched_customer_name: mapping.customer_name,
        auto_excluded: false,
        suggested_match_type: '매핑',
      };
    }

    // 3. 거래처명 fuzzy 매칭
    const matched = customers.find((c) => {
      const cNorm = normalize(c.name);
      return (
        depNorm.includes(cNorm) ||
        cNorm.includes(depNorm) ||
        (cNorm.length >= 4 && dep.includes(cNorm.substring(0, 4)))
      );
    });
    if (matched) {
      return {
        ...row,
        matched_customer_id: matched.id,
        matched_customer_name: matched.name,
        auto_excluded: false,
        suggested_match_type: '자동',
      };
    }

    return {
      ...row,
      matched_customer_id: null,
      matched_customer_name: null,
      auto_excluded: false,
      suggested_match_type: null,
    };
  });
}
