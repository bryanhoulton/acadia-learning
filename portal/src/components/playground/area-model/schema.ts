/**
 * Area Model Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from 'zod';

import type { ActionsToUnion } from '../types';

// ============================================
// Color Key Schema
// ============================================

export const AreaModelColorKeySchema = z.enum([
  "blue",
  "red",
  "green",
  "purple",
  "orange",
  "yellow",
  "overlap",
]);

// ============================================
// Config Schemas
// ============================================

export const AreaShapeTypeSchema = z.enum(["rectangle", "circle", "bar"]);

export const FractionDisplayFormatSchema = z.enum([
  "improper",
  "mixed",
  "decimal",
  "percent",
]);

export const ConfigSchema = z.object({
  shapeType: AreaShapeTypeSchema,

  // Display Options
  showFractionLabels: z.boolean(),
  fractionDisplay: FractionDisplayFormatSchema.optional(),
  showGridLines: z.boolean().optional(),
  showOverlap: z.boolean().optional(),
  overlapColor: AreaModelColorKeySchema.optional(),
  fixedDimensions: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  gridOverlay: z.object({
    enabled: z.boolean(),
    rows: z.number(),
    cols: z.number(),
  }),

  // Interaction Permissions
  allowPartitioning: z.boolean(),
  allowShading: z.boolean(),
  allowColorChange: z.boolean().optional(),
  allowAddingShapes: z.boolean().optional(),
  allowRemovingShapes: z.boolean().optional(),
  allowClear: z.boolean().optional(),
  allowDragShading: z.boolean().optional(),

  // Constraints
  multipleShapes: z.boolean(),
  maxShapes: z.number(),
  availableColors: z.array(AreaModelColorKeySchema).optional(),
  interactionMode: z.enum(["shade", "partition", "view"]).optional(),
});

// ============================================
// State Schemas
// ============================================

export const ShadedCellSchema = z.object({
  row: z.number(),
  col: z.number(),
  color: AreaModelColorKeySchema,
});

export const ShadingLayerSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: AreaModelColorKeySchema,
  rows: z.array(z.number()).nullable().optional(),
  cols: z.array(z.number()).nullable().optional(),
  segments: z.array(z.number()).optional(),
  opacity: z.number().optional(),
});

export const LabeledRegionSchema = z.object({
  id: z.string(),
  fromRow: z.number(),
  toRow: z.number(),
  fromCol: z.number(),
  toCol: z.number(),
  label: z.string(),
  sublabel: z.string().optional(),
  color: AreaModelColorKeySchema.optional(),
});

export const DimensionMarkerSchema = z.object({
  index: z.number(),
  span: z.number().optional(),
  label: z.string(),
});

export const AreaShapeSchema = z.object({
  id: z.string(),
  type: AreaShapeTypeSchema,
  partitions: z.object({
    horizontal: z.number(),
    vertical: z.number(),
  }),
  shadedCells: z.array(ShadedCellSchema).optional(),
  shadingLayers: z.array(ShadingLayerSchema).optional(),
  regions: z.array(LabeledRegionSchema).optional(),
  dimensionLabels: z
    .object({
      top: z.array(DimensionMarkerSchema).optional(),
      side: z.array(DimensionMarkerSchema).optional(),
    })
    .optional(),
  labels: z
    .object({
      top: z.string().optional(),
      side: z.string().optional(),
      shaded: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

export const StateSchema = z.object({
  shapes: z.array(AreaShapeSchema),
  activeColor: AreaModelColorKeySchema.optional(),
  activeShapeId: z.string().optional(),
});

// ============================================
// Action Schemas (Dictionary Pattern)
// ============================================

/**
 * Action schemas as a dictionary.
 * Keys are action names, values are Zod schemas for params.
 */
export const actionSchemas = {
  highlight_cell: z.object({
    shapeId: z.string(),
    row: z.number(),
    col: z.number(),
    color: z.string().optional(),
    duration: z.number().positive().optional(),
    label: z.string().optional(),
  }),

  highlight_region: z.object({
    shapeId: z.string(),
    cells: z.array(
      z.object({
        row: z.number(),
        col: z.number(),
      })
    ),
    color: z.string().optional(),
    duration: z.number().positive().optional(),
    label: z.string().optional(),
  }),

  pulse_shape: z.object({
    shapeId: z.string(),
    duration: z.number().positive().optional(),
    color: z.string().optional(),
  }),

  show_comparison: z.object({
    shapeId1: z.string(),
    shapeId2: z.string(),
    duration: z.number().positive().optional(),
    label: z.string().optional(),
  }),

  animate_fill: z.object({
    shapeId: z.string(),
    cells: z.array(
      z.object({
        row: z.number(),
        col: z.number(),
      })
    ),
    color: z.string(),
    stepDelay: z.number().positive().optional(),
    duration: z.number().positive().optional(),
  }),

  highlight_fraction: z.object({
    shapeId: z.string(),
    duration: z.number().positive().optional(),
  }),

  show_divider: z.object({
    shapeId: z.string(),
    orientation: z.enum(["horizontal", "vertical"]),
    position: z.number(),
    duration: z.number().positive().optional(),
    color: z.string().optional(),
  }),

  clear_highlights: z.object({}),

  set_brush_color: z.object({
    color: z.string(),
  }),
} as const;

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type AreaShape = z.infer<typeof AreaShapeSchema>;
export type ShadedCell = z.infer<typeof ShadedCellSchema>;
export type ShadingLayer = z.infer<typeof ShadingLayerSchema>;
export type LabeledRegion = z.infer<typeof LabeledRegionSchema>;
export type DimensionMarker = z.infer<typeof DimensionMarkerSchema>;
export type AreaModelColorKey = z.infer<typeof AreaModelColorKeySchema>;
export type AreaShapeType = z.infer<typeof AreaShapeTypeSchema>;
export type FractionDisplayFormat = z.infer<typeof FractionDisplayFormatSchema>;

// Action types
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;
export type ActionParams<T extends ActionName> = z.infer<ActionSchemas[T]>;

/** Union of all area model actions with typed params */
export type AreaModelAction = ActionsToUnion<typeof actionSchemas>;
