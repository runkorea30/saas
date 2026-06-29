/**
 * 이미지 압축 유틸 — Canvas API 기반 리사이즈 + JPEG 인코딩.
 *
 * 출고 사진(분쟁 대비)은 1280px / quality 0.75 정도로 압축해도 식별에 충분하며,
 * 원본 3~8MB → 압축 후 200~400KB로 업로드 시간을 10~20배 단축한다.
 *
 * HEIC 등 Canvas 가 렌더할 수 없는 포맷이거나 처리 중 오류가 나면 원본 File 을 그대로 반환.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export async function compressImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.75 } = options;

  // 비-이미지 파일은 그대로 통과 (방어적).
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, '');
          const compressed = new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          // 압축 결과가 더 크면(이미 작은 이미지) 원본 유지.
          resolve(compressed.size < file.size ? compressed : file);
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function logCompressionRate(original: File, compressed: File): void {
  if (original === compressed) {
    console.log(
      `[compress] skipped (${(original.size / 1024).toFixed(0)}KB ${original.type})`,
    );
    return;
  }
  const ratio = ((1 - compressed.size / original.size) * 100).toFixed(1);
  console.log(
    `[compress] ${(original.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (-${ratio}%)`,
  );
}
