/**
 * 출고 사진 섹션 — 모바일/데스크탑 공용 컴포넌트.
 *
 * - showCamera=true: 모바일 촬영 모드 (capture="environment" 후면카메라 기본)
 * - readOnly=true: 데스크탑 조회 전용 (삭제/촬영 버튼 숨김)
 * - 최대 5장, 5일 후 자동 만료(DB + Storage)
 *
 * 🔴 CLAUDE.md §1: companyId 는 useCompany() 결과를 prop 으로 받음.
 */
import { useRef, useState } from 'react';
import { Camera, X, ImageOff, Clock } from 'lucide-react';
import {
  useOrderPhotos,
  useUploadOrderPhoto,
  useDeleteOrderPhoto,
} from '@/hooks/queries/useOrderPhotos';

interface Props {
  orderId: string;
  companyId: string | null;
  customerId?: string | null;
  showCamera?: boolean;
  readOnly?: boolean;
}

export function OrderPhotoSection({
  orderId,
  companyId,
  customerId,
  showCamera = false,
  readOnly = false,
}: Props) {
  const { data: photos = [], isLoading } = useOrderPhotos(orderId, companyId);
  const uploadMutation = useUploadOrderPhoto(companyId);
  const deleteMutation = useDeleteOrderPhoto(companyId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const canUpload = !readOnly && photos.length < 5;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = 5 - photos.length;
    const toUpload = files.slice(0, remaining);
    try {
      for (let i = 0; i < toUpload.length; i++) {
        await uploadMutation.mutateAsync({
          orderId,
          customerId,
          file: toUpload[i],
          index: photos.length + i,
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '사진 업로드 실패');
    } finally {
      e.target.value = '';
    }
  };

  const handleDelete = (photoId: string, storagePath: string) => {
    if (!confirm('이 사진을 삭제할까요?')) return;
    deleteMutation.mutate({ photoId, storagePath, orderId });
  };

  if (isLoading) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Camera size={14} className="text-stone-400" />
          <span className="text-xs font-medium text-stone-600">
            출고 사진 {photos.length > 0 ? `(${photos.length}/5)` : ''}
          </span>
        </div>
        {photos.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-stone-400">
            <Clock size={10} />
            <span>5일 후 자동 삭제</span>
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden bg-stone-100 cursor-pointer group"
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
              {!readOnly && (
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

          {showCamera && canUpload && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="aspect-square rounded-lg border-2 border-dashed border-stone-300 flex items-center justify-center bg-stone-50 hover:bg-stone-100 transition-colors"
              aria-label="사진 추가"
            >
              {uploadMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={16} className="text-stone-400" />
              )}
            </button>
          )}
        </div>
      )}

      {showCamera && canUpload && photos.length === 0 && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100 transition-colors text-sm text-stone-500"
        >
          {uploadMutation.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
              <span>업로드 중...</span>
            </>
          ) : (
            <>
              <Camera size={16} />
              <span>출고 사진 촬영 (최대 5장)</span>
            </>
          )}
        </button>
      )}

      {!showCamera && photos.length === 0 && (
        <div className="flex items-center gap-1.5 py-2 text-xs text-stone-400">
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
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
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
