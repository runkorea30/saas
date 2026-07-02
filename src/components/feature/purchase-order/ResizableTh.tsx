/**
 * OPS 전용 — 드래그로 폭 조절 가능한 <th>.
 * 폭은 localStorage(key: `po-col-width:${columnKey}`) 에 저장해 새로고침 후에도 유지.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const STORAGE_PREFIX = 'po-col-width:';
const MIN_WIDTH = 50;

export function useColumnWidth(columnKey: string, defaultWidth: number) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth;
    const saved = window.localStorage.getItem(STORAGE_PREFIX + columnKey);
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : defaultWidth;
  });

  const persist = (w: number) => {
    setWidth(w);
    window.localStorage.setItem(STORAGE_PREFIX + columnKey, String(w));
  };

  return [width, persist] as const;
}

interface Props {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
  width: number;
  onResize: (width: number) => void;
}

export function ResizableTh({
  children,
  align = 'center',
  width,
  onResize,
}: Props) {
  const startX = useRef(0);
  const startWidth = useRef(width);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      const next = Math.max(MIN_WIDTH, startWidth.current + delta);
      onResize(next);
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const style: CSSProperties = {
    position: 'relative',
    width,
    minWidth: MIN_WIDTH,
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ink-2)',
    textAlign: align,
    whiteSpace: 'nowrap',
    borderRight: '1px solid var(--line)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <th style={style}>
      {children}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          startX.current = e.clientX;
          startWidth.current = width;
          setDragging(true);
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 6,
          height: '100%',
          cursor: 'col-resize',
          userSelect: 'none',
        }}
      />
    </th>
  );
}
