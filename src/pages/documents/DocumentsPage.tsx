/**
 * 문서관리 페이지 — 5개 탭.
 *  - 시험검사번호: DB 테이블 CRUD
 *  - 엔젤러스인보이스: 자동 수집 + 그룹/타임라인 UI (별도 컴포넌트)
 *  - 수입면장 / 화학물질관련 / 기타서류: 공용 파일 업로드/목록 탭
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만 획득.
 * 🟠 페덱스/엔젤러스 이메일은 자동 수집 탭에서 "지금 메일 확인" 버튼으로 수동 트리거.
 *    최근 30일 이내 메일을 전체 조회하며, 이미 처리된 메일은 message_id UNIQUE 로 자동 스킵.
 *    Gmail 의 읽음(Seen) 상태는 절대 변경하지 않음.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Loader2 } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { DocumentFilesTab } from '@/components/feature/documents/DocumentFilesTab';
import { AngelusInvoiceTab } from '@/components/feature/documents/AngelusInvoiceTab';
import { InspectionCertTab } from '@/components/feature/documents/InspectionCertTab';
import { EmailIngestLogView } from '@/components/feature/documents/EmailIngestLogView';
import { useToast } from '@/components/ui/Toast';

export type DocFileCategory =
  | 'import_declaration'
  | 'angelus_invoice'
  | 'chemical'
  | 'other';

type DocTab = DocFileCategory | 'inspection';

const TAB_LIST: { key: DocTab; label: string }[] = [
  { key: 'inspection', label: '시험검사번호' },
  { key: 'angelus_invoice', label: '엔젤러스인보이스' },
  { key: 'import_declaration', label: '수입면장' },
  { key: 'chemical', label: '화학물질관련' },
  { key: 'other', label: '기타서류' },
];

const AUTO_INGEST_TABS = new Set<DocTab>([
  'angelus_invoice',
  'import_declaration',
]);

export function DocumentsPage() {
  const { companyId } = useCompany();
  const [activeTab, setActiveTab] = useState<DocTab>('inspection');
  const [ingesting, setIngesting] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const showIngestControls = AUTO_INGEST_TABS.has(activeTab);

  const handleIngest = async () => {
    if (ingesting) return;
    setIngesting(true);
    try {
      const res = await fetch('/api/ingest-emails', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            summary?: {
              scanned: number;
              processed: number;
              skipped: number;
              errors: number;
              hasMore?: boolean;
            };
          }
        | null;
      if (!res.ok || !body?.ok) {
        const msg = body?.error ?? `요청 실패 (${res.status})`;
        showToast({ kind: 'error', text: `메일 확인 실패: ${msg}` });
        return;
      }
      const s = body.summary;
      const summaryText = s
        ? `신규 ${s.processed} · 스킵 ${s.skipped} · 오류 ${s.errors}${
            s.hasMore ? ' · 더 있음 (다시 눌러서 계속)' : ''
          }`
        : '완료';
      showToast({
        kind: s?.hasMore ? 'info' : 'success',
        text: `메일 확인 완료 — ${summaryText}`,
      });
      await queryClient.invalidateQueries({
        queryKey: ['document-files', companyId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['email-ingest-log', companyId],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '메일 확인 실패';
      showToast({ kind: 'error', text: msg });
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {TAB_LIST.map((t) => (
            <TabButton
              key={t.key}
              active={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              label={t.label}
            />
          ))}
        </div>
        {showIngestControls && (
          <button
            type="button"
            onClick={handleIngest}
            disabled={ingesting || !companyId}
            className="btn-base"
            style={{
              height: 32,
              padding: '0 12px',
              fontSize: 12,
              marginBottom: 6,
              opacity: ingesting || !companyId ? 0.6 : 1,
              cursor: ingesting || !companyId ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Gmail 에서 최근 30일 이내 페덱스·엔젤러스 메일을 확인해 새 문서를 가져옵니다."
          >
            {ingesting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Mail size={14} />
            )}
            {ingesting ? '메일 확인 중…' : '지금 메일 확인'}
          </button>
        )}
      </div>

      {activeTab === 'inspection' ? (
        <InspectionCertTab companyId={companyId} />
      ) : activeTab === 'angelus_invoice' ? (
        <AngelusInvoiceTab companyId={companyId} />
      ) : (
        <DocumentFilesTab companyId={companyId} category={activeTab} />
      )}

      {showIngestControls && <EmailIngestLogView companyId={companyId} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        background: 'transparent',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--ink)'
          : '2px solid transparent',
        marginBottom: '-1px',
        cursor: 'pointer',
        fontFamily: 'var(--font-kr)',
      }}
    >
      {label}
    </button>
  );
}
