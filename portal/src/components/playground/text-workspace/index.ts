/**
 * Text Workspace Playground
 *
 * Re-exports the definition and any types needed externally.
 */

// Definition is the single source of truth
export {
  type TextWorkspaceConfig,
  textWorkspaceDefinition,
  type TextWorkspaceState,
} from './definition';

// Component
export { TextWorkspace } from './TextWorkspace';

// Schemas and types
export {
  type Composition,
  type Config,
  ConfigSchema,
  type ReadingTool,
  type State,
  StateSchema,
  type TextAnnotation,
  type TextHighlight,
  type TextMode,
  type WritingTool,
} from './schema';

// Constants
export * from "./constants";

// Utils
export * from "./utils";
