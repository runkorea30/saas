/**
 * 수입/매입 — 요약 바 (헤더 폼과 행 테이블 사이).
 *
 * 좌: 총 건수 / 매칭 / 미매칭
 * 중: 인보이스 합계 (PDF 입력) · 실제 합계 (행 합산) · 차이
 * 우: 원화 총합계 (행 KRW 합)
 *
 * 🟡 차이 색상: 0 이면 회색, 0.5 USD 초과면 warning, 그 외 success (약간의 반올림 편차).
 * 🟡 미매칭 > 0 이면 unmatched 건수 빨강 표시.
 */

interface Props {
  total: number;
  matched: number;
  unmatched: number;
  pdfTotalUsd: number;
  actualTotalUsd: number;
  diffUsd: number;
  significantDiff: boolean;
  totalKrw: number;
}

export function ImportSummaryBar({
  total,
  matched,
  unmatched,
  pdfTotalUsd,
  actualTotalUsd,
  diffUsd,
  significantDiff,
  totalKrw,
}: Props) {
  const showPdfSection = pdfTotalUsd > 0;
  const diffColor = !showPdfSection
    ? 'var(--ink-3)'
    : significantDiff
      ? 'var(--warning)'
      : Math.abs(diffUsd) < 0.005
        ? 'var(--ink-3)'
        : 'var(--success)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '10px 14px',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      {/* 좌: 건수 */}
      <div style={{ display: 'flex', gap: 14 }}>
        <Item label="총" value={`${total}건`} />
        <Item label="매칭" value={`${matched}`} tone="success" />
        <Item
          label="미매칭"
          value={`${unmatched}`}
          tone={unmatched > 0 ? 'danger' : undefined}
        />
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--line)' }} />

      {/* 중: USD */}
      <div style={{ display: 'flex', gap: 14 }}>
        <Item
          label="인보이스 합계"
          value={showPdfSection ? fmtUsd(pdfTotalUsd) : '—'}
          muted={!showPdfSection}
        />
        <Item label="실제 합계" value={fmtUsd(actualTotalUsd)} />
        <Item
          label="차이"
          value={showPdfSection ? fmtUsdSigned(diffUsd) : '—'}
          color={diffColor}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* 우: KRW */}
      <Item label="원화 총합계" value={`₩${totalKrw.toLocaleString('ko-KR')}`} large />
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function Item({
  label,
  value,
  tone,
  color,
  muted,
  large,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
  color?: string;
  muted?: boolean;
  large?: boolean;
}) {
  const resolved =
    color ??
    (tone === 'success'
      ? 'var(--success)'
      : tone === 'danger'
        ? 'var(--danger)'
        : muted
          ? 'var(--ink-3)'
          : 'var(--ink)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-num)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: large ? 14.5 : 13,
          fontWeight: 600,
          color: resolved,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUsdSigned(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (Math.abs(n) < 0.005) return `$${abs}`;
  return n > 0 ? `+$${abs}` : `-$${abs}`;
}
