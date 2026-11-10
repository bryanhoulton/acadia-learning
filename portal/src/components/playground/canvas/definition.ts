/**
 * Canvas Playground Definition
 *
 * SINGLE SOURCE OF TRUTH for the canvas playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 *
 * Canvas is the default/fallback playground - it should always be enabled.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from '../types';
import { Canvas } from './Canvas';
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
    name: "Empty Canvas",
    description: "Start with an empty canvas",
    grades: "K-12",
    tags: ["default"],
    config: {},
    state: { blocks: [] },
  },
  {
    id: "explanation",
    name: "Explanation Template",
    description: "Text and math blocks for explaining concepts",
    grades: "K-12",
    tags: ["explanation", "teaching"],
    config: {},
    state: {
      blocks: [
        {
          data: { type: "text", text: "Let's learn about..." },
          index: 0,
        },
        {
          data: { type: "math", latex: "x = ?" },
          index: 1,
        },
      ],
    },
  },
  {
    id: "assessment",
    name: "Assessment Template",
    description: "Question blocks for student assessment",
    grades: "K-12",
    tags: ["assessment", "quiz"],
    config: {},
    state: {
      blocks: [
        {
          data: { type: "text", text: "Answer the following question:" },
          index: 0,
        },
        {
          data: {
            type: "question",
            question: "What is the answer?",
            correct_answer: "",
          },
          index: 1,
        },
      ],
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "K-12",
    extended: "K-12",
  },

  interactionModel:
    "Block-based content display. Stack blocks of different types (text, math, questions, graphs) to build instructional content. Students can interact with question blocks.",
  cognitiveLevel:
    "Symbolic/Abstract - Presents information and captures responses",

  bestFor: [
    "Displaying step-by-step worked examples",
    "Presenting text explanations with math",
    "Asking questions and capturing student answers",
    "Multiple choice assessments",
    "Showing graphs and visualizations inline",
    "Building mixed content (text + math + questions)",
    "General tutoring conversations",
  ],

  whenToUse: [
    "Need to present information step by step",
    "Want to ask the student a question",
    "Showing worked examples with explanations",
    "Don't need interactive manipulatives",
    "Building instructional content progressively",
  ],

  whenNotToUse: [
    "Student needs interactive visual exploration of a concept",
    "Teaching operations as physical movement or manipulation",
    "Concept benefits from hands-on interaction rather than static display",
    "Working with geometric constructions that require precise positioning",
    "Need real-time graphing with function tracing",
  ],

  exampleScenarios: [
    {
      concept: "Explain how to solve 2x + 5 = 13",
      setup:
        "Start with text block explaining the goal, then add step-by-step math blocks showing the solution, end with a question block asking student to verify.",
      grade: "7-8",
    },
    {
      concept: "Multiple choice quiz on fractions",
      setup:
        "Text block with instructions, followed by multiple_choice blocks for each question. Set correct_answer to validate responses.",
      grade: "4-5",
    },
    {
      concept: "Introduce the Pythagorean theorem",
      setup:
        "Text block with explanation, math block showing a² + b² = c², graph block showing a right triangle, question block asking student to find a side length.",
      grade: "8",
    },
  ],

  visualDetails: {
    layout: `
      Canvas renders as a vertical stack of blocks inside a scrollable container.
      Each block has padding and renders based on its type.
      
      Visual structure:
      ┌─────────────────────────────────────────┐
      │ ┌─────────────────────────────────────┐ │
      │ │ Text Block                          │ │
      │ │ "Let's solve this equation..."      │ │
      │ └─────────────────────────────────────┘ │
      │ ┌─────────────────────────────────────┐ │
      │ │ Math Block                          │ │
      │ │      2x + 5 = 13                    │ │
      │ └─────────────────────────────────────┘ │
      │ ┌─────────────────────────────────────┐ │
      │ │ Question Block                      │ │
      │ │ "What is x?"                        │ │
      │ │ [____________] <- input field       │ │
      │ └─────────────────────────────────────┘ │
      │ ┌─────────────────────────────────────┐ │
      │ │ Multiple Choice Block               │ │
      │ │ "Which is correct?"                 │ │
      │ │ ○ A) 4                              │ │
      │ │ ○ B) 8                              │ │
      │ │ ● C) 9  <- selected                 │ │
      │ └─────────────────────────────────────┘ │
      └─────────────────────────────────────────┘
    `,
    elements: {
      textBlock: "Renders plain text or markdown content",
      mathBlock: "Renders LaTeX math using KaTeX",
      questionBlock:
        "Shows question text with an input field for student answer",
      multipleChoiceBlock:
        "Shows question with radio buttons for options, validates against correct_answer",
      graphBlock: "Renders a mathematical graph/plot",
      tableBlock: "Renders data in a table format",
      timelineBlock: "Renders events on a timeline",
      numberLineBlock:
        "Simple static number line display (for interactive, use number-line playground)",
      fractionBlock: "Visual fraction representation",
    },
    automaticBehaviors: [
      "Blocks render in order by index",
      "Question blocks validate input against correct_answer when submitted",
      "Multiple choice highlights correct/incorrect after selection",
      "Math blocks auto-render LaTeX",
      "Canvas auto-scrolls to show new blocks",
    ],
  },

  configSchema: {
    core: {
      description: "Canvas has no config options - all content is in state",
      properties: {},
    },
    displayOptions: {
      description: "No display options",
      properties: {},
    },
    interactionPermissions: {
      description:
        "No interaction permissions - students can always interact with question blocks",
      properties: {},
    },
  },

  stateSchema: {
    blocks: {
      description: "Array of content blocks",
      properties: {
        "blocks[].data": {
          description: "Block content - structure depends on block type",
          type: "object",
          required: true,
        },
        "blocks[].data.type": {
          description:
            "Block type: text, math, question, multiple_choice, graph, table, timeline, number_line, fraction",
          type: "string",
          required: true,
        },
        "blocks[].index": {
          description: "Order of the block (0-indexed)",
          type: "number",
          required: true,
        },
      },
      example: {
        data: { type: "text", text: "Hello world" },
        index: 0,
      },
    },
    blockTypes: {
      description: "Available block types and their data properties",
      properties: {
        text: {
          description:
            "Text content block. Use size to scale the text larger for emphasis.",
          type: '{ type: "text", text: string, size?: "small" | "medium" | "large" | number }',
          example: '{ "type": "text", "text": "Let\'s solve this problem:" }',
          sizeNote:
            "size: 'small'=1x, 'medium'=2x, 'large'=5x, or use a number directly",
        },
        math: {
          description:
            "LaTeX math expression. Use size to scale the math larger for emphasis.",
          type: '{ type: "math", latex: string, size?: "small" | "medium" | "large" | number }',
          example:
            '{ "type": "math", "latex": "2x + 5 = 13", "size": "large" }',
          sizeNote:
            "size: 'small'=1x, 'medium'=2x, 'large'=5x, or use a number directly",
        },
        question: {
          description: "Short answer question",
          type: '{ type: "question", question: string, correct_answer: string }',
          example:
            '{ "type": "question", "question": "What is x?", "correct_answer": "4" }',
        },
        multiple_choice: {
          description: "Multiple choice question",
          type: '{ type: "multiple_choice", question: string, options: string[], correct_answer: string }',
          example:
            '{ "type": "multiple_choice", "question": "Which is 2+2?", "options": ["3", "4", "5"], "correct_answer": "4" }',
        },
        graph: {
          description: "Mathematical graph with equations and/or points",
          type: '{ type: "graph", equations?: {equation: string, color: string}[], points?: {x: number, y: number, label?: string, color: string}[], viewport_left: number, viewport_right: number, viewport_top: number, viewport_bottom: number }',
          example:
            '{ "type": "graph", "equations": [{"equation": "x^2", "color": "blue"}], "points": [{"x": 2, "y": 4, "color": "red"}], "viewport_left": -5, "viewport_right": 5, "viewport_top": 10, "viewport_bottom": -2 }',
        },
        table: {
          description: "Data table with headers and rows",
          type: '{ type: "table", headers: string[], rows: string[][] }',
          example:
            '{ "type": "table", "headers": ["x", "y"], "rows": [["1", "2"], ["3", "6"]] }',
        },
        timeline: {
          description: "Timeline with sequential items/events",
          type: '{ type: "timeline", items: {title: string, description?: string, date: string, filled?: boolean}[], title?: string, color?: string }',
          example:
            '{ "type": "timeline", "title": "Steps", "items": [{"title": "Step 1", "date": "First", "description": "Do this first"}, {"title": "Step 2", "date": "Second"}] }',
        },
        number_line: {
          description: "Simple number line with marks, segments, or rays",
          type: '{ type: "number_line", min: number, max: number, step?: number, marks?: {value: number, label?: string, color?: string}[], segments?: {start: number, end: number, color?: string}[], rays?: {value: number, direction: "left"|"right", color?: string}[], title?: string }',
          example:
            '{ "type": "number_line", "min": 0, "max": 10, "marks": [{"value": 5, "label": "halfway", "color": "blue"}] }',
        },
        fraction: {
          description:
            "Visual fraction diagram (pie or grid). Pass an array of fractions to display.",
          type: '{ type: "fraction", fractions: {numerator: number, denominator: number, fillColor?: string}[], diagram_type?: "pie"|"grid", show_label?: boolean }',
          example:
            '{ "type": "fraction", "fractions": [{"numerator": 1, "denominator": 2}, {"numerator": 3, "denominator": 4}], "diagram_type": "pie" }',
        },
      },
    },
  },

  configurationTips: {
    block_ordering: [
      "Use index to control block order - lower indices appear first",
      "Start with context (text), then content (math), then assessment (question)",
      "Add blocks progressively as you explain - don't dump everything at once",
      "When showing just 1-2 blocks, use size: 'large' to make them prominent and fill the canvas",
    ],
    question_blocks: [
      "Always provide correct_answer for validation",
      "Keep questions focused on one concept",
      "Use multiple_choice when there are common misconceptions to address",
    ],
    math_blocks: [
      "Use standard LaTeX notation",
      "For fractions: \\frac{a}{b}",
      "For exponents: x^2",
      "For square roots: \\sqrt{x}",
      "Use size: 'large' to make important equations bigger and more visible",
    ],
    sizing: [
      "Use size property on text and math blocks to scale them: 'small' (1x), 'medium' (2x), 'large' (5x)",
      "IMPORTANT: When showing just 1-2 blocks (e.g., a single equation or problem), use size: 'large' to fill the canvas and make it more visible",
      "Large size is great for emphasizing key equations or important text",
      "You can also use a number directly (e.g., size: 3 for 3x scale)",
      "Use smaller sizes when you have many blocks that need to fit together",
    ],
  },

  interactionPresets: {
    explanation: {
      description: "Text and math blocks only - pure explanation",
      permissions: {},
    },
    assessment: {
      description: "Include question blocks for student responses",
      permissions: {},
    },
    worked_example: {
      description: "Step-by-step solution with final check question",
      permissions: {},
    },
  },

  exampleConfigurations: [
    {
      name: "Simple Explanation with Question",
      concept: "Explain a concept then ask a question",
      props: {
        config: {},
        state: {
          blocks: [
            {
              data: {
                type: "text",
                text: "Let's solve the equation 2x + 5 = 13",
              },
              index: 0,
            },
            {
              data: { type: "math", latex: "2x + 5 = 13" },
              index: 1,
            },
            {
              data: {
                type: "text",
                text: "First, subtract 5 from both sides:",
              },
              index: 2,
            },
            {
              data: { type: "math", latex: "2x = 8" },
              index: 3,
            },
            {
              data: { type: "text", text: "Then divide both sides by 2:" },
              index: 4,
            },
            {
              data: { type: "math", latex: "x = 4" },
              index: 5,
            },
            {
              data: {
                type: "question",
                question: "What is x?",
                correct_answer: "4",
              },
              index: 6,
            },
          ],
        },
      },
      pedagogy:
        "Build up the solution step by step, explaining each operation. End with a question to verify understanding.",
    },
    {
      name: "Multiple Choice Assessment",
      concept: "Test understanding with multiple choice",
      props: {
        config: {},
        state: {
          blocks: [
            {
              data: {
                type: "text",
                text: "Which expression is equivalent to 3(x + 2)?",
              },
              index: 0,
            },
            {
              data: {
                type: "multiple_choice",
                question: "Select the correct answer:",
                options: ["3x + 2", "3x + 6", "x + 6", "3x + 5"],
                correct_answer: "3x + 6",
              },
              index: 1,
            },
          ],
        },
      },
      pedagogy:
        "Use multiple choice to check for common distribution errors. Wrong answers reflect typical mistakes.",
    },
  ],

  commonMistakes: [
    "Adding too many blocks at once - build up progressively as you explain",
    "Forgetting to set correct_answer on question blocks",
    "Using wrong LaTeX syntax in math blocks",
    "Not using index properly - blocks may appear out of order",
    "Putting interactive content in canvas when a specialized playground would be better",
    "Making questions too long - keep them focused",
    "Not providing context before asking questions",
  ],
};

// ============================================
// Definition
// ============================================

export const canvasDefinition = definePlayground({
  id: "canvas",
  name: "Canvas",
  icon: "📝",
  description:
    "Block-based content display for text, math, questions, graphs, and more",
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

  component: Canvas,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type CanvasDefinition = typeof canvasDefinition;
export type CanvasConfig = Config;
export type CanvasState = State;
