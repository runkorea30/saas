/**
 * 거래처 포털 주문 전송 완료 팝업.
 *
 * - 기본: "주문서가 전송되었습니다." 한 줄.
 * - hasChanges=true (품절/수량조정 발생) → 호박색 안내 문구 추가:
 *     "주문내용 중 변경된 사항이 있으니 오늘 주문내역에서 확인하세요."
 * - 확인 버튼으로 닫힘. 외부 영역 클릭으로도 닫힘.
 */
import { useEffect } from 'react';
import { Check } from 'lucide-react';

export interface SubmitSuccessDialogProps {
  open: boolean;
  hasChanges: boolean;
  onClose: () => void;
}

export function SubmitSuccessDialog({
  open,
  hasChanges,
  onClose,
}: SubmitSuccessDialogProps) {
  // ESC 로도 닫기 — UX 일관성.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[360px] rounded-xl bg-white p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" strokeWidth={2.5} />
        </div>
        <p className="text-[15px] font-semibold text-[#2b2521]">
          주문서가 전송되었습니다.
        </p>
        {hasChanges && (
          <p className="mt-2 text-[13px] leading-relaxed text-amber-600">
            주문내용 중 변경된 사항이 있으니
            <br />
            오늘 주문내역에서 확인하세요.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-5 w-full rounded-lg bg-[#6B1F2A] py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#5c1a24]"
        >
          확인
        </button>
      </div>
    </div>
  );
}
