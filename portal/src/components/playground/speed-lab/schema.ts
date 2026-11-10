/**
 * Speed Lab Zod Schemas
 *
 * All schemas for validation. TypeScript types are inferred from these.
 * NO manual type definitions needed - use z.infer<typeof Schema>.
 */

import { z } from 'zod';

import type { ActionsToUnion } from '../types';

// ============================================
// Pages - SINGLE SOURCE OF TRUTH
// ============================================

/**
 * All pages in the Speed Lab, in order.
 * This is the SINGLE SOURCE OF TRUTH for page IDs, order, and metadata.
 */
export const PAGES = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Learn what we'll explore today",
  },
  {
    id: "build",
    title: "Build Your Car",
    description: "Pick parts and tune your ride",
  },
  {
    id: "simulation",
    title: "Test Run",
    description: "See how your choices affect speed",
  },
  {
    id: "victory",
    title: "Results",
    description: "See how you did and what helped",
  },
  {
    id: "quiz",
    title: "Math Challenge",
    description: "Use fractions to solve car problems",
  },
] as const;

/** PageId type (inferred from PAGES) */
export type PageId = (typeof PAGES)[number]["id"];

/** Page IDs in order (derived from PAGES) */
export const PAGE_IDS = PAGES.map((p) => p.id) as PageId[];

/** Page order for navigation (same as PAGE_IDS, explicit name for clarity) */
export const PAGE_ORDER: PageId[] = PAGE_IDS;

// ============================================
// Derived Page Schemas
// ============================================

/** Page ID schema - derived from PAGES */
export const PageIdSchema = z.enum(
  PAGE_IDS as unknown as [string, ...string[]]
);

// ============================================
// Vehicle Stats Schema
// ============================================

export const VehicleStatsSchema = z.object({
  topSpeed: z.number(),
  acceleration: z.number(),
  handling: z.number(),
});

// ============================================
// Car Config Schema
// ============================================

export const CarConfigSchema = z.object({
  /** Weight adjustment in pounds (-500, 0, or +500 from vehicle's default) */
  weightAdjustment: z.number(),
  /** Tire type: 0 = slick (low friction), 1 = sport (medium), 2 = grip (high friction) */
  tireType: z.number().min(0).max(2),
});

// ============================================
// Stat Adjustments Schema
// ============================================

export const StatAdjustmentsSchema = z.object({
  topSpeed: z.number(),
  acceleration: z.number(),
  handling: z.number(),
});

// ============================================
// Quiz Progress Schema
// ============================================

export const QuizProgressSchema = z.object({
  answered: z.array(z.string()),
  correct: z.array(z.string()),
});

// ============================================
// Dynamic Question Schema
// ============================================

export const DynamicQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    })
  ),
  correctId: z.string(),
  explanation: z.string(),
  type: z.enum(["choice", "thisThat"]),
});

// ============================================
// Config Schema
// ============================================

export const ConfigSchema = z.object({
  /** Which pages are allowed in this lab instance */
  allowedPages: z.array(PageIdSchema),
  /** Track length for simulation (meters) */
  trackLength: z.number().default(1000),
  /** Whether user can switch vehicles */
  allowVehicleSwitch: z.boolean().default(true),
  /** Whether user can adjust stats */
  allowStatAdjustment: z.boolean().default(true),
  /** Whether quiz requires agent control or auto-progresses */
  agentControlledQuiz: z.boolean().default(true),
});

// ============================================
// State Schema
// ============================================

export const StateSchema = z.object({
  /** Current page being displayed */
  currentPage: PageIdSchema,
  /** ID of the selected vehicle */
  selectedVehicleId: z.string(),
  /** Car configuration (weight, tires) */
  carConfig: CarConfigSchema,
  /** Stat adjustments (topSpeed, acceleration, handling) */
  statAdjustments: StatAdjustmentsSchema,
  /** Quiz progress tracking */
  quizProgress: QuizProgressSchema,
  /** Current dynamic question from agent (if any) */
  dynamicQuestion: DynamicQuestionSchema.nullable(),
  /** Whether the quiz has ended */
  quizEnded: z.boolean(),
  /** Current hint text to display (if any) */
  hintText: z.string().nullable(),
});

// ============================================
// Action Schemas (Dictionary Pattern)
// ============================================

/**
 * Action schemas as a dictionary.
 * Keys are action names, values are Zod schemas for params.
 */
export const actionSchemas = {
  /** Navigate to a specific page in the lab */
  set_page: z.object({
    id: PageIdSchema,
  }),

  /** Send a quiz question to the student */
  set_quiz_question: z.object({
    id: z.string(),
    question: z.string(),
    options: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
      })
    ),
    correctId: z.string(),
    explanation: z.string().optional(),
    type: z.enum(["choice", "thisThat"]).optional(),
  }),
} as const;

// ============================================
// Inferred Types (export for use in components)
// ============================================

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type CarConfig = z.infer<typeof CarConfigSchema>;
export type StatAdjustments = z.infer<typeof StatAdjustmentsSchema>;
export type QuizProgress = z.infer<typeof QuizProgressSchema>;
export type DynamicQuestion = z.infer<typeof DynamicQuestionSchema>;
export type VehicleStats = z.infer<typeof VehicleStatsSchema>;

// Action types
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;
export type ActionParams<T extends ActionName> = z.infer<ActionSchemas[T]>;

/** Union of all speed lab actions with typed params */
export type SpeedLabAction = ActionsToUnion<typeof actionSchemas>;
