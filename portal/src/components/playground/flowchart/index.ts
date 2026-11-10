/**
 * Flowchart Module
 *
 * A view-only flowchart visualization component with support for:
 * - Automatic dagre-based layout
 * - Multiple node shapes (rectangle, diamond, circle, pill)
 * - Edge labels for decision branches
 * - Node selection and highlighting
 * - Ephemeral actions (highlight node, highlight path)
 *
 * @module flowchart
 */

// Definition is the single source of truth
export {
  type FlowchartConfig,
  flowchartDefinition,
  type FlowchartDefinition,
  type FlowchartState,
} from './definition';

// Component
export { Flowchart } from './Flowchart';

// Schemas and types
export {
  type ActionName,
  type ActionParams,
  actionSchemas,
  type ActionSchemas,
  type Config,
  ConfigSchema,
  type FlowchartAction,
  type FlowchartDirection,
  FlowchartDirectionSchema,
  type FlowchartEdge,
  FlowchartEdgeSchema,
  type FlowchartEdgeStyle,
  FlowchartEdgeStyleSchema,
  type FlowchartNode,
  FlowchartNodeSchema,
  type FlowchartNodeShape,
  FlowchartNodeShapeSchema,
  type State,
  StateSchema,
} from './schema';

// Action runtime defaults
export { ACTION_DEFAULTS } from './actions';
