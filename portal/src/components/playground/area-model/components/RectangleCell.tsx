/**
 * RectangleCell Component
 *
 * A single cell within a rectangle shape.
 * Handles hover states, painting preview, and click interactions.
 *
 * Visual States:
 * - Empty: White background
 * - Shaded: Filled with color
 * - Hovered (empty): Shows ghost preview of active color at 30% opacity
 * - Hovered (shaded): Shows darker hover color
 * - Painting (fill mode): Shows preview at 60% opacity
 * - Painting (erase mode): Shows faded version at 30% opacity
 */

import {
  GHOST_OPACITY,
  GRID_LINE_COLOR_MINOR,
  TIMING_FAST,
} from '../constants';
import { AREA_MODEL_COLORS as COLORS } from '../definition';
import type { AreaModelColorKey } from '../schema';

export interface RectangleCellProps {
  /** Cell position */
  row: number;
  col: number;
  /** Cell dimensions */
  cellWidth: number;
  cellHeight: number;
  /** Current shading state */
  color: AreaModelColorKey | null;
  opacity: number;
  /** Interaction state */
  isHovered: boolean;
  isPainting: boolean;
  paintMode: "fill" | "erase" | null;
  /** Permissions */
  allowShading: boolean;
  /** Active color for shading */
  activeColor: AreaModelColorKey;
  /** Event handlers */
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: () => void;
}

export function RectangleCell({
  cellWidth,
  cellHeight,
  color,
  opacity,
  isHovered,
  isPainting,
  paintMode,
  allowShading,
  activeColor,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
}: RectangleCellProps) {
  // Determine the base fill color
  const fillColor = color ? COLORS[color].fill : "white";

  // Calculate display color and opacity based on state
  let displayColor = fillColor;
  let displayOpacity = opacity || (color ? 1 : 0);

  // Hover state (when not painting)
  if (allowShading && isHovered && !isPainting) {
    if (!color) {
      // Empty cell being hovered - show ghost preview
      displayColor = COLORS[activeColor].fill;
      displayOpacity = GHOST_OPACITY;
    } else {
      // Filled cell being hovered - show darker version
      displayColor = COLORS[color].hover;
      displayOpacity = 1;
    }
  }

  // Painting state - show what will happen
  if (isPainting && isHovered) {
    if (paintMode === "fill" && !color) {
      displayColor = COLORS[activeColor].fill;
      displayOpacity = 0.6;
    } else if (paintMode === "erase" && color) {
      displayOpacity = GHOST_OPACITY;
    }
  }

  return (
    <rect
      width={cellWidth}
      height={cellHeight}
      fill={displayColor}
      fillOpacity={displayOpacity}
      stroke={GRID_LINE_COLOR_MINOR}
      strokeWidth={1}
      style={{
        cursor: allowShading ? "pointer" : "default",
        transition: `fill-opacity ${TIMING_FAST}ms ease-out`,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    />
  );
}
