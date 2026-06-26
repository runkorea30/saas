/**
 * 입고 이력 섹션 — ImportReceivingPage 하단에 마운트.
 *
 * 🟠 자동입고 vs 수동입고 구분은 useRecentImportInvoices 의 `is_auto` 플래그로 결정
 *    (invoice_number 가 'PO-AUTO' 접두사 또는 notes 에 'PO-AUTO' 포함).
 * 🟡 페이지 다른 카드와 동일한 inline 스타일 시스템 (var(--surface), var(--line) 등).
 */
import { useRecentImportInvoices } from '@/hooks/queries/useRecentImportInvoices';

interface Props {
  companyId: string | null;
}

function formatUsd(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function RecentInvoicesSection({ companyId }: Props) {
  const { data, isLoading, error } = useRecentImportInvoices(companyId);

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 16,
        marginTop: 24,
      }}
    >
      <h3
        style={{
          margin: '0 0 14px',
          fontSize: 13.5,
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        📋 입고 이력 <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400, marginLeft: 6 }}>최근 20건</span>
      </h3>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-wash)',
            color: 'var(--danger)',
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          입고 이력 로딩 실패: {error.message}
        </div>
      )}

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12.5,
              minWidth: 900,
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--surface-2, #fafafa)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <Th align="left">인보이스 번호</Th>
                <Th align="center">입고일</Th>
                <Th align="left">공급처</Th>
                <Th align="right">합계 USD</Th>
                <Th align="right">품목 수</Th>
                <Th align="left">메모</Th>
                <Th align="center">등록 구분</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: 'var(--ink-3)',
                      fontSize: 12.5,
                    }}
                  >
                    불러오는 중…
                  </td>
                </tr>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: 'var(--ink-3)',
                      fontSize: 12.5,
                    }}
                  >
                    등록된 인보이스가 없습니다.
                  </td>
                </tr>
              )}
              {!isLoading &&
                (data ?? []).map((iv) => (
                  <tr
                    key={iv.id}
                    style={{ borderBottom: '1px solid var(--line)' }}
                  >
                    <Td align="left">
                      <span
                        className="num"
                        style={{
                          fontWeight: 500,
                          color: 'var(--ink)',
                        }}
                      >
                        {iv.invoice_number}
                      </span>
                    </Td>
                    <Td align="center">
                      <span className="num" style={{ color: 'var(--ink-2)' }}>
                        {iv.invoice_date}
                      </span>
                    </Td>
                    <Td align="left">
                      <span style={{ color: 'var(--ink-2)' }}>
                        {iv.supplier_name || '—'}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="num"
                        style={{
                          fontWeight: 500,
                          color: 'var(--ink)',
                        }}
                      >
                        {formatUsd(iv.total_usd)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="num" style={{ color: 'var(--ink-2)' }}>
                        {iv.lot_count.toLocaleString('ko-KR')}
                      </span>
                    </Td>
                    <Td align="left">
                      <span
                        title={iv.notes ?? ''}
                        style={{
                          color: 'var(--ink-3)',
                          display: 'inline-block',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'middle',
                        }}
                      >
                        {iv.notes || '—'}
                      </span>
                    </Td>
                    <Td align="center">
                      <SourceBadge isAuto={iv.is_auto} />
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────

function SourceBadge({ isAuto }: { isAuto: boolean }) {
  // 자동입고: 파랑(info) / 수동입고: 회색(neutral)
  return (
    <span
      className="chip"
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        color: isAuto ? 'var(--info)' : 'var(--ink-3)',
        background: isAuto ? 'var(--info-wash)' : 'var(--surface-2, #fafafa)',
        border: isAuto ? '1px solid var(--info)' : '1px solid var(--line)',
        borderRadius: 999,
        padding: '2px 10px',
      }}
    >
      {isAuto ? '자동입고' : '수동입고'}
    </span>
  );
}

function Th({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <th
      style={{
        padding: '10px 12px',
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--ink-2)',
        textAlign: align,
        whiteSpace: 'nowrap',
        borderRight: '1px solid var(--line)',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <td
      style={{
        padding: '8px 12px',
        textAlign: align,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        borderRight: '1px solid var(--line)',
      }}
    >
      {children}
    </td>
  );
}
