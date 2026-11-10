/**
 * Canvas Playground Schema
 *
 * Zod schemas for the canvas (block-based) playground.
 * This is the source of truth for block types.
 */

import { z } from 'zod';

// ============================================
// Text Block
// ============================================

export const TextBlockSchema = z.object({
  type: z.literal("text").describe("Block type identifier"),
  text: z
    .string()
    .min(1)
    .describe(
      "The text content to display. Supports Markdown and LaTeX between $...$"
    ),
  size: z
    .number()
    .min(1)
    .default(1)
    .optional()
    .describe("Scale factor (1 = normal, 2 = double)"),
});

// ============================================
// Math Block
// ============================================

export const MathBlockSchema = z.object({
  type: z.literal("math").describe("Block type identifier"),
  latex: z.string().min(1).describe("The LaTeX content to render"),
  size: z
    .number()
    .min(1)
    .default(1)
    .optional()
    .describe("Scale factor (1 = normal, 2 = double)"),
});

// ============================================
// Question Block
// ============================================

export const QuestionBlockSchema = z.object({
  type: z.literal("question").describe("Block type identifier"),
  question: z
    .string()
    .min(1)
    .describe("The question text. Supports LaTeX inline with $...$"),
  placeholder: z
    .string()
    .default("")
    .optional()
    .describe("Placeholder text for the input"),
  user_answer: z.string().default("").optional().describe("The user's answer"),
  correct_answer: z
    .string()
    .default("")
    .optional()
    .describe("The correct answer"),
});

// ============================================
// Multiple Choice Block
// ============================================

export const MultipleChoiceBlockSchema = z.object({
  type: z.literal("multiple_choice").describe("Block type identifier"),
  question: z
    .string()
    .min(1)
    .describe("The question text. Supports LaTeX inline with $...$"),
  options: z.array(z.string()).min(2).describe("Answer options (at least 2)"),
  correct_answer: z.string().min(1).describe("The correct answer from options"),
  user_answer: z
    .string()
    .default("")
    .optional()
    .describe("The user's selected answer"),
});

// ============================================
// Graph Block
// ============================================

export const EquationSchema = z.object({
  equation: z
    .string()
    .min(1)
    .describe("LaTeX equation to plot (e.g., f(x)=x^2)"),
  color: z.string().min(1).describe("CSS color for the equation"),
});

export const PointSchema = z.object({
  x: z.number().describe("X coordinate"),
  y: z.number().describe("Y coordinate"),
  label: z.string().nullable().optional().describe("Label for the point"),
  color: z.string().min(1).describe("CSS color for the point"),
});

export const GraphBlockSchema = z.object({
  type: z.literal("graph").describe("Block type identifier"),
  equations: z
    .array(EquationSchema)
    .default([])
    .optional()
    .describe("Equations to plot"),
  points: z
    .array(PointSchema)
    .default([])
    .optional()
    .describe("Points to display"),
  viewport_left: z.number().describe("Left viewport boundary"),
  viewport_right: z.number().describe("Right viewport boundary"),
  viewport_top: z.number().describe("Top viewport boundary"),
  viewport_bottom: z.number().describe("Bottom viewport boundary"),
});

// ============================================
// Table Block
// ============================================

export const TableBlockSchema = z.object({
  type: z.literal("table").describe("Block type identifier"),
  headers: z.array(z.string()).min(1).describe("Column headers"),
  rows: z.array(z.array(z.string())).min(1).describe("Table rows"),
});

// ============================================
// Timeline Block
// ============================================

export const TimelineItemSchema = z.object({
  title: z.string().min(1).describe("Title of the timeline item"),
  description: z.string().default("").optional().describe("Description"),
  date: z.string().min(1).describe("Date or time label"),
  filled: z.boolean().default(false).optional().describe("Whether completed"),
});

export const TimelineBlockSchema = z.object({
  type: z.literal("timeline").describe("Block type identifier"),
  title: z.string().default("").optional().describe("Timeline title"),
  color: z.string().default("blue").optional().describe("CSS color"),
  items: z.array(TimelineItemSchema).min(1).describe("Timeline items"),
});

// ============================================
// Number Line Block (canvas version - simple)
// ============================================

export const NumberLineMarkSchema = z.object({
  value: z.number().describe("Position on the number line"),
  label: z.string().nullable().optional().describe("Label for the mark"),
  color: z.string().default("blue").optional().describe("CSS color"),
  size: z
    .enum(["sm", "md", "lg"])
    .default("md")
    .optional()
    .describe("Size of the mark"),
});

export const NumberLineSegmentSchema = z.object({
  start: z.number().describe("Start position"),
  end: z.number().describe("End position"),
  label: z.string().nullable().optional().describe("Label"),
  color: z.string().default("blue").optional().describe("CSS color"),
  startType: z.enum(["open", "closed"]).default("open").optional(),
  endType: z.enum(["open", "closed"]).default("closed").optional(),
});

export const NumberLineRaySchema = z.object({
  value: z.number().describe("Start position"),
  direction: z.enum(["left", "right"]).describe("Direction of the ray"),
  label: z.string().nullable().optional().describe("Label"),
  color: z.string().default("blue").optional().describe("CSS color"),
  type: z.enum(["open", "closed"]).default("open").optional(),
});

export const NumberLineBlockSchema = z.object({
  type: z.literal("number_line").describe("Block type identifier"),
  min: z.number().describe("Minimum value"),
  max: z.number().describe("Maximum value"),
  step: z.number().nullable().optional().describe("Step size for tick marks"),
  marks: z.array(NumberLineMarkSchema).default([]).optional(),
  segments: z.array(NumberLineSegmentSchema).default([]).optional(),
  rays: z.array(NumberLineRaySchema).default([]).optional(),
  title: z.string().nullable().optional().describe("Title/label"),
});

// ============================================
// Fraction Block
// ============================================

export const FractionSchema = z.object({
  numerator: z.number().describe("Numerator"),
  denominator: z.number().describe("Denominator"),
  fillColor: z.string().default("blue").optional().describe("Fill color"),
});

export const FractionBlockSchema = z.object({
  type: z.literal("fraction").describe("Block type identifier"),
  fractions: z.array(FractionSchema).describe("Fractions to display"),
  diagram_type: z.enum(["pie", "grid"]).default("grid").optional(),
  show_label: z.boolean().default(true).optional(),
});

// ============================================
// Combined Block Data Schema (discriminated union)
// ============================================

export const BlockDataSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  MathBlockSchema,
  QuestionBlockSchema,
  MultipleChoiceBlockSchema,
  GraphBlockSchema,
  TableBlockSchema,
  TimelineBlockSchema,
  NumberLineBlockSchema,
  FractionBlockSchema,
]);

// ============================================
// Block and Canvas Schemas
// ============================================

export const BlockSchema = z.object({
  data: BlockDataSchema,
  index: z.number().describe("Index of the block in the canvas"),
});

// Config schema - canvas has no config options
export const ConfigSchema = z.object({}).passthrough();

// State schema - array of blocks
export const StateSchema = z.object({
  blocks: z.array(BlockSchema),
});

// Canvas has no actions - it's a display-only wrapper
export const actionSchemas = null;

// ============================================
// Inferred Types
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;

// Block types
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type MathBlock = z.infer<typeof MathBlockSchema>;
export type QuestionBlock = z.infer<typeof QuestionBlockSchema>;
export type MultipleChoiceBlock = z.infer<typeof MultipleChoiceBlockSchema>;
export type Equation = z.infer<typeof EquationSchema>;
export type Point = z.infer<typeof PointSchema>;
export type GraphBlock = z.infer<typeof GraphBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type TimelineBlock = z.infer<typeof TimelineBlockSchema>;
export type NumberLineMark = z.infer<typeof NumberLineMarkSchema>;
export type NumberLineSegment = z.infer<typeof NumberLineSegmentSchema>;
export type NumberLineRay = z.infer<typeof NumberLineRaySchema>;
export type NumberLineBlock = z.infer<typeof NumberLineBlockSchema>;
export type Fraction = z.infer<typeof FractionSchema>;
export type FractionBlock = z.infer<typeof FractionBlockSchema>;
export type BlockData = z.infer<typeof BlockDataSchema>;
export type Block = z.infer<typeof BlockSchema>;
