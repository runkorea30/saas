/**
 * 이메일 자동 수집 로그 뷰 — 최근 30건 표시.
 * cron 이 처리한 메일 히스토리(성공/스킵/에러)를 눈으로 확인.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AlertCircle, CheckCircle2, MinusCircle } from 'lucide-react';

interface LogRow {
  id: string;
  message_id: string;
  sender: string | null;
  subject: string | null;
  received_at: string | null;
  matched_category: string | null;
  status: string;
  error_message: string | null;
  processed_at: string | null;
}

interface Props {
  companyId: string | null;
}

export function EmailIngestLogView({ companyId }: Props) {
  const { data: rows = [], isLoading } = useQuery<LogRow[]>({
    queryKey: ['email-ingest-log', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_ingest_log')
        .select(
          'id, message_id, sender, subject, received_at, matched_category, status, error_message, processed_at',
        )
        .eq('company_id', companyId!)
        .order('processed_at', { ascending: false, nullsFirst: false })
        .limit(30);
      if (error) throw error;
      return (data as LogRow[]) ?? [];
    },
    staleTime: 15_000,
  });

  return (
    <div
      style={{
        marginTop: 16,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--line)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        자동 수집 로그 (최근 30건)
      </div>
      {isLoading ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 12,
          }}
        >
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 12,
          }}
        >
          자동 수집 이력이 없습니다.
        </div>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th style={thStyle('center', 70)}>상태</th>
              <th style={thStyle('left', 100)}>분류</th>
              <th style={thStyle('left', 200)}>발신자</th>
              <th style={thStyle('left')}>제목</th>
              <th style={thStyle('left', 150)}>처리시각</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={tdStyle('center')}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                  {categoryLabel(row.matched_category)}
                </td>
                <td
                  style={{
                    ...tdStyle('left'),
                    color: 'var(--ink-2)',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.sender ?? '—'}
                </td>
                <td
                  style={{
                    ...tdStyle('left'),
                    color: 'var(--ink)',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={
                    row.error_message
                      ? `${row.subject ?? ''} — ${row.error_message}`
                      : (row.subject ?? '')
                  }
                >
                  {row.subject ?? '—'}
                  {row.error_message && (
                    <span style={{ color: 'var(--danger)', marginLeft: 6 }}>
                      · {row.error_message}
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle('left'), color: 'var(--ink-2)' }}>
                  {fmtDateTime(row.processed_at ?? row.received_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { color: string; bg: string; Icon: typeof CheckCircle2; label: string }
  > = {
    processed: {
      color: '#10b981',
      bg: '#d1fae5',
      Icon: CheckCircle2,
      label: '성공',
    },
    skipped: {
      color: '#6b7280',
      bg: '#f3f4f6',
      Icon: MinusCircle,
      label: '스킵',
    },
    error: {
      color: '#dc2626',
      bg: '#fee2e2',
      Icon: AlertCircle,
      label: '에러',
    },
  };
  const c = config[status] ?? config.skipped;
  const Icon = c.Icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        fontSize: 11,
        color: c.color,
        background: c.bg,
        borderRadius: 5,
        fontFamily: 'var(--font-kr)',
      }}
    >
      <Icon size={10} />
      {c.label}
    </span>
  );
}

function categoryLabel(c: string | null): string {
  if (c === 'import_declaration') return '수입면장';
  if (c === 'angelus_invoice') return '엔젤러스';
  return '—';
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

function thStyle(
  align: 'left' | 'center' | 'right',
  width?: number,
): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align,
    fontWeight: 600,
    fontSize: 11,
    color: 'var(--ink-2)',
    width,
  };
}

function tdStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    padding: '8px 10px',
    textAlign: align,
    color: 'var(--ink)',
  };
}
