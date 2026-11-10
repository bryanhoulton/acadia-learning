/**
 * Flowchart Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from 'zod';

import type { ActionsToUnion } from '../types';

// ============================================
// Config Schemas
// ============================================

export const FlowchartDirectionSchema = z.enum(["TB", "LR", "BT", "RL"]);

export const ConfigSchema = z.object({
  direction: FlowchartDirectionSchema.default("TB"),
  allowNodeSelection: z.boolean().default(true),
  allowMultiSelect: z.boolean().default(false),
  showEdgeLabels: z.boolean().default(true),
});

// ============================================
// State Schemas
// ============================================

export const FlowchartNodeShapeSchema = z.enum([
  "rectangle",
  "diamond",
  "circle",
  "pill",
]);

export const FlowchartEdgeStyleSchema = z.enum(["solid", "dashed"]);

export const FlowchartNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  shape: FlowchartNodeShapeSchema.default("rectangle"),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const FlowchartEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  style: FlowchartEdgeStyleSchema.optional(),
  color: z.string().optional(),
});

export const StateSchema = z.object({
  nodes: z.array(FlowchartNodeSchema),
  edges: z.array(FlowchartEdgeSchema),
  selectedNodeIds: z.array(z.string()).default([]),
});

// ============================================
// Action Schemas (Dictionary Pattern)
// ============================================

/**
 * Action schemas as a dictionary.
 * Keys are action names, values are Zod schemas for params.
 */
export const actionSchemas = {
  highlight_node: z.object({
    nodeId: z.string(),
    duration: z.number().positive().optional(),
  }),

  highlight_path: z.object({
    nodeIds: z.array(z.string()),
    duration: z.number().positive().optional(),
  }),

  clear_highlights: z.object({}),
} as const;

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type FlowchartNode = z.infer<typeof FlowchartNodeSchema>;
export type FlowchartEdge = z.infer<typeof FlowchartEdgeSchema>;
export type FlowchartDirection = z.infer<typeof FlowchartDirectionSchema>;
export type FlowchartNodeShape = z.infer<typeof FlowchartNodeShapeSchema>;
export type FlowchartEdgeStyle = z.infer<typeof FlowchartEdgeStyleSchema>;

// Action types
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;
export type ActionParams<T extends ActionName> = z.infer<ActionSchemas[T]>;

/** Union of all flowchart actions with typed params */
export type FlowchartAction = ActionsToUnion<typeof actionSchemas>;
