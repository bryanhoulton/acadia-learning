/**
 * Number Line Definition
 *
 * SINGLE SOURCE OF TRUTH for the number-line playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import { definePlayground, type PlaygroundGuideContent, type PlaygroundPreset } from "../types";
import { NumberLine } from "./NumberLine";
import {
  actionSchemas,
  ConfigSchema,
  StateSchema,
  type Config,
  type State,
} from "./schema";

// ============================================
// Presets
// ============================================

const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "default",
    name: "Basic Number Line",
    description: "Standard integer number line with points and jumps",
    grades: "K-5",
    tags: ["integers", "addition", "subtraction"],
    config: {
      lines: [
        {
          id: "main",
          range: [-10, 10] as [number, number],
          tickInterval: 1,
          showLabels: true,
          labelInterval: 1,
          showFractions: false,
          snapToTicks: true,
        },
      ],
      doubleNumberLine: {
        enabled: false,
        topLabel: "miles",
        bottomLabel: "hours",
        ratio: [60, 1] as [number, number],
      },
      showJumps: true,
      allowPointPlacement: true,
      allowPointRemoval: true,
      allowJumpDrawing: true,
    },
    state: {
      points: [
        { id: "p1", line: "main", value: 3, label: "A", color: "#3b82f6" },
        { id: "p2", line: "main", value: -2, label: "B", color: "#ef4444" },
      ],
      jumps: [
        {
          id: "j1",
          line: "main",
          fromPointId: "p2",
          toPointId: "p1",
          color: "#10b981",
        },
      ],
      regions: [],
    },
  },
  {
    id: "fractions",
    name: "Fraction Number Line",
    description: "Number line with fractional tick marks",
    grades: "3-5",
    tags: ["fractions", "decimals"],
    config: {
      lines: [
        {
          id: "main",
          range: [0, 2] as [number, number],
          tickInterval: 0.25,
          showLabels: true,
          labelInterval: 0.5,
          showFractions: true,
          snapToTicks: true,
        },
      ],
      doubleNumberLine: { enabled: false },
      showJumps: true,
      allowPointPlacement: true,
      allowPointRemoval: true,
      allowJumpDrawing: true,
    },
    state: {
      points: [
        { id: "p1", line: "main", value: 0.5, label: "½", color: "#3b82f6" },
        { id: "p2", line: "main", value: 1.5, label: "1½", color: "#ef4444" },
      ],
      jumps: [
        {
          id: "j1",
          line: "main",
          fromPointId: "p1",
          toPointId: "p2",
          color: "#10b981",
        },
      ],
      regions: [],
    },
  },
  {
    id: "addition-jumps",
    name: "Addition with Jumps",
    description: "Show multi-step addition using jump arcs",
    grades: "1-3",
    tags: ["addition", "jumps", "counting"],
    config: {
      lines: [
        {
          id: "main",
          range: [0, 20] as [number, number],
          tickInterval: 1,
          showLabels: true,
          labelInterval: 5,
          showFractions: false,
          snapToTicks: true,
        },
      ],
      doubleNumberLine: { enabled: false },
      showJumps: true,
      allowPointPlacement: true,
      allowPointRemoval: true,
      allowJumpDrawing: true,
    },
    state: {
      points: [
        { id: "start", line: "main", value: 3, label: "S", color: "#6b7280" },
        { id: "mid", line: "main", value: 8, color: "#3b82f6" },
        { id: "end", line: "main", value: 15, label: "E", color: "#10b981" },
      ],
      jumps: [
        {
          id: "j1",
          line: "main",
          fromPointId: "start",
          toPointId: "mid",
          color: "#3b82f6",
        },
        {
          id: "j2",
          line: "main",
          fromPointId: "mid",
          toPointId: "end",
          color: "#10b981",
        },
      ],
      regions: [],
    },
  },
  {
    id: "view-only",
    name: "View Only (Locked)",
    description: "Non-interactive display - points cannot be moved",
    grades: "K-12",
    tags: ["presentation", "locked", "view"],
    config: {
      lines: [
        {
          id: "main",
          range: [0, 10] as [number, number],
          tickInterval: 1,
          showLabels: true,
          labelInterval: 1,
          showFractions: false,
          snapToTicks: true,
        },
      ],
      doubleNumberLine: { enabled: false },
      showJumps: true,
      allowPointPlacement: false,
      allowPointRemoval: false,
      allowPointDragging: false,
      allowJumpDrawing: false,
      allowClear: false,
    },
    state: {
      points: [
        { id: "p1", line: "main", value: 2, label: "A", color: "#3b82f6" },
        { id: "p2", line: "main", value: 7, label: "B", color: "#ef4444" },
      ],
      jumps: [
        {
          id: "j1",
          line: "main",
          fromPointId: "p1",
          toPointId: "p2",
          color: "#10b981",
        },
      ],
      regions: [],
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "K-8",
    extended: "K-12",
  },

  interactionModel:
    "1D continuous representation. Students place points, show operations as 'jumps', compare positions, shade regions.",
  cognitiveLevel:
    "Iconic/Visual - Bridge between concrete manipulatives and abstract symbolic math",

  bestFor: [
    "Ordering and comparing numbers (which is bigger/smaller)",
    "Visualizing addition as moving RIGHT on the line",
    "Visualizing subtraction as moving LEFT on the line",
    "Understanding negative numbers and integers",
    "Placing fractions and decimals between whole numbers",
    "Showing distance and absolute value",
    "Ratios and proportional relationships (double number line)",
    "Rounding to nearest benchmark",
    "Inequalities and solution sets (x > 3 shown as shaded region)",
    "Interval notation and domain/range",
  ],

  whenToUse: [
    "Concept involves ordering, comparing, or positioning numbers",
    "Teaching operations as directional movement (+ right, - left)",
    "Introducing negative numbers or integers for the first time",
    "Student needs to see where a number 'lives' relative to others",
    "Working with fractions/decimals between whole numbers",
    "Teaching proportional reasoning with double number lines",
    "Visualizing inequalities or ranges of values",
  ],

  whenNotToUse: [
    "Student needs part-whole relationships or fraction visualization",
    "Working with 2D concepts like coordinate pairs or graphing functions",
    "Discrete counting with physical objects",
    "Geometric concepts involving shapes and constructions",
  ],

  exampleScenarios: [
    {
      concept: "Adding integers: -3 + 7 = 4",
      setup:
        "Place start point at -3, end point at 4, with jump arc showing +7. Let student drag start point to explore how result changes.",
      grade: "6-7",
    },
    {
      concept: "Comparing fractions: Place 3/4 on the number line",
      setup:
        "Range [0, 2], tickInterval 0.25, showFractions true, allowPointPlacement true. Empty line for student to place point.",
      grade: "3-4",
    },
    {
      concept: "Inequality: x > -2",
      setup:
        "Range [-5, 5], open circle at -2, shaded region from -2 to right edge. Points locked for demonstration.",
      grade: "7-8",
    },
  ],

  visualDetails: {
    layout: `
      The number line renders as a horizontal line inside a container.
      SVG dimensions: 800×160 pixels. Line positioned at y=100 with 60px padding on sides.
    `,
    elements: {
      axis: "Horizontal line with tick marks at regular intervals.",
      tickMarks: "Vertical lines at each tickInterval. Major ticks are taller.",
      labels: "Numbers below tick marks.",
      points: "Colored circles (28px diameter) positioned on line at their value.",
      jumps: "Curved arcs connecting two points, curving UPWARD.",
      regions: "Shaded rectangles between two values.",
      ghostPoint: "Semi-transparent preview circle shown when hovering.",
    },
    automaticBehaviors: [
      "Points auto-label with next available letter (A, B, C...)",
      "Points auto-color from palette",
      "Jump labels auto-calculate signed distance",
      "Points smoothly animate when snapping",
    ],
    colors: {
      blue: "#3b82f6",
      red: "#ef4444",
      green: "#22c55e",
      amber: "#f59e0b",
      purple: "#a855f7",
      pink: "#ec4899",
      cyan: "#06b6d4",
      orange: "#f97316",
    },
  },

  configSchema: {
    core: {
      description: "Line definition and basic settings",
      properties: {
        "lines[].id": {
          description: "Unique identifier for the line",
          type: "string",
          required: true,
        },
        "lines[].range": {
          description: "Visible range as [min, max] tuple",
          type: "[number, number]",
          required: true,
        },
        "lines[].tickInterval": {
          description: "Distance between tick marks",
          type: "number",
          required: true,
        },
      },
    },
    displayOptions: {
      description: "What visual elements to show",
      properties: {
        showJumps: {
          description: "Show jump arcs connecting points",
          type: "boolean",
          required: true,
        },
        showRegions: {
          description: "Show shaded region areas",
          type: "boolean",
        },
      },
    },
    interactionPermissions: {
      description: "What the student can do",
      properties: {
        allowPointPlacement: {
          description: "Can click on line to add new points",
          type: "boolean",
          required: true,
        },
        allowPointRemoval: {
          description: "Can double-click points to remove them",
          type: "boolean",
          required: true,
        },
        allowPointDragging: {
          description: "Can drag existing points to new positions",
          type: "boolean",
        },
        allowJumpDrawing: {
          description: "Can draw jump arcs between points",
          type: "boolean",
          required: true,
        },
      },
    },
    constraints: {
      description: "Double number line configuration",
      properties: {
        "doubleNumberLine.enabled": {
          description: "Enable second aligned number line",
          type: "boolean",
        },
      },
    },
  },

  stateSchema: {
    points: {
      description: "Points displayed on the number line",
      properties: {
        id: { description: "Unique identifier", type: "string", required: true },
        line: { description: "Which line this point belongs to", type: "string", required: true },
        value: { description: "Numeric position on the line", type: "number", required: true },
        label: { description: "Display label", type: "string" },
        color: { description: "CSS hex color", type: "string" },
      },
    },
    jumps: {
      description: "Arc connections between points",
      properties: {
        id: { description: "Unique identifier", type: "string", required: true },
        line: { description: "Which line this jump belongs to", type: "string", required: true },
        fromPointId: { description: "ID of starting point", type: "string" },
        toPointId: { description: "ID of ending point", type: "string" },
      },
    },
    regions: {
      description: "Shaded areas for inequalities/intervals",
      properties: {
        id: { description: "Unique identifier", type: "string", required: true },
        line: { description: "Which line this region belongs to", type: "string", required: true },
        from: { description: "Start value", type: "number", required: true },
        to: { description: "End value", type: "number", required: true },
      },
    },
  },

  configurationTips: {
    range_selection: [
      "For integer work: include buffer around values",
      "For fractions: range [0, 2] with tickInterval 0.25 works well",
    ],
    tick_interval: [
      "Integers: tickInterval 1",
      "Quarters: tickInterval 0.25, showFractions true",
    ],
  },

  interactionPresets: {
    demonstration: {
      description: "View only - tutor controls all elements",
      permissions: {
        allowPointPlacement: false,
        allowPointRemoval: false,
        allowPointDragging: false,
        allowJumpDrawing: false,
        allowClear: false,
      },
    },
    free_exploration: {
      description: "Student has full control",
      permissions: {
        allowPointPlacement: true,
        allowPointRemoval: true,
        allowPointDragging: true,
        allowJumpDrawing: true,
        allowClear: true,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "Integer Addition: -3 + 7",
      concept: "Visualize adding a positive to a negative",
      props: {
        config: presets[0].config,
        state: presets[0].state,
      },
      pedagogy: "Student can drag start point to explore how sum changes.",
    },
  ],

  commonMistakes: [
    "Setting range too small/large for the concept",
    "Forgetting to set allowPointDragging: false when points should be fixed",
    "Creating jumps with static from/to instead of point references",
  ],

  actions: {
    highlight_value: {
      description: "Show a pulsing highlight at a specific value",
      params: {
        value: { type: "number", required: true, description: "The value to highlight" },
        color: { type: "string", required: false, description: "Highlight color" },
        duration: { type: "number", required: false, description: "Duration in ms" },
      },
      example: { action: "highlight_value", params: { value: 5 } },
      useCase: "Draw attention to a specific position",
    },
    animate_jump: {
      description: "Show an animated arc from one value to another",
      params: {
        from: { type: "number", required: true, description: "Starting value" },
        to: { type: "number", required: true, description: "Ending value" },
      },
      example: { action: "animate_jump", params: { from: 3, to: 8 } },
      useCase: "Demonstrate an operation visually",
    },
    clear_highlights: {
      description: "Clear all active highlights",
      params: {},
      example: { action: "clear_highlights", params: {} },
      useCase: "Reset visual state",
    },
  },
};

// ============================================
// Definition
// ============================================

export const numberLineDefinition = definePlayground({
  id: "number-line",
  name: "Number Line",
  icon: "📏",
  description:
    "1D continuous representation for placing points, showing jumps/operations, and visualizing number relationships",
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

  component: NumberLine,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type NumberLineDefinition = typeof numberLineDefinition;
export type NumberLineConfig = Config;
export type NumberLineState = State;
