/**
 * 파일로 주문서 보내기 카드 — 드래그·드롭 + 클릭 업로드, 다운로드/전송 액션.
 *
 * 데이터 로직(handleSubmitFile / handleDownloadOrderForm 등)은 LeftPanel 이 소유.
 * 본 컴포넌트는 callbacks 와 file/loading 만 받아 화면을 그린다.
 */
import { Upload, Download, Send, Loader2, X } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

const ACCEPT_EXT = '.xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif,.webp,.pdf';

export interface FileUploadSectionProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
  onDownload: () => void;
  /** 업로드 전송 진행 중 */
  sending: boolean;
  /** 주문서 양식 다운로드 진행 중 */
  downloading: boolean;
  /** 드래그·드롭 핸들러 (LeftPanel 이 소유) */
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  dragOver: boolean;
}

export function FileUploadSection({
  file,
  onFileChange,
  onSubmit,
  onDownload,
  sending,
  downloading,
  onDrop,
  onDragOver,
  onDragLeave,
  dragOver,
}: FileUploadSectionProps) {
  const submitDisabled = !file || sending;

  return (
    <section className="flex h-full flex-col rounded-lg border border-[var(--p-card-bg)] bg-[var(--p-card-bg)] p-4 shadow-sm">
      <div className="mb-3">
        <SectionHeading title="파일로 주문서 보내기" />
      </div>

      {/* 드롭존 — flex-1 로 남은 세로 공간을 모두 점유 (옆 카드 높이와 정렬) */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-upload-input')?.click()}
        className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 transition-colors ${
          dragOver
            ? 'border-[var(--p-brand)] bg-[var(--p-card-bg)]'
            : 'border-[var(--p-line)] bg-[var(--p-card-bg)] hover:bg-[var(--p-card-bg)]'
        }`}
      >
        <Upload
          className="h-7 w-7 shrink-0 text-[var(--p-ink-3)]"
          strokeWidth={1.4}
        />
        {file ? (
          <span
            className="flex items-center gap-2 text-[13px] font-medium text-[var(--p-ink)]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="max-w-[260px] truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => onFileChange(null)}
              title="파일 제거"
              className="grid h-5 w-5 place-items-center rounded-full text-[var(--p-ink-3)] hover:bg-[var(--p-card-bg)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <span className="text-[13px] font-medium text-[var(--p-ink-2)]">
            파일을 드래그하거나{' '}
            <span className="font-semibold text-[var(--p-brand)]">
              클릭하여 업로드
            </span>
          </span>
        )}
        <span className="text-[11px] text-[var(--p-ink-3)]">
          .xlsx · .xls · .csv · .jpg · .png (최대 10MB)
        </span>
        <input
          id="file-upload-input"
          type="file"
          className="hidden"
          accept={ACCEPT_EXT}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* 액션 행 */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          title="현재 거래처 등급의 판매가·공급가가 반영된 빈 주문서를 받습니다"
          className={`inline-flex items-center gap-2 rounded-md border border-[var(--p-line)] bg-[var(--p-card-bg)] px-3 py-1.5 text-[13px] font-medium text-[var(--p-ink-2)] transition-colors hover:bg-[var(--p-card-bg)] ${
            downloading ? 'cursor-not-allowed opacity-55' : ''
          }`}
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          주문서 엑셀 다운로드
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className={`inline-flex items-center gap-2 rounded-md bg-[var(--p-brand)] px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(107,31,42,0.20)] transition-colors hover:bg-[var(--p-brand-deep)] ${
            submitDisabled ? 'cursor-not-allowed opacity-55' : ''
          }`}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          {sending ? '전송 중...' : '전송하기'}
          {!sending && <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </section>
  );
}
