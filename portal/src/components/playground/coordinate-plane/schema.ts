/**
 * Coordinate Plane Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from "zod";

// ============================================
// State Element Schemas
// ============================================

export const CoordinatePointSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
  draggable: z.boolean().optional(),
});

export const CoordinateFunctionSchema = z.object({
  id: z.string(),
  equation: z.string(),
  color: z.string().optional(),
  visible: z.boolean().optional(),
  domain: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
});

export const CoordinateLineSchema = z.object({
  id: z.string(),
  points: z.array(z.tuple([z.number(), z.number()])),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  color: z.string().optional(),
});

export const CoordinateRegionSchema = z.object({
  id: z.string(),
  inequality: z.string(),
  shaded: z.boolean(),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

export const CoordinateMarkerSchema = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
});

// ============================================
// Config Schema
// ============================================

export const ConfigSchema = z.object({
  xRange: z.tuple([z.number(), z.number()]),
  yRange: z.tuple([z.number(), z.number()]),
  gridEnabled: z.boolean(),
  axisLabels: z.object({ x: z.string(), y: z.string() }),
  snapToGrid: z.boolean(),
  allowPointPlot: z.boolean(),
  allowPointRemoval: z.boolean().optional(),
  showCoordinates: z.boolean(),
  pedagogicalTools: z
    .object({
      traceMode: z.boolean().optional(),
      showIntercepts: z.boolean().optional(),
      showIntersections: z.boolean().optional(),
    })
    .optional(),
  gridConfig: z
    .object({
      majorInterval: z.number().optional(),
      showMinorGrid: z.boolean().optional(),
      minorInterval: z.number().optional(),
    })
    .optional(),
});

// ============================================
// State Schema
// ============================================

export const StateSchema = z.object({
  points: z.array(CoordinatePointSchema),
  functions: z.array(CoordinateFunctionSchema),
  lines: z.array(CoordinateLineSchema),
  regions: z.array(CoordinateRegionSchema),
  markers: z
    .object({
      intersections: z.array(CoordinateMarkerSchema).optional(),
      intercepts: z.array(CoordinateMarkerSchema).optional(),
    })
    .optional(),
  activeTool: z.enum(["select", "point", "trace"]).optional(),
});

// ============================================
// Action Schemas (Dictionary Pattern)
// ============================================

/**
 * Action schemas as a dictionary.
 * Currently empty - actions are disabled for coordinate plane.
 */
export const actionSchemas = {} as const;

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type CoordinatePoint = z.infer<typeof CoordinatePointSchema>;
export type CoordinateFunction = z.infer<typeof CoordinateFunctionSchema>;
export type CoordinateLine = z.infer<typeof CoordinateLineSchema>;
export type CoordinateRegion = z.infer<typeof CoordinateRegionSchema>;
export type CoordinateMarker = z.infer<typeof CoordinateMarkerSchema>;

// Action types (empty - actions disabled)
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;

/** Union of all coordinate plane actions (empty - actions disabled) */
export type CoordinatePlaneAction = never;
