/**
 * Number Line Module
 *
 * An interactive number line visualization component with support for:
 * - Draggable points with snapping
 * - Point placement with ghost preview
 * - Jump arcs between points
 * - Animated range changes
 * - Ephemeral actions (highlights, animated jumps)
 *
 * @module number-line
 */

// Definition is the single source of truth
export { numberLineDefinition, type NumberLineConfig, type NumberLineState } from "./definition";

// Component
export { NumberLine } from "./NumberLine";

// Schemas and inferred types
export {
  ConfigSchema,
  StateSchema,
  actionSchemas,
  type Config,
  type State,
  type Point,
  type Jump,
  type Region,
  type LineDefinition,
  type ActionName,
  type ActionParams,
  type NumberLineAction,
} from "./schema";

// Utilities
export * from "./constants";
export * from "./utils";
export * from "./actions";
export { useNumberLineActions } from "./useNumberLineActions";
