/**
 * CircleShape Component
 *
 * Renders a circular (pie chart) area model.
 * Useful for visualizing fractions of a whole in a familiar format.
 *
 * The circle is divided into equal pie slices (segments).
 * Each segment can be shaded independently.
 *
 * Note: Circle shapes only support vertical partitions (number of slices).
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
import {
  getPieSlicePath,
  getSegmentShading,
} from '../utils';

export interface CircleShapeProps {
  shape: AreaShape;
  size: number;
  /** Interaction */
  allowShading: boolean;
  activeColor: AreaModelColorKey;
  /** Event handler */
  onSegmentClick: (segment: number) => void;
}

export function CircleShape({
  shape,
  size,
  allowShading,
  activeColor,
  onSegmentClick,
}: CircleShapeProps) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const segments = shape.partitions.vertical;
  const radius = size / 2 - 4; // 4px padding for border
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
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
          <path
            key={i}
            d={getPieSlicePath(i, segments, center, center, radius)}
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
