/**
 * 파트너 모바일 주문 - Mode A: 사진 업로드.
 *
 * 카메라 촬영 또는 갤러리에서 이미지/PDF를 선택 → order-photos 버킷 업로드
 * → customer_order_uploads INSERT(status='pending', upload_type='mobile_image').
 *
 * 🟠 버킷 사전 존재 확인 후 업로드 — 없으면 사용자에게 안내.
 * 🟠 단일 파일 업로드(YAGNI). 다중 파일은 추후 요구 발생 시 확장.
 * 🟠 15MB 초과 파일은 사전 차단 — 모바일 네트워크에서 업로드 실패 방지.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, FileText, X, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MobileSession } from '@/lib/mobileOrderAuth';

const BUCKET = 'order-photos';
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME_PREFIX = ['image/', 'application/pdf'];

interface Props {
  session: MobileSession;
  /** 전송 성공 시 부모에 알림 — 예: 주문 확인 탭으로 이동. */
  onSubmitted?: () => void;
}

export function MobileOrderUpload({ session, onSubmitted }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // previewUrl 은 URL.createObjectURL 결과 → 언마운트/교체 시 revoke.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const isImage = file?.type.startsWith('image/') ?? false;

  const handleFilePicked = (picked: File | null): void => {
    setError(null);
    setSuccess(null);
    if (!picked) return;

    if (!ALLOWED_MIME_PREFIX.some((p) => picked.type.startsWith(p))) {
      setError('이미지 또는 PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setError('파일 크기는 최대 15MB 입니다.');
      return;
    }
    // 기존 previewUrl 은 useEffect cleanup 에서 revoke.
    setFile(picked);
    setPreviewUrl(picked.type.startsWith('image/') ? URL.createObjectURL(picked) : null);
  };

  const clearFile = (): void => {
    setFile(null);
    setPreviewUrl(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleSubmit = async (): Promise<void> => {
    if (!file || submitting) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      // 1) 버킷 존재 확인 (에러 응답이 명확해지도록).
      const listBucketsRes = await supabase.storage.listBuckets();
      if (listBucketsRes.error) {
        // 권한상 listBuckets 가 막혀있을 수도 있음 → 실패해도 업로드 계속 시도.
        // eslint-disable-next-line no-console
        console.warn('[mo.upload.listBuckets]', listBucketsRes.error);
      } else {
        const exists = listBucketsRes.data?.some((b) => b.name === BUCKET);
        if (!exists) {
          throw new Error('파일 저장소가 설정되지 않았습니다. 관리자에게 문의하세요.');
        }
      }

      // 2) Storage 업로드.
      const safeName = file.name.replace(/[^\w.\-가-힣]/g, '_');
      const path = `customer-uploads/${session.companyId}/${session.customerId}/${Date.now()}_${safeName}`;
      const uploadRes = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadRes.error) {
        // eslint-disable-next-line no-console
        console.error('[mo.upload.storage]', uploadRes.error);
        throw new Error('파일 업로드에 실패했습니다.');
      }

      // 3) public URL 확보 (기존 CustomerOrderPage 와 동일 정책 — 관리자 화면 미리보기용).
      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const fileUrl = publicData?.publicUrl ?? path;

      // 4) customer_order_uploads INSERT.
      const insertRes = await supabase.from('customer_order_uploads').insert({
        company_id: session.companyId,
        customer_id: session.customerId,
        upload_type: 'mobile_image',
        file_name: file.name,
        file_url: fileUrl,
        message: memo.trim() || null,
        status: 'pending',
      });
      if (insertRes.error) {
        // eslint-disable-next-line no-console
        console.error('[mo.upload.insert]', insertRes.error);
        throw new Error('주문서 접수에 실패했습니다.');
      }

      // 5) 성공 상태 + 폼 초기화.
      setSuccess("주문서가 전송되었습니다. '주문 확인' 탭에서 처리 결과를 확인하세요.");
      setFile(null);
      setPreviewUrl(null);
      setMemo('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* 파일 없을 때: 큰 업로드 영역 */}
      {!file ? (
        <div className="mo-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '40px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              textAlign: 'center',
              color: 'var(--mo-text-secondary)',
            }}
          >
            <Camera size={44} strokeWidth={1.5} />
            <div style={{ fontSize: 14, color: 'var(--mo-text-primary)', fontWeight: 500 }}>
              주문서 사진을 첨부하세요
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              팩스지·손글씨 주문서·화면 캡처 등을
              <br />
              사진으로 찍어 보내주시면 됩니다.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: 16,
              borderTop: '1px solid var(--mo-border)',
            }}
          >
            <button
              type="button"
              className="mo-btn-secondary"
              onClick={() => cameraInputRef.current?.click()}
              disabled={submitting}
            >
              <Camera size={16} />
              사진 찍기
            </button>
            <button
              type="button"
              className="mo-btn-secondary"
              onClick={() => galleryInputRef.current?.click()}
              disabled={submitting}
            >
              <ImagePlus size={16} />
              갤러리
            </button>
          </div>
        </div>
      ) : (
        <div className="mo-card">
          {/* 미리보기 */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
                alt="첨부 미리보기"
                style={{
                  width: '100%',
                  maxHeight: 360,
                  objectFit: 'contain',
                  borderRadius: 8,
                  background: 'var(--mo-bg-input)',
                  display: 'block',
                }}
              />
            ) : (
              <div
                style={{
                  padding: '32px 16px',
                  border: '1px dashed var(--mo-border)',
                  borderRadius: 8,
                  background: 'var(--mo-bg-input)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <FileText size={36} strokeWidth={1.5} color="var(--mo-text-secondary)" />
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--mo-text-primary)',
                    wordBreak: 'break-all',
                    textAlign: 'center',
                  }}
                >
                  {file.name}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={clearFile}
              disabled={submitting}
              aria-label="첨부 파일 제거"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 32,
                height: 32,
                borderRadius: 999,
                background: 'var(--mo-overlay)',
                border: 'none',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--mo-text-secondary)' }}>
            {formatFileSize(file.size)}
          </div>
        </div>
      )}

      {/* 메모 입력 */}
      <div className="mo-card" style={{ marginTop: 12 }}>
        <label className="mo-label" htmlFor="mo-upload-memo">
          메모 (선택)
        </label>
        <textarea
          id="mo-upload-memo"
          className="mo-textarea"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="배송지 변경, 급한 상품 등 특이사항이 있으면 입력하세요."
          rows={4}
          disabled={submitting}
        />
      </div>

      {/* 상태/에러 */}
      {error ? (
        <div className="mo-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: 'var(--mo-bg-card)',
            border: '1px solid var(--mo-success)',
            color: 'var(--mo-success)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{success}</span>
        </div>
      ) : null}

      {/* 제출 */}
      <button
        type="button"
        className="mo-btn-primary"
        onClick={handleSubmit}
        disabled={!file || submitting}
        style={{ marginTop: 16 }}
      >
        {submitting ? <Loader2 size={16} className="mo-spin" /> : null}
        {submitting ? '전송 중…' : '주문서 전송'}
      </button>

      {/* Hidden inputs — 카메라와 갤러리 각각 별도 트리거 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
