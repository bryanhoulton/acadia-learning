/**
 * ShapeContainer Component
 *
 * Wraps a shape (rectangle, circle, or bar) with its associated labels:
 * - Title
 * - Top dimension labels
 * - Side dimension labels
 * - Fraction result label
 * - Remove button (optional)
 *
 * This component handles the layout and positioning of labels around the shape.
 */

import type { ReactNode } from 'react';

import { LABEL_PADDING } from '../constants';
import type { AreaShape } from '../schema';
import { DimensionLabels } from './DimensionLabels';

export interface ShapeContainerProps {
  shape: AreaShape;
  width: number;
  height: number;
  fraction: string;
  showFractionLabels: boolean;
  /** Remove button */
  showRemoveButton: boolean;
  onRemove: () => void;
  /** The shape component to render */
  children: ReactNode;
}

export function ShapeContainer({
  shape,
  width,
  height,
  fraction,
  showFractionLabels,
  showRemoveButton,
  onRemove,
  children,
}: ShapeContainerProps) {
  const hasSideLabels = !!shape.dimensionLabels?.side;
  const hasTopLabels = !!shape.dimensionLabels?.top;

  return (
    <div className="flex flex-col items-center gap-3 group relative">
      {/* Remove button (appears on hover) */}
      {showRemoveButton && (
        <button
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
          onClick={onRemove}
          title="Remove shape"
          aria-label="Remove this shape"
        >
          ×
        </button>
      )}

      {/* Title */}
      {shape.labels?.title && (
        <div className="text-base font-semibold text-neutral-800">
          {shape.labels.title}
        </div>
      )}

      {/* Top dimension labels */}
      {hasTopLabels && (
        <div
          className="flex"
          style={{
            // Add spacer matching side labels width + gap (8px from gap-2)
            paddingLeft: hasSideLabels ? LABEL_PADDING + 8 : 0,
          }}
        >
          <DimensionLabels
            shape={shape}
            width={width}
            height={height}
            position="top"
          />
        </div>
      )}

      {/* Overall top label (fallback when no dimension labels) */}
      {shape.labels?.top && !hasTopLabels && (
        <div className="text-sm font-medium text-neutral-700">
          {shape.labels.top}
        </div>
      )}

      {/* Shape row: side labels + shape */}
      <div className="flex items-center gap-2">
        {/* Side dimension labels */}
        {hasSideLabels && (
          <DimensionLabels
            shape={shape}
            width={width}
            height={height}
            position="side"
          />
        )}

        {/* Overall side label (fallback when no dimension labels) */}
        {shape.labels?.side && !hasSideLabels && (
          <div className="text-sm font-medium text-neutral-700 -rotate-90 origin-center whitespace-nowrap">
            {shape.labels.side}
          </div>
        )}

        {/* The actual shape */}
        <div className="relative">{children}</div>
      </div>

      {/* Fraction label */}
      {showFractionLabels && (
        <div className="text-lg font-bold text-neutral-900">{fraction}</div>
      )}
    </div>
  );
}
