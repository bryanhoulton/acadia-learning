/**
 * RectangleShape Component
 *
 * Renders a rectangular area model with grid cells.
 * This is the primary shape for fraction visualization.
 *
 * Features:
 * - Grid of interactive cells
 * - Optional grid lines
 * - Labeled regions for partial products
 * - Support for drag-to-paint interaction
 *
 * The component handles:
 * - Cell hover tracking
 * - Pointer event routing to parent
 * - SVG rendering with proper layering
 */

import { useState } from 'react';

import type {
  ActiveCellHighlight,
  ActiveDivider,
  ActiveRegionHighlight,
  ActiveShapePulse,
} from '../actions';
import {
  BORDER_COLOR,
  BORDER_WIDTH,
  GRID_LINE_COLOR,
  GRID_LINE_WIDTH,
} from '../constants';
import type {
  AreaModelColorKey,
  AreaShape,
} from '../schema';
import { getCellShading } from '../utils';
import { ActionOverlays } from './ActionOverlays';
import { RectangleCell } from './RectangleCell';
import { RegionLabel } from './RegionLabel';

export interface RectangleShapeProps {
  shape: AreaShape;
  width: number;
  height: number;
  /** Display options */
  showOverlap: boolean;
  overlapColor: AreaModelColorKey;
  showGridLines: boolean;
  /** Interaction */
  allowShading: boolean;
  activeColor: AreaModelColorKey;
  isPainting: boolean;
  paintMode: "fill" | "erase" | null;
  /** Event handler for cell interactions */
  onCellInteraction: (
    row: number,
    col: number,
    type: "down" | "enter" | "up"
  ) => void;
  /** Action overlay state */
  cellHighlights?: ActiveCellHighlight[];
  regionHighlights?: ActiveRegionHighlight[];
  shapePulses?: ActiveShapePulse[];
  dividers?: ActiveDivider[];
}

export function RectangleShape({
  shape,
  width,
  height,
  showOverlap,
  overlapColor,
  showGridLines,
  allowShading,
  activeColor,
  isPainting,
  paintMode,
  onCellInteraction,
  cellHighlights = [],
  regionHighlights = [],
  shapePulses = [],
  dividers = [],
}: RectangleShapeProps) {
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);

  const { horizontal: rows, vertical: cols } = shape.partitions;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible select-none"
      onPointerUp={() => onCellInteraction(-1, -1, "up")}
      onPointerLeave={() => {
        setHoveredCell(null);
        onCellInteraction(-1, -1, "up");
      }}
    >
      {/* Layer 1: Cells */}
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((_, col) => {
          const { color, opacity } = getCellShading(
            row,
            col,
            shape,
            showOverlap,
            overlapColor
          );
          const isHovered =
            hoveredCell?.[0] === row && hoveredCell?.[1] === col;

          return (
            <g
              key={`cell-${row}-${col}`}
              transform={`translate(${col * cellWidth}, ${row * cellHeight})`}
            >
              <RectangleCell
                row={row}
                col={col}
                cellWidth={cellWidth}
                cellHeight={cellHeight}
                color={color}
                opacity={opacity}
                isHovered={isHovered}
                isPainting={isPainting}
                paintMode={paintMode}
                allowShading={allowShading}
                activeColor={activeColor}
                onPointerEnter={() => {
                  setHoveredCell([row, col]);
                  onCellInteraction(row, col, "enter");
                }}
                onPointerLeave={() => setHoveredCell(null)}
                onPointerDown={() => onCellInteraction(row, col, "down")}
              />
            </g>
          );
        })
      )}

      {/* Layer 2: Grid lines (rendered on top for visibility) */}
      {showGridLines && (
        <g pointerEvents="none">
          {/* Vertical lines */}
          {Array.from({ length: cols + 1 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={i * cellWidth}
              y1={0}
              x2={i * cellWidth}
              y2={height}
              stroke={GRID_LINE_COLOR}
              strokeWidth={
                i === 0 || i === cols ? BORDER_WIDTH : GRID_LINE_WIDTH
              }
            />
          ))}
          {/* Horizontal lines */}
          {Array.from({ length: rows + 1 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              y1={i * cellHeight}
              x2={width}
              y2={i * cellHeight}
              stroke={GRID_LINE_COLOR}
              strokeWidth={
                i === 0 || i === rows ? BORDER_WIDTH : GRID_LINE_WIDTH
              }
            />
          ))}
        </g>
      )}

      {/* Layer 3: Outer border */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="none"
        stroke={BORDER_COLOR}
        strokeWidth={BORDER_WIDTH}
        pointerEvents="none"
      />

      {/* Layer 4: Region labels */}
      {shape.regions?.map((region) => (
        <RegionLabel
          key={region.id}
          region={region}
          cellWidth={cellWidth}
          cellHeight={cellHeight}
        />
      ))}

      {/* Layer 5: Action overlays (topmost layer) */}
      <ActionOverlays
        shapeId={shape.id}
        width={width}
        height={height}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
        rows={rows}
        cols={cols}
        cellHighlights={cellHighlights}
        regionHighlights={regionHighlights}
        shapePulses={shapePulses}
        dividers={dividers}
      />
    </svg>
  );
}
