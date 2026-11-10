/**
 * Playground Type System
 *
 * This file defines the core generic types for the playground system.
 * Every playground implements PlaygroundDefinition with strongly-typed
 * schemas, and all TypeScript types are inferred from Zod schemas.
 */

import type { ComponentType } from "react";

import type { z } from "zod";

import type {
  ActionDoc,
  ConfigurationTips,
  ExampleConfiguration,
  ExampleScenario,
  GradeRange,
  InteractionPreset,
  PropertyGroupDoc,
  VisualDetails,
} from "./guide.types";

// ============================================
// Action Schema Types
// ============================================

/**
 * Dictionary of action schemas.
 * Keys are action names, values are Zod schemas for the action's params.
 *
 * @example
 * const actions = {
 *   highlight_value: z.object({ value: z.number(), color: z.string().optional() }),
 *   animate_jump: z.object({ from: z.number(), to: z.number() }),
 * } satisfies ActionSchemas;
 */
export type ActionSchemas = Record<string, z.ZodType>;

/**
 * Infer the params type for a specific action from the action schemas.
 */
export type InferActionParams<
  TActions extends ActionSchemas,
  TActionName extends keyof TActions,
> = z.infer<TActions[TActionName]>;

/**
 * Union type of all action names from action schemas.
 */
export type ActionName<TActions extends ActionSchemas> = keyof TActions &
  string;

/**
 * A typed action with name and params.
 */
export interface TypedAction<
  TActions extends ActionSchemas,
  TName extends ActionName<TActions> = ActionName<TActions>,
> {
  action: TName;
  params: z.infer<TActions[TName]>;
}

/**
 * Convert an action schemas dictionary into a discriminated union of typed actions.
 *
 * This maps each key in the dictionary to a typed action object, then extracts
 * all values as a union type.
 *
 * @example
 * const actionSchemas = {
 *   highlight_value: z.object({ value: z.number(), color: z.string().optional() }),
 *   animate_jump: z.object({ from: z.number(), to: z.number() }),
 * } as const;
 *
 * type MyAction = ActionsToUnion<typeof actionSchemas>;
 * // = { action: "highlight_value"; params: { value: number; color?: string } }
 * //   | { action: "animate_jump"; params: { from: number; to: number } }
 */
export type ActionsToUnion<TActions extends Record<string, z.ZodType>> = {
  [K in keyof TActions]: {
    action: K;
    params: z.infer<TActions[K]>;
  };
}[keyof TActions];

// ============================================
// Guide Content
// ============================================

/**
 * PlaygroundGuideContent contains documentation for AI agents.
 * This is parameterized by the config/state types for example configurations.
 */
export interface PlaygroundGuideContent<TConfig = unknown, TState = unknown> {
  gradeRange: GradeRange;
  interactionModel: string;
  cognitiveLevel: string;
  bestFor: string[];
  whenToUse: string[];
  whenNotToUse: string[];
  exampleScenarios: ExampleScenario[];
  visualDetails: VisualDetails;
  configSchema: {
    core: PropertyGroupDoc;
    displayOptions: PropertyGroupDoc;
    interactionPermissions: PropertyGroupDoc;
    constraints?: PropertyGroupDoc;
  };
  stateSchema: Record<string, PropertyGroupDoc>;
  configurationTips: ConfigurationTips;
  interactionPresets: Record<string, InteractionPreset>;
  exampleConfigurations: ExampleConfiguration<{
    config: TConfig;
    state: TState;
  }>[];
  commonMistakes: string[];
  actions?: Record<string, ActionDoc>;
}

// ============================================
// Component Props
// ============================================

/**
 * Loose action type for runtime/generic contexts.
 * Used when passing actions through the PlaygroundRenderer.
 */
export interface LooseAction {
  action: string;
  params: Record<string, unknown>;
}

/**
 * Loose action payload for runtime/generic contexts.
 */
export interface LooseActionPayload {
  actions: LooseAction[];
}

/**
 * Generic playground event.
 * All playgrounds can emit events with a type and arbitrary data.
 * This provides a consistent interface for playground → agent communication.
 */
export interface PlaygroundEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Props that playground components receive.
 * Strongly typed based on the playground's schemas.
 */
export interface PlaygroundComponentProps<
  TConfig,
  TState,
  TActions extends ActionSchemas | null = null,
> {
  config: TConfig;
  state: TState;
  onChange?: (state: TState) => void;
  onEvent?: (event: PlaygroundEvent) => void;
  pendingAction?: TActions extends ActionSchemas
    ? { actions: TypedAction<TActions>[] } | null
    : null;
  onActionComplete?: () => void;
}

// ============================================
// Preset
// ============================================

/**
 * A named, reusable configuration for a playground.
 * Strongly typed based on the playground's config and state types.
 */
export interface PlaygroundPreset<TConfig, TState> {
  id: string;
  name: string;
  description: string;
  grades?: string;
  tags?: string[];
  config: TConfig;
  state: TState;
}

// ============================================
// Playground Definition
// ============================================

/**
 * The complete definition of a playground.
 *
 * This is the SINGLE SOURCE OF TRUTH for a playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 *
 * @template TId - Literal string type for the playground ID
 * @template TConfigSchema - Zod schema for configuration
 * @template TStateSchema - Zod schema for state
 * @template TActions - Dictionary of action name -> params schema, or null
 */
export interface PlaygroundDefinition<
  TId extends string,
  TConfigSchema extends z.ZodType,
  TStateSchema extends z.ZodType,
  TActions extends ActionSchemas | null = null,
> {
  // === Identity ===
  id: TId;
  name: string;
  icon: string;
  description: string;
  grades: string;
  enabled: boolean;

  // === Schemas ===
  schemas: {
    config: TConfigSchema;
    state: TStateSchema;
    actions: TActions;
  };

  // === Defaults ===
  defaultConfig: z.infer<TConfigSchema>;
  defaultState: z.infer<TStateSchema>;

  // === Presets ===
  presets: PlaygroundPreset<z.infer<TConfigSchema>, z.infer<TStateSchema>>[];

  // === Component ===
  component: ComponentType<
    PlaygroundComponentProps<
      z.infer<TConfigSchema>,
      z.infer<TStateSchema>,
      TActions
    >
  >;

  // === Guide ===
  guide: PlaygroundGuideContent<z.infer<TConfigSchema>, z.infer<TStateSchema>>;
}

// ============================================
// Type Utilities
// ============================================

/**
 * Infer the config type from a PlaygroundDefinition.
 */
export type InferConfig<T> =
  T extends PlaygroundDefinition<
    string,
    infer TConfigSchema extends z.ZodType,
    z.ZodType,
    ActionSchemas | null
  >
    ? z.infer<TConfigSchema>
    : T extends {
          schemas: { config: infer TConfigSchema extends z.ZodType };
        }
      ? z.infer<TConfigSchema>
      : never;

/**
 * Infer the state type from a PlaygroundDefinition.
 */
export type InferState<T> =
  T extends PlaygroundDefinition<
    string,
    z.ZodType,
    infer TStateSchema extends z.ZodType,
    ActionSchemas | null
  >
    ? z.infer<TStateSchema>
    : T extends {
          schemas: { state: infer TStateSchema extends z.ZodType };
        }
      ? z.infer<TStateSchema>
      : never;

/**
 * Infer the ID type from a PlaygroundDefinition.
 */
export type InferId<T> =
  T extends PlaygroundDefinition<
    infer TId extends string,
    z.ZodType,
    z.ZodType,
    ActionSchemas | null
  >
    ? TId
    : T extends { id: infer TId extends string }
      ? TId
      : never;

/**
 * Infer the actions schema type from a PlaygroundDefinition.
 */
export type InferActions<T> =
  T extends PlaygroundDefinition<
    string,
    z.ZodType,
    z.ZodType,
    infer TActions extends ActionSchemas | null
  >
    ? TActions
    : T extends { schemas: { actions: infer TActions } }
      ? TActions
      : never;

/**
 * Infer the action payload type from a PlaygroundDefinition.
 * Returns { actions: TypedAction<TActions>[] } | null for playgrounds with actions,
 * or null for playgrounds without actions.
 */
export type InferActionPayload<T> =
  InferActions<T> extends ActionSchemas
    ? { actions: TypedAction<InferActions<T>>[] } | null
    : null;

// ============================================
// Helper Function
// ============================================

/**
 * Helper to define a playground with proper type inference.
 * Use this instead of manually typing the definition object.
 *
 * @example
 * export const numberLineDefinition = definePlayground({
 *   id: "number-line",
 *   schemas: { config: ConfigSchema, state: StateSchema, actions: actionSchemas },
 *   // ... TypeScript infers all types from schemas
 * });
 */
export function definePlayground<
  TId extends string,
  TConfigSchema extends z.ZodType,
  TStateSchema extends z.ZodType,
  TActions extends ActionSchemas | null = null,
>(
  definition: PlaygroundDefinition<TId, TConfigSchema, TStateSchema, TActions>
): PlaygroundDefinition<TId, TConfigSchema, TStateSchema, TActions> {
  return definition;
}

// ============================================
// Playground Metadata (for UI)
// ============================================

/**
 * Metadata extracted from a playground definition for UI display.
 */
export interface PlaygroundMetadata {
  id: string;
  name: string;
  icon: string;
  description: string;
  grades: string;
}
