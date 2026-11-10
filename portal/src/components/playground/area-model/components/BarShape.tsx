/**
 * BarShape Component
 *
 * Renders a horizontal bar divided into segments.
 * Useful for linear fraction visualization (like a fraction strip).
 *
 * The bar is divided into equal vertical segments.
 * Each segment can be shaded independently.
 *
 * Note: Bar shapes only support vertical partitions (number of segments).
 * Horizontal partitions are ignored.
 */

import { useState } from 'react';

import {
  BORDER_COLOR,
  GHOST_OPACITY,
  TIMING_FAST,
} from '../constants';
import { AREA_MODEL_COLORS as COLORS } from '../definition';
import type {
  AreaModelColorKey,
  AreaShape,
} from '../schema';
import { getSegmentShading } from '../utils';

export interface BarShapeProps {
  shape: AreaShape;
  width: number;
  height: number;
  /** Interaction */
  allowShading: boolean;
  activeColor: AreaModelColorKey;
  /** Event handler */
  onSegmentClick: (segment: number) => void;
}

export function BarShape({
  shape,
  width,
  height,
  allowShading,
  activeColor,
  onSegmentClick,
}: BarShapeProps) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const segments = shape.partitions.vertical;
  const segmentWidth = width / segments;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="select-none"
    >
      {Array.from({ length: segments }).map((_, i) => {
        const { color, opacity } = getSegmentShading(i, shape);
        const isHovered = hoveredSegment === i;

        // Determine fill color and opacity
        const fillColor = color
          ? COLORS[color].fill
          : isHovered && allowShading
            ? COLORS[activeColor].fill
            : "white";

        const fillOpacity =
          isHovered && !color ? GHOST_OPACITY : opacity || (color ? 1 : 0);

        return (
          <rect
            key={i}
            x={i * segmentWidth}
            y={0}
            width={segmentWidth}
            height={height}
            fill={fillColor}
            fillOpacity={fillOpacity}
            stroke={BORDER_COLOR}
            strokeWidth={1.5}
            style={{
              cursor: allowShading ? "pointer" : "default",
              transition: `fill-opacity ${TIMING_FAST}ms ease-out`,
            }}
            onPointerEnter={() => setHoveredSegment(i)}
            onPointerLeave={() => setHoveredSegment(null)}
            onPointerDown={() => onSegmentClick(i)}
          />
        );
      })}
    </svg>
  );
}
