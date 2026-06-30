/**
 * 외부 공개 라우트(거래처 포털 등) 라이트 테마 강제 가드.
 *
 * OPS 운영자가 본인 브라우저에 다크 테마를 저장해둔 상태에서 같은 브라우저로
 * /customer-order 에 접근하면 index.html 의 FOUC inline script 가
 * localStorage 캐시를 보고 data-theme 을 다크로 설정한다.
 * 거래처(외부 사용자)가 그 페이지를 볼 때 다크 톤으로 보이는 것은 사양 위반.
 *
 * 사용처: CustomerOrderPage 최상단 등 라이트 고정이 필요한 컴포넌트.
 * 마운트 시 라이트 강제, 언마운트 시 직전 값 복원 → OPS 로 복귀 시 다크 유지.
 */
import { useLayoutEffect } from 'react';

export function useForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    if (previous) root.removeAttribute('data-theme');
    return () => {
      if (previous) root.setAttribute('data-theme', previous);
    };
  }, []);
}
