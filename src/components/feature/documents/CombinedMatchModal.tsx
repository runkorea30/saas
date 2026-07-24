/**
 * 항목 25: 엔젤러스인보이스 연도+제품 검색 결과를 한 팝업에 통합 조회 + ZIP 다운로드.
 * 항목 19의 개별 상세보기(MatchDetailModal)와 별도 컴포넌트, 스타일 톤은 통일.
 * presentational only — ZIP 생성/다운로드는 onDownloadZip 으로 주입.
 */
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fmtUsd, unitPrice } from '@/components/feature/documents/MatchDetailModal';
import type { MatchedLine } from '@/utils/lineItemSearch';

export interface CombinedMatchEntry {
  docNo: string | null;
  shipDate: string;
  fileName: string;
  lines: MatchedLine[];
  /** 항목 29: 연관 수입면장(있으면 파일명 클릭 → 새 탭 PDF). */
  linkedDeclaration?: { fileName: string; onOpen: () => void } | null;
}

export function CombinedMatchModal({
  open,
  onClose,
  queryLabel,
  years,
  entries,
  onDownloadZip,
  zipBusy,
  onDownloadDeclZip,
  declZipBusy,
  declCount,
  onExportExcel,
  excelBusy,
}: {
  open: boolean;
  onClose: () => void;
  queryLabel: string;
  years: string[];
  entries: CombinedMatchEntry[];
  onDownloadZip: () => void;
  zipBusy: boolean;
  /** 작업2: 연관 수입면장(AWB) PDF 일괄 ZIP 다운로드(엔젤러스인보이스 탭 전용, 미주입 시 버튼 숨김). */
  onDownloadDeclZip?: () => void;
  declZipBusy?: boolean;
  /** 팝업에 표시된 고유 AWB 파일 개수(0이거나 핸들러 없으면 버튼 숨김). */
  declCount?: number;
  /** 작업3: 통합조회 데이터 엑셀(.xlsx) export(미주입 시 버튼 숨김). */
  onExportExcel?: () => void;
  excelBusy?: boolean;
}) {
  const total = entries.reduce(
    (s, e) => s + e.lines.reduce((x, l) => x + (l.amount ?? 0), 0),
    0,
  );
  const lineCount = entries.reduce((s, e) => s + e.lines.length, 0);
  const yearLabel = years.length ? `${years.join(', ')}년` : '전체';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="통합 조회"
      width={760}
      footer={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-base primary"
            onClick={onDownloadZip}
            disabled={zipBusy || entries.length === 0}
            style={{ opacity: zipBusy || entries.length === 0 ? 0.6 : 1 }}
          >
            {zipBusy ? (
              <Loader2 className="ico-sm animate-spin" />
            ) : (
              <Download size={14} />
            )}
            <span>
              {zipBusy
                ? 'ZIP 생성 중…'
                : `ZIP 인보이스 다운로드 (${entries.length}개 PDF)`}
            </span>
          </button>
          {onDownloadDeclZip && (declCount ?? 0) > 0 && (
            <button
              type="button"
              className="btn-base"
              onClick={onDownloadDeclZip}
              disabled={declZipBusy}
              style={{ opacity: declZipBusy ? 0.6 : 1 }}
            >
              {declZipBusy ? (
                <Loader2 className="ico-sm animate-spin" />
              ) : (
                <Download size={14} />
              )}
              <span>
                {declZipBusy
                  ? 'ZIP 생성 중…'
                  : `수입면장 ZIP 다운로드 (${declCount ?? 0}개 PDF)`}
              </span>
            </button>
          )}
          {onExportExcel && (
            <button
              type="button"
              className="btn-base"
              onClick={onExportExcel}
              disabled={excelBusy || entries.length === 0}
              style={{ opacity: excelBusy || entries.length === 0 ? 0.6 : 1 }}
            >
              {excelBusy ? (
                <Loader2 className="ico-sm animate-spin" />
              ) : (
                <FileSpreadsheet size={14} />
              )}
              <span>{excelBusy ? '엑셀 생성 중…' : '엑셀 다운로드'}</span>
            </button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink-2)',
            padding: '8px 10px',
            background: 'var(--surface-2)',
            borderRadius: 8,
            border: '1px solid var(--line)',
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>{queryLabel || '전체'}</strong>
          {' · '}
          {yearLabel}
          {' · '}매칭 인보이스 {entries.length}건 · 라인 {lineCount}건
        </div>

        {entries.map((e, ei) => (
          <div key={ei} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'baseline',
                flexWrap: 'wrap',
                fontSize: 12.5,
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                {e.docNo ?? '—'}
              </span>
              <span style={{ color: 'var(--ink-3)' }}>Ship Date {e.shipDate}</span>
              <span
                style={{
                  color: 'var(--ink-3)',
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={e.fileName}
              >
                {e.fileName}
              </span>
            </div>
            {e.linkedDeclaration && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                연관 수입면장:{' '}
                <button
                  type="button"
                  onClick={e.linkedDeclaration.onOpen}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent, #6b7cff)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: 11.5,
                  }}
                >
                  {e.linkedDeclaration.fileName}
                </button>
              </div>
            )}
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={th('left', 100)}>코드</th>
                  <th style={th('left')}>제품명</th>
                  <th style={th('right', 52)}>수량</th>
                  <th style={th('right', 80)}>단가</th>
                  <th style={th('right', 92)}>금액</th>
                </tr>
              </thead>
              <tbody>
                {e.lines.map((li, li2) => (
                  <tr key={li2} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ ...td('left'), color: 'var(--ink-2)' }}>
                      {li.code || '—'}
                    </td>
                    <td style={td('left')}>{li.name || '—'}</td>
                    <td style={{ ...td('right'), color: 'var(--ink-2)' }}>
                      {li.qty != null ? li.qty.toLocaleString('en-US') : '—'}
                    </td>
                    <td style={{ ...td('right'), color: 'var(--ink-2)' }}>
                      {fmtUsd(unitPrice(li.amount, li.qty))}
                    </td>
                    <td style={{ ...td('right'), color: 'var(--ink-2)' }}>
                      {fmtUsd(li.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 8,
            borderTop: '1px solid var(--line)',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
            전체 매칭 라인 합계
          </span>
          <span
            style={{
              fontWeight: 700,
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtUsd(total)}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function th(align: 'left' | 'right', width?: number): React.CSSProperties {
  return {
    padding: '6px 8px',
    textAlign: align,
    fontWeight: 600,
    fontSize: 11.5,
    color: 'var(--ink-2)',
    width,
  };
}

function td(align: 'left' | 'right'): React.CSSProperties {
  return {
    padding: '6px 8px',
    textAlign: align,
    color: 'var(--ink)',
    fontVariantNumeric: 'tabular-nums',
  };
}
