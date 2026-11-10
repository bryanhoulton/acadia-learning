/**
 * Area Model Playground
 *
 * Playground for visualizing fractions, multiplication, and part-whole relationships
 * using partitioned shapes (rectangles, circles, bars).
 *
 * @example
 * ```tsx
 * import { AreaModel } from './area-model';
 *
 * <AreaModel
 *   config={{
 *     shapeType: 'rectangle',
 *     allowShading: true,
 *     showFractionLabels: true,
 *     // ... other config
 *   }}
 *   state={{
 *     shapes: [{ id: 's1', type: 'rectangle', partitions: { horizontal: 2, vertical: 4 }, shadedCells: [] }],
 *   }}
 *   onChange={(newState) => console.log(newState)}
 * />
 * ```
 */

// Definition is the single source of truth
export {
  AREA_MODEL_COLORS,
  type AreaModelConfig,
  areaModelDefinition,
  type AreaModelDefinition,
  type AreaModelState,
} from './definition';

// Component
export { AreaModel } from './AreaModel';

// Schemas and types
export {
  type ActionName,
  actionSchemas,
  type AreaModelAction,
  type AreaModelColorKey,
  type AreaShape,
  type AreaShapeType,
  type Config,
  ConfigSchema,
  type DimensionMarker,
  type FractionDisplayFormat,
  type LabeledRegion,
  type ShadedCell,
  type ShadingLayer,
  type State,
  StateSchema,
} from './schema';

// Action runtime state and defaults
export * from "./actions";
export { useAreaModelActions } from './useAreaModelActions';

// Re-export utilities
export * from "./utils";
export * from "./constants";

// Re-export components for composition
export * from "./components";
