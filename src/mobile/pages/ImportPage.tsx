/**
 * 모바일 수입/매입.
 * useRecentImportInvoices 재사용 (최근 20건).
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany().
 */
import { useCompany } from '@/hooks/useCompany';
import { useRecentImportInvoices } from '@/hooks/queries/useRecentImportInvoices';

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ImportPage() {
  const { companyId } = useCompany();
  const { data: invoices = [], isLoading } = useRecentImportInvoices(companyId);

  return (
    <div>
      <header className="m-page-header">
        <h1 className="m-page-title">수입/매입</h1>
        <div
          style={{
            fontSize: 11,
            color: 'var(--m-text-secondary)',
            marginTop: 4,
          }}
        >
          최근 {invoices.length}건
        </div>
      </header>

      {isLoading ? (
        <div className="m-empty">불러오는 중…</div>
      ) : invoices.length === 0 ? (
        <div className="m-empty">수입 인보이스가 없습니다.</div>
      ) : (
        <div className="m-list">
          {invoices.map((iv) => {
            const status = iv.is_auto
              ? { label: '자동발주', color: 'var(--m-primary)' }
              : iv.lot_count > 0
                ? { label: '입고완료', color: 'var(--m-success)' }
                : { label: '대기', color: 'var(--m-warning)' };
            return (
              <div key={iv.id} className="m-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--m-text)',
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {iv.supplier_name ?? '(공급사 미상)'}
                  </span>
                  <span
                    className="m-badge"
                    style={{
                      background: `${status.color}22`,
                      color: status.color,
                      border: `1px solid ${status.color}`,
                    }}
                  >
                    {status.label}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--m-text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  <span className="m-num">{iv.invoice_date?.slice(0, 10)}</span>
                  <span className="m-num">{iv.invoice_number}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                  }}
                >
                  <span
                    style={{ fontSize: 11, color: 'var(--m-text-secondary)' }}
                  >
                    {iv.lot_count > 0 ? `${iv.lot_count}개 lot 입고` : '미입고'}
                  </span>
                  <span
                    className="m-num"
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--m-text)',
                    }}
                  >
                    ${fmtUsd(iv.total_usd)}
                  </span>
                </div>
                {iv.notes && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid var(--m-border)',
                      fontSize: 11,
                      color: 'var(--m-text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={iv.notes}
                  >
                    {iv.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
