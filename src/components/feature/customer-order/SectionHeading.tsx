/**
 * 거래처 포털 카드 섹션 헤딩 — 좌측 버건디 사각 + 타이틀 + 보조 힌트.
 */
export interface SectionHeadingProps {
  title: string;
  hint?: string;
}

export function SectionHeading({ title, hint }: SectionHeadingProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3.5 w-[3px] rounded-sm bg-[var(--p-brand)]" />
      <span className="text-sm font-semibold text-[var(--p-ink)]">{title}</span>
      {hint && (
        <span className="text-[11px] font-normal text-[var(--p-ink-3)]">{hint}</span>
      )}
    </div>
  );
}
