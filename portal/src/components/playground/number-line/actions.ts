/**
 * Number Line Action Runtime State
 *
 * Internal state and utilities for rendering ephemeral actions.
 * Action schemas are defined in schema.ts - this file only contains
 * runtime state for tracking active animations and their lifecycles.
 */

// ============================================
// Runtime State (for tracking active animations)
// ============================================

export interface ActiveHighlight {
  id: string;
  type: "value" | "point" | "tick" | "range" | "comparison";
  value?: number;
  pointId?: string;
  from?: number;
  to?: number;
  color?: string;
  label?: string;
  expiresAt: number;
}

export interface ActiveJump {
  id: string;
  from: number;
  to: number;
  color: string;
  label: string;
  phase: "enter" | "hold" | "exit";
  expiresAt: number;
}

export interface ActionState {
  highlights: ActiveHighlight[];
  jumps: ActiveJump[];
}

export const INITIAL_ACTION_STATE: ActionState = {
  highlights: [],
  jumps: [],
};

// ============================================
// Default Values for Action Params
// ============================================

export const ACTION_DEFAULTS = {
  highlight_value: {
    color: "#3b82f6",
    duration: 2000,
  },
  highlight_point: {
    duration: 2000,
  },
  animate_jump: {
    color: "#10b981",
    duration: 2500,
  },
  pulse_tick: {
    color: "#f59e0b",
    duration: 1500,
  },
  show_comparison: {
    duration: 3000,
  },
  highlight_range: {
    color: "rgba(59, 130, 246, 0.3)",
    duration: 3000,
  },
} as const;
