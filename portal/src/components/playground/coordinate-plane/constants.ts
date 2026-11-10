/**
 * Coordinate Plane Constants
 * Following the design ethos for visual feedback hierarchy
 */

// ============================================
// Animation Timing (Visual Feedback Hierarchy)
// ============================================

export const TIMING = {
  /** Position changes, hover states - immediate */
  immediate: 0,
  /** Snap transitions, selection highlights */
  fast: 100,
  /** Enter/exit animations, layout shifts */
  comfortable: 250,
  /** Onboarding reveals, major state changes */
  slow: 500,
} as const;

// ============================================
// Colors
// ============================================

export const COLORS = {
  // Grid and axes
  grid: "#e5e7eb",
  gridMinor: "#f3f4f6",
  axis: "#374151",
  axisLabel: "#6b7280",

  // Default function colors (distinct, accessible)
  functions: [
    "#3b82f6", // blue
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#84cc16", // lime
  ],

  // Point colors
  point: "#3b82f6",
  pointHover: "#2563eb",
  pointDrag: "#1d4ed8",
  pointSelected: "#1e40af",

  // Special markers
  intercept: "#10b981",
  intersection: "#f59e0b",
  vertex: "#8b5cf6",

  // Regions
  regionFill: "rgba(59, 130, 246, 0.15)",
  regionStroke: "rgba(59, 130, 246, 0.5)",

  // Ghost/preview
  ghost: "rgba(107, 114, 128, 0.5)",
  ghostStroke: "rgba(107, 114, 128, 0.3)",

  // Trace
  traceLine: "rgba(107, 114, 128, 0.4)",
  tracePoint: "#f59e0b",
} as const;

// ============================================
// Dimensions
// ============================================

export const DIMENSIONS = {
  // Point sizes
  pointRadius: 10,
  pointRadiusHover: 12,
  pointRadiusDrag: 14,
  pointHitArea: 20, // Generous hit area for forgiveness

  // Line widths
  axisWidth: 1.5,
  gridWidth: 0.5,
  functionWidth: 2.5,
  functionWidthHover: 3.5,
  regionStrokeWidth: 2,

  // Markers
  interceptRadius: 5,
  intersectionRadius: 6,

  // Labels
  labelOffset: 8,
  tickLength: 6,
  tickLabelOffset: 16,
} as const;

// ============================================
// Interaction
// ============================================

export const INTERACTION = {
  /** Distance in pixels to trigger snap preview */
  snapPreviewDistance: 20,
  /** Grid snap size (in math units) */
  defaultGridSnap: 1,
  /** Minimum drag distance to start drag */
  dragThreshold: 3,
  /** Debounce time for function parsing */
  parseDebounce: 150,
} as const;

// ============================================
// Easing Functions
// ============================================

export const EASING = {
  /** For interactive elements - spring-like */
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** For autonomous animations - smooth */
  smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** For exit animations - quick out */
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  /** For enter animations - decelerate */
  enter: "cubic-bezier(0, 0, 0.2, 1)",
} as const;

// ============================================
// Default Values
// ============================================

export const DEFAULTS = {
  xRange: [-10, 10] as [number, number],
  yRange: [-10, 10] as [number, number],
  functionSamples: 300,
  maxFunctions: 8,
  maxPoints: 50,
} as const;
