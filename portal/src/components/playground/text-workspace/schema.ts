/**
 * Text Workspace Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from 'zod';

// ============================================
// Enum Schemas
// ============================================

export const TextModeSchema = z.enum(["reading", "writing", "editing"]);
export const ReadingToolSchema = z.enum(["highlight"]);
export const WritingToolSchema = z.enum([
  "outline",
  "spellcheck",
  "word-count",
]);
export const ResponseTypeSchema = z.enum([
  "multiple-choice",
  "short-answer",
  "evidence-based",
]);
export const WritingTemplateSchema = z.enum(["paragraph", "essay", "summary"]);

// ============================================
// Config Schemas
// ============================================

export const PassageSchema = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  source: z.string().optional(),
});

export const StructuredWritingSchema = z.object({
  enabled: z.boolean(),
  template: WritingTemplateSchema,
});

export const ConfigSchema = z.object({
  mode: TextModeSchema,
  passage: PassageSchema.optional(),
  readingTools: z.array(ReadingToolSchema).default([]),
  writingTools: z.array(WritingToolSchema).default([]),
  responseTypes: z.array(ResponseTypeSchema).default([]),
  structuredWriting: StructuredWritingSchema,
});

// ============================================
// State Schemas
// ============================================

export const TextHighlightSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  color: z.string(),
  note: z.string().optional(),
});

export const TextAnnotationSchema = z.object({
  id: z.string(),
  position: z.number(),
  text: z.string(),
});

export const TextResponseSchema = z.object({
  questionId: z.string(),
  answer: z.string(),
  correct: z.boolean().optional(),
});

export const CompositionSchema = z.object({
  outline: z.array(z.string()).default([]),
  draft: z.string().default(""),
});

export const StateSchema = z.object({
  highlights: z.array(TextHighlightSchema).default([]),
  annotations: z.array(TextAnnotationSchema).default([]),
  responses: z.array(TextResponseSchema).default([]),
  composition: CompositionSchema.optional(),
});

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type TextMode = z.infer<typeof TextModeSchema>;
export type ReadingTool = z.infer<typeof ReadingToolSchema>;
export type WritingTool = z.infer<typeof WritingToolSchema>;
export type ResponseType = z.infer<typeof ResponseTypeSchema>;
export type WritingTemplate = z.infer<typeof WritingTemplateSchema>;
export type Passage = z.infer<typeof PassageSchema>;
export type StructuredWriting = z.infer<typeof StructuredWritingSchema>;
export type TextHighlight = z.infer<typeof TextHighlightSchema>;
export type TextAnnotation = z.infer<typeof TextAnnotationSchema>;
export type TextResponse = z.infer<typeof TextResponseSchema>;
export type Composition = z.infer<typeof CompositionSchema>;
