/**
 * 출고 사진 섹션 — 모바일/데스크탑 공용 컴포넌트.
 *
 * - showCamera=true: 모바일 촬영 모드 (capture="environment" 후면카메라 기본)
 * - readOnly=true: 데스크탑 조회 전용 (삭제/촬영 버튼 숨김)
 * - theme='dark': 어두운 배경(바텀시트 등) 위 렌더링용 색상 분기
 * - 최대 5장, 5일 후 자동 만료(DB + Storage)
 * - 업로드 정책: 촬영 즉시가 아닌 "일괄 업로드" — pendingFiles 에 모아두고
 *   '업로드' 버튼 클릭 시 Promise.allSettled 병렬 업로드.
 *
 * 🔴 CLAUDE.md §1: companyId 는 useCompany() 결과를 prop 으로 받음.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, X, ImageOff, Clock, Upload } from 'lucide-react';
import {
  useOrderPhotos,
  useUploadOrderPhoto,
  useDeleteOrderPhoto,
} from '@/hooks/queries/useOrderPhotos';
import { compressImage, logCompressionRate } from '@/utils/compressImage';

interface Props {
  orderId: string;
  companyId: string | null;
  customerId?: string | null;
  showCamera?: boolean;
  readOnly?: boolean;
  theme?: 'light' | 'dark';
  /** 일괄 업로드 진행 상태가 바뀔 때 호출 — 바텀시트 닫기 방지 등에 사용. */
  onUploadingChange?: (uploading: boolean) => void;
}

const MAX_PHOTOS = 5;

export function OrderPhotoSection({
  orderId,
  companyId,
  customerId,
  showCamera = false,
  readOnly = false,
  theme = 'light',
  onUploadingChange,
}: Props) {
  const { data: photos = [], isLoading } = useOrderPhotos(orderId, companyId);
  const uploadMutation = useUploadOrderPhoto(companyId);
  const deleteMutation = useDeleteOrderPhoto(companyId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // 🟠 일괄 업로드 대기 큐: 로컬 File + ObjectURL 미리보기.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // 🟠 압축 진행 중 — 카메라 입력 잠금.
  const [isCompressing, setIsCompressing] = useState(false);

  // 부모(바텀시트)에 업로드 상태 브로드캐스트.
  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  // 언마운트 시 ObjectURL 메모리 해제. ref 로 최신 prev 추적.
  const pendingPreviewsRef = useRef(pendingPreviews);
  pendingPreviewsRef.current = pendingPreviews;
  useEffect(() => {
    return () => {
      pendingPreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const dark = theme === 'dark';
  const labelText = dark ? 'text-white/80' : 'text-stone-600';
  const subText = dark ? 'text-white/40' : 'text-stone-400';
  const iconColor = dark ? 'text-white/60' : 'text-stone-400';
  const emptyText = dark ? 'text-white/40' : 'text-stone-400';
  const tileBg = dark ? 'bg-white/5' : 'bg-stone-100';
  const dashedBorder = dark ? 'border-white/30' : 'border-stone-300';
  const dashedBg = dark
    ? 'bg-white/5 hover:bg-white/10'
    : 'bg-stone-50 hover:bg-stone-100';

  const totalCount = photos.length + pendingFiles.length;
  const canAddMore = !readOnly && totalCount < MAX_PHOTOS;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - totalCount;
    if (remaining <= 0) {
      alert(`최대 ${MAX_PHOTOS}장까지 촬영 가능합니다.`);
      return;
    }
    const toAdd = files.slice(0, remaining);
    setIsCompressing(true);
    try {
      // 🟠 Canvas 리사이즈 + JPEG 압축 (병렬). HEIC/오류는 원본 반환.
      const compressed = await Promise.all(
        toAdd.map(async (f) => {
          const out = await compressImage(f, {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.75,
          });
          logCompressionRate(f, out);
          return out;
        }),
      );
      const previews = compressed.map((f) => URL.createObjectURL(f));
      setPendingFiles((prev) => [...prev, ...compressed]);
      setPendingPreviews((prev) => [...prev, ...previews]);
    } finally {
      setIsCompressing(false);
    }
  };

  const removePending = (index: number) => {
    URL.revokeObjectURL(pendingPreviews[index]);
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    setPendingPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBulkUpload = async () => {
    if (pendingFiles.length === 0 || isUploading) return;
    setIsUploading(true);
    setUploadProgress(0);
    const baseIndex = photos.length;
    const filesSnapshot = pendingFiles;
    const previewsSnapshot = pendingPreviews;
    try {
      const results = await Promise.allSettled(
        filesSnapshot.map(async (file, i) => {
          await uploadMutation.mutateAsync({
            orderId,
            customerId,
            file,
            index: baseIndex + i,
          });
          setUploadProgress((p) => p + 1);
        }),
      );
      const failedIdx: number[] = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected') failedIdx.push(i);
      });
      // 성공한 항목의 ObjectURL/큐 정리. 실패한 항목은 재시도 위해 큐에 남김.
      const succeededPreviewsToRevoke = previewsSnapshot.filter(
        (_, i) => !failedIdx.includes(i),
      );
      succeededPreviewsToRevoke.forEach((url) => URL.revokeObjectURL(url));
      if (failedIdx.length === 0) {
        setPendingFiles([]);
        setPendingPreviews([]);
      } else {
        setPendingFiles(filesSnapshot.filter((_, i) => failedIdx.includes(i)));
        setPendingPreviews(
          previewsSnapshot.filter((_, i) => failedIdx.includes(i)),
        );
        alert(
          `${failedIdx.length}장 실패 / ${filesSnapshot.length - failedIdx.length}장 성공. 실패한 사진은 다시 업로드해주세요.`,
        );
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = (photoId: string, storagePath: string) => {
    if (!confirm('이 사진을 삭제할까요?')) return;
    deleteMutation.mutate({ photoId, storagePath, orderId });
  };

  // 🟠 로딩 중에도 섹션 헤더는 유지 → 데스크탑 상세 패널에서
  //    사진 영역이 '있다'는 시각적 단서를 항상 제공.
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Camera size={14} className={dark ? 'text-white/60' : 'text-stone-400'} />
          <span className={`text-xs font-medium ${dark ? 'text-white/80' : 'text-stone-600'}`}>
            출고 사진
          </span>
          <span className={`text-[10px] ${dark ? 'text-white/40' : 'text-stone-400'}`}>
            불러오는 중…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Camera size={14} className={iconColor} />
          <span className={`text-xs font-medium ${labelText}`}>
            출고 사진 {totalCount > 0 ? `(${totalCount}/${MAX_PHOTOS})` : ''}
            {pendingFiles.length > 0 && (
              <span className={`ml-1 ${subText}`}>
                · 대기 {pendingFiles.length}
              </span>
            )}
          </span>
        </div>
        {photos.length > 0 && (
          <div className={`flex items-center gap-1 text-[10px] ${subText}`}>
            <Clock size={10} />
            <span>5일 후 자동 삭제</span>
          </div>
        )}
      </div>

      {totalCount > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group ${tileBg}`}
              onClick={() => setPreviewPhoto(photo.storage_url)}
            >
              <img
                src={photo.storage_url}
                alt="출고사진"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              {!readOnly && !isUploading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(photo.id, photo.storage_path);
                  }}
                  className="absolute top-0.5 right-0.5 bg-black/50 rounded-full p-0.5 opacity-80 hover:opacity-100 transition-opacity"
                  aria-label="사진 삭제"
                >
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>
          ))}

          {pendingPreviews.map((url, i) => (
            <div
              key={`pending-${url}`}
              className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer ${tileBg}`}
              onClick={() => setPreviewPhoto(url)}
            >
              <img
                src={url}
                alt="대기 사진"
                className="w-full h-full object-cover opacity-70"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9px] font-medium text-center py-0.5">
                대기
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePending(i);
                  }}
                  className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                  aria-label="대기 사진 제거"
                >
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>
          ))}

          {showCamera && canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isCompressing}
              className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${dashedBorder} ${dashedBg} disabled:opacity-50`}
              aria-label="사진 추가"
            >
              {isCompressing ? (
                <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={16} className={iconColor} />
              )}
            </button>
          )}
        </div>
      )}

      {showCamera && canAddMore && totalCount === 0 && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isCompressing}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed text-sm ${dashedBorder} ${dashedBg} ${emptyText} disabled:opacity-60`}
        >
          {isCompressing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              <span>사진 처리 중...</span>
            </>
          ) : (
            <>
              <Camera size={16} />
              <span>출고 사진 촬영 (최대 {MAX_PHOTOS}장)</span>
            </>
          )}
        </button>
      )}

      {pendingFiles.length > 0 && (
        <button
          type="button"
          onClick={handleBulkUpload}
          disabled={isUploading}
          className="w-full mt-1 py-2.5 rounded-xl bg-[#6B1F2A] text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isUploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>
                {uploadProgress}/{pendingFiles.length}장 업로드 중...
              </span>
            </>
          ) : (
            <>
              <Upload size={15} />
              <span>{pendingFiles.length}장 업로드</span>
            </>
          )}
        </button>
      )}

      {!showCamera && photos.length === 0 && (
        <div className={`flex items-center gap-1.5 py-2 text-xs ${emptyText}`}>
          <ImageOff size={13} />
          <span>촬영된 사진 없음 (모바일 앱에서 촬영)</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center"
          onClick={() => setPreviewPhoto(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white"
            onClick={() => setPreviewPhoto(null)}
            aria-label="닫기"
          >
            <X size={28} />
          </button>
          <img
            src={previewPhoto}
            alt="출고사진 원본"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

    </div>
  );
}
