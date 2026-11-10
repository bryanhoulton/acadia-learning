/**
 * Playground Registry
 *
 * Central registry that imports all playground definitions and exports
 * derived values for use throughout the application.
 *
 * This is the SINGLE SOURCE OF TRUTH for all playground information.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================
// Import all playground definitions
// ============================================
import { areaModelDefinition } from './area-model/definition';
import { canvasDefinition } from './canvas/definition';
import { columnMathDefinition } from './column-math/definition';
import { coordinatePlaneDefinition } from './coordinate-plane/definition';
import { flowchartDefinition } from './flowchart/definition';
import { mathDrillDefinition } from './math-drill/definition';
import { numberLineDefinition } from './number-line/definition';
import { speedLabDefinition } from './speed-lab/definition';
import { textWorkspaceDefinition } from './text-workspace/definition';
import type {
  InferActionPayload,
  InferConfig,
  InferState,
} from './types';

// ============================================
// Registry Types
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

// ============================================
// The Registry
// ============================================

/**
 * The central playground registry.
 * All playground definitions are collected here.
 */
export const PLAYGROUND_REGISTRY = {
  canvas: canvasDefinition,
  "number-line": numberLineDefinition,
  "area-model": areaModelDefinition,
  "coordinate-plane": coordinatePlaneDefinition,
  "text-workspace": textWorkspaceDefinition,
  "math-drill": mathDrillDefinition,
  flowchart: flowchartDefinition,
  "column-math": columnMathDefinition,
  "speed-lab": speedLabDefinition,
} as const;

// ============================================
// Derived Types
// ============================================

/**
 * Union of all playground IDs (e.g., "canvas" | "number-line" | ...)
 */
export type PlaygroundId = keyof typeof PLAYGROUND_REGISTRY;

/**
 * Alias for PlaygroundId for backward compatibility
 */
export type PlaygroundType = PlaygroundId;

/**
 * Get the definition type for a specific playground ID
 */
export type PlaygroundDefinitionOf<T extends PlaygroundId> =
  (typeof PLAYGROUND_REGISTRY)[T];

/**
 * Discriminated union of all playground objects.
 * Each playground has { type, config, state, pendingAction } with proper typing.
 * The pendingAction type is derived from each playground's action schema.
 */
export type Playground = {
  [K in PlaygroundId]: {
    type: K;
    config: InferConfig<(typeof PLAYGROUND_REGISTRY)[K]>;
    state: InferState<(typeof PLAYGROUND_REGISTRY)[K]>;
    pendingAction?: InferActionPayload<(typeof PLAYGROUND_REGISTRY)[K]>;
  };
}[PlaygroundId];

/**
 * Get the config type for a specific playground
 */
export type PlaygroundConfigOf<T extends PlaygroundId> = InferConfig<
  (typeof PLAYGROUND_REGISTRY)[T]
>;

/**
 * Get the state type for a specific playground
 */
export type PlaygroundStateOf<T extends PlaygroundId> = InferState<
  (typeof PLAYGROUND_REGISTRY)[T]
>;

/**
 * Get the action payload type for a specific playground
 */
export type PlaygroundActionPayloadOf<T extends PlaygroundId> =
  InferActionPayload<(typeof PLAYGROUND_REGISTRY)[T]>;

// ============================================
// Derived Values
// ============================================

/**
 * Array of all playground IDs
 */
export const PLAYGROUND_IDS = Object.keys(
  PLAYGROUND_REGISTRY
) as PlaygroundId[];

/**
 * Array of all enabled playground IDs (when playgrounds_enabled = true)
 */
export const ENABLED_PLAYGROUND_IDS = Object.entries(PLAYGROUND_REGISTRY)
  .filter(([, def]) => def.enabled)
  .map(([id]) => id) as PlaygroundId[];

/**
 * Metadata for all playgrounds (for UI display)
 */
export const PLAYGROUND_METADATA: PlaygroundMetadata[] = Object.values(
  PLAYGROUND_REGISTRY
).map((def) => ({
  id: def.id,
  name: def.name,
  icon: def.icon,
  description: def.description,
  grades: def.grades,
}));

// ============================================
// Accessor Functions
// ============================================

/**
 * Get a playground definition by ID
 */
export function getPlaygroundDefinition<T extends PlaygroundId>(
  id: T
): PlaygroundDefinitionOf<T> {
  return PLAYGROUND_REGISTRY[id] as PlaygroundDefinitionOf<T>;
}

/**
 * Get playground metadata by ID
 */
export function getPlaygroundMetadata(id: PlaygroundId): PlaygroundMetadata {
  const def = PLAYGROUND_REGISTRY[id];
  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    description: def.description,
    grades: def.grades,
  };
}

/**
 * Check if a string is a valid playground ID
 */
export function isValidPlaygroundId(id: string): id is PlaygroundId {
  return id in PLAYGROUND_REGISTRY;
}

// ============================================
// Schema Utilities
// ============================================

/**
 * Get the Zod schemas for a playground
 */
export function getPlaygroundSchemas(id: PlaygroundId) {
  const def = PLAYGROUND_REGISTRY[id];
  return def.schemas;
}

/**
 * Get JSON Schema for a playground (for agent validation)
 */
export function getPlaygroundJsonSchema(id: PlaygroundId) {
  const schemas = getPlaygroundSchemas(id);
  return {
    configSchema: zodToJsonSchema(schemas.config),
    stateSchema: zodToJsonSchema(schemas.state),
    actionsSchema: schemas.actions
      ? Object.fromEntries(
          Object.entries(schemas.actions).map(([key, value]) => [
            key,
            zodToJsonSchema(value),
          ])
        )
      : undefined,
  };
}

/**
 * Get all playground JSON schemas
 */
export function getAllPlaygroundJsonSchemas() {
  const result: Record<
    string,
    { configSchema: object; stateSchema: object; actionsSchema?: object }
  > = {};
  for (const id of PLAYGROUND_IDS) {
    result[id] = getPlaygroundJsonSchema(id);
  }
  return result;
}

// ============================================
// Guide Utilities
// ============================================

/**
 * Serialize a guide for transmission to agent.
 * Combines definition metadata with guide content.
 */
export function serializeGuide(id: PlaygroundId) {
  const def = PLAYGROUND_REGISTRY[id];
  const jsonSchemas = getPlaygroundJsonSchema(id);

  return {
    // Identity from definition
    id: def.id,
    name: def.name,
    icon: def.icon,
    // Grade range from guide
    gradeRange: def.guide.gradeRange,
    // Guide content
    interactionModel: def.guide.interactionModel,
    cognitiveLevel: def.guide.cognitiveLevel,
    bestFor: def.guide.bestFor,
    whenToUse: def.guide.whenToUse,
    whenNotToUse: def.guide.whenNotToUse,
    exampleScenarios: def.guide.exampleScenarios,
    visualDetails: def.guide.visualDetails,
    configSchema: def.guide.configSchema,
    stateSchema: def.guide.stateSchema,
    jsonSchema: jsonSchemas,
    configurationTips: def.guide.configurationTips,
    interactionPresets: def.guide.interactionPresets,
    exampleConfigurations: def.guide.exampleConfigurations,
    commonMistakes: def.guide.commonMistakes,
    actions: def.guide.actions,
  };
}

/**
 * Get all serialized guides
 */
export function getAllSerializedGuides() {
  return PLAYGROUND_IDS.map(serializeGuide);
}

/**
 * Get guides payload for agent (filtered by enabled flags)
 */
export function getGuidesPayload(
  options: {
    playgroundsEnabled?: boolean;
    speedLabEnabled?: boolean;
  } = {}
) {
  const { playgroundsEnabled = false, speedLabEnabled = false } = options;

  let enabledIds: readonly string[] = playgroundsEnabled
    ? ENABLED_PLAYGROUND_IDS.filter((id) => id !== "speed-lab")
    : (["canvas"] as const);

  // Speed lab requires its own feature flag
  if (speedLabEnabled && !enabledIds.includes("speed-lab")) {
    enabledIds = [...enabledIds, "speed-lab"];
  }

  const guides = enabledIds.map((id) => serializeGuide(id as PlaygroundId));
  const schemas = getAllPlaygroundJsonSchemas();

  // Filter schemas to only enabled playgrounds
  const filteredSchemas: typeof schemas = {};
  for (const id of enabledIds) {
    if (schemas[id]) {
      filteredSchemas[id] = schemas[id];
    }
  }

  return {
    guides,
    schemas: filteredSchemas,
  };
}

// ============================================
// Default Utilities
// ============================================

/**
 * Get default props for a playground.
 * Returns a properly typed member of the Playground union.
 */
export function getDefaultProps<T extends PlaygroundId>(
  id: T
): Extract<Playground, { type: T }> {
  const def = PLAYGROUND_REGISTRY[id];
  return {
    type: def.id,
    config: def.defaultConfig,
    state: def.defaultState,
  } as Extract<Playground, { type: T }>;
}

/**
 * Create a Playground object from parts.
 * Use this when constructing from dynamic sources (e.g., presets, user input).
 *
 * When the type is known at compile time, use the generic overload for better type safety.
 * When constructing from runtime data, use the base overload.
 */
export function createPlayground<T extends PlaygroundId>(
  type: T,
  config: PlaygroundConfigOf<T>,
  state: PlaygroundStateOf<T>
): Extract<Playground, { type: T }>;
export function createPlayground(
  type: PlaygroundId,
  config: unknown,
  state: unknown
): Playground;
export function createPlayground(
  type: PlaygroundId,
  config: unknown,
  state: unknown
): Playground {
  return { type, config, state } as Playground;
}

/**
 * Get all default props (indexed by playground ID)
 */
export function getAllDefaultProps() {
  const result: Record<
    string,
    { type: string; config: unknown; state: unknown }
  > = {};
  for (const id of PLAYGROUND_IDS) {
    result[id] = getDefaultProps(id);
  }
  return result;
}

/**
 * Get presets for a playground
 */
export function getPlaygroundPresets(id: PlaygroundId) {
  return PLAYGROUND_REGISTRY[id].presets;
}

/**
 * Get all presets (indexed by playground ID)
 */
export function getAllPresets() {
  const result: Record<
    string,
    (typeof PLAYGROUND_REGISTRY)[PlaygroundId]["presets"]
  > = {};
  for (const id of PLAYGROUND_IDS) {
    result[id] = getPlaygroundPresets(id);
  }
  return result;
}

// ============================================
// Component Utilities
// ============================================

/**
 * Get the component for a playground
 */
export function getPlaygroundComponent(id: PlaygroundId) {
  return PLAYGROUND_REGISTRY[id].component;
}

// ============================================
// Re-export types
// ============================================

export type {
  ActionSchemas,
  InferActionPayload,
  InferActions,
  InferConfig,
  InferId,
  InferState,
  LooseAction,
  LooseActionPayload,
  PlaygroundComponentProps,
  PlaygroundDefinition,
  PlaygroundGuideContent,
  PlaygroundPreset,
  TypedAction,
} from './types';
