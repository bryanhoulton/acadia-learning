/**
 * Area Model Constants
 *
 * Visual and behavioral constants for the Area Model playground.
 * These values are tuned for pedagogical clarity and visual consistency.
 */

// ============================================
// Dimensions
// ============================================

/** Default shape width in pixels when fixedDimensions not specified */
export const DEFAULT_WIDTH = 240;

/** Default shape height in pixels when fixedDimensions not specified */
export const DEFAULT_HEIGHT = 240;

/** Minimum cell size in pixels (prevents cells from becoming too small to interact with) */
export const MIN_CELL_SIZE = 20;

/** Padding for dimension labels on the side/top of shapes */
export const LABEL_PADDING = 32;

/** Gap between shapes when multiple are displayed */
export const SHAPE_GAP = 32;

// ============================================
// Animation Timing (following design ethos)
// ============================================

/** Immediate feedback (hover states, position changes) */
export const TIMING_IMMEDIATE = 0;

/** Fast transitions (snap, selection highlights) */
export const TIMING_FAST = 50;

/** Comfortable transitions (enter/exit animations) */
export const TIMING_COMFORTABLE = 200;

/** Slow transitions (onboarding, major state changes) */
export const TIMING_SLOW = 400;

// ============================================
// Interaction
// ============================================

/** Minimum drag distance before painting starts (prevents accidental drags) */
export const DRAG_THRESHOLD = 3;

/** Opacity for ghost/preview states */
export const GHOST_OPACITY = 0.3;

/** Opacity for layer shading (when using overlapping layers) */
export const LAYER_OPACITY = 0.4;

/** Opacity for solid shading */
export const SOLID_OPACITY = 1;

// ============================================
// Visual Styling
// ============================================

/** Grid line color */
export const GRID_LINE_COLOR = "#9ca3af";

/** Grid line color (minor) */
export const GRID_LINE_COLOR_MINOR = "#d1d5db";

/** Border color for shapes */
export const BORDER_COLOR = "#1f2937";

/** Border width for outer shape border */
export const BORDER_WIDTH = 2;

/** Border width for internal grid lines */
export const GRID_LINE_WIDTH = 1;

/** Region label background opacity */
export const REGION_LABEL_BG_OPACITY = 1;

/** Region label border dash pattern */
export const REGION_BORDER_DASH = "4 2";

// ============================================
// Highlight Styling
// ============================================

/** Highlight stroke width for cells */
export const HIGHLIGHT_STROKE_WIDTH = 4;

/** Highlight fill opacity for cells */
export const HIGHLIGHT_FILL_OPACITY = 0.25;

/** Region highlight stroke width */
export const REGION_HIGHLIGHT_STROKE_WIDTH = 4;

/** Region highlight fill opacity */
export const REGION_HIGHLIGHT_FILL_OPACITY = 0.3;

/** Label background padding */
export const LABEL_BG_PADDING = 6;

/** Label border radius */
export const LABEL_BORDER_RADIUS = 6;

/** Label shadow blur */
export const LABEL_SHADOW_BLUR = 4;
