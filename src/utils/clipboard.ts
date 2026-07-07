/**
 * 공용 클립보드 유틸.
 *
 * navigator.clipboard.writeText 우선 시도 (권장), 실패 시 execCommand('copy') 폴백.
 * 폴백은 iframe/구브라우저/HTTP 컨텍스트 대응용.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Clipboard API 미지원 or 권한 거부 → execCommand 폴백.
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}
