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
import { Camera, ImagePlus, FileText, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MobileSession } from '@/lib/mobileOrderAuth';

const BUCKET = 'order-photos';
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME_PREFIX = ['image/', 'application/pdf'];

interface Props {
  session: MobileSession;
  /**
   * (Deprecated) 전송 성공 시 부모 알림 콜백.
   * 성공 시 자체 모달을 띄운 뒤 사용자 확인 후 window.location.reload() 하므로 호출 안 함.
   */
  onSubmitted?: () => void;
}

export function MobileOrderUpload({ session }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // previewUrl 은 URL.createObjectURL 결과 → 언마운트/교체 시 revoke.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const isImage = file?.type.startsWith('image/') ?? false;

  const handleFilePicked = (picked: File | null): void => {
    setError(null);
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
    setSubmitting(true);

    try {
      // Storage 업로드. anon 정책상 listBuckets 는 항상 실패하므로 사전 체크 없이 바로 업로드.
      // 원본 파일명은 customer_order_uploads.file_name 에 그대로 보존(관리자 표시용).
      // Storage 경로에 쓰는 파일명은 확장자만 뽑아 timestamp 로 재구성 —
      // 한글/공백/이모지 등 Storage 가 URL 인코딩 후 거부할 수 있는 문자를 완전 배제.
      const extMatch = /\.([a-zA-Z0-9]{1,5})$/.exec(file.name);
      const ext = (extMatch?.[1] ?? 'bin').toLowerCase();
      const safeName = `${Date.now()}.${ext}`;
      const path = `customer-uploads/${session.companyId}/${session.customerId}/${safeName}`;
      const uploadRes = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadRes.error) {
        // eslint-disable-next-line no-console
        console.error('[mo.upload.storage]', uploadRes.error);
        throw new Error('파일 업로드에 실패했습니다.');
      }

      // public URL 확보 (기존 CustomerOrderPage 와 동일 정책 — 관리자 화면 미리보기용).
      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const fileUrl = publicData?.publicUrl ?? path;

      // orders INSERT — OPS 주문 목록에 노출되도록 빈 주문 생성.
      //   · CustomerOrderPage(portal) 이미지 접수와 동일 패턴.
      //   · 관리자는 OrderDetailPane 에서 attachment_url 을 열어보며 품목을 직접 입력.
      //   · received_at 은 database.ts 미반영(types desync) — 캐스팅으로 우회.
      const nowIso = new Date().toISOString();
      const orderRes = await supabase
        .from('orders')
        .insert({
          company_id: session.companyId,
          customer_id: session.customerId,
          order_date: nowIso,
          status: 'received',
          received_at: nowIso,
          source: 'mobile',
          memo: memo.trim() || null,
          attachment_url: fileUrl,
          total_amount: 0,
          // received_at 은 database.ts 에 없어(types desync) 캐스팅 인터페이스에서 제외 —
          // 런타임 객체 리터럴에는 유지되므로 INSERT 값에는 포함됨.
        } as unknown as {
          company_id: string;
          customer_id: string;
          order_date: string;
          status: string;
          source: string;
          memo: string | null;
          attachment_url: string;
          total_amount: number;
        })
        .select('id')
        .single();
      if (orderRes.error || !orderRes.data) {
        // eslint-disable-next-line no-console
        console.error('[mo.upload.order]', orderRes.error);
        throw new Error('주문 접수에 실패했습니다.');
      }
      const newOrderId = orderRes.data.id;

      // customer_order_uploads INSERT — 방금 만든 order 와 연결. order 가 이미 있으므로 status='done'.
      const insertRes = await supabase.from('customer_order_uploads').insert({
        company_id: session.companyId,
        customer_id: session.customerId,
        upload_type: 'mobile_image',
        file_name: file.name,
        file_url: fileUrl,
        message: memo.trim() || null,
        order_id: newOrderId,
        status: 'done',
      });
      if (insertRes.error) {
        // eslint-disable-next-line no-console
        console.error('[mo.upload.insert]', insertRes.error);
        throw new Error('주문서 접수에 실패했습니다.');
      }

      // 폼 초기화 후 성공 모달 표시. 사용자가 확인 버튼을 누르면 페이지 새로고침.
      setFile(null);
      setPreviewUrl(null);
      setMemo('');
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      setShowSuccessModal(true);
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
          {/* 미리보기 — 하단 전송 버튼이 화면 밖으로 밀리지 않도록 높이 제한. */}
          <div
            style={{
              position: 'relative',
              marginBottom: 12,
              maxHeight: 220,
              overflow: 'hidden',
              borderRadius: 8,
            }}
          >
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
                alt="첨부 미리보기"
                style={{
                  width: '100%',
                  maxHeight: 200,
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

      {/* 에러 — 성공은 아래 모달로 처리. */}
      {error ? (
        <div className="mo-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {/* 제출 — mo-main 스크롤 컨테이너 하단에 sticky 로 붙어 항상 노출. */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 16,
          paddingTop: 12,
          paddingBottom: 8,
          background: 'var(--mo-bg)',
        }}
      >
        <button
          type="button"
          className="mo-btn-primary"
          onClick={handleSubmit}
          disabled={!file || submitting}
        >
          {submitting ? <Loader2 size={16} className="mo-spin" /> : null}
          {submitting ? '전송 중…' : '주문서 전송'}
        </button>
      </div>

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

      {/* 성공 모달 — 확인 클릭 시 페이지 새로고침. */}
      {showSuccessModal ? <SuccessModal customerName={session.customerName} /> : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 성공 모달 — 확인 → window.location.reload()
// ───────────────────────────────────────────────────────────

function SuccessModal({ customerName }: { customerName: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'var(--mo-bg-card)',
          border: '1px solid var(--mo-border)',
          borderRadius: 16,
          padding: '28px 24px',
          width: '100%',
          maxWidth: 320,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--mo-success)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          ✓
        </div>
        <p
          style={{
            color: 'var(--mo-text-primary)',
            fontSize: 16,
            fontWeight: 600,
            margin: '0 0 8px',
          }}
        >
          {customerName}의 주문이
          <br />
          접수되었습니다.
        </p>
        <p
          style={{
            color: 'var(--mo-text-secondary)',
            fontSize: 13,
            margin: '0 0 24px',
          }}
        >
          담당자 확인 후 처리됩니다.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            width: '100%',
            background: 'var(--mo-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: 14,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
