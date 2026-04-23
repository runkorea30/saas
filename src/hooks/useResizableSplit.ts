/**
 * 공용 좌우 스플릿 리사이저 훅.
 *
 * - 좌측 폭을 퍼센트(25~75)로 관리. 그 밖의 값은 기본값으로 복원.
 * - `mc.{pageKey}.split` localStorage 키로 영속화.
 * - 드래그 중에는 body cursor/user-select 를 전역으로 제어하여
 *   드래그 도중 텍스트 선택 방지.
 * - 페이지에서는 반환된 containerRef 를 스플릿 그리드 컨테이너에 부착하고,
 *   중간 핸들의 onMouseDown 에 onDragStart 를 연결.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

const MIN_PERCENT = 25;
const MAX_PERCENT = 75;

export interface UseResizableSplitParams {
  /** 페이지 식별자. 저장 키 = `mc.${pageKey}.split`. */
  pageKey: string;
  /** 최초 로드 시(또는 저장값이 범위 밖일 때) 사용할 좌측 비율. */
  defaultLeftPercent?: number;
}

export interface UseResizableSplitResult {
  leftPercent: number;
  onDragStart: (e: ReactMouseEvent) => void;
  containerRef: RefObject<HTMLDivElement>;
}

function storageKey(pageKey: string): string {
  return `mc.${pageKey}.split`;
}

function clampPercent(n: number): number {
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, n));
}

function readInitial(pageKey: string, fallback: number): number {
  try {
    const s = localStorage.getItem(storageKey(pageKey));
    if (!s) return fallback;
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return fallback;
    if (n < MIN_PERCENT || n > MAX_PERCENT) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

export function useResizableSplit({
  pageKey,
  defaultLeftPercent = 50,
}: UseResizableSplitParams): UseResizableSplitResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState<number>(() =>
    readInitial(pageKey, clampPercent(defaultLeftPercent)),
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(pageKey), String(leftPercent));
    } catch {
      /* noop */
    }
  }, [pageKey, leftPercent]);

  const onDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPercent(clampPercent(pct));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return { leftPercent, onDragStart, containerRef };
}
