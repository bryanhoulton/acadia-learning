/**
 * Canvas Playground
 *
 * The canvas is the block-based playground that renders blocks of content
 * (text, math, questions, graphs, etc.)
 */

// Definition is the single source of truth
export {
  type CanvasConfig,
  canvasDefinition,
  type CanvasState,
} from './definition';

// Component
export { Canvas } from './Canvas';

// Schemas and types
export {
  actionSchemas,
  type Block,
  type BlockData,
  type Config,
  ConfigSchema,
  type FractionBlock,
  type GraphBlock,
  type MathBlock,
  type MultipleChoiceBlock,
  type NumberLineBlock,
  type QuestionBlock,
  type State,
  StateSchema,
  type TableBlock,
  type TextBlock,
  type TimelineBlock,
} from './schema';

// Re-export BlockRenderer from the canvas component directory
export { default as BlockRenderer } from './BlockRenderer';
