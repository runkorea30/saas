/**
 * 문서관리 페이지 — 5개 탭으로 구성.
 *  - 수입면장 / 엔젤러스인보이스 / 화학물질관련 / 기타서류: 파일 업로드 + 목록
 *  - 시험검사번호: DB 테이블 CRUD
 *
 * 🔴 CLAUDE.md §1: company_id 는 useCompany() 훅에서만 획득.
 * 🟠 파일은 base64 로 인코딩 후 document_files.file_path 에 저장 (Storage 버킷 미사용).
 */
import { useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { DocumentFilesTab } from '@/components/feature/documents/DocumentFilesTab';
import { InspectionCertTab } from '@/components/feature/documents/InspectionCertTab';

export type DocFileCategory =
  | 'import_declaration'
  | 'angelus_invoice'
  | 'chemical'
  | 'other';

type DocTab = DocFileCategory | 'inspection';

const TAB_LIST: { key: DocTab; label: string }[] = [
  { key: 'import_declaration', label: '수입면장' },
  { key: 'angelus_invoice', label: '엔젤러스인보이스' },
  { key: 'chemical', label: '화학물질관련' },
  { key: 'other', label: '기타서류' },
  { key: 'inspection', label: '시험검사번호' },
];

export function DocumentsPage() {
  const { companyId } = useCompany();
  const [activeTab, setActiveTab] = useState<DocTab>('import_declaration');

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '1px solid var(--line)',
        }}
      >
        {TAB_LIST.map((t) => (
          <TabButton
            key={t.key}
            active={activeTab === t.key}
            onClick={() => setActiveTab(t.key)}
            label={t.label}
          />
        ))}
      </div>

      {activeTab === 'inspection' ? (
        <InspectionCertTab companyId={companyId} />
      ) : (
        <DocumentFilesTab companyId={companyId} category={activeTab} />
      )}
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
