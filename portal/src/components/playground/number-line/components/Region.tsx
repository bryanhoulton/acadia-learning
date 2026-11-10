/**
 * Region Component
 *
 * Renders a shaded region between two values on the number line.
 * Used to highlight ranges, intervals, or segments.
 */

import { motion } from "framer-motion";

import { LINE_Y, TICK_HEIGHT } from "../constants";

interface RegionProps {
  fromX: number;
  toX: number;
  color?: string;
  shaded?: boolean;
}

/** Default region color (blue) */
const DEFAULT_REGION_COLOR = "#3b82f6";

/** Default opacity for semi-transparent fill */
const REGION_OPACITY = 0.3;

/** Height of the region above and below the axis */
const REGION_HALF_HEIGHT = TICK_HEIGHT + 8;

/**
 * Converts a color to an rgba string with specified opacity.
 * Handles hex colors (#rgb, #rrggbb), rgb(), and existing rgba().
 */
function toTransparentColor(color: string, opacity: number): string {
  // If already rgba with alpha, return as-is (respect explicit alpha)
  if (color.startsWith("rgba(")) {
    return color;
  }

  // Handle rgb() format - add alpha
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }

  // Handle hex colors
  if (color.startsWith("#")) {
    let hex = color.slice(1);

    // Expand shorthand (#rgb -> #rrggbb)
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // Fallback: return color as-is with opacity via fill-opacity
  return color;
}

export function Region({
  fromX,
  toX,
  color = DEFAULT_REGION_COLOR,
  shaded = true,
}: RegionProps) {
  if (!shaded) return null;

  const x = Math.min(fromX, toX);
  const width = Math.abs(toX - fromX);

  // Don't render if width is too small
  if (width < 1) return null;

  // Ensure the color is semi-transparent
  const transparentColor = toTransparentColor(color, REGION_OPACITY);

  return (
    <motion.rect
      x={x}
      y={LINE_Y - REGION_HALF_HEIGHT}
      width={width}
      height={REGION_HALF_HEIGHT * 2}
      fill={transparentColor}
      rx={4}
      ry={4}
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0 }}
      transition={{ duration: 0.2 }}
      style={{ originX: x + width / 2, originY: LINE_Y }}
    />
  );
}
