/**
 * DimensionLabels Component
 *
 * Displays labels along the top or side of a shape.
 * Used for showing dimension values in partial products.
 *
 * Example: For 23 × 14, shows "20" and "3" along one axis,
 * and "10" and "4" along the other.
 *
 * Each label can span multiple segments (for grouped values).
 */

import { LABEL_PADDING } from '../constants';
import type { AreaShape } from '../schema';

export interface DimensionLabelsProps {
  shape: AreaShape;
  width: number;
  height: number;
  position: "top" | "side";
}

export function DimensionLabels({
  shape,
  width,
  height,
  position,
}: DimensionLabelsProps) {
  const markers =
    position === "top"
      ? shape.dimensionLabels?.top
      : shape.dimensionLabels?.side;

  if (!markers?.length) return null;

  const { horizontal: rows, vertical: cols } = shape.partitions;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  if (position === "top") {
    return (
      <div className="relative" style={{ width, height: 24 }}>
        {markers.map((marker) => {
          const span = marker.span ?? 1;
          const markerWidth = cellWidth * span;
          const startX = marker.index * cellWidth;

          return (
            <div
              key={`top-${marker.index}`}
              className="absolute flex items-center justify-center text-sm font-medium text-neutral-700"
              style={{
                left: startX,
                width: markerWidth,
                height: 24,
              }}
            >
              {marker.label}
            </div>
          );
        })}
      </div>
    );
  }

  // Side labels
  return (
    <div
      className="flex flex-col relative"
      style={{ width: LABEL_PADDING, height }}
    >
      {markers.map((marker) => {
        const span = marker.span ?? 1;
        const markerHeight = cellHeight * span;
        const startY = marker.index * cellHeight;

        return (
          <div
            key={`side-${marker.index}`}
            className="absolute flex items-center justify-end pr-2 text-sm font-medium text-neutral-700"
            style={{
              top: startY,
              height: markerHeight,
              width: LABEL_PADDING,
            }}
          >
            {marker.label}
          </div>
        );
      })}
    </div>
  );
}
