/**
 * 이미 발주됐지만 아직 입고확정 안 된 "입고예정 수량" 을 제품별로 집계.
 *
 * 데이터 소스:
 *  - `invoice_verifications` 의 미확정(`resolved_at IS NULL`) 세션 중 `transfer_rows`
 *    가 있는 것들의 `sourceCode` × `adjustedQuantity`(EA) 합.
 *  - 추가 안전장치: `invoice_verifications.invoice_no` 가 이미 `import_invoices` 에
 *    존재하는 세션(수동 확정된 케이스)은 제외.
 *
 * 🔴 이 값은 25번(구매 예측) 화면의 권장구매수량에서만 차감. `recalculate_reorder_points`
 *    RPC 는 장기 판매추세 기반이라 성질이 다르므로 여기서는 반영하지 않는다.
 * 🟡 대량 데이터가 아니므로 클라이언트에서 집계 (PostgREST 는 jsonb_array_elements
 *    unnest 를 view/RPC 없이는 매끄럽게 지원하지 않음).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProducts } from '@/hooks/queries/useProducts';

interface PendingRow {
  invoice_no: string | null;
  transfer_rows: unknown;
}
interface ImportInvoiceKey {
  invoice_number: string | null;
}

/** transfer_rows 원소 shape (InvoiceUploadCard.handleFill 참조). */
interface TransferRow {
  sourceCode?: string;
  adjustedQuantity?: number;
}

function normalizeInvoiceKey(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export interface IncomingSource {
  /** 세션의 invoice_no (있으면). 빈 문자열이면 아직 인보이스 번호 미입력. */
  invoice_no: string;
  /** 그 세션에서 이 제품에 잡힌 adjustedQuantity(EA) 합. */
  qty: number;
}

export interface IncomingQuantitiesResult {
  /** productId → 입고예정 EA 합계 (기존과 동일). */
  totalByProduct: Map<string, number>;
  /**
   * productId → 세션별 breakdown. 계산검증 팝오버에서 "몇 건의 세션에서 왔는지" 노출용.
   * 세션이 여러 개면 각각 나열, 없으면 빈 배열.
   */
  sourcesByProduct: Map<string, IncomingSource[]>;
}

/**
 * 반환: totalByProduct(EA 합) + sourcesByProduct(세션별 상세).
 * products 미매칭(코드 정확히 일치하는 제품 없음) 항목은 조용히 무시.
 */
export function useIncomingQuantities(companyId: string | null) {
  const productsQ = useProducts(companyId);

  return useQuery<IncomingQuantitiesResult>({
    queryKey: ['incoming-quantities', companyId, productsQ.data?.length ?? 0],
    enabled: Boolean(companyId) && Boolean(productsQ.data),
    queryFn: async () => {
      // 병렬 조회: 미확정 세션 + 이미 입고된 인보이스 번호 목록.
      const [pendingRes, resolvedRes] = await Promise.all([
        supabase
          .from('invoice_verifications')
          .select('invoice_no, transfer_rows')
          .eq('company_id', companyId!)
          .is('resolved_at', null),
        supabase
          .from('import_invoices')
          .select('invoice_number')
          .eq('company_id', companyId!)
          .is('deleted_at', null),
      ]);
      if (pendingRes.error) throw pendingRes.error;
      if (resolvedRes.error) throw resolvedRes.error;

      const resolvedKeys = new Set(
        ((resolvedRes.data ?? []) as ImportInvoiceKey[])
          .map((r) => normalizeInvoiceKey(r.invoice_number))
          .filter(Boolean),
      );

      // 제품 code(정확히 일치) → id 매핑.
      const codeToProductId = new Map<string, string>();
      for (const p of productsQ.data ?? []) {
        if (p.code) codeToProductId.set(p.code, p.id);
      }

      const totalByProduct = new Map<string, number>();
      const sourcesByProduct = new Map<string, IncomingSource[]>();
      const pending = (pendingRes.data ?? []) as PendingRow[];
      for (const s of pending) {
        if (resolvedKeys.has(normalizeInvoiceKey(s.invoice_no))) continue;
        const rows = Array.isArray(s.transfer_rows)
          ? (s.transfer_rows as TransferRow[])
          : [];
        // 세션 내에서 sourceCode 별 합산 후 다시 제품별 sources 에 append.
        const sessionQtyByCode = new Map<string, number>();
        for (const r of rows) {
          const code = r.sourceCode?.trim();
          const qty = Number(r.adjustedQuantity ?? 0);
          if (!code || !Number.isFinite(qty) || qty <= 0) continue;
          sessionQtyByCode.set(code, (sessionQtyByCode.get(code) ?? 0) + qty);
        }
        for (const [code, qty] of sessionQtyByCode) {
          const pid = codeToProductId.get(code);
          if (!pid) continue;
          totalByProduct.set(pid, (totalByProduct.get(pid) ?? 0) + qty);
          const arr = sourcesByProduct.get(pid) ?? [];
          arr.push({ invoice_no: s.invoice_no ?? '', qty });
          sourcesByProduct.set(pid, arr);
        }
      }
      return { totalByProduct, sourcesByProduct };
    },
    staleTime: 30_000,
  });
}
