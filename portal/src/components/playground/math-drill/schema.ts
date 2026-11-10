import { z } from "zod";

import type { ActionsToUnion } from "../types";

export const OperationSchema = z.enum([
  "addition",
  "subtraction",
  "multiplication",
  "division",
]);

export const NumberTypeSchema = z.enum(["integer", "fraction", "mixed"]);

export const FractionSchema = z.object({
  whole: z.number().int().optional(),
  numerator: z.number().int(),
  denominator: z.number().int().positive(),
});

export const OperandSchema = z.union([z.number(), FractionSchema]);

export const FractionConfigSchema = z.object({
  maxDenominator: z.number().int().min(2).max(100).default(12),
  allowImproper: z.boolean().default(false),
  requireSimplified: z.boolean().default(true),
  sameDenominator: z.boolean().default(true),
});

export const MultipleChoiceConfigSchema = z.object({
  numOptions: z.number().int().min(2).max(6).default(4),
  distractorStrategy: z.enum(["random", "near-miss"]).default("near-miss"),
});

export const ConfigSchema = z.object({
  operations: z.array(OperationSchema).min(1),
  numberTypes: z.array(NumberTypeSchema).min(1),
  operandRange: z.object({
    min: z.number().int().min(0).default(0),
    max: z.number().int().min(1).default(12),
  }),
  fractionConfig: FractionConfigSchema.optional(),
  inputType: z.enum(["type", "multiple-choice"]).default("type"),
  multipleChoiceConfig: MultipleChoiceConfigSchema.optional(),
  problemCount: z.number().int().min(1).max(100).optional(),
  timeLimitSeconds: z.number().int().min(10).max(600).optional(),
});

export const ProblemSchema = z.object({
  id: z.string(),
  operand1: OperandSchema,
  operand2: OperandSchema,
  operation: OperationSchema,
  correctAnswer: OperandSchema,
  options: z.array(OperandSchema).optional(),
});

export const ResultEntrySchema = z.object({
  problemId: z.string(),
  userAnswer: OperandSchema,
  correct: z.boolean(),
  answeredAt: z.number(),
});

export const StateSchema = z.object({
  problems: z.array(ProblemSchema).default([]),
  currentIndex: z.number().int().min(0).default(0),
  results: z.array(ResultEntrySchema).default([]),
  completed: z.boolean().default(false),
  startedAt: z.number().nullable().default(null),
  completedAt: z.number().nullable().default(null),
});

export const actionSchemas = {
  get_results: z.object({}),
} as const;

export const DrillCompleteEventSchema = z.object({
  type: z.literal("drill_complete"),
  correct: z.number().int(),
  total: z.number().int(),
  accuracy: z.number(),
  timeElapsed: z.number(),
});

export const ResultsResponseEventSchema = z.object({
  type: z.literal("results_response"),
  completed: z.boolean(),
  correct: z.number().int(),
  total: z.number().int(),
  accuracy: z.number(),
  timeElapsed: z.number(),
  results: z.array(
    z.object({
      problem: z.string(),
      userAnswer: z.string(),
      correctAnswer: z.string(),
      correct: z.boolean(),
    })
  ),
});

export const EventSchema = z.discriminatedUnion("type", [
  DrillCompleteEventSchema,
  ResultsResponseEventSchema,
]);

export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;
export type MathDrillAction = ActionsToUnion<typeof actionSchemas>;
export type Operation = z.infer<typeof OperationSchema>;
export type NumberType = z.infer<typeof NumberTypeSchema>;
export type Fraction = z.infer<typeof FractionSchema>;
export type Operand = z.infer<typeof OperandSchema>;
export type Problem = z.infer<typeof ProblemSchema>;
export type ResultEntry = z.infer<typeof ResultEntrySchema>;
export type FractionConfig = z.infer<typeof FractionConfigSchema>;
export type MultipleChoiceConfig = z.infer<typeof MultipleChoiceConfigSchema>;
export type Event = z.infer<typeof EventSchema>;

export function isFraction(value: Operand): value is Fraction {
  return (
    typeof value === "object" && "numerator" in value && "denominator" in value
  );
}
