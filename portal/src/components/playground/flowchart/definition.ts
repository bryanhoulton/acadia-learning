/**
 * Flowchart Definition
 *
 * SINGLE SOURCE OF TRUTH for the flowchart playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from '../types';
import { Flowchart } from './Flowchart';
import {
  actionSchemas,
  type Config,
  ConfigSchema,
  type State,
  StateSchema,
} from './schema';

// ============================================
// Presets
// ============================================

const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "flowchart-simple-process",
    name: "Simple Process",
    description: "A basic linear process flowchart",
    grades: "K-12",
    tags: ["process", "linear", "basic"],
    config: {
      direction: "TB",
      allowNodeSelection: true,
      allowMultiSelect: false,
      showEdgeLabels: true,
    },
    state: {
      nodes: [
        { id: "start", label: "Start", shape: "pill", color: "#10b981" },
        { id: "step1", label: "Step 1", shape: "rectangle" },
        { id: "step2", label: "Step 2", shape: "rectangle" },
        { id: "step3", label: "Step 3", shape: "rectangle" },
        { id: "end", label: "End", shape: "pill", color: "#ef4444" },
      ],
      edges: [
        { id: "e1", source: "start", target: "step1" },
        { id: "e2", source: "step1", target: "step2" },
        { id: "e3", source: "step2", target: "step3" },
        { id: "e4", source: "step3", target: "end" },
      ],
      selectedNodeIds: [],
    },
  },
  {
    id: "flowchart-decision-tree",
    name: "Decision Tree",
    description: "A yes/no branching decision flowchart",
    grades: "3-12",
    tags: ["decision", "branching", "logic"],
    config: {
      direction: "TB",
      allowNodeSelection: true,
      allowMultiSelect: false,
      showEdgeLabels: true,
    },
    state: {
      nodes: [
        { id: "start", label: "Start", shape: "pill" },
        { id: "q1", label: "Question?", shape: "diamond" },
        { id: "yes", label: "Yes Action", shape: "rectangle" },
        { id: "no", label: "No Action", shape: "rectangle" },
        { id: "end", label: "End", shape: "pill" },
      ],
      edges: [
        { id: "e1", source: "start", target: "q1" },
        { id: "e2", source: "q1", target: "yes", label: "yes" },
        { id: "e3", source: "q1", target: "no", label: "no" },
        { id: "e4", source: "yes", target: "end" },
        { id: "e5", source: "no", target: "end" },
      ],
      selectedNodeIds: [],
    },
  },
  {
    id: "flowchart-loop",
    name: "Loop Pattern",
    description: "A flowchart with a repeating loop",
    grades: "4-12",
    tags: ["loop", "iteration", "algorithm"],
    config: {
      direction: "TB",
      allowNodeSelection: true,
      allowMultiSelect: false,
      showEdgeLabels: true,
    },
    state: {
      nodes: [
        { id: "start", label: "Start", shape: "pill" },
        { id: "init", label: "Initialize", shape: "rectangle" },
        { id: "check", label: "Continue?", shape: "diamond" },
        { id: "process", label: "Process", shape: "rectangle" },
        { id: "update", label: "Update", shape: "rectangle" },
        { id: "end", label: "Done", shape: "pill", color: "#10b981" },
      ],
      edges: [
        { id: "e1", source: "start", target: "init" },
        { id: "e2", source: "init", target: "check" },
        { id: "e3", source: "check", target: "process", label: "yes" },
        { id: "e4", source: "process", target: "update" },
        { id: "e5", source: "update", target: "check" },
        { id: "e6", source: "check", target: "end", label: "no" },
      ],
      selectedNodeIds: [],
    },
  },
  {
    id: "flowchart-horizontal",
    name: "Horizontal Timeline",
    description: "Left-to-right process flow",
    grades: "K-12",
    tags: ["horizontal", "timeline", "sequence"],
    config: {
      direction: "LR",
      allowNodeSelection: true,
      allowMultiSelect: false,
      showEdgeLabels: false,
    },
    state: {
      nodes: [
        { id: "n1", label: "Phase 1", shape: "rectangle" },
        { id: "n2", label: "Phase 2", shape: "rectangle" },
        { id: "n3", label: "Phase 3", shape: "rectangle" },
        { id: "n4", label: "Phase 4", shape: "rectangle" },
        { id: "n5", label: "Complete", shape: "circle", color: "#10b981" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4" },
        { id: "e4", source: "n4", target: "n5" },
      ],
      selectedNodeIds: [],
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "3-12",
    extended: "K-12",
  },

  interactionModel:
    "View-only flowchart with auto-layout. AI defines nodes and edges, system positions them automatically. Students can click to select/highlight nodes.",
  cognitiveLevel:
    "Iconic/Visual - Represents abstract processes and decisions as connected visual elements",

  bestFor: [
    "Visualizing algorithms and decision processes",
    "Explaining step-by-step procedures",
    "Showing branching logic (if-then-else)",
    "Process mapping and workflows",
    "Story branching and narrative paths",
    "Taxonomies and hierarchical relationships",
    "Problem-solving strategies",
    "Cause and effect relationships",
  ],

  whenToUse: [
    "Explaining a multi-step process or algorithm",
    "Showing how decisions lead to different outcomes",
    "Teaching problem-solving strategies with branching",
    "Visualizing a classification or taxonomy",
    "Illustrating cause and effect chains",
    "Breaking down complex procedures into steps",
  ],

  whenNotToUse: [
    "Numeric calculations or arithmetic operations",
    "Graphing mathematical functions or plotting data",
    "Reading comprehension with extended text",
    "Data visualization with charts or graphs",
    "When students need to manipulate numbers directly",
  ],

  exampleScenarios: [
    {
      concept: "Long division algorithm",
      setup:
        "Create nodes for: Divide, Multiply, Subtract, Bring down, Check if done. Connect in sequence with loop back from Check to Divide.",
      grade: "4-5",
    },
    {
      concept: "Classification of animals",
      setup:
        "Diamond nodes for questions like 'Has backbone?', 'Warm blooded?'. Rectangle nodes for animal classes. Connect with 'yes'/'no' edge labels.",
      grade: "3-5",
    },
    {
      concept: "Writing process",
      setup:
        "Pill nodes for: Brainstorm → Outline → Draft → Revise → Edit → Publish. Linear flow with optional feedback loops.",
      grade: "3-8",
    },
    {
      concept: "Solving word problems",
      setup:
        "Show strategy: Read → Identify info → Choose operation → Solve → Check. Diamond for 'Does answer make sense?' with yes/no paths.",
      grade: "2-6",
    },
  ],

  visualDetails: {
    layout: `
      The flowchart renders using ReactFlow with automatic dagre layout.
      Nodes are positioned automatically based on their connections.
      Layout direction can be: TB (top-to-bottom), LR (left-to-right), BT, RL.
      
      Visual structure (ASCII representation for TB direction):
      ┌──────────────────────────────────────────────────────────┐
      │                    ┌─────────────┐                       │
      │                    │   Start     │   <- Rectangle node   │
      │                    └──────┬──────┘                       │
      │                           │                              │
      │                           ▼                              │
      │                      ◇─────────◇                         │
      │                     ╱ Condition? ╲   <- Diamond node     │
      │                    ◇─────────────◇                       │
      │                   yes│         │no                       │
      │                      ▼         ▼                         │
      │             ┌────────────┐  ┌────────────┐               │
      │             │  Action A  │  │  Action B  │               │
      │             └────────────┘  └────────────┘               │
      │                      │         │                         │
      │                      └────┬────┘                         │
      │                           ▼                              │
      │                    (  End  )      <- Pill node           │
      │                                                          │
      └──────────────────────────────────────────────────────────┘
    `,
    elements: {
      rectangle:
        "Rounded rectangle for action/process steps. Blue by default. Used for most statements.",
      diamond:
        "Diamond/rhombus shape for decision points. Amber by default. Used for yes/no or branching questions.",
      circle:
        "Circle shape for start/end points or simple states. Green by default.",
      pill: "Rounded pill/capsule shape for terminal nodes (start/end). Purple by default.",
      edges:
        "Smooth curved arrows connecting nodes. Can have labels (e.g., 'yes', 'no'). Solid or dashed style.",
    },
    automaticBehaviors: [
      "Nodes are automatically positioned using dagre graph layout",
      "Layout recalculates when nodes/edges change",
      "View automatically fits to show all nodes with padding",
      "Selected nodes show a white ring highlight",
      "Highlighted nodes (via action) pulse with yellow ring",
      "Pan and zoom are enabled for exploration",
    ],
    colors: {
      rectangle: "#3b82f6", // blue-500
      diamond: "#f59e0b", // amber-500
      circle: "#10b981", // green-500
      pill: "#8b5cf6", // purple-500
      edge: "#94a3b8", // slate-400
      highlight: "#facc15", // yellow-400
    },
  },

  configSchema: {
    core: {
      description: "Core layout and behavior settings",
      properties: {
        direction: {
          description: "Direction of the flowchart layout",
          type: '"TB" | "LR" | "BT" | "RL"',
          required: false,
          default: "TB",
          example: "TB for top-to-bottom, LR for left-to-right",
        },
      },
      example: {
        direction: "TB",
      },
    },

    displayOptions: {
      description: "What visual elements to show",
      properties: {
        showEdgeLabels: {
          description: "Show labels on edges (e.g., 'yes', 'no')",
          type: "boolean",
          default: "true",
        },
      },
    },

    interactionPermissions: {
      description: "What the student can do",
      properties: {
        allowNodeSelection: {
          description: "Can click nodes to select them",
          type: "boolean",
          default: "true",
        },
        allowMultiSelect: {
          description: "Can select multiple nodes at once (with clicks)",
          type: "boolean",
          default: "false",
        },
      },
    },
  },

  stateSchema: {
    nodes: {
      description: "Nodes in the flowchart",
      properties: {
        id: {
          description: "Unique identifier for the node",
          type: "string",
          required: true,
        },
        label: {
          description: "Text displayed inside the node",
          type: "string",
          required: true,
        },
        shape: {
          description: "Shape of the node",
          type: '"rectangle" | "diamond" | "circle" | "pill"',
          required: false,
          default: "rectangle",
        },
        color: {
          description: "Custom color (CSS hex or named color)",
          type: "string",
          example: "#3b82f6",
        },
        description: {
          description: "Tooltip text shown on hover/click",
          type: "string",
        },
      },
      example: {
        id: "step1",
        label: "Start",
        shape: "pill",
        color: "#10b981",
      },
    },

    edges: {
      description: "Edges connecting nodes",
      properties: {
        id: {
          description: "Unique identifier for the edge",
          type: "string",
          required: true,
        },
        source: {
          description: "ID of the source node",
          type: "string",
          required: true,
        },
        target: {
          description: "ID of the target node",
          type: "string",
          required: true,
        },
        label: {
          description: "Text label on the edge (e.g., 'yes', 'no')",
          type: "string",
        },
        style: {
          description: "Line style",
          type: '"solid" | "dashed"',
          default: "solid",
        },
        color: {
          description: "Custom edge color",
          type: "string",
        },
      },
      example: {
        id: "e1",
        source: "decision1",
        target: "action1",
        label: "yes",
      },
    },

    selectedNodeIds: {
      description: "Currently selected node IDs (user interaction)",
      properties: {
        selectedNodeIds: {
          description: "Array of selected node IDs",
          type: "string[]",
          default: "[]",
        },
      },
    },
  },

  configurationTips: {
    node_shapes: [
      "Use 'rectangle' for action/process steps (most common)",
      "Use 'diamond' for decision points with yes/no branches",
      "Use 'circle' for simple start/end markers",
      "Use 'pill' for terminal states or important endpoints",
    ],
    layout_direction: [
      "TB (top-to-bottom): Best for hierarchies and processes",
      "LR (left-to-right): Good for timelines and sequences",
      "Use consistent direction within a flowchart",
    ],
    edge_labels: [
      "Always label edges from decision diamonds ('yes', 'no')",
      "Use short, clear labels (1-2 words)",
      "Leave edges unlabeled when the connection is obvious",
    ],
    node_ids: [
      "Use descriptive IDs (e.g., 'check_balance', 'deposit_funds')",
      "IDs must be unique within the flowchart",
      "Reference IDs correctly in edges (source/target)",
    ],
  },

  interactionPresets: {
    view_only: {
      description: "Student can only view, no selection",
      permissions: {
        allowNodeSelection: false,
        allowMultiSelect: false,
      },
    },
    single_select: {
      description: "Student can select one node at a time",
      permissions: {
        allowNodeSelection: true,
        allowMultiSelect: false,
      },
    },
    multi_select: {
      description: "Student can select multiple nodes",
      permissions: {
        allowNodeSelection: true,
        allowMultiSelect: true,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "Simple Decision Tree",
      concept: "Basic yes/no branching",
      props: {
        config: presets[1].config,
        state: presets[1].state,
      },
      pedagogy:
        "Simple example showing how decisions create different paths. Student can click nodes to explore each step.",
    },
    {
      name: "Long Division Algorithm",
      concept: "Visualize the steps of long division",
      props: {
        config: presets[2].config,
        state: presets[2].state,
      },
      pedagogy:
        "Shows the cyclical nature of long division. Use highlight_path action to walk through steps one by one.",
    },
    {
      name: "Horizontal Timeline",
      concept: "Left-to-right process flow",
      props: {
        config: presets[3].config,
        state: presets[3].state,
      },
      pedagogy:
        "Left-to-right layout shows progression. Use to discuss sequential processes with students.",
    },
  ],

  commonMistakes: [
    "Forgetting to connect nodes with edges (orphan nodes appear)",
    "Using the same ID for multiple nodes (causes rendering issues)",
    "Not labeling decision edges ('yes'/'no' makes diamonds clearer)",
    "Creating circular references without an exit condition",
    "Making node labels too long (keep under 20 characters)",
    "Using wrong source/target IDs in edges (edges won't render)",
    "Setting direction but expecting manual positioning (layout is automatic)",
    "Telling student to 'drag' nodes (this is view-only, no dragging)",
    "Using 'rectangle' for decisions instead of 'diamond'",
  ],

  actions: {
    highlight_node: {
      description: "Highlight a specific node with a pulse effect",
      params: {
        nodeId: {
          type: "string",
          required: true,
          description: "The ID of the node to highlight",
        },
        duration: {
          type: "number",
          required: false,
          default: 2000,
          description: "Duration in ms",
        },
      },
      example: { action: "highlight_node", params: { nodeId: "step1" } },
      useCase: "Draw attention to a specific step when explaining the process",
    },
    highlight_path: {
      description:
        "Highlight multiple nodes to show a path through the flowchart",
      params: {
        nodeIds: {
          type: "string[]",
          required: true,
          description: "Array of node IDs to highlight",
        },
        duration: {
          type: "number",
          required: false,
          default: 3000,
          description: "Duration in ms",
        },
      },
      example: {
        action: "highlight_path",
        params: { nodeIds: ["start", "q1", "umbrella", "end"] },
      },
      useCase:
        "Show a specific path through the flowchart (e.g., the 'yes' branch)",
    },
    clear_highlights: {
      description: "Clear all active highlights immediately",
      params: {},
      example: { action: "clear_highlights", params: {} },
      useCase: "Reset the visual state before starting a new explanation",
    },
  },
};

// ============================================
// Definition
// ============================================

export const flowchartDefinition = definePlayground({
  id: "flowchart",
  name: "Flowchart",
  icon: "🔀",
  description: "Visual flowcharts for processes, decisions, and algorithms",
  grades: "K-12",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: Flowchart,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type FlowchartDefinition = typeof flowchartDefinition;
export type FlowchartConfig = Config;
export type FlowchartState = State;
