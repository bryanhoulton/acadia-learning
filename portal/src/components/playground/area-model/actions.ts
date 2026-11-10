/**
 * Area Model Action Runtime State
 *
 * This file contains only:
 * - Runtime state interfaces for tracking active animations
 * - Initial state constants
 * - Default values for action params
 *
 * Action schemas and types are defined in schema.ts using ActionsToUnion.
 */

// ============================================
// Runtime State (for component rendering)
// ============================================

export interface ActiveCellHighlight {
  id: string;
  shapeId: string;
  row: number;
  col: number;
  color: string;
  label?: string;
  expiresAt: number;
}

export interface ActiveRegionHighlight {
  id: string;
  shapeId: string;
  cells: Array<{ row: number; col: number }>;
  color: string;
  label?: string;
  expiresAt: number;
}

export interface ActiveShapePulse {
  id: string;
  shapeId: string;
  color?: string;
  expiresAt: number;
}

export interface ActiveComparison {
  id: string;
  shapeId1: string;
  shapeId2: string;
  label?: string;
  expiresAt: number;
}

export interface ActiveFillAnimation {
  id: string;
  shapeId: string;
  cells: Array<{ row: number; col: number }>;
  color: string;
  currentIndex: number;
  expiresAt: number;
}

export interface ActiveFractionHighlight {
  id: string;
  shapeId: string;
  expiresAt: number;
}

export interface ActiveDivider {
  id: string;
  shapeId: string;
  orientation: "horizontal" | "vertical";
  position: number;
  color: string;
  expiresAt: number;
}

export interface ActionState {
  cellHighlights: ActiveCellHighlight[];
  regionHighlights: ActiveRegionHighlight[];
  shapePulses: ActiveShapePulse[];
  comparisons: ActiveComparison[];
  fillAnimations: ActiveFillAnimation[];
  fractionHighlights: ActiveFractionHighlight[];
  dividers: ActiveDivider[];
}

export const INITIAL_ACTION_STATE: ActionState = {
  cellHighlights: [],
  regionHighlights: [],
  shapePulses: [],
  comparisons: [],
  fillAnimations: [],
  fractionHighlights: [],
  dividers: [],
};

// ============================================
// Default Values for Action Params
// ============================================

export const ACTION_DEFAULTS = {
  highlight_cell: {
    color: "#1d4ed8", // blue-700 - more saturated for visibility
    duration: 2000,
  },
  highlight_region: {
    color: "#1d4ed8", // blue-700 - more saturated for visibility
    duration: 3000,
  },
  pulse_shape: {
    duration: 1500,
  },
  show_comparison: {
    duration: 3000,
  },
  animate_fill: {
    stepDelay: 300,
    duration: 2000,
  },
  highlight_fraction: {
    duration: 2000,
  },
  show_divider: {
    color: "#d97706", // amber-600 - more visible
    duration: 2500,
  },
} as const;
