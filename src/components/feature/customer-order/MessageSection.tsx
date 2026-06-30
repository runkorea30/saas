/**
 * 전달 메시지 카드 — 한 줄 입력. 상태/onChange 는 LeftPanel 소유.
 */
import { SectionHeading } from './SectionHeading';

export interface MessageSectionProps {
  value: string;
  onChange: (value: string) => void;
}

export function MessageSection({ value, onChange }: MessageSectionProps) {
  return (
    <section className="flex h-full flex-col rounded-lg border border-[var(--p-card-bg)] bg-[var(--p-card-bg)] p-4 shadow-sm">
      <div className="mb-2.5">
        <SectionHeading title="전달 메시지" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="담당자에게 전달할 메시지 (선택)"
        className="mt-auto h-[38px] w-full rounded-md border border-[var(--p-line)] bg-[var(--p-card-bg)] px-3 text-[13px] text-[var(--p-ink)] placeholder:text-[var(--p-ink-3)] focus:border-[var(--p-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--p-brand)]/15"
      />
    </section>
  );
}
