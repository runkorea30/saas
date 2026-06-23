/**
 * 엑셀 업로드 미리보기 + 일괄 재고조정 모달.
 *
 * 흐름: 호출부에서 파일 파싱 결과(`diffs` + `warnings`)를 props 로 전달 → 사용자가 [적용]
 *       클릭 시 onApply 콜백 호출. 적용 중에는 모달이 닫히지 않으며 진행 상태 표시.
 *
 * 🟠 적용은 호출부에서 순차 RPC 호출 (concurrent 시 opening lot 갱신 충돌 가능성).
 * 🟡 변경 없는 행은 props 에 포함하지 않는다 (호출부에서 필터링).
 * 🟡 warnings 는 skip 된 행에 대한 사용자 안내 문자열 배열.
 */
import type { Product } from '@/hooks/queries/useProducts';

export interface StockDiffRow {
  product: Product;
  oldStock: number;
  newStock: number;
  /** newStock - oldStock. 양수=증가, 음수=감소. 0 인 행은 props 에 포함하지 않음. */
  delta: number;
}

interface Props {
  open: boolean;
  /** 변경된 제품만. delta != 0. */
  diffs: StockDiffRow[];
  /** Skip 된 행에 대한 안내 문자열. */
  warnings: string[];
  applying: boolean;
  /** 적용 진행률 (현재 처리된 건수). applying=true 일 때만 의미 있음. */
  appliedCount: number;
  onApply: () => void;
  onClose: () => void;
}

export function StockExcelUploadModal({
  open,
  diffs,
  warnings,
  applying,
  appliedCount,
  onApply,
  onClose,
}: Props) {
  if (!open) return null;

  const total = diffs.length;
  const hasChanges = total > 0;
  const hasWarnings = warnings.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="엑셀 재고조정 미리보기"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !applying) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(20, 15, 12, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '6vh',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'var(--surface)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '86vh',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h2
            className="disp"
            style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}
          >
            엑셀 재고조정 미리보기
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            aria-label="닫기"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: applying ? 'not-allowed' : 'pointer',
              color: 'var(--ink-3)',
              padding: 4,
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {/* 요약 */}
          <div
            style={{
              padding: '10px 14px',
              background: hasChanges ? 'var(--info-wash)' : 'var(--surface-2)',
              color: hasChanges ? 'var(--info)' : 'var(--ink-3)',
              borderRadius: 8,
              fontSize: 12.5,
              marginBottom: 12,
            }}
          >
            {hasChanges
              ? `총 ${total}개 제품 재고 조정 예정`
              : '변경된 제품이 없습니다.'}
          </div>

          {/* 경고 */}
          {hasWarnings && (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--warning-wash)',
                color: 'var(--warning)',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                건너뛴 행 ({warnings.length}건)
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {warnings.slice(0, 30).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {warnings.length > 30 && (
                  <li>… 외 {warnings.length - 30}건</li>
                )}
              </ul>
            </div>
          )}

          {/* 변경 테이블 */}
          {hasChanges && (
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 90px 90px 90px',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--font-num)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <span>제품코드</span>
                <span>제품명</span>
                <span style={{ textAlign: 'right' }}>기존</span>
                <span style={{ textAlign: 'right' }}>새 값</span>
                <span style={{ textAlign: 'right' }}>차이</span>
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {diffs.map((d) => (
                  <div
                    key={d.product.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 90px 90px 90px',
                      gap: 8,
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--line)',
                      fontSize: 12.5,
                      alignItems: 'center',
                    }}
                  >
                    <span className="num" style={{ color: 'var(--ink-3)' }}>
                      {d.product.code}
                    </span>
                    <span
                      style={{
                        color: 'var(--ink)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={d.product.name}
                    >
                      {d.product.name}
                    </span>
                    <span
                      className="num"
                      style={{ textAlign: 'right', color: 'var(--ink-3)' }}
                    >
                      {d.oldStock.toLocaleString('ko-KR')}
                    </span>
                    <span
                      className="num"
                      style={{ textAlign: 'right', color: 'var(--ink)', fontWeight: 500 }}
                    >
                      {d.newStock.toLocaleString('ko-KR')}
                    </span>
                    <span
                      className="num"
                      style={{
                        textAlign: 'right',
                        fontWeight: 600,
                        color: d.delta > 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {d.delta > 0 ? '+' : ''}
                      {d.delta.toLocaleString('ko-KR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 진행 상태 */}
          {applying && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--brand-wash)',
                color: 'var(--brand)',
                borderRadius: 8,
                fontSize: 12.5,
              }}
            >
              조정 중… {appliedCount} / {total}
            </div>
          )}
        </div>

        <footer
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn-base"
            onClick={onClose}
            disabled={applying}
            style={{ height: 32, fontSize: 12.5 }}
          >
            취소
          </button>
          <button
            type="button"
            className="btn-base primary"
            onClick={onApply}
            disabled={applying || !hasChanges}
            style={{ height: 32, fontSize: 12.5 }}
          >
            {applying ? '적용 중…' : `적용 (${total}건)`}
          </button>
        </footer>
      </div>
    </div>
  );
}
