/**
 * 항목 19: 검색 매칭 인보이스 "상세보기" 팝업 (엔젤러스인보이스 + 수입면장 공용).
 * 항목 16 요약 팝업을 확장 — 라인별 단가(=amount/qty) + 원본 PDF 다운로드 버튼 포함.
 *
 * presentational only: 데이터 조회/다운로드 로직은 호출부에서 onDownload 로 주입.
 */
import { Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export interface MatchDetailLine {
  code: string;
  name: string;
  qty: number | null;
  amount: number | null;
}

/** USD 금액 표시 — null 이면 '—'. */
export function fmtUsd(n: number | null): string {
  if (n == null) return '—';
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 단가 = amount / qty (2자리 반올림). qty 없거나 0 이면 null. */
export function unitPrice(amount: number | null, qty: number | null): number | null {
  if (amount == null || qty == null || qty === 0) return null;
  return Math.round((amount / qty) * 100) / 100;
}

export function MatchDetailModal({
  open,
  onClose,
  fileName,
  docNo,
  shipDate,
  lines,
  totalUsd,
  onDownload,
  linkedDeclaration,
}: {
  open: boolean;
  onClose: () => void;
  fileName: string;
  docNo: string | null;
  shipDate: string;
  lines: MatchDetailLine[];
  totalUsd: number | null;
  onDownload?: () => void;
  /** 항목 29: 연관 수입면장(있으면 파일명 클릭 → 새 탭 PDF). */
  linkedDeclaration?: { fileName: string; onOpen: () => void } | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="상세보기"
      width={640}
      footer={
        onDownload ? (
          <button
            type="button"
            className="btn-base primary"
            onClick={onDownload}
          >
            <Download size={14} />
            <span>PDF 다운로드</span>
          </button>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SummaryRow label="파일명" value={fileName} />
          <SummaryRow label="인보이스번호" value={docNo ?? '—'} />
          <SummaryRow label="Ship Date" value={shipDate} />
          {linkedDeclaration && (
            <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
              <span
                style={{ color: 'var(--ink-3)', minWidth: 84, flexShrink: 0 }}
              >
                연관 수입면장
              </span>
              <button
                type="button"
                onClick={linkedDeclaration.onOpen}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--accent, #6b7cff)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                  fontSize: 13,
                }}
              >
                {linkedDeclaration.fileName}
              </button>
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-2)',
              marginBottom: 6,
            }}
          >
            매칭 제품 {lines.length}건
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12.5,
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={th('left', 100)}>코드</th>
                <th style={th('left')}>제품명</th>
                <th style={th('right', 56)}>수량</th>
                <th style={th('right', 84)}>단가</th>
                <th style={th('right', 96)}>금액</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((li, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
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
            인보이스 전체 합계
          </span>
          <span
            style={{
              fontWeight: 700,
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtUsd(totalUsd)}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** 상단 라벨-값 한 줄. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'var(--ink-3)', minWidth: 84, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
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
