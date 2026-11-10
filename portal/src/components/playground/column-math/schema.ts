/**
 * Column Math Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from 'zod';

import type { ActionsToUnion } from '../types';

// ============================================
// Config Schema
// ============================================

export const ConfigSchema = z.object({
  /** The operation to perform: "addition" (e.g., 71 + 41) or "subtraction" (e.g., 85 - 32) */
  operation: z.enum(["addition", "subtraction"]),
  /** The operands as whole numbers. For addition: [71, 41] means 71 + 41. For subtraction: [85, 32] means 85 - 32. */
  operands: z.array(z.number().int().nonnegative()).min(2),
  /** Show place value labels (ones, tens, hundreds, etc.) */
  showPlaceValues: z.boolean().default(true),
  /** Show regrouping indicators (carries for addition, borrows for subtraction) */
  showRegrouping: z.boolean().default(true),
  /** Allow student to type answers (true) or just display the problem (false) */
  interactive: z.boolean().default(false),
  /** Automatically show the solved answer (only applies when interactive=false). Set to false to show the problem without the answer. */
  autoSolve: z.boolean().default(false),
});

// ============================================
// State Schema
// ============================================

export const StateSchema = z.object({
  /** Whether the student has completed the problem */
  completed: z.boolean().default(false),
  /** Whether the answer is correct (null until completed, true/false after) */
  isCorrect: z.boolean().nullable().default(null),
  /** Answer digits set by agent (index 0 = ones, 1 = tens, etc.). Used in agent-controlled mode. */
  answerDigits: z.array(z.number().int().min(0).max(9).nullable()).optional(),
  /** Carry digits shown above columns (index 0 = ones, 1 = tens, etc.). Used in agent-controlled mode. */
  carries: z.array(z.number().int().min(0).nullable()).optional(),
  /** Display digits for operands after borrow operations. 2D array: [operandIndex][columnIndex]. */
  displayDigits: z.array(z.array(z.number().int().nullable())).optional(),
});

// ============================================
// Action Schemas (Dictionary Pattern)
// ============================================

/**
 * Action schemas as a dictionary.
 * Keys are action names, values are Zod schemas for params.
 */
export const actionSchemas = {
  /** Set an answer digit in a specific column (agent-controlled mode) */
  set_answer: z.object({
    /** Column index (0 = ones, 1 = tens, 2 = hundreds, etc.) */
    column: z.number().int().min(0),
    /** The digit to set (0-9) */
    value: z.number().int().min(0).max(9),
  }),

  /** Set a carry digit above a column (for addition) */
  carry: z.object({
    /** Column index where the carry appears (0 = ones, 1 = tens, etc.) */
    column: z.number().int().min(0),
    /** The carry value (typically 1, but could be higher for multi-addend) */
    value: z.number().int().min(0),
  }),

  /** Perform a borrow operation (for subtraction) */
  borrow: z.object({
    /** Column to borrow FROM (the column that decreases) */
    from: z.number().int().min(0),
    /** Column to borrow TO (the column that gains 10) */
    to: z.number().int().min(0),
  }),

  /** Highlight a column to draw attention to it */
  highlight_column: z.object({
    /** Column to highlight (0 = ones, 1 = tens, 2 = hundreds, etc.) */
    column: z.number().int().min(0),
    /** Duration in milliseconds (default: 2000) */
    duration: z.number().int().min(0).optional(),
  }),

  /** Reset the problem to initial state */
  reset: z.object({}),
} as const;

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;

// Action types
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;
export type ActionParams<T extends ActionName> = z.infer<ActionSchemas[T]>;

/** Union of all column math actions with typed params */
export type ColumnMathAction = ActionsToUnion<typeof actionSchemas>;

// ============================================
// Internal State (not exposed to agent)
// ============================================

/** Internal state managed by the component, not visible to the agent */
export interface ColumnMathInternalState {
  /** Display values for each operand digit (can change from borrowing) */
  displayDigits: (number | null)[][];
  /** Answer digits per column (index 0 = ones place) */
  answerDigits: (number | null)[];
  /** Carry digits shown above each column */
  carries: (number | null)[];
  /** Current column being worked on (interactive mode) */
  currentColumn: number | null;
  /** Whether completed */
  completed: boolean;
}

/** For backward compatibility with existing code */
export interface RegroupingState {
  value: number | null;
  crossedOut?: boolean;
  adjustedValue?: number | null;
}
