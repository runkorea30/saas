/**
 * 사업자등록번호 자동 하이픈 포맷.
 *
 * 입력은 자유 문자열(숫자/하이픈/공백 혼합)을 받아
 * 숫자만 추출 → 최대 10자리 → `000-00-00000` 형식으로 정규화한다.
 *
 * 사용 예:
 *   formatBizNo('1234567890') === '123-45-67890'
 *   formatBizNo('123-45')     === '123-45'
 *   formatBizNo('12345')      === '123-45'
 *   formatBizNo('')           === ''
 */
export function formatBizNo(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
