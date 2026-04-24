/**
 * 수입/매입 페이지 전용 타입.
 *
 * - `ImportRowInput`: 사용자가 편집하는 상태(state에 저장). 수동 입력 6필드 + id.
 * - `ImportRow`: 렌더링/검증/제출에 쓰이는 완전 enriched 로우. Input에 매칭 결과
 *   + 계산값(수입원가/수입단가/운송비배분/원가KRW/원가합계KRW)을 `useMemo`로 부착.
 * - `ImportInvoiceHeader`: 인보이스 헤더 폼 값.
 *
 * 🔴 CLAUDE.md §2: 계산은 `src/utils/inventory.ts` 순수 함수로만 수행.
 * 🟡 `sourceUnitPriceUsd` 는 DB에 저장되지 않는 표시 전용값 (렌더 시 derive).
 */

export type ImportUnit = 'DZ' | 'EA';
export type ImportRowStatus = 'matched' | 'unmatched';

/** 사용자 입력 상태 (state에 저장). */
export interface ImportRowInput {
  /** 클라이언트 전용 uuid. */
  id: string;
  /** 원본 코드 (대시 포함 가능). */
  sourceCode: string;
  /** 입력 수량 (DZ 박스 또는 EA 낱개). 0 = 미입력. */
  quantity: number;
  unit: ImportUnit;
  /** 입고수량 (DZ×12 또는 EA 그대로가 기본, 사용자 수정 가능). 0 = 미입력. */
  adjustedQuantity: number;
  /** 합계 USD (PDF의 AMOUNT 칸). 0 = 미입력. */
  totalUsd: number;
}

/** 렌더·요약·제출 시 쓰는 완전 derived 로우. */
export interface ImportRow extends ImportRowInput {
  /** 대시 제거된 정규화 코드. products.code 매칭 키. */
  convertedCode: string;
  /** DB 매칭 결과. */
  productId: string | null;
  /** 매칭 성공 시 products.name, 실패 시 빈 문자열. */
  productName: string;
  status: ImportRowStatus;

  // ───── 표시/저장용 계산값 (렌더 시 derive) ─────
  /** 수입원가 USD = 합계USD / 수량. PDF PRICE 역검증용 (저장 안 됨). */
  sourceUnitPriceUsd: number;
  /** 낱개 단가 USD = 합계USD / 입고수량. cost_usd 의 일부로 저장됨. */
  unitPriceUsd: number;
  /** 운송비 배분 USD (이 행 몫). inventory_lots.shipping_allocated_usd 에 저장. */
  shippingAllocatedUsd: number;
  /** 낱개 원가 KRW = round((unitPriceUsd + shippingPerUnit) × 환율). cost_krw 저장. */
  costKrw: number;
  /** 행 원가합계 KRW = 입고수량 × 원가. 화면 총합 용. */
  lineTotalKrw: number;
}

export interface ImportInvoiceHeader {
  invoiceNumber: string;
  supplierName: string;
  /** YYYY-MM-DD (KST 해석). */
  invoiceDate: string;
  exchangeRate: number;
  shippingCostUsd: number;
  /** 사용자가 PDF 에 찍힌 Total 을 직접 입력 — 검증용. 0 이면 차이 검증 스킵. */
  pdfTotalUsd: number;
  notes: string;
}
