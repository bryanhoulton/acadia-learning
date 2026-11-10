/**
 * Text Workspace Constants
 *
 * Centralized configuration for the text workspace visualization.
 * Following the design ethos:
 * - Immediate (0ms): Position changes, hover states
 * - Fast (50-150ms): Selection highlights, tool transitions
 * - Comfortable (200-300ms): Panel animations, mode switches
 * - Slow (400-600ms): Onboarding reveals
 */

// ============================================
// Animation Timing (in ms)
// ============================================

export const TIMING = {
  /** Instant feedback for hover states */
  IMMEDIATE: 0,
  /** Quick transitions for selections and highlights */
  FAST: 100,
  /** Standard UI transitions */
  COMFORTABLE: 250,
  /** Larger transitions like panel open/close */
  SLOW: 400,
} as const;

// ============================================
// Easing Functions
// ============================================

export const EASING = {
  /** Standard ease out for most animations */
  OUT: "cubic-bezier(0.33, 1, 0.68, 1)",
  /** Bouncy ease for satisfying interactions */
  OUT_BACK: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Spring-like for interactive elements */
  SPRING: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

// ============================================
// Highlight Colors
// ============================================

export const HIGHLIGHT_COLORS = {
  yellow: {
    fill: "rgba(250, 204, 21, 0.4)",
    solid: "#facc15",
    hover: "rgba(250, 204, 21, 0.6)",
    name: "Yellow",
  },
  green: {
    fill: "rgba(34, 197, 94, 0.4)",
    solid: "#22c55e",
    hover: "rgba(34, 197, 94, 0.6)",
    name: "Green",
  },
  blue: {
    fill: "rgba(59, 130, 246, 0.4)",
    solid: "#3b82f6",
    hover: "rgba(59, 130, 246, 0.6)",
    name: "Blue",
  },
  pink: {
    fill: "rgba(236, 72, 153, 0.4)",
    solid: "#ec4899",
    hover: "rgba(236, 72, 153, 0.6)",
    name: "Pink",
  },
  orange: {
    fill: "rgba(249, 115, 22, 0.4)",
    solid: "#f97316",
    hover: "rgba(249, 115, 22, 0.6)",
    name: "Orange",
  },
} as const;

export type HighlightColorKey = keyof typeof HIGHLIGHT_COLORS;

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorKey = "yellow";

// ============================================
// Layout Constants
// ============================================

export const LAYOUT = {
  /** Max width for reading content */
  MAX_CONTENT_WIDTH: 680,
  /** Sidebar width for annotations */
  SIDEBAR_WIDTH: 280,
  /** Padding inside panels */
  PANEL_PADDING: 24,
  /** Gap between elements */
  GAP: 16,
} as const;

// ============================================
// Typography
// ============================================

export const TYPOGRAPHY = {
  /** Reading passage line height */
  LINE_HEIGHT: 1.8,
  /** Reading passage font size */
  FONT_SIZE: 17,
  /** Title font size */
  TITLE_SIZE: 28,
} as const;

// ============================================
// Tool Icons (using Lucide icon names)
// ============================================

export const TOOL_ICONS = {
  highlight: "Highlighter",
  annotate: "MessageSquare",
  define: "BookOpen",
  "read-aloud": "Volume2",
} as const;

// ============================================
// Spring Config for Framer Motion
// ============================================

export const SPRING_CONFIG = {
  /** Snappy spring for interactive elements */
  SNAPPY: { stiffness: 500, damping: 30 },
  /** Gentle spring for larger elements */
  GENTLE: { stiffness: 300, damping: 25 },
  /** Bouncy spring for playful feedback */
  BOUNCY: { stiffness: 400, damping: 15 },
} as const;
