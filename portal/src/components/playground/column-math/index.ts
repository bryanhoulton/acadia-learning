/**
 * Column Math Playground
 *
 * Agent-controlled visual tool for column arithmetic.
 */

// Definition is the single source of truth
export {
  type ColumnMathConfig,
  columnMathDefinition,
  type ColumnMathDefinition,
  type ColumnMathState,
} from './definition';

// Component
export { ColumnMath } from './ColumnMath';

// Schemas and types
export {
  type ActionName,
  type ActionParams,
  actionSchemas,
  type ActionSchemas,
  type ColumnMathAction,
  type ColumnMathInternalState,
  type Config,
  ConfigSchema,
  type RegroupingState,
  type State,
  StateSchema,
} from './schema';
