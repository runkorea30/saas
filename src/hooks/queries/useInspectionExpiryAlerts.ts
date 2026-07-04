/**
 * 시험검사번호 유효기간 임박 경고 — TopNav 티커용 전역 쿼리 훅.
 *
 * 🔴 CLAUDE.md §1: company_id 필터 필수.
 * 🟠 임계값: 검사유효기간 90일(3개월), 수입유효기간 30일(1개월).
 *    오늘 포함 & 만료된 건 포함 (음수 daysLeft 도 알림 대상).
 * 🟠 편집/삭제 후 캐시 무효화는 호출측(InspectionCertTab)에서 처리.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { daysUntil } from '@/utils/dateThresholds';

export const INSPECTION_THRESHOLD_DAYS = 90;
export const IMPORT_THRESHOLD_DAYS = 30;

export interface ExpiryAlert {
  id: string;
  productName: string;
  dateStr: string;
  daysLeft: number;
}

export interface InspectionExpiryAlertsResult {
  inspectionAlerts: ExpiryAlert[];
  importAlerts: ExpiryAlert[];
  isLoading: boolean;
}

interface Row {
  id: string;
  product_name: string;
  inspection_valid_until: string | null;
  import_valid_until: string | null;
}

export function useInspectionExpiryAlerts(
  companyId: string | null,
): InspectionExpiryAlertsResult {
  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ['inspection-expiry-alerts', companyId],
    enabled: Boolean(companyId),
    queryFn: async () =>
      fetchAllRows<Row>(() =>
        supabase
          .from('inspection_certificates')
          .select('id, product_name, inspection_valid_until, import_valid_until')
          .eq('company_id', companyId!),
      ),
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const inspectionAlerts: ExpiryAlert[] = [];
    const importAlerts: ExpiryAlert[] = [];
    for (const r of data) {
      const insp = daysUntil(r.inspection_valid_until);
      if (!insp.invalid && insp.daysLeft <= INSPECTION_THRESHOLD_DAYS) {
        inspectionAlerts.push({
          id: r.id,
          productName: r.product_name,
          dateStr: r.inspection_valid_until as string,
          daysLeft: insp.daysLeft,
        });
      }
      const imp = daysUntil(r.import_valid_until);
      if (!imp.invalid && imp.daysLeft <= IMPORT_THRESHOLD_DAYS) {
        importAlerts.push({
          id: r.id,
          productName: r.product_name,
          dateStr: r.import_valid_until as string,
          daysLeft: imp.daysLeft,
        });
      }
    }
    inspectionAlerts.sort((a, b) => a.daysLeft - b.daysLeft);
    importAlerts.sort((a, b) => a.daysLeft - b.daysLeft);
    return { inspectionAlerts, importAlerts, isLoading };
  }, [data, isLoading]);
}
