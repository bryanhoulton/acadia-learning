/**
 * Action Runtime State
 *
 * This file contains only:
 * - Default values for action params
 *
 * Action schemas and types are defined in schema.ts using ActionsToUnion.
 */

// ============================================
// Default Values for Action Params
// ============================================

export const ACTION_DEFAULTS = {
  highlight_node: {
    duration: 2000,
  },
  highlight_path: {
    duration: 3000,
  },
} as const;
