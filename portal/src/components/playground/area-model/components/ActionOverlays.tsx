/**
 * Action Overlay Components for Area Model
 *
 * Visual components for ephemeral highlights and animations
 * triggered by playground actions.
 */

import { AnimatePresence, motion } from "framer-motion";

import type {
  ActiveCellHighlight,
  ActiveDivider,
  ActiveRegionHighlight,
  ActiveShapePulse,
} from "../actions";
import {
  HIGHLIGHT_FILL_OPACITY,
  HIGHLIGHT_STROKE_WIDTH,
  LABEL_BG_PADDING,
  LABEL_BORDER_RADIUS,
  REGION_HIGHLIGHT_FILL_OPACITY,
  REGION_HIGHLIGHT_STROKE_WIDTH,
} from "../constants";

interface CellHighlightOverlayProps {
  highlight: ActiveCellHighlight;
  cellWidth: number;
  cellHeight: number;
}

function CellHighlightOverlay({
  highlight,
  cellWidth,
  cellHeight,
}: CellHighlightOverlayProps) {
  const x = highlight.col * cellWidth;
  const y = highlight.row * cellHeight;
  const fontSize = Math.min(cellWidth, cellHeight) * 0.35;
  const labelWidth = highlight.label
    ? Math.max(fontSize * highlight.label.length * 0.6, cellWidth * 0.7)
    : 0;
  const labelHeight = fontSize * 1.8;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      {/* Semi-transparent fill for visibility */}
      <motion.rect
        x={x + 2}
        y={y + 2}
        width={cellWidth - 4}
        height={cellHeight - 4}
        fill={highlight.color}
        fillOpacity={HIGHLIGHT_FILL_OPACITY}
        rx={2}
        animate={{
          fillOpacity: [HIGHLIGHT_FILL_OPACITY, HIGHLIGHT_FILL_OPACITY * 0.5, HIGHLIGHT_FILL_OPACITY],
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Pulsing border - thicker and more visible */}
      <motion.rect
        x={x + 2}
        y={y + 2}
        width={cellWidth - 4}
        height={cellHeight - 4}
        fill="none"
        stroke={highlight.color}
        strokeWidth={HIGHLIGHT_STROKE_WIDTH}
        rx={2}
        animate={{
          strokeOpacity: [1, 0.6, 1],
          scale: [1, 1.02, 1],
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Label with background for readability */}
      {highlight.label && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Label background */}
          <rect
            x={x + cellWidth / 2 - labelWidth / 2}
            y={y + cellHeight / 2 - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            fill="white"
            stroke={highlight.color}
            strokeWidth={2}
            rx={LABEL_BORDER_RADIUS}
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
          />
          {/* Label text */}
          <text
            x={x + cellWidth / 2}
            y={y + cellHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={highlight.color}
            fontSize={fontSize}
            fontWeight="bold"
          >
            {highlight.label}
          </text>
        </motion.g>
      )}
    </motion.g>
  );
}

interface RegionHighlightOverlayProps {
  highlight: ActiveRegionHighlight;
  cellWidth: number;
  cellHeight: number;
}

function RegionHighlightOverlay({
  highlight,
  cellWidth,
  cellHeight,
}: RegionHighlightOverlayProps) {
  if (highlight.cells.length === 0) return null;

  // Find bounding box
  const rows = highlight.cells.map((c) => c.row);
  const cols = highlight.cells.map((c) => c.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);

  const x = minCol * cellWidth;
  const y = minRow * cellHeight;
  const width = (maxCol - minCol + 1) * cellWidth;
  const height = (maxRow - minRow + 1) * cellHeight;

  const fontSize = Math.max(14, Math.min(width, height) * 0.25);
  const labelWidth = highlight.label
    ? Math.max(fontSize * highlight.label.length * 0.65 + LABEL_BG_PADDING * 2, 50)
    : 0;
  const labelHeight = fontSize * 1.8;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Highlight fill - more visible */}
      <motion.rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={highlight.color}
        fillOpacity={REGION_HIGHLIGHT_FILL_OPACITY}
        stroke={highlight.color}
        strokeWidth={REGION_HIGHLIGHT_STROKE_WIDTH}
        rx={4}
        animate={{
          strokeOpacity: [1, 0.6, 1],
          fillOpacity: [REGION_HIGHLIGHT_FILL_OPACITY, REGION_HIGHLIGHT_FILL_OPACITY * 0.7, REGION_HIGHLIGHT_FILL_OPACITY],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Outer glow effect for better visibility */}
      <motion.rect
        x={x - 2}
        y={y - 2}
        width={width + 4}
        height={height + 4}
        fill="none"
        stroke={highlight.color}
        strokeWidth={2}
        strokeOpacity={0.4}
        rx={6}
        animate={{
          strokeOpacity: [0.4, 0.2, 0.4],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Label with background for readability */}
      {highlight.label && (
        <motion.g initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Label background with shadow */}
          <rect
            x={x + width / 2 - labelWidth / 2}
            y={y + height / 2 - labelHeight / 2}
            width={labelWidth}
            height={labelHeight}
            fill="white"
            stroke={highlight.color}
            strokeWidth={2}
            rx={LABEL_BORDER_RADIUS}
            filter="drop-shadow(0 2px 6px rgba(0,0,0,0.25))"
          />
          {/* Label text - darker for contrast */}
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1f2937"
            fontSize={fontSize}
            fontWeight="bold"
          >
            {highlight.label}
          </text>
        </motion.g>
      )}
    </motion.g>
  );
}

interface ShapePulseOverlayProps {
  pulse: ActiveShapePulse;
  width: number;
  height: number;
}

function ShapePulseOverlay({ pulse, width, height }: ShapePulseOverlayProps) {
  const color = pulse.color || "#1d4ed8"; // blue-700 for better visibility

  return (
    <motion.g>
      {/* Outer glow layer */}
      <motion.rect
        x={-8}
        y={-8}
        width={width + 16}
        height={height + 16}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.3}
        rx={12}
        initial={{ opacity: 0 }}
        animate={{
          opacity: [0, 0.5, 0],
          scale: [0.98, 1.04, 0.98],
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Main pulse border */}
      <motion.rect
        x={-4}
        y={-4}
        width={width + 8}
        height={height + 8}
        fill="none"
        stroke={color}
        strokeWidth={5}
        rx={8}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{
          opacity: [0, 1, 0],
          scale: [0.98, 1.02, 0.98],
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.g>
  );
}

interface DividerOverlayProps {
  divider: ActiveDivider;
  cellWidth: number;
  cellHeight: number;
  rows: number;
  cols: number;
}

function DividerOverlay({
  divider,
  cellWidth,
  cellHeight,
  rows,
  cols,
}: DividerOverlayProps) {
  const isHorizontal = divider.orientation === "horizontal";

  const x1 = isHorizontal ? 0 : divider.position * cellWidth;
  const y1 = isHorizontal ? divider.position * cellHeight : 0;
  const x2 = isHorizontal ? cols * cellWidth : divider.position * cellWidth;
  const y2 = isHorizontal ? divider.position * cellHeight : rows * cellHeight;

  return (
    <motion.g>
      {/* Glow/shadow layer for better visibility */}
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={divider.color}
        strokeWidth={8}
        strokeOpacity={0.3}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      />
      {/* Main divider line */}
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={divider.color}
        strokeWidth={5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      />
    </motion.g>
  );
}

export interface ActionOverlaysProps {
  shapeId: string;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  rows: number;
  cols: number;
  cellHighlights: ActiveCellHighlight[];
  regionHighlights: ActiveRegionHighlight[];
  shapePulses: ActiveShapePulse[];
  dividers: ActiveDivider[];
}

export function ActionOverlays({
  shapeId,
  width,
  height,
  cellWidth,
  cellHeight,
  rows,
  cols,
  cellHighlights,
  regionHighlights,
  shapePulses,
  dividers,
}: ActionOverlaysProps) {
  // Filter to only show overlays for this shape
  const shapeCellHighlights = cellHighlights.filter(
    (h) => h.shapeId === shapeId,
  );
  const shapeRegionHighlights = regionHighlights.filter(
    (h) => h.shapeId === shapeId,
  );
  const shapeShapePulses = shapePulses.filter((p) => p.shapeId === shapeId);
  const shapeDividers = dividers.filter((d) => d.shapeId === shapeId);

  const hasOverlays =
    shapeCellHighlights.length > 0 ||
    shapeRegionHighlights.length > 0 ||
    shapeShapePulses.length > 0 ||
    shapeDividers.length > 0;

  if (!hasOverlays) return null;

  return (
    <g className="action-overlays" pointerEvents="none">
      <AnimatePresence>
        {/* Shape pulses (rendered first, behind everything) */}
        {shapeShapePulses.map((pulse) => (
          <ShapePulseOverlay
            key={pulse.id}
            pulse={pulse}
            width={width}
            height={height}
          />
        ))}

        {/* Region highlights */}
        {shapeRegionHighlights.map((highlight) => (
          <RegionHighlightOverlay
            key={highlight.id}
            highlight={highlight}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
          />
        ))}

        {/* Cell highlights */}
        {shapeCellHighlights.map((highlight) => (
          <CellHighlightOverlay
            key={highlight.id}
            highlight={highlight}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
          />
        ))}

        {/* Dividers */}
        {shapeDividers.map((divider) => (
          <DividerOverlay
            key={divider.id}
            divider={divider}
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            rows={rows}
            cols={cols}
          />
        ))}
      </AnimatePresence>
    </g>
  );
}
