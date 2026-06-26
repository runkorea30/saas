/**
 * 주문서 직접 입력 진입 카드 — 버건디 배경 풀카드 버튼.
 */
import { Pencil, ArrowRight } from 'lucide-react';

export interface DirectOrderEntryCardProps {
  onClick: () => void;
}

export function DirectOrderEntryCard({ onClick }: DirectOrderEntryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full items-center gap-3 rounded-lg bg-[#6B1F2A] px-4 py-3.5 text-left shadow-[0_4px_14px_rgba(107,31,42,0.24)] transition-shadow hover:shadow-[0_7px_22px_rgba(107,31,42,0.36)]"
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.14]">
        <Pencil className="h-[19px] w-[19px] text-white" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-white">
          주문서 직접 입력
        </span>
        <span className="mt-0.5 block text-[11px] text-white/[0.78]">
          제품 목록에서 수량 직접 입력
        </span>
      </span>
      <ArrowRight className="h-[18px] w-[18px] text-white/[0.85]" />
    </button>
  );
}
