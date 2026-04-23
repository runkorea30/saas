// Phase 1 스캐폴딩 — 디자인 토큰 + 폰트 로딩 시각 검증용 화면.
// 실제 라우팅/Provider/대시보드는 Phase 2에서 구성.
function App() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-background text-foreground">
      <div className="card-surface max-w-lg w-full p-8 space-y-4">
        <div className="space-y-1">
          <div className="text-xs text-ink-3 uppercase tracking-wider">
            Phase 1 scaffolding
          </div>
          <h1 className="text-3xl disp text-ink">
            안녕하세요,{' '}
            <span className="italic text-brand">MochiCraft OPS</span>
          </h1>
          <p className="text-sm text-ink-2">
            Vite · React 18 · TypeScript · Tailwind · Supabase 준비 완료
          </p>
        </div>

        <div className="hair" />

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip" style={{ background: 'var(--success-wash)', color: 'var(--success)' }}>
            <span className="dot" /> success
          </span>
          <span className="chip" style={{ background: 'var(--warning-wash)', color: 'var(--warning)' }}>
            <span className="dot" /> warning
          </span>
          <span className="chip" style={{ background: 'var(--danger-wash)', color: 'var(--danger)' }}>
            <span className="dot" /> danger
          </span>
          <span className="chip" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}>
            <span className="dot" /> brand
          </span>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button type="button" className="btn-base primary">
            + 주문 추가
          </button>
          <button type="button" className="btn-base">
            리포트 받기
          </button>
          <button type="button" className="btn-base ghost">
            취소
          </button>
        </div>

        <div className="pt-2">
          <div className="num text-2xl text-ink">₩128,430,000</div>
          <div className="text-xs text-ink-3">이번달 매출 · 숫자 폰트 확인 (Inter Tight)</div>
        </div>
      </div>
    </div>
  );
}

export default App;
