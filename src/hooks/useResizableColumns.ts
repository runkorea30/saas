/**
 * 공용 테이블 컬럼 폭 리사이저 훅.
 *
 * - 컬럼 키별 폭(px) 을 관리. 각 컬럼의 minWidth 이하로 내려가지 않음.
 * - `mc.{pageKey}.columns` localStorage 키에 {key: width} 맵으로 영속화.
 * - 신규 컬럼 추가 시 저장값에 없으면 defaultWidth 적용(하위 호환).
 * - 드래그 중에는 body cursor/user-select 를 전역으로 제어하고,
 *   `draggingKey` 로 현재 드래그 중인 컬럼을 노출 (헤더 핸들 스타일 분기용).
 * - `resetColumn(key)` 로 단일 컬럼 기본 폭 복원 (더블클릭 리셋).
 *
 * 사용:
 *   const COLUMN_DEFS = [
 *     { key: 'code', defaultWidth: 140, minWidth: 100 },
 *     ...
 *   ] as const;
 *   const { widths, draggingKey, onResizeStart, resetColumn } = useResizableColumns({
 *     pageKey: 'products',
 *     columns: COLUMN_DEFS,
 *   });
 *   // 헤더 셀의 우측 끝에 <ResizeHandle
 *   //   onResizeStart={onResizeStart('code')}
 *   //   isDragging={draggingKey === 'code'}
 *   //   onReset={() => resetColumn('code')} />.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

const MIN_WIDTH_FALLBACK = 60;

export interface ColumnDef {
  key: string;
  defaultWidth: number;
  minWidth?: number;
}

export interface UseResizableColumnsParams {
  /** 페이지 식별자. 저장 키 = `mc.${pageKey}.columns`. */
  pageKey: string;
  columns: ReadonlyArray<ColumnDef>;
}

export interface UseResizableColumnsResult {
  widths: Record<string, number>;
  /** 현재 드래그 중인 컬럼 키. 없으면 null. */
  draggingKey: string | null;
  onResizeStart: (key: string) => (e: ReactMouseEvent) => void;
  /** 단일 컬럼을 defaultWidth 로 복원. */
  resetColumn: (key: string) => void;
  /** 모든 컬럼을 defaultWidth 로 복원. */
  reset: () => void;
}

function storageKey(pageKey: string): string {
  return `mc.${pageKey}.columns`;
}

function buildDefaults(columns: ReadonlyArray<ColumnDef>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of columns) out[c.key] = c.defaultWidth;
  return out;
}

function readInitial(
  pageKey: string,
  columns: ReadonlyArray<ColumnDef>,
): Record<string, number> {
  const defaults = buildDefaults(columns);
  try {
    const s = localStorage.getItem(storageKey(pageKey));
    if (!s) return defaults;
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const out: Record<string, number> = { ...defaults };
    for (const c of columns) {
      const v = (parsed as Record<string, unknown>)[c.key];
      const min = c.minWidth ?? MIN_WIDTH_FALLBACK;
      if (typeof v === 'number' && Number.isFinite(v) && v >= min) {
        out[c.key] = v;
      }
    }
    return out;
  } catch {
    return defaults;
  }
}

export function useResizableColumns({
  pageKey,
  columns,
}: UseResizableColumnsParams): UseResizableColumnsResult {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    readInitial(pageKey, columns),
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(pageKey), JSON.stringify(widths));
    } catch {
      /* noop */
    }
  }, [pageKey, widths]);

  const onResizeStart = useCallback(
    (key: string) => (e: ReactMouseEvent) => {
      if (e.button !== 0) return; // 좌클릭만
      e.preventDefault();
      e.stopPropagation();
      const col = columns.find((c) => c.key === key);
      if (!col) return;
      const min = col.minWidth ?? MIN_WIDTH_FALLBACK;
      const startX = e.clientX;
      const startWidth = widths[key] ?? col.defaultWidth;

      setDraggingKey(key);
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const next = Math.max(min, startWidth + dx);
        setWidths((w) => ({ ...w, [key]: next }));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setDraggingKey(null);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [columns, widths],
  );

  const resetColumn = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key);
      if (!col) return;
      setWidths((w) => ({ ...w, [key]: col.defaultWidth }));
    },
    [columns],
  );

  const reset = useCallback(() => {
    setWidths(buildDefaults(columns));
  }, [columns]);

  return { widths, draggingKey, onResizeStart, resetColumn, reset };
}
