/**
 * 직송 정보 카드 — 헤더(타이틀 + 추가 버튼) + 본문 슬롯.
 *
 * 항상 열린 상태로 표시 (collapsible 제거). 직송 테이블은 거래처 컨텍스트와
 * paste 핸들러를 LeftPanel 에 의존하므로 children 슬롯으로 받는다.
 */
import { Plus } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

export interface DirectShippingSectionProps {
  /** + 추가 클릭 시 호출 — LeftPanel 이 빈 행 push */
  onAdd: () => void;
  /** 본문(직송 테이블) */
  children: React.ReactNode;
}

export function DirectShippingSection({
  onAdd,
  children,
}: DirectShippingSectionProps) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--p-card-bg)] bg-[var(--p-card-bg)] shadow-sm">
      <div className="flex w-full shrink-0 items-center justify-between px-4 py-3.5">
        <SectionHeading
          title="직송 정보"
          hint="다른 주소로 직접 배송할 경우"
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--p-card-bg)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--p-brand)] transition-colors hover:bg-[var(--p-card-bg)]"
        >
          <Plus className="h-3.5 w-3.5" />
          추가
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
    </section>
  );
}
