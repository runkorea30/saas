/**
 * 직송 정보 카드 — 헤더(타이틀 + 추가 버튼) + 본문 슬롯.
 *
 * 직송 테이블은 거래처 컨텍스트(customer.customerName, CREDIT_LABEL) 및
 * 다중 셀 paste 핸들러를 LeftPanel 에 의존하므로, 본 컴포넌트는 children 으로
 * 테이블을 받아 카드 셰이프만 제공한다.
 */
import { useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

export interface DirectShippingSectionProps {
  /** + 추가 클릭 시 호출 — LeftPanel 이 빈 행 push */
  onAdd: () => void;
  /** 본문(직송 테이블) */
  children: React.ReactNode;
  /** 카드 펼침 기본값 (테스트/외부 제어용) */
  defaultOpen?: boolean;
}

export function DirectShippingSection({
  onAdd,
  children,
  defaultOpen = true,
}: DirectShippingSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="h-full overflow-hidden rounded-lg border border-[#ece6e0] bg-white shadow-sm">
      <div className="flex w-full items-center justify-between px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2"
          aria-expanded={open}
        >
          <SectionHeading
            title="직송 정보"
            hint="다른 주소로 직접 배송할 경우"
          />
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-[#b9aea5]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#b9aea5]" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onAdd();
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#f6efea] px-3 py-1.5 text-[12.5px] font-semibold text-[#6B1F2A] transition-colors hover:bg-[#efe4dd]"
        >
          <Plus className="h-3.5 w-3.5" />
          추가
        </button>
      </div>

      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
