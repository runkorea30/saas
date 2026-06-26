/**
 * 다음 단계에서 구현될 페이지의 임시 placeholder.
 */
export function StubPage({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <header className="m-page-header">
        <h1 className="m-page-title">{title}</h1>
      </header>
      <div className="m-empty">
        <div style={{ fontSize: 14, marginBottom: 8 }}>준비 중</div>
        {hint && (
          <div style={{ fontSize: 12, color: 'var(--m-text-secondary)' }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
