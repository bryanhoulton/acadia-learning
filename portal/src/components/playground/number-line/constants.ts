/**
 * Number Line Constants
 *
 * Centralized configuration for the number line visualization.
 * All dimensional values are in SVG coordinate units.
 */

// Layout dimensions
export const SVG_WIDTH = 800;
export const SVG_HEIGHT = 360;
export const PADDING_X = 60;
export const LINE_Y = 260; // Positioned lower to leave room for arcs above
export const AXIS_Y = LINE_Y; // Alias for clarity in action components

// Element sizing
export const TICK_HEIGHT = 12;
export const LABEL_OFFSET = 30;
export const POINT_RADIUS = 14;
export const JUMP_HEIGHT = 100;

// Color palette
export const COLORS = {
  axis: "#1f2937",
  tick: "#4b5563",
  tickLabel: "#374151",
  ghostPoint: "rgba(59, 130, 246, 0.4)",
  defaultPoint: "#3b82f6",
  jump: "#10b981",
} as const;

// Auto-assigned point colors (cycles through these)
export const POINT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
] as const;
