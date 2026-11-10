/**
 * Number Line Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from "zod";

import type { ActionsToUnion } from "../types";

// ============================================
// Config Schemas
// ============================================

export const LineDefinitionSchema = z.object({
  id: z.string(),
  range: z.tuple([z.number(), z.number()]),
  tickInterval: z.number().positive(),
  showLabels: z.boolean().default(true),
  labelInterval: z.number().positive().default(1),
  showFractions: z.boolean().default(false),
  snapToTicks: z.boolean().default(true),
  minIncrement: z.number().positive().optional(),
});

export const ConfigSchema = z.object({
  lines: z.array(LineDefinitionSchema).min(1),
  doubleNumberLine: z.object({
    enabled: z.boolean(),
    topLabel: z.string().optional(),
    bottomLabel: z.string().optional(),
    ratio: z.tuple([z.number(), z.number()]).optional(),
  }),
  showJumps: z.boolean(),
  showRegions: z.boolean().optional(),
  showPointLabels: z.boolean().optional(),
  showDragTooltip: z.boolean().optional(),
  allowPointPlacement: z.boolean(),
  allowPointRemoval: z.boolean(),
  allowPointDragging: z.boolean().optional(),
  allowJumpDrawing: z.boolean(),
  allowRegionCreation: z.boolean().optional(),
  allowClear: z.boolean().optional(),
});

// ============================================
// State Schemas
// ============================================

export const PointSchema = z.object({
  id: z.string(),
  line: z.string(),
  value: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
});

export const JumpSchema = z.object({
  id: z.string(),
  line: z.string(),
  fromPointId: z.string().optional(),
  toPointId: z.string().optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  label: z.string().optional(),
  color: z.string().optional(),
});

export const RegionSchema = z.object({
  id: z.string(),
  line: z.string(),
  from: z.number(),
  to: z.number(),
  shaded: z.boolean().default(true),
  color: z.string().optional(),
});

export const StateSchema = z.object({
  points: z.array(PointSchema),
  jumps: z.array(JumpSchema),
  regions: z.array(RegionSchema),
});

// ============================================
// Action Schemas (Dictionary Pattern)
// ============================================

/**
 * Action schemas as a dictionary.
 * Keys are action names, values are Zod schemas for params.
 */
export const actionSchemas = {
  highlight_value: z.object({
    value: z.number(),
    color: z.string().optional(),
    duration: z.number().positive().optional(),
    label: z.string().optional(),
  }),

  highlight_point: z.object({
    pointId: z.string(),
    duration: z.number().positive().optional(),
  }),

  animate_jump: z.object({
    from: z.number(),
    to: z.number(),
    color: z.string().optional(),
    label: z.string().optional(),
    duration: z.number().positive().optional(),
  }),

  pulse_tick: z.object({
    value: z.number(),
    color: z.string().optional(),
    duration: z.number().positive().optional(),
  }),

  show_comparison: z.object({
    value1: z.number(),
    value2: z.number(),
    duration: z.number().positive().optional(),
  }),

  highlight_range: z.object({
    from: z.number(),
    to: z.number(),
    color: z.string().optional(),
    label: z.string().optional(),
    duration: z.number().positive().optional(),
  }),

  clear_highlights: z.object({}),

  set_placement_mode: z.object({
    enabled: z.boolean().optional(),
  }),
} as const;

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type LineDefinition = z.infer<typeof LineDefinitionSchema>;
export type Point = z.infer<typeof PointSchema>;
export type Jump = z.infer<typeof JumpSchema>;
export type Region = z.infer<typeof RegionSchema>;

// Action types
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;
export type ActionParams<T extends ActionName> = z.infer<ActionSchemas[T]>;

/** Union of all number line actions with typed params */
export type NumberLineAction = ActionsToUnion<typeof actionSchemas>;
