/**
 * RegionLabel Component
 *
 * Displays a labeled rectangular region within a shape.
 * Used primarily for partial products in multi-digit multiplication.
 *
 * Visual structure:
 * - Dashed border around the region
 * - Solid white background with colored border for label
 * - Main label (e.g., "200")
 * - Optional sublabel (e.g., "20×10")
 */

import {
  LABEL_BG_PADDING,
  LABEL_BORDER_RADIUS,
  REGION_BORDER_DASH,
} from '../constants';
import { AREA_MODEL_COLORS as COLORS } from '../definition';
import type { LabeledRegion } from '../schema';

export interface RegionLabelProps {
  region: LabeledRegion;
  cellWidth: number;
  cellHeight: number;
}

export function RegionLabel({
  region,
  cellWidth,
  cellHeight,
}: RegionLabelProps) {
  // Calculate center position
  const x =
    region.fromCol * cellWidth +
    ((region.toCol - region.fromCol) * cellWidth) / 2;
  const y =
    region.fromRow * cellHeight +
    ((region.toRow - region.fromRow) * cellHeight) / 2;

  // Calculate dimensions
  const width = (region.toCol - region.fromCol) * cellWidth;
  const height = (region.toRow - region.fromRow) * cellHeight;

  // Scale font size based on region size (min 14px, max 24px for better readability)
  const fontSize = Math.min(Math.max(14, Math.min(width, height) / 2.5), 24);

  // Label background dimensions - more generous padding
  const labelBgWidth = Math.max(
    fontSize * Math.max(region.label.length * 0.7, 2) + LABEL_BG_PADDING * 2,
    region.sublabel ? fontSize * 4 : fontSize * 2.5
  );
  const labelBgHeight = region.sublabel ? fontSize * 2.6 : fontSize * 2;

  const borderColor = region.color ? COLORS[region.color].highlight : "#374151";
  const fillColor = region.color ? COLORS[region.color].fill : "#6b7280";

  return (
    <g pointerEvents="none">
      {/* Region border - thicker and more visible */}
      <rect
        x={region.fromCol * cellWidth}
        y={region.fromRow * cellHeight}
        width={width}
        height={height}
        fill="none"
        stroke={borderColor}
        strokeWidth={3}
        strokeDasharray={REGION_BORDER_DASH}
      />

      {/* Label background with shadow and border */}
      <rect
        x={x - labelBgWidth / 2}
        y={y - labelBgHeight / 2}
        width={labelBgWidth}
        height={labelBgHeight}
        fill="white"
        stroke={fillColor}
        strokeWidth={2}
        rx={LABEL_BORDER_RADIUS}
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
      />

      {/* Main label - larger and bolder */}
      <text
        x={x}
        y={region.sublabel ? y - fontSize * 0.25 : y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={700}
        fill="#111827"
      >
        {region.label}
      </text>

      {/* Sublabel (optional) - better contrast */}
      {region.sublabel && (
        <text
          x={x}
          y={y + fontSize * 0.7}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize * 0.75}
          fontWeight={500}
          fill="#4b5563"
        >
          {region.sublabel}
        </text>
      )}
    </g>
  );
}
