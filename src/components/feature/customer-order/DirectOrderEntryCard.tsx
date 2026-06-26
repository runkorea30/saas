/**
 * 주문서 직접 입력 진입 카드 — 보조 액션. Outline 스타일로 전송하기(Primary) 와 시각 구분.
 *
 * 🟡 디자인 의도: 전송하기(파일업로드의 Primary CTA)와 색·무게 차이를 주어
 *    실수 클릭을 줄인다. 핸들러(onClick) 동작 변경 없음 — 스타일만 변경.
 */
import { ClipboardList, ArrowRight } from 'lucide-react';

export interface DirectOrderEntryCardProps {
  onClick: () => void;
}

export function DirectOrderEntryCard({ onClick }: DirectOrderEntryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full w-full items-center gap-3 rounded-lg border border-[#d9cfc8] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#6B1F2A] hover:bg-[#faf2f1]"
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border border-[#ece6e0] bg-[#faf6f4] transition-colors group-hover:border-[#e8d5d7] group-hover:bg-white">
        <ClipboardList
          className="h-[19px] w-[19px] text-[#6B1F2A]"
          strokeWidth={1.8}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-[#2b2521]">
          주문서 직접 입력
        </span>
        <span className="mt-0.5 block text-[11px] text-[#78716C]">
          제품 목록에서 수량 직접 입력
        </span>
      </span>
      <ArrowRight className="h-[18px] w-[18px] text-[#a98e87] transition-colors group-hover:text-[#6B1F2A]" />
    </button>
  );
}
