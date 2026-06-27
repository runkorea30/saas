/**
 * 홈 최상단 — 발주 필요 금액 위젯.
 * 1개월/3개월 토글 + 목표금액 입력 + 예상 주문금액 + 달성률 바.
 */
import { useState } from 'react';
import { useCompany } from '@/hooks/useCompany';
import {
  useOrderNeedEstimate,
  type OrderBasis,
} from '@/hooks/queries/useOrderNeedEstimate';

function fmt(v: number): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function OrderNeedWidget() {
  const { companyId } = useCompany();
  const [basis, setBasis] = useState<OrderBasis>('1m');
  const [threshold, setThreshold] = useState(4000);
  const [thresholdInput, setThresholdInput] = useState('4000');

  const est = useOrderNeedEstimate(companyId, basis, threshold);

  const reached = est.estimatedUsd >= threshold && threshold > 0;
  const barPct =
    threshold > 0 ? Math.min((est.estimatedUsd / threshold) * 100, 100) : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        padding: '12px 20px',
        marginBottom: 20,
        background: reached ? 'var(--success-wash)' : 'var(--surface)',
        border: `1px solid ${reached ? 'var(--success)' : 'var(--line)'}`,
        borderRadius: 12,
        flexWrap: 'wrap',
        rowGap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 120,
          marginRight: 20,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 2,
          }}
        >
          발주 필요 예상
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
          현재 재고 부족분 기준
        </div>
      </div>

      <div
        style={{
          width: 1,
          background: 'var(--line)',
          margin: '0 16px',
          flexShrink: 0,
          alignSelf: 'stretch',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          border: '1px solid var(--line)',
          borderRadius: 7,
          padding: 2,
          alignSelf: 'center',
          flexShrink: 0,
        }}
      >
        {(['1m', '3m'] as OrderBasis[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBasis(b)}
            style={{
              height: 26,
              padding: '0 12px',
              fontSize: 12,
              fontWeight: basis === b ? 700 : 400,
              borderRadius: 5,
              border: 'none',
              background: basis === b ? 'var(--ink)' : 'transparent',
              color: basis === b ? '#fff' : 'var(--ink-2)',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {b === '1m' ? '1개월' : '3개월'}
          </button>
        ))}
      </div>

      <div
        style={{
          width: 1,
          background: 'var(--line)',
          margin: '0 16px',
          flexShrink: 0,
          alignSelf: 'stretch',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
          예상 주문금액 ({est.needCount}개 품목)
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: 'var(--font-num)',
            color: reached ? 'var(--success)' : 'var(--ink)',
          }}
        >
          {est.isLoading ? '…' : `$${fmt(est.estimatedUsd)}`}
        </div>
      </div>

      <div
        style={{
          width: 1,
          background: 'var(--line)',
          margin: '0 16px',
          flexShrink: 0,
          alignSelf: 'stretch',
        }}
      />

      <div
        style={{
          flex: 1,
          minWidth: 200,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>목표</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>$</span>
            <input
              type="number"
              min={0}
              step={500}
              value={thresholdInput}
              onChange={(e) => {
                setThresholdInput(e.target.value);
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) setThreshold(n);
              }}
              style={{
                width: 80,
                height: 24,
                padding: '0 6px',
                border: '1px solid var(--line)',
                borderRadius: 5,
                fontSize: 12.5,
                fontFamily: 'var(--font-num)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                outline: 'none',
                textAlign: 'right',
              }}
            />
          </div>
          {!est.isLoading && threshold > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: reached ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {reached
                ? `✅ 목표 달성! (+$${fmt(Math.abs(est.gap))})`
                : `-$${fmt(est.gap)} 부족`}
            </span>
          )}
        </div>
        <div
          style={{
            height: 6,
            background: 'var(--line)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${barPct}%`,
              height: '100%',
              background: reached
                ? 'var(--success)'
                : barPct >= 80
                  ? 'var(--warning)'
                  : 'var(--brand)',
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {est.isLoading
            ? '계산 중…'
            : threshold > 0
              ? `${barPct.toFixed(0)}% 달성`
              : '목표금액을 입력하세요'}
        </div>
      </div>
    </div>
  );
}
