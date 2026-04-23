/**
 * 공용 컬럼 리사이즈 핸들.
 *
 * - 시각 너비: idle 1px hairline (60% opacity) / hover 2px brand / drag 3px brand
 * - 히트 영역: 12px (시각선 양쪽에 5~6px 투명 패딩)
 * - 세로 확장: 헤더 셀 위아래 10px 바깥까지 (행 근처도 잡히게)
 * - 더블클릭: 해당 컬럼 기본 폭으로 리셋
 *
 * 부모는 `position: relative` 여야 함 (핸들은 absolute 로 우측 끝에 부착).
 */
import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface Props {
  onResizeStart: (e: ReactMouseEvent) => void;
  isDragging: boolean;
  onReset?: () => void;
  /** 우측(기본) 또는 좌측에 부착. */
  side?: 'left' | 'right';
}

export function ResizeHandle({
  onResizeStart,
  isDragging,
  onReset,
  side = 'right',
}: Props) {
  const [hover, setHover] = useState(false);

  const visualWidth = isDragging ? 3 : hover ? 2 : 1;
  const visualColor = isDragging
    ? 'var(--brand)'
    : hover
      ? 'var(--brand)'
      : 'var(--line-strong)';
  const visualOpacity = isDragging ? 1 : hover ? 1 : 0.6;

  return (
    <div
      onMouseDown={onResizeStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset?.();
      }}
      title={onReset ? '드래그로 폭 조절 · 더블클릭으로 기본값 복원' : '드래그로 폭 조절'}
      style={{
        position: 'absolute',
        top: -10,
        bottom: -10,
        [side]: -6,
        width: 12,
        cursor: 'col-resize',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 2,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: visualWidth,
          background: visualColor,
          opacity: visualOpacity,
          alignSelf: 'stretch',
          transition: isDragging ? 'none' : 'background .12s, width .12s, opacity .12s',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
