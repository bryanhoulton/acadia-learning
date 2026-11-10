/**
 * Area Model Definition
 *
 * SINGLE SOURCE OF TRUTH for the area-model playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from "../types";
import { AreaModel } from "./AreaModel";
import {
  actionSchemas,
  type Config,
  ConfigSchema,
  type State,
  StateSchema,
} from "./schema";

// ============================================
// Color Constants (used in guide)
// ============================================

export const AREA_MODEL_COLORS = {
  blue: {
    fill: "#3b82f6",
    hover: "#2563eb",
    highlight: "#1d4ed8",
    name: "Blue",
  },
  red: { fill: "#ef4444", hover: "#dc2626", highlight: "#b91c1c", name: "Red" },
  green: {
    fill: "#22c55e",
    hover: "#16a34a",
    highlight: "#15803d",
    name: "Green",
  },
  purple: {
    fill: "#a855f7",
    hover: "#9333ea",
    highlight: "#7e22ce",
    name: "Purple",
  },
  orange: {
    fill: "#f97316",
    hover: "#ea580c",
    highlight: "#c2410c",
    name: "Orange",
  },
  yellow: {
    fill: "#eab308",
    hover: "#ca8a04",
    highlight: "#a16207",
    name: "Yellow",
  },
  overlap: {
    fill: "#7c3aed",
    hover: "#6d28d9",
    highlight: "#5b21b6",
    name: "Overlap",
  },
} as const;

/**
 * High-contrast highlight colors for action overlays
 * These are more saturated/darker versions for better visibility
 */
export const HIGHLIGHT_COLORS = {
  blue: "#1e40af", // blue-800
  red: "#991b1b", // red-800
  green: "#166534", // green-800
  purple: "#6b21a8", // purple-800
  orange: "#9a3412", // orange-800
  yellow: "#854d0e", // yellow-800
  amber: "#92400e", // amber-800
  default: "#1e40af", // blue-800
} as const;

// ============================================
// Presets
// ============================================

const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "default",
    name: "Fraction Shading",
    description: "Interactive fraction visualization with shading",
    grades: "3-5",
    tags: ["fractions", "shading", "interactive"],
    config: {
      shapeType: "rectangle",
      showFractionLabels: true,
      showGridLines: true,
      showOverlap: true,
      overlapColor: "purple",
      fixedDimensions: { width: 200, height: 200 },
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
      allowPartitioning: true,
      allowShading: true,
      allowColorChange: true,
      allowAddingShapes: true,
      allowRemovingShapes: true,
      allowClear: true,
      allowDragShading: true,
      multipleShapes: true,
      maxShapes: 4,
      availableColors: ["blue", "red", "green", "orange"],
    },
    state: {
      shapes: [
        {
          id: "s1",
          type: "rectangle",
          partitions: { horizontal: 4, vertical: 4 },
          shadedCells: [
            { row: 0, col: 0, color: "blue" },
            { row: 0, col: 1, color: "blue" },
            { row: 0, col: 2, color: "blue" },
            { row: 1, col: 0, color: "blue" },
            { row: 1, col: 1, color: "blue" },
            { row: 1, col: 2, color: "blue" },
            { row: 2, col: 0, color: "blue" },
            { row: 2, col: 1, color: "blue" },
            { row: 2, col: 2, color: "blue" },
          ],
          labels: {
            title: "Shade cells to explore fractions",
          },
        },
      ],
      activeColor: "blue",
    },
  },
  {
    id: "equivalent-fractions",
    name: "Equivalent Fractions",
    description: "Compare fractions with same value but different denominators",
    grades: "3-5",
    tags: ["fractions", "equivalent", "comparison"],
    config: {
      shapeType: "rectangle",
      allowPartitioning: false,
      allowShading: false,
      showFractionLabels: true,
      multipleShapes: true,
      maxShapes: 3,
      fixedDimensions: { width: 160, height: 160 },
      showGridLines: true,
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
    },
    state: {
      shapes: [
        {
          id: "one-half",
          type: "rectangle",
          partitions: { horizontal: 1, vertical: 2 },
          shadedCells: [{ row: 0, col: 0, color: "blue" }],
          labels: { title: "1/2" },
        },
        {
          id: "two-fourths",
          type: "rectangle",
          partitions: { horizontal: 2, vertical: 2 },
          shadedCells: [
            { row: 0, col: 0, color: "blue" },
            { row: 1, col: 0, color: "blue" },
          ],
          labels: { title: "2/4" },
        },
        {
          id: "four-eighths",
          type: "rectangle",
          partitions: { horizontal: 2, vertical: 4 },
          shadedCells: [
            { row: 0, col: 0, color: "blue" },
            { row: 0, col: 1, color: "blue" },
            { row: 1, col: 0, color: "blue" },
            { row: 1, col: 1, color: "blue" },
          ],
          labels: { title: "4/8" },
        },
      ],
    },
  },
  {
    id: "fraction-multiplication",
    name: "Fraction Multiplication",
    description: "Visualize multiplying fractions with overlapping regions",
    grades: "5-6",
    tags: ["fractions", "multiplication", "overlap"],
    config: {
      shapeType: "rectangle",
      allowPartitioning: false,
      allowShading: false,
      showFractionLabels: true,
      multipleShapes: false,
      maxShapes: 1,
      fixedDimensions: { width: 280, height: 280 },
      showOverlap: true,
      overlapColor: "purple",
      showGridLines: true,
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
    },
    state: {
      shapes: [
        {
          id: "multiplication",
          type: "rectangle",
          partitions: { horizontal: 2, vertical: 4 },
          shadingLayers: [
            {
              id: "three-fourths",
              name: "3/4 (columns)",
              color: "blue",
              rows: null,
              cols: [0, 1, 2],
              opacity: 0.4,
            },
            {
              id: "one-half",
              name: "1/2 (rows)",
              color: "red",
              rows: [0],
              cols: null,
              opacity: 0.4,
            },
          ],
          labels: {
            title: "1/2 × 3/4 = ?",
            top: "4 columns (shade 3)",
            side: "2 rows (shade 1)",
            shaded: "3/8",
          },
        },
      ],
    },
  },
  {
    id: "partial-products",
    name: "Partial Products",
    description: "Multi-digit multiplication using area model",
    grades: "4-6",
    tags: ["multiplication", "place-value", "partial-products"],
    config: {
      shapeType: "rectangle",
      allowPartitioning: false,
      allowShading: false,
      showFractionLabels: false,
      multipleShapes: false,
      maxShapes: 1,
      fixedDimensions: { width: 320, height: 240 },
      showGridLines: true,
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
    },
    state: {
      shapes: [
        {
          id: "multiplication",
          type: "rectangle",
          partitions: { horizontal: 2, vertical: 2 },
          dimensionLabels: {
            top: [
              { index: 0, label: "10" },
              { index: 1, label: "4" },
            ],
            side: [
              { index: 0, label: "20" },
              { index: 1, label: "3" },
            ],
          },
          regions: [
            {
              id: "r1",
              fromRow: 0,
              toRow: 1,
              fromCol: 0,
              toCol: 1,
              label: "200",
              sublabel: "20×10",
              color: "blue",
            },
            {
              id: "r2",
              fromRow: 0,
              toRow: 1,
              fromCol: 1,
              toCol: 2,
              label: "80",
              sublabel: "20×4",
              color: "green",
            },
            {
              id: "r3",
              fromRow: 1,
              toRow: 2,
              fromCol: 0,
              toCol: 1,
              label: "30",
              sublabel: "3×10",
              color: "orange",
            },
            {
              id: "r4",
              fromRow: 1,
              toRow: 2,
              fromCol: 1,
              toCol: 2,
              label: "12",
              sublabel: "3×4",
              color: "red",
            },
          ],
          labels: {
            title: "23 × 14 = 322",
            top: "14",
            side: "23",
          },
        },
      ],
    },
  },
  {
    id: "percent",
    name: "Percent Grid",
    description: "Visualize percentages on a 10×10 grid",
    grades: "5-7",
    tags: ["percent", "100-grid", "ratio"],
    config: {
      shapeType: "rectangle",
      allowPartitioning: false,
      allowShading: true,
      allowDragShading: true,
      allowClear: true,
      showFractionLabels: true,
      fractionDisplay: "percent",
      multipleShapes: false,
      maxShapes: 1,
      fixedDimensions: { width: 250, height: 250 },
      availableColors: ["blue"],
      showGridLines: true,
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
    },
    state: {
      shapes: [
        {
          id: "percent-grid",
          type: "rectangle",
          partitions: { horizontal: 10, vertical: 10 },
          shadedCells: Array.from({ length: 75 }, (_, i) => ({
            row: Math.floor(i / 10),
            col: i % 10,
            color: "blue" as const,
          })),
          labels: { title: "Shade to show a percent" },
        },
      ],
    },
  },
  {
    id: "decimal",
    name: "Decimal Display",
    description: "Show fractions as decimal values",
    grades: "4-6",
    tags: ["decimals", "fractions", "conversion"],
    config: {
      shapeType: "rectangle",
      allowPartitioning: false,
      allowShading: true,
      allowDragShading: true,
      allowClear: true,
      showFractionLabels: true,
      fractionDisplay: "decimal",
      multipleShapes: false,
      maxShapes: 1,
      fixedDimensions: { width: 200, height: 200 },
      availableColors: ["blue"],
      showGridLines: true,
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
    },
    state: {
      shapes: [
        {
          id: "decimal-grid",
          type: "rectangle",
          partitions: { horizontal: 4, vertical: 4 },
          shadedCells: [
            { row: 0, col: 0, color: "blue" },
            { row: 0, col: 1, color: "blue" },
            { row: 0, col: 2, color: "blue" },
            { row: 0, col: 3, color: "blue" },
            { row: 1, col: 0, color: "blue" },
            { row: 1, col: 1, color: "blue" },
            { row: 1, col: 2, color: "blue" },
            { row: 1, col: 3, color: "blue" },
            { row: 2, col: 0, color: "blue" },
            { row: 2, col: 1, color: "blue" },
            { row: 2, col: 2, color: "blue" },
            { row: 2, col: 3, color: "blue" },
          ],
          labels: { title: "What decimal is shown?" },
        },
      ],
      activeColor: "blue",
    },
  },
  {
    id: "view-only",
    name: "View Only (Locked)",
    description: "Non-interactive display for presentation",
    grades: "K-12",
    tags: ["presentation", "locked", "view"],
    config: {
      shapeType: "rectangle",
      showFractionLabels: true,
      showGridLines: true,
      showOverlap: true,
      overlapColor: "purple",
      fixedDimensions: { width: 180, height: 180 },
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
      allowPartitioning: false,
      allowShading: false,
      allowColorChange: false,
      allowAddingShapes: false,
      allowRemovingShapes: false,
      allowClear: false,
      allowDragShading: false,
      multipleShapes: false,
      maxShapes: 1,
      availableColors: ["blue"],
    },
    state: {
      shapes: [
        {
          id: "demo",
          type: "rectangle",
          partitions: { horizontal: 4, vertical: 4 },
          shadedCells: [
            { row: 0, col: 0, color: "blue" },
            { row: 0, col: 1, color: "blue" },
            { row: 0, col: 2, color: "blue" },
            { row: 1, col: 0, color: "blue" },
            { row: 1, col: 1, color: "blue" },
            { row: 1, col: 2, color: "blue" },
          ],
          labels: {
            title: "6/16 = 3/8",
            shaded: "6/16",
          },
        },
      ],
    },
  },
  {
    id: "click-only",
    name: "Click Only (No Drag)",
    description: "Click individual cells - drag painting disabled",
    grades: "K-5",
    tags: ["practice", "controlled", "click"],
    config: {
      shapeType: "rectangle",
      showFractionLabels: true,
      showGridLines: true,
      fixedDimensions: { width: 200, height: 200 },
      gridOverlay: { enabled: false, rows: 1, cols: 1 },
      allowPartitioning: false,
      allowShading: true,
      allowColorChange: true,
      allowAddingShapes: false,
      allowRemovingShapes: false,
      allowClear: true,
      allowDragShading: false,
      multipleShapes: false,
      maxShapes: 1,
      availableColors: ["blue", "red"],
    },
    state: {
      shapes: [
        {
          id: "practice",
          type: "rectangle",
          partitions: { horizontal: 3, vertical: 4 },
          shadedCells: [],
          labels: { title: "Shade 3/4" },
        },
      ],
      activeColor: "blue",
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "2-6",
    extended: "K-8",
  },

  interactionModel:
    "2D part-whole representation. Students partition shapes into equal parts, shade regions to show fractions, compare amounts visually.",
  cognitiveLevel:
    "Iconic/Visual - Concrete representation of fractions, multiplication, and part-whole relationships",

  bestFor: [
    "Understanding fractions as parts of a whole",
    "Comparing fractions visually (which is larger?)",
    "Equivalent fractions (same shaded amount, different partitions)",
    "Adding and subtracting fractions with like denominators",
    "Multiplying fractions (shade rows, then columns, overlap shows product)",
    "Part-whole relationships and ratios",
    "Decimal/percent visualization (10x10 grid = 100 squares)",
    "Multi-digit multiplication using partial products (area model method)",
    "Understanding that fractions represent division",
  ],

  whenToUse: [
    "Teaching fractions for the first time - visual parts make sense",
    "Student confuses numerator/denominator - seeing parts clarifies",
    "Comparing fractions - visual overlap makes 3/4 > 1/2 obvious",
    "Introducing fraction multiplication - area model shows why you multiply",
    "Student needs to see that 2/4 = 1/2 (same shaded area)",
    "Teaching partial products multiplication (23 × 14 = area of rectangle)",
    "Introducing decimals/percents using 100-grid",
  ],

  whenNotToUse: [
    "Number line concepts like ordering or comparing positions",
    "Operations as directional movement (+ as 'move right')",
    "Working with negative numbers (area model doesn't handle negatives well)",
    "Coordinate pairs, graphing functions, or 2D plotting",
    "When student already has strong abstract fraction understanding",
  ],

  exampleScenarios: [
    {
      concept: "What is 3/4? Shade three-fourths of the rectangle",
      setup:
        "Rectangle with 4 columns, allowShading true. Student shades 3 of 4 parts.",
      grade: "3-4",
    },
    {
      concept: "Compare 2/3 and 3/4 - which is larger?",
      setup:
        "Two rectangles side by side, same total size. One partitioned into thirds (shade 2), one into fourths (shade 3).",
      grade: "4-5",
    },
    {
      concept: "Multiply 1/2 × 3/4 using area model",
      setup:
        "Rectangle partitioned 2 rows × 4 columns. Shade bottom row (1/2), then shade 3 columns (3/4). Overlap region = 3/8.",
      grade: "5-6",
    },
    {
      concept: "Show that 2/4 = 1/2 (equivalent fractions)",
      setup:
        "Two rectangles: one with 2 parts (1 shaded), one with 4 parts (2 shaded). Same shaded area proves equality.",
      grade: "3-4",
    },
    {
      concept: "Multiply 23 × 14 using partial products",
      setup:
        "Rectangle split into 4 regions: 20×10, 20×4, 3×10, 3×4. Labels show partial products that sum to 322.",
      grade: "4-5",
    },
  ],

  visualDetails: {
    layout: `
      The area model renders shapes (rectangles, circles, bars) inside a container.
      Default container: ~400×300 pixels per shape, responsive.
      
      Visual structure for rectangle (ASCII representation):
      ┌────────────────────────────────────────────────────────────────┐
      │                         "3/4"  <- Fraction label (optional)    │
      │  ┌──────────┬──────────┬──────────┬──────────┐                 │
      │  │██████████│██████████│██████████│          │                 │
      │  │██████████│██████████│██████████│          │                 │
      │  │██ Blue ██│██ Blue ██│██ Blue ██│  Empty   │                 │
      │  │██████████│██████████│██████████│          │                 │
      │  │██████████│██████████│██████████│          │                 │
      │  └──────────┴──────────┴──────────┴──────────┘                 │
      │                                                                │
      └────────────────────────────────────────────────────────────────┘
      
      Shaded cells shown with color fill. Grid lines divide into equal parts.
    `,
    elements: {
      shape:
        "Rectangle, circle, or bar divided into equal parts. Shape type set in config.",
      cells:
        "Equal-sized regions within the shape. Can be individually shaded with colors.",
      gridLines:
        "Lines dividing the shape into partitions. Horizontal = rows, Vertical = columns.",
      fractionLabel:
        "Shows the fraction represented (e.g., '3/4'). Position and format configurable.",
      colorPicker:
        "Palette of colors for shading. Student selects active color before shading.",
      dimensionLabels:
        "Optional labels on rows/columns (e.g., '20' and '3' for 23 in multiplication).",
      regionLabels:
        "Optional labels on cell groups showing partial products or values.",
    },
    automaticBehaviors: [
      "Fraction label auto-calculates from shaded/total cells",
      "Click cell to toggle shading with active color",
      "Drag across cells to shade multiple (if allowDragShading true)",
      "Colors layer visually when same cell shaded with multiple colors",
      "Grid lines auto-render based on partition count",
    ],
    colors: {
      blue: "#3b82f6",
      red: "#ef4444",
      green: "#22c55e",
      purple: "#a855f7",
      orange: "#f97316",
      yellow: "#eab308",
      overlap: "#7c3aed",
    },
  },

  configSchema: {
    core: {
      description: "Shape type and basic settings",
      properties: {
        shapeType: {
          description: "Type of shape to display",
          type: '"rectangle" | "circle" | "bar"',
          required: true,
          example: "rectangle",
        },
      },
    },

    displayOptions: {
      description: "What visual elements to show",
      properties: {
        showFractionLabels: {
          description: "Show fraction value (e.g., '3/4') on shapes",
          type: "boolean",
          required: true,
        },
        fractionDisplay: {
          description: "Format for fraction display",
          type: '"improper" | "mixed" | "decimal" | "percent"',
          default: "improper",
        },
        showGridLines: {
          description: "Show partition lines within shapes",
          type: "boolean",
          default: "true",
        },
        showOverlap: {
          description: "Highlight overlapping regions with special color",
          type: "boolean",
          default: "false",
        },
        overlapColor: {
          description: "Color key for overlap regions",
          type: "AreaModelColorKey",
          default: "overlap",
        },
        fixedDimensions: {
          description:
            "Fixed pixel dimensions for shapes (for fair comparison)",
          type: "{ width: number, height: number }",
        },
        gridOverlay: {
          description: "Background grid settings",
          type: "{ enabled: boolean, rows: number, cols: number }",
          required: true,
        },
      },
    },

    interactionPermissions: {
      description: "What the student can do",
      properties: {
        allowPartitioning: {
          description: "Can change number of rows/columns",
          type: "boolean",
          required: true,
        },
        allowShading: {
          description: "Can click cells to shade/unshade",
          type: "boolean",
          required: true,
        },
        allowColorChange: {
          description: "Can select different colors for shading",
          type: "boolean",
          default: "true",
        },
        allowAddingShapes: {
          description: "Can add new shapes to the workspace",
          type: "boolean",
          default: "false",
        },
        allowRemovingShapes: {
          description: "Can remove shapes from the workspace",
          type: "boolean",
          default: "false",
        },
        allowClear: {
          description: "Can clear all shading",
          type: "boolean",
          default: "true",
        },
        allowDragShading: {
          description: "Can drag to shade multiple cells at once",
          type: "boolean",
          default: "false",
        },
        interactionMode: {
          description: "Preset interaction mode",
          type: '"shade" | "partition" | "view"',
        },
      },
    },

    constraints: {
      description: "Limits and options",
      properties: {
        multipleShapes: {
          description: "Allow multiple shapes for comparison",
          type: "boolean",
          required: true,
        },
        maxShapes: {
          description: "Maximum number of shapes allowed",
          type: "number",
          required: true,
          example: "2",
        },
        availableColors: {
          description: "Limit color palette to specific colors",
          type: "AreaModelColorKey[]",
          example: '["blue", "red"]',
        },
      },
    },
  },

  stateSchema: {
    shapes: {
      description: "Array of shapes displayed in the area model",
      properties: {
        id: {
          description: "Unique identifier for the shape",
          type: "string",
          required: true,
        },
        type: {
          description: "Shape type (rectangle, circle, bar)",
          type: "AreaShapeType",
          required: true,
        },
        partitions: {
          description: "How the shape is divided",
          type: "{ horizontal: number, vertical: number }",
          required: true,
          example: "{ horizontal: 4, vertical: 3 } = 4 rows × 3 columns",
        },
        shadedCells: {
          description: "Array of shaded cell coordinates with colors",
          type: "Array<{ row: number, col: number, color: AreaModelColorKey }>",
          example: '[{ row: 0, col: 0, color: "blue" }]',
        },
        shadingLayers: {
          description: "Layer-based shading for overlap visualization",
          type: "ShadingLayer[]",
        },
        regions: {
          description: "Labeled regions for partial products",
          type: "LabeledRegion[]",
        },
        dimensionLabels: {
          description: "Labels on rows and columns",
          type: "{ top?: DimensionMarker[], side?: DimensionMarker[] }",
        },
        labels: {
          description: "Overall shape labels",
          type: "{ top?: string, side?: string, shaded?: string, title?: string }",
        },
      },
      example: {
        id: "shape1",
        type: "rectangle",
        partitions: { horizontal: 1, vertical: 4 },
        shadedCells: [
          { row: 0, col: 0, color: "blue" },
          { row: 0, col: 1, color: "blue" },
          { row: 0, col: 2, color: "blue" },
        ],
      },
    },

    interactionState: {
      description: "Current interaction state",
      properties: {
        activeColor: {
          description: "Currently selected color for shading",
          type: "AreaModelColorKey",
          default: '"blue"',
        },
        activeShapeId: {
          description: "Currently selected shape for editing",
          type: "string",
        },
      },
    },
  },

  configurationTips: {
    shape_selection: [
      "Rectangle: Best for most fraction work, multiplication, partial products",
      "Circle: Good for pie-chart-like fractions, clock concepts",
      "Bar: Good for comparing fractions side-by-side, percent bars",
    ],
    partition_setup: [
      "For simple fractions like 3/4: use 1 row × 4 columns",
      "For fraction multiplication: rows = one fraction's denominator, cols = other's",
      "For partial products: split based on place value (23 = 20+3, so 2 columns)",
      "Keep partitions reasonable (2-12 per dimension) for visual clarity",
    ],
    shading_strategy: [
      "Use single color for simple fractions",
      "Use different colors for multiplication (blue for rows, red for columns)",
      "Enable showOverlap to see where colors intersect (the product)",
      "Pre-shade for demonstration, leave empty for student practice",
    ],
    interaction_modes: [
      "Demonstration: allowShading false - tutor controls display",
      "Guided practice: allowShading true, allowPartitioning false - student shades given shape",
      "Free exploration: all permissions true - student builds own model",
      "Assessment: allowShading true, allowClear false - one-shot answer",
    ],
  },

  interactionPresets: {
    demonstration: {
      description: "View only - tutor controls all elements",
      permissions: {
        allowPartitioning: false,
        allowShading: false,
        allowColorChange: false,
        allowAddingShapes: false,
        allowRemovingShapes: false,
        allowClear: false,
      },
    },
    guided_shading: {
      description: "Student can shade but not change partitions",
      permissions: {
        allowPartitioning: false,
        allowShading: true,
        allowColorChange: true,
        allowAddingShapes: false,
        allowRemovingShapes: false,
        allowClear: true,
      },
    },
    free_exploration: {
      description: "Student has full control",
      permissions: {
        allowPartitioning: true,
        allowShading: true,
        allowColorChange: true,
        allowAddingShapes: true,
        allowRemovingShapes: true,
        allowClear: true,
      },
    },
    comparison: {
      description: "Two shapes for comparing fractions",
      permissions: {
        allowPartitioning: false,
        allowShading: true,
        allowColorChange: false,
        allowAddingShapes: false,
        allowRemovingShapes: false,
        allowClear: true,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "Simple Fraction: Show 3/4",
      concept: "Student shades three-fourths of a rectangle",
      props: {
        config: {
          shapeType: "rectangle",
          showFractionLabels: true,
          fractionDisplay: "improper",
          showGridLines: true,
          gridOverlay: { enabled: false, rows: 1, cols: 1 },
          allowPartitioning: false,
          allowShading: true,
          allowColorChange: false,
          multipleShapes: false,
          maxShapes: 1,
          availableColors: ["blue"],
        },
        state: {
          shapes: [
            {
              id: "main",
              type: "rectangle",
              partitions: { horizontal: 1, vertical: 4 },
              shadedCells: [],
            },
          ],
          activeColor: "blue",
        },
      },
      pedagogy:
        "Empty 1×4 rectangle. Student clicks cells to shade 3 of 4 parts. Fraction label updates automatically as they shade.",
    },
    {
      name: "Compare Fractions: 2/3 vs 3/4",
      concept: "Which fraction is larger?",
      props: {
        config: {
          shapeType: "rectangle",
          showFractionLabels: true,
          fractionDisplay: "improper",
          showGridLines: true,
          fixedDimensions: { width: 200, height: 100 },
          gridOverlay: { enabled: false, rows: 1, cols: 1 },
          allowPartitioning: false,
          allowShading: false,
          allowColorChange: false,
          multipleShapes: true,
          maxShapes: 2,
        },
        state: {
          shapes: [
            {
              id: "thirds",
              type: "rectangle",
              partitions: { horizontal: 1, vertical: 3 },
              shadedCells: [
                { row: 0, col: 0, color: "blue" },
                { row: 0, col: 1, color: "blue" },
              ],
              labels: { title: "2/3" },
            },
            {
              id: "fourths",
              type: "rectangle",
              partitions: { horizontal: 1, vertical: 4 },
              shadedCells: [
                { row: 0, col: 0, color: "red" },
                { row: 0, col: 1, color: "red" },
                { row: 0, col: 2, color: "red" },
              ],
              labels: { title: "3/4" },
            },
          ],
        },
      },
      pedagogy:
        "Two same-size rectangles show 2/3 and 3/4. Visual comparison makes it clear 3/4 has more shaded area.",
    },
  ],

  commonMistakes: [
    "Using wrong partition count (4 rows instead of 4 columns for 3/4)",
    "Not using fixedDimensions when comparing fractions (different size shapes are misleading)",
    "Forgetting showOverlap for multiplication problems (overlap IS the product)",
    "Setting allowShading false when student should shade their answer",
    "Using too many partitions (12×12 grid is hard to see/count)",
    "Not matching shape partition to fraction denominator",
    "Asking student to 'shade 3/4' when shape has wrong number of parts",
    "Using horizontal partitions when vertical would be clearer (or vice versa)",
    "For multiplication: forgetting that one fraction = rows, other = columns",
    "Not labeling shapes when showing multiple for comparison",
  ],

  actions: {
    highlight_cell: {
      description: "Show a pulsing highlight on a specific cell",
      params: {
        shapeId: {
          type: "string",
          required: true,
          description: "ID of the shape containing the cell",
        },
        row: {
          type: "number",
          required: true,
          description: "Row index (0-based)",
        },
        col: {
          type: "number",
          required: true,
          description: "Column index (0-based)",
        },
        color: {
          type: "string",
          required: false,
          default: "#3b82f6",
          description: "Highlight color",
        },
        duration: {
          type: "number",
          required: false,
          default: 2000,
          description: "Duration in ms",
        },
        label: {
          type: "string",
          required: false,
          description: "Optional label to show on the cell",
        },
      },
      example: {
        action: "highlight_cell",
        params: { shapeId: "main", row: 0, col: 2, label: "3rd part" },
      },
      useCase: "Draw attention to a specific cell when explaining fractions",
    },
    highlight_region: {
      description: "Highlight multiple cells as a group",
      params: {
        shapeId: {
          type: "string",
          required: true,
          description: "ID of the shape",
        },
        cells: {
          type: "Array<{row: number, col: number}>",
          required: true,
          description: "Array of cells to highlight",
        },
        color: {
          type: "string",
          required: false,
          default: "#3b82f6",
          description: "Highlight color",
        },
        duration: {
          type: "number",
          required: false,
          default: 3000,
          description: "Duration in ms",
        },
        label: {
          type: "string",
          required: false,
          description: "Optional label for the region",
        },
      },
      example: {
        action: "highlight_region",
        params: {
          shapeId: "main",
          cells: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
          ],
          label: "2 parts",
        },
      },
      useCase:
        "Show a group of cells together, like 'these 2 parts represent the numerator'",
    },
    pulse_shape: {
      description: "Pulse the entire shape to draw attention",
      params: {
        shapeId: {
          type: "string",
          required: true,
          description: "ID of the shape to pulse",
        },
        duration: {
          type: "number",
          required: false,
          default: 1500,
          description: "Duration in ms",
        },
        color: {
          type: "string",
          required: false,
          description: "Optional color override",
        },
      },
      example: { action: "pulse_shape", params: { shapeId: "thirds" } },
      useCase: "Draw attention to one shape when comparing multiple",
    },
    clear_highlights: {
      description: "Clear all active highlights and animations",
      params: {},
      example: { action: "clear_highlights", params: {} },
      useCase: "Reset visual state before new explanation",
    },
    set_brush_color: {
      description: "Set the active brush color for student shading",
      params: {
        color: {
          type: "string",
          required: true,
          description: "Color to set as active",
        },
      },
      example: { action: "set_brush_color", params: { color: "red" } },
      useCase:
        "Guide student to use a specific color for the next shading step",
    },
  },
};

// ============================================
// Definition
// ============================================

export const areaModelDefinition = definePlayground({
  id: "area-model",
  name: "Area Model",
  icon: "🟦",
  description:
    "Visualize fractions, multiplication, and part-whole relationships using partitioned shapes",
  grades: "2-6",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: AreaModel,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type AreaModelDefinition = typeof areaModelDefinition;
export type AreaModelConfig = Config;
export type AreaModelState = State;
