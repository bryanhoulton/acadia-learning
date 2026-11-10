/**
 * Coordinate Plane Module
 *
 * A 2D graphing environment for:
 * - Plotting points and functions
 * - Exploring intersections
 * - Shading inequality regions
 * - Interactive trace mode
 *
 * @module coordinate-plane
 */

// Definition is the single source of truth
export {
  type CoordinatePlaneConfig,
  coordinatePlaneDefinition,
  type CoordinatePlaneState,
} from './definition';

// Component
export { CoordinatePlane } from './CoordinatePlane';

// Schemas and inferred types
export {
  actionSchemas,
  type Config,
  ConfigSchema,
  type CoordinateFunction,
  type CoordinateLine,
  type CoordinateMarker,
  type CoordinatePoint,
  type CoordinateRegion,
  type State,
  StateSchema,
} from './schema';

// Utilities
export * from "./constants";
export * from "./utils";
