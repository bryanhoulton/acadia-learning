/**
 * Coordinate Plane Definition
 *
 * SINGLE SOURCE OF TRUTH for the coordinate-plane playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from '../types';
import { CoordinatePlane } from './CoordinatePlane';
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
    id: "default",
    name: "Explore Functions",
    description: "Graph and explore linear and quadratic functions",
    grades: "8-12",
    tags: ["functions", "graphing", "exploration"],
    config: {
      xRange: [-10, 10],
      yRange: [-10, 10],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: true,
      allowPointRemoval: true,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: true,
        showIntercepts: true,
        showIntersections: true,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [
        {
          id: "p1",
          x: 3,
          y: 4,
          label: "A",
          color: "#3b82f6",
          draggable: true,
        },
        {
          id: "p2",
          x: -2,
          y: 1,
          label: "B",
          color: "#ef4444",
          draggable: true,
        },
      ],
      functions: [
        {
          id: "f1",
          equation: "y = 2x + 1",
          color: "#3b82f6",
          visible: true,
        },
        {
          id: "f2",
          equation: "y = x^2 - 4",
          color: "#10b981",
          visible: true,
        },
      ],
      lines: [],
      regions: [],
      markers: {
        intersections: [],
        intercepts: [],
      },
    },
  },
  {
    id: "plotting-points",
    name: "Plotting Points",
    description: "First quadrant introduction to ordered pairs",
    grades: "5-6",
    tags: ["coordinates", "ordered-pairs", "introduction"],
    config: {
      xRange: [0, 10],
      yRange: [0, 10],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: true,
      allowPointRemoval: true,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: false,
        showIntercepts: false,
        showIntersections: false,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [
        { id: "p1", x: 2, y: 3, label: "A", color: "#3b82f6", draggable: true },
        { id: "p2", x: 5, y: 7, label: "B", color: "#10b981", draggable: true },
        { id: "p3", x: 8, y: 4, label: "C", color: "#f59e0b", draggable: true },
      ],
      functions: [],
      lines: [],
      regions: [],
      markers: {},
    },
  },
  {
    id: "slope-exploration",
    name: "Understanding Slope",
    description: "Visualize rise over run with the slope triangle",
    grades: "7-8",
    tags: ["slope", "rise-run", "linear"],
    config: {
      xRange: [-8, 8],
      yRange: [-8, 8],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: true,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: true,
        showIntercepts: true,
        showIntersections: false,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [
        {
          id: "p1",
          x: -2,
          y: -1,
          label: "A",
          color: "#3b82f6",
          draggable: true,
        },
        { id: "p2", x: 4, y: 5, label: "B", color: "#3b82f6", draggable: true },
      ],
      functions: [
        { id: "f1", equation: "y = x + 1", color: "#3b82f6", visible: true },
      ],
      lines: [],
      regions: [],
      markers: {},
    },
  },
  {
    id: "systems",
    name: "Systems of Equations",
    description: "Find where two lines intersect",
    grades: "8-10",
    tags: ["systems", "intersection", "linear"],
    config: {
      xRange: [-8, 8],
      yRange: [-8, 8],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: true,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: true,
        showIntercepts: true,
        showIntersections: true,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [],
      functions: [
        { id: "f1", equation: "y = 2x - 3", color: "#3b82f6", visible: true },
        { id: "f2", equation: "y = -x + 6", color: "#ef4444", visible: true },
      ],
      lines: [],
      regions: [],
      markers: {},
    },
  },
  {
    id: "quadratic-intro",
    name: "Introduction to Parabolas",
    description: "Explore the shape of y = x²",
    grades: "8-10",
    tags: ["quadratic", "parabola", "introduction"],
    config: {
      xRange: [-6, 6],
      yRange: [-4, 10],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: true,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: true,
        showIntercepts: true,
        showIntersections: true,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [
        {
          id: "vertex",
          x: 0,
          y: 0,
          label: "vertex",
          color: "#8b5cf6",
          draggable: false,
        },
      ],
      functions: [
        { id: "f1", equation: "y = x^2", color: "#8b5cf6", visible: true },
      ],
      lines: [],
      regions: [],
      markers: {},
    },
  },
  {
    id: "inequalities",
    name: "Graphing Inequalities",
    description: "Visualize solution regions for linear inequalities",
    grades: "8-10",
    tags: ["inequalities", "regions", "shading"],
    config: {
      xRange: [-8, 8],
      yRange: [-8, 8],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: true,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: false,
        showIntercepts: true,
        showIntersections: false,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [],
      functions: [
        { id: "f1", equation: "y = x + 2", color: "#3b82f6", visible: true },
      ],
      lines: [],
      regions: [
        {
          id: "r1",
          inequality: "y < x + 2",
          shaded: true,
          color: "rgba(59, 130, 246, 0.2)",
          opacity: 0.3,
        },
      ],
      markers: {},
    },
  },
  {
    id: "view-only",
    name: "View Only (Locked)",
    description: "Non-interactive display - points cannot be moved",
    grades: "5-12",
    tags: ["presentation", "locked", "view"],
    config: {
      xRange: [-6, 6],
      yRange: [-6, 6],
      gridEnabled: true,
      axisLabels: { x: "x", y: "y" },
      snapToGrid: true,
      allowPointPlot: false,
      allowPointRemoval: false,
      showCoordinates: true,
      pedagogicalTools: {
        traceMode: true,
        showIntercepts: true,
        showIntersections: false,
      },
      gridConfig: {
        majorInterval: 1,
        showMinorGrid: false,
        minorInterval: 0.5,
      },
    },
    state: {
      points: [],
      functions: [
        { id: "f1", equation: "y = 0.5x", color: "#3b82f6", visible: true },
        { id: "f2", equation: "y = x", color: "#10b981", visible: true },
        { id: "f3", equation: "y = 2x", color: "#f59e0b", visible: true },
        { id: "f4", equation: "y = -x", color: "#ef4444", visible: true },
      ],
      lines: [],
      regions: [],
      markers: {},
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "6-12",
    extended: "5-Calculus",
  },

  interactionModel:
    "2D graphing environment. Plot points, graph functions, explore intersections, shade inequality regions.",
  cognitiveLevel:
    "Iconic/Symbolic bridge - Visual representation of abstract relationships",

  bestFor: [
    "Graphing linear equations (y = mx + b)",
    "Visualizing quadratic and polynomial functions",
    "Systems of equations (finding intersections graphically)",
    "Understanding intercepts (where lines cross axes)",
    "Real-world rate problems (distance-time, cost-quantity)",
    "Graphing inequalities with shaded regions",
    "Comparing multiple functions visually",
    "Exploring function transformations",
  ],

  whenToUse: [
    "Concept involves relationship between two quantities (x and y)",
    "Student needs to SEE what an equation looks like as a graph",
    "Teaching intercepts or where functions cross axes",
    "Comparing multiple functions (which grows faster?)",
    "Systems of equations - finding where lines intersect",
    "Real-world applications with meaningful axis labels",
  ],

  whenNotToUse: [
    "Single-variable concepts like ordering or comparing numbers on a line",
    "Part-whole relationships or fraction visualization",
    "Geometric constructions and precise measurements",
    "Discrete counting with physical objects",
  ],

  exampleScenarios: [
    {
      concept: "Plot ordered pairs in the first quadrant",
      setup:
        "xRange [0, 10], yRange [0, 10], allowPointPlot true. Student clicks to place points at given coordinates.",
      grade: "5-6",
    },
    {
      concept: "Graph y = 2x + 1 and identify the y-intercept",
      setup:
        "Standard range [-10, 10], add function 'y = 2x + 1', enable showIntercepts. Ask student to identify where line crosses y-axis.",
      grade: "7-8",
    },
    {
      concept: "Solve system: y = 2x - 3 and y = -x + 6",
      setup:
        "Add both functions, enable showIntersections. Diamond marker appears at solution (3, 3). Student verifies algebraically.",
      grade: "8-10",
    },
    {
      concept: "Compare speeds: 60 mph vs 45 mph",
      setup:
        "xRange [0, 6] (hours), yRange [0, 300] (miles), axis labels for context. Graph y = 60x and y = 45x. Discuss steepness.",
      grade: "7-9",
    },
  ],

  visualDetails: {
    layout: `
      Square SVG canvas (500x500) with 40px padding for axis labels.
      Content area is 420x420 pixels. Background is white with light gray grid.
      
      Key visual elements:
      - Grid lines at regular intervals (configurable majorInterval)
      - X and Y axes as darker lines through origin (if visible in range)
      - Tick marks with numeric labels along axes
      - Arrow tips at axis ends indicating direction
    `,
    elements: {
      grid: "Light gray lines (#e5e7eb) at majorInterval spacing. Optional minor grid at half intervals.",
      axes: "Darker gray lines (#374151) for x and y axes. Arrow tips point right (x) and up (y).",
      tickLabels:
        "Small numbers below x-axis and left of y-axis. Positioned at majorInterval. Origin shows '0'.",
      points:
        "Colored circles (12px diameter) with white stroke. Letter label (A, B, C...) appears above. Hover enlarges to 16px and shows coordinate tooltip.",
      functions:
        "Smooth curves sampled at 300 points across x-range. Each function has distinct color from palette. Hover thickens line.",
      intercepts:
        "Small green circles where function crosses axes. Hover shows exact coordinates.",
      intersections:
        "Diamond-shaped amber markers where two functions cross. Auto-detected when showIntersections enabled.",
      ghostPoint:
        "Semi-transparent preview when placing points. Shows where click will land, with crosshairs to axes.",
      regions:
        "Semi-transparent fill for inequalities. Extends to edge of visible area. Dashed boundary for strict (<, >), solid for inclusive (<=, >=).",
      traceMode:
        "Vertical dashed line follows cursor. Points appear where line crosses each function with coordinate tooltips.",
    },
    automaticBehaviors: [
      "Points auto-label with next letter (A, B, C...)",
      "Points auto-color from palette (blue, green, amber, red, purple...)",
      "Functions auto-color distinctly when added",
      "Intercepts auto-detected when showIntercepts enabled",
      "Intersections auto-calculated when showIntersections enabled",
      "Points snap to grid when snapToGrid is true",
      "Coordinate tooltip follows during drag",
    ],
    colors: {
      blue: "#3b82f6",
      emerald: "#10b981",
      amber: "#f59e0b",
      red: "#ef4444",
      violet: "#8b5cf6",
      pink: "#ec4899",
      cyan: "#06b6d4",
    },
  },

  configSchema: {
    core: {
      description: "Range and basic display settings",
      properties: {
        xRange: {
          description: "Visible x-axis range as [min, max]",
          type: "[number, number]",
          required: true,
          example: "[-10, 10] or [0, 10] for first quadrant",
        },
        yRange: {
          description: "Visible y-axis range as [min, max]",
          type: "[number, number]",
          required: true,
          example: "[-10, 10] or [0, 25] for quadratics",
        },
        gridEnabled: {
          description: "Show background grid lines",
          type: "boolean",
          default: "true",
        },
        axisLabels: {
          description: "Labels at axis tips",
          type: "{ x: string, y: string }",
          example:
            "{ x: 'x', y: 'y' } or { x: 'Time (hrs)', y: 'Distance (mi)' }",
        },
        snapToGrid: {
          description: "Points snap to integer coordinates when placed/dragged",
          type: "boolean",
          default: "true",
        },
      },
      example: {
        xRange: [-10, 10],
        yRange: [-10, 10],
        gridEnabled: true,
        axisLabels: { x: "x", y: "y" },
        snapToGrid: true,
      },
    },

    displayOptions: {
      description: "What visual elements to show",
      properties: {
        showCoordinates: {
          description: "Show coordinate tooltip on hover/drag",
          type: "boolean",
          default: "true",
        },
        "pedagogicalTools.traceMode": {
          description: "Enable trace mode for exploring f(x) values",
          type: "boolean",
          default: "true",
        },
        "pedagogicalTools.showIntercepts": {
          description: "Auto-mark where functions cross axes",
          type: "boolean",
          default: "true",
        },
        "pedagogicalTools.showIntersections": {
          description: "Auto-mark where functions cross each other",
          type: "boolean",
          default: "true",
        },
        "gridConfig.majorInterval": {
          description: "Spacing between major grid lines",
          type: "number",
          default: "1",
        },
        "gridConfig.showMinorGrid": {
          description: "Show fainter grid lines between major lines",
          type: "boolean",
          default: "false",
        },
      },
    },

    interactionPermissions: {
      description: "What the student can do",
      properties: {
        allowPointPlot: {
          description: "Can click on canvas to add new points",
          type: "boolean",
          required: true,
        },
        allowPointRemoval: {
          description: "Can double-click points to remove them",
          type: "boolean",
          default: "true",
        },
      },
    },
  },

  stateSchema: {
    points: {
      description: "Points displayed on the coordinate plane",
      properties: {
        id: {
          description: "Unique identifier",
          type: "string",
          required: true,
        },
        x: {
          description: "X coordinate",
          type: "number",
          required: true,
        },
        y: {
          description: "Y coordinate",
          type: "number",
          required: true,
        },
        label: {
          description: "Display label (auto-generates A, B, C... if omitted)",
          type: "string",
        },
        color: {
          description: "CSS hex color (auto-assigned if omitted)",
          type: "string",
          example: "#3b82f6",
        },
        draggable: {
          description: "Can this point be dragged?",
          type: "boolean",
          default: "true",
        },
      },
      example: {
        id: "p1",
        x: 3,
        y: 4,
        label: "A",
        color: "#3b82f6",
        draggable: true,
      },
    },

    functions: {
      description: "Function equations to graph",
      properties: {
        id: {
          description: "Unique identifier",
          type: "string",
          required: true,
        },
        equation: {
          description: "Equation in 'y = ...' format",
          type: "string",
          required: true,
        },
        color: {
          description: "Curve color (auto-assigned if omitted)",
          type: "string",
        },
        visible: {
          description: "Whether to render this function",
          type: "boolean",
          default: "true",
        },
      },
      example: {
        id: "f1",
        equation: "y = 2x + 1",
        color: "#3b82f6",
        visible: true,
      },
    },

    lines: {
      description: "Manually drawn line segments",
      properties: {
        id: {
          description: "Unique identifier",
          type: "string",
          required: true,
        },
        points: {
          description: "Array of [x, y] coordinate pairs",
          type: "[number, number][]",
          required: true,
        },
        style: {
          description: "Line style",
          type: "'solid' | 'dashed' | 'dotted'",
          default: "solid",
        },
        color: {
          description: "Line color",
          type: "string",
        },
      },
      example: {
        id: "l1",
        points: [
          [0, 0],
          [3, 4],
        ],
        style: "solid",
        color: "#333",
      },
    },

    regions: {
      description: "Shaded regions for inequalities",
      properties: {
        id: {
          description: "Unique identifier",
          type: "string",
          required: true,
        },
        inequality: {
          description: "Inequality string (e.g., 'y < 2x + 1')",
          type: "string",
          required: true,
        },
        shaded: {
          description: "Whether region is filled",
          type: "boolean",
          default: "true",
        },
        color: {
          description: "Fill color (use rgba for transparency)",
          type: "string",
          example: "rgba(59, 130, 246, 0.2)",
        },
        opacity: {
          description: "Fill opacity (0-1)",
          type: "number",
          default: "0.2",
        },
      },
      example: {
        id: "r1",
        inequality: "y < 2x + 1",
        shaded: true,
        color: "rgba(59, 130, 246, 0.2)",
      },
    },
  },

  configurationTips: {
    range_selection: [
      "Standard exploration: xRange [-10, 10], yRange [-10, 10]",
      "First quadrant only (grades 5-6): xRange [0, 10], yRange [0, 10]",
      "Quadratics: extend yRange (e.g., [0, 25] for y=x² with xRange [-5, 5])",
      "Real-world: match meaningful ranges (e.g., [0, 6] hours, [0, 300] miles)",
    ],
    function_syntax: [
      "Always use 'y = ...' format",
      "Linear: y = 2x + 3, y = -0.5x + 1",
      "Quadratic: y = x^2, y = 2x^2 - 3x + 1, y = (x - 2)^2 + 3",
      "Absolute value: y = abs(x), y = abs(x - 2) + 1",
      "Trig: y = sin(x), y = cos(x) (x in radians)",
      "Other: y = sqrt(x), y = ln(x), y = 2^x",
      "Use ^ for exponents (x^2 not x²)",
    ],
    interaction_modes: [
      "Demonstration: all permissions false - LLM controls everything",
      "Guided practice: allowPointPlot true, pre-placed functions for analysis",
      "Free exploration: all permissions true - student experiments",
      "Assessment: allowPointPlot true, no removal - student places answer once",
    ],
  },

  interactionPresets: {
    demonstration: {
      description: "View only - LLM controls all elements",
      permissions: {
        allowPointPlot: false,
        allowPointRemoval: false,
      },
    },
    guided_exploration: {
      description: "Student can place points to explore, LLM manages functions",
      permissions: {
        allowPointPlot: true,
        allowPointRemoval: true,
      },
    },
    full_exploration: {
      description: "Student has full control",
      permissions: {
        allowPointPlot: true,
        allowPointRemoval: true,
      },
    },
    assessment: {
      description: "Student places answer but cannot adjust",
      permissions: {
        allowPointPlot: true,
        allowPointRemoval: false,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "First Quadrant Plotting",
      concept: "Introduction to ordered pairs for younger students",
      props: {
        config: presets[1].config,
        state: presets[1].state,
      },
      pedagogy:
        "Clean first-quadrant grid with two draggable points. LLM can ask student to identify coordinates or place new points at specific locations.",
    },
    {
      name: "Systems of Equations",
      concept: "Finding where two lines intersect",
      props: {
        config: presets[3].config,
        state: presets[3].state,
      },
      pedagogy:
        "Two lines crossing at (3, 3). Diamond marker shows intersection. Student can verify by substituting x=3 into both equations.",
    },
  ],

  commonMistakes: [
    "Function not rendering: Check equation format. Must be 'y = ...' with ^ for exponents (x^2 not x²).",
    "Points outside visible area: Adjust xRange and yRange to include all point coordinates.",
    "Intercepts not showing: Enable pedagogicalTools.showIntercepts and check if intercepts are within visible range.",
    "Too cluttered: Reduce number of functions. Use function.visible=false to temporarily hide some.",
    "Wrong range for quadratics: y=x² needs yRange extending higher (e.g., [0, 25] for xRange [-5, 5]).",
    "Intersection not detected: Make sure both functions are visible and showIntersections is enabled.",
    "Student can't place points: Check that allowPointPlot is true in config.",
  ],
};

// ============================================
// Definition
// ============================================

export const coordinatePlaneDefinition = definePlayground({
  id: "coordinate-plane",
  name: "Coordinate Plane",
  icon: "📈",
  description:
    "2D graphing environment for plotting points, graphing functions, exploring intersections, and shading inequality regions",
  grades: "5-12",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: CoordinatePlane,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type CoordinatePlaneDefinition = typeof coordinatePlaneDefinition;
export type CoordinatePlaneConfig = Config;
export type CoordinatePlaneState = State;
