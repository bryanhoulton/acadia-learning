/**
 * Coordinate Plane Action Runtime State
 *
 * Actions are currently disabled for the coordinate plane component.
 * This file provides empty state structures for compatibility.
 */

// ============================================
// Empty Action State (for compatibility)
// ============================================

export interface ActionState {
  pointHighlights: never[];
  functionHighlights: never[];
  regionHighlights: never[];
  traces: never[];
  distances: never[];
}

export const INITIAL_ACTION_STATE: ActionState = {
  pointHighlights: [],
  functionHighlights: [],
  regionHighlights: [],
  traces: [],
  distances: [],
};
