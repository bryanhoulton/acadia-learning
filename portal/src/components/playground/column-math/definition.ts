/**
 * Column Math Definition
 *
 * SINGLE SOURCE OF TRUTH for the column-math playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from '../types';
import { ColumnMath } from './ColumnMath';
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
  // Addition progression
  {
    id: "addition-no-carry",
    name: "Addition: No Carrying",
    description: "Simple 2-digit addition without carrying",
    grades: "1-2",
    tags: ["addition", "beginner", "no-regrouping"],
    config: {
      operation: "addition",
      operands: [23, 45],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "addition-simple-carry",
    name: "Addition: With Carrying",
    description: "2-digit addition introducing carrying",
    grades: "2-3",
    tags: ["addition", "carrying", "regrouping"],
    config: {
      operation: "addition",
      operands: [28, 35],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "addition-three-digit",
    name: "Addition: 3-Digit",
    description: "Three-digit addition with multiple carries",
    grades: "2-3",
    tags: ["addition", "3-digit", "carrying"],
    config: {
      operation: "addition",
      operands: [347, 285],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "addition-three-numbers",
    name: "Addition: Three Numbers",
    description: "Adding three numbers together",
    grades: "3-4",
    tags: ["addition", "multiple-addends"],
    config: {
      operation: "addition",
      operands: [156, 234, 189],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "addition-large",
    name: "Addition: Large Numbers",
    description: "4-digit addition practice",
    grades: "3-4",
    tags: ["addition", "4-digit", "advanced"],
    config: {
      operation: "addition",
      operands: [2847, 1965],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  // Subtraction progression
  {
    id: "subtraction-no-borrow",
    name: "Subtraction: No Borrowing",
    description: "Simple 2-digit subtraction without borrowing",
    grades: "1-2",
    tags: ["subtraction", "beginner", "no-regrouping"],
    config: {
      operation: "subtraction",
      operands: [67, 23],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "subtraction-simple-borrow",
    name: "Subtraction: With Borrowing",
    description: "2-digit subtraction introducing borrowing",
    grades: "2-3",
    tags: ["subtraction", "borrowing", "regrouping"],
    config: {
      operation: "subtraction",
      operands: [52, 38],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "subtraction-three-digit",
    name: "Subtraction: 3-Digit",
    description: "Three-digit subtraction with borrowing",
    grades: "2-3",
    tags: ["subtraction", "3-digit", "borrowing"],
    config: {
      operation: "subtraction",
      operands: [542, 287],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "subtraction-across-zeros",
    name: "Subtraction: Across Zeros",
    description: "Borrowing when there are zeros (challenging)",
    grades: "3-4",
    tags: ["subtraction", "zeros", "advanced-borrowing"],
    config: {
      operation: "subtraction",
      operands: [400, 156],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
  {
    id: "subtraction-large",
    name: "Subtraction: Large Numbers",
    description: "4-digit subtraction practice",
    grades: "3-4",
    tags: ["subtraction", "4-digit", "advanced"],
    config: {
      operation: "subtraction",
      operands: [5432, 2789],
      showPlaceValues: true,
      showRegrouping: true,
      interactive: true,
      autoSolve: false,
    },
    state: {
      completed: false,
      isCorrect: null,
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "1-4",
    extended: "K-5",
  },

  interactionModel:
    "Agent-controlled visual tool for column arithmetic. The agent manipulates the display while explaining verbally to the student.",
  cognitiveLevel:
    "Concrete/Procedural - visual representation of the standard algorithm with explicit regrouping",

  bestFor: [
    "Teaching the standard addition algorithm with carrying",
    "Teaching the standard subtraction algorithm with borrowing",
    "Understanding place value through regrouping",
    "Step-by-step demonstrations with verbal explanation",
    "Showing work for multi-digit arithmetic",
  ],

  whenToUse: [
    "When teaching multi-digit addition or subtraction algorithms",
    "When explaining carrying (addition) or borrowing (subtraction)",
    "For guided demonstrations while talking through each step",
    "When the student needs to see the process broken down",
  ],

  whenNotToUse: [
    "For mental math fluency practice",
    "For conceptual understanding of what operations mean",
    "For single-digit facts practice",
    "When students already have procedural fluency",
  ],

  exampleScenarios: [
    {
      concept: "Teaching borrowing in subtraction",
      setup:
        "For 52 - 38: First highlight_column(0), explain '2 minus 8, hmm we can't do that.' Then borrow(from:1, to:0), explain 'Watch - I borrow from the tens. 5 becomes 4, and 2 becomes 12.' Then set_answer(column:0, value:4), explain 'Now 12 minus 8 is 4.'",
      grade: "2-3",
    },
    {
      concept: "Teaching carrying in addition",
      setup:
        "For 28 + 35: First highlight_column(0), explain '8 plus 5 is 13.' Then set_answer(column:0, value:3), then carry(column:1, value:1), explain 'We write the 3 and carry the 1 to the tens.'",
      grade: "2-3",
    },
    {
      concept: "Borrowing across zeros",
      setup:
        "For 400 - 156: Show the cascading borrow - must first borrow from hundreds to tens, then tens becomes 10, then borrow again to ones. Use multiple borrow actions with explanations.",
      grade: "3-4",
    },
  ],

  visualDetails: {
    layout:
      "Vertical stack: numbers aligned by place value with a horizontal line separating operands from answer",
    elements: {
      operands: "Numbers stacked vertically, right-aligned by place value",
      operationSymbol: "+ or − shown to the left of the bottom operand",
      separatorLine: "Thick horizontal line above the answer row",
      answerRow: "Underscores for empty, filled digits when set",
      displayDigits:
        "The current visual state of operand digits - changes when borrowing (e.g., 5→4, 2→12)",
      carries: "(Addition) Small numbers above columns showing carried values",
      borrowMarks:
        "(Subtraction) Original digit fades/crosses out, new value appears in rose color",
      placeLabels: "Optional labels below: 'ones', 'tens', 'hundreds', etc.",
    },
    automaticBehaviors: [
      "Smooth animations when digits change (borrow/carry)",
      "Original digit crosses out and fades when borrowed from",
      "New value animates in with scale effect",
      "Completion checkmark appears when all digits are filled correctly",
    ],
    colors: {
      digits: "Dark gray for normal operand digits",
      borrowed: "Rose/red for adjusted values after borrowing",
      crossedOut: "Light gray with strikethrough for borrowed-from digits",
      carry: "Amber/orange for carry digits above columns",
      answer: "Dark gray normally, emerald green when completed",
      highlight: "Blue background for highlighted columns",
    },
  },

  configSchema: {
    core: {
      description: "Essential settings for the arithmetic problem",
      properties: {
        operation: {
          description: "The arithmetic operation to perform",
          type: '"addition" | "subtraction"',
          required: true,
          example: "subtraction",
        },
        operands: {
          description:
            "Numbers to operate on. For addition: all addends. For subtraction: [minuend, subtrahend]",
          type: "number[]",
          required: true,
          example: "[52, 38]",
        },
      },
    },
    displayOptions: {
      description: "Control what visual elements are shown",
      properties: {
        showPlaceValues: {
          description:
            "Show place value labels (ones, tens, hundreds) below columns",
          type: "boolean",
          default: "true",
        },
        showRegrouping: {
          description:
            "Show carries (addition) or allow borrow marks (subtraction)",
          type: "boolean",
          default: "true",
        },
      },
    },
    interactionPermissions: {
      description: "Control student interaction and answer display",
      properties: {
        interactive: {
          description:
            "When true, student types answer digits column by column. Wrong answers are accepted but shown as incorrect (red) when all digits are filled. When false, the problem is displayed but the student cannot type.",
          type: "boolean",
          default: "false",
        },
        autoSolve: {
          description:
            "When true (and interactive=false), the answer is automatically displayed. When false, the problem is shown without the answer, allowing the agent to walk through the solution step by step using actions like set_answer.",
          type: "boolean",
          default: "false",
          important:
            "Use autoSolve=true to show a completed problem. Use autoSolve=false (default) when you want to demonstrate the solution process step by step.",
        },
      },
    },
  },

  stateSchema: {
    display: {
      description:
        "Current visual state of the problem. Arrays use place-value indexing (index 0 = ones, index 1 = tens, etc.)",
      properties: {
        displayDigits: {
          description:
            "2D array of current digit values for each operand. Index 0 = ones, 1 = tens, etc. Example: 52 is [2, 5]. Changes when borrowing (e.g., 52's [2, 5] becomes [12, 4] after borrowing).",
          type: "number[][]",
          required: true,
        },
        answerDigits: {
          description:
            "Answer digits per column. Index 0 = ones place, 1 = tens, etc. Null for unfilled columns.",
          type: "(number | null)[]",
          required: true,
        },
        carries: {
          description:
            "Carry values above each column (addition only). Index 0 = ones, 1 = tens, etc. carries[1] means a carry above the tens column.",
          type: "(number | null)[]",
          required: true,
        },
      },
    },
    progress: {
      description: "Tracks solving progress",
      properties: {
        currentColumn: {
          description: "Currently focused column (for highlighting)",
          type: "number | null",
          required: true,
        },
        completed: {
          description: "Whether the problem is fully solved",
          type: "boolean",
          required: true,
        },
      },
    },
  },

  configurationTips: {
    problemSelection: [
      "Start with no-regrouping problems (e.g., 23 + 45) for new learners",
      "Introduce single carries/borrows before multiple",
      "For subtraction, 'borrowing across zeros' (e.g., 400 - 156) is advanced",
      "Keep digit count appropriate: 2 for grade 1-2, 3-4 for grade 3-4",
    ],
    teachingFlow: [
      "Highlight the column you're discussing",
      "Explain the operation verbally before showing it",
      "For borrowing: explain WHY we need to borrow before doing it",
      "For carrying: show the carry appearing after explaining the sum",
      "Move column by column, right to left",
    ],
  },

  interactionPresets: {
    demonstration: {
      description:
        "Agent walks through the solution step by step using set_answer actions while explaining verbally",
      permissions: {
        interactive: false,
        autoSolve: false,
        showRegrouping: true,
        showPlaceValues: true,
      },
    },
    show_completed: {
      description:
        "Display the fully solved problem immediately (use when reviewing or checking answers)",
      permissions: {
        interactive: false,
        autoSolve: true,
        showRegrouping: true,
        showPlaceValues: true,
      },
    },
    guided_practice: {
      description: "Student types answers, agent handles borrow/carry actions",
      permissions: {
        interactive: true,
        autoSolve: false,
        showRegrouping: true,
        showPlaceValues: true,
      },
    },
    independent_practice: {
      description: "Student works independently with minimal scaffolding",
      permissions: {
        interactive: true,
        autoSolve: false,
        showRegrouping: false,
        showPlaceValues: false,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "Teaching Subtraction with Borrowing (52 - 38)",
      concept: "Step-by-step borrowing demonstration",
      props: {
        config: {
          operation: "subtraction",
          operands: [52, 38],
          showPlaceValues: true,
          showRegrouping: true,
          interactive: false,
          autoSolve: false,
        },
        state: {
          completed: false,
          isCorrect: null,
        },
      },
      pedagogy:
        "Teaching script: 1) highlight_column(0), say 'Let's start with the ones. 2 minus 8... can we do that?' 2) Wait for response. 3) Say 'We need more ones. Let's borrow from the tens.' 4) borrow(from:1, to:0) - the 5 becomes 4, and 2 becomes 12. 5) Say 'Now we have 12 minus 8.' 6) set_answer(column:0, value:4). 7) Continue to tens column.",
    },
    {
      name: "Teaching Addition with Carrying (28 + 35)",
      concept: "Step-by-step carrying demonstration",
      props: {
        config: {
          operation: "addition",
          operands: [28, 35],
          showPlaceValues: true,
          showRegrouping: true,
          interactive: false,
          autoSolve: false,
        },
        state: {
          completed: false,
          isCorrect: null,
        },
      },
      pedagogy:
        "Teaching script: 1) highlight_column(0), say 'Let's add the ones. 8 plus 5 is?' 2) Wait for '13'. 3) Say 'Right! 13. We write the 3 and carry the 1.' 4) set_answer(column:0, value:3), then carry(column:1, value:1). 5) Say 'Now the tens: 2 plus 3 plus our carried 1.' 6) Continue.",
    },
    {
      name: "Showing Completed Problem (28 + 35 = 63)",
      concept: "Display a fully solved problem for review",
      props: {
        config: {
          operation: "addition",
          operands: [28, 35],
          showPlaceValues: true,
          showRegrouping: true,
          interactive: false,
          autoSolve: true,
        },
        state: {
          completed: false,
          isCorrect: null,
        },
      },
      pedagogy:
        "Use autoSolve=true when you want to show the completed problem immediately, such as when reviewing answers or showing a worked example.",
    },
  ],

  commonMistakes: [
    "Using autoSolve=true when you want to demonstrate step by step (use autoSolve=false and set_answer actions instead)",
    "Forgetting to set interactive=true when you want the student to type answers",
    "Setting operands in wrong order for subtraction (smaller first gives negative)",
    "Performing borrow/carry without verbal explanation first",
    "Moving too fast - let the animation complete and student absorb",
    "Not highlighting the column you're discussing",
  ],

  actions: {
    set_answer: {
      description: "Set an answer digit in a specific column (agent-controlled mode)",
      params: {
        column: {
          type: "number",
          required: true,
          description: "Column index (0 = ones, 1 = tens, 2 = hundreds, etc.)",
        },
        value: {
          type: "number",
          required: true,
          description: "The digit to set (0-9)",
        },
      },
      example: {
        action: "set_answer",
        params: { column: 0, value: 4 },
      },
      useCase:
        "After explaining the calculation for a column, set the answer digit to show the result.",
    },
    carry: {
      description: "Set a carry digit above a column (for addition)",
      params: {
        column: {
          type: "number",
          required: true,
          description: "Column index where the carry appears (0 = ones, 1 = tens, etc.)",
        },
        value: {
          type: "number",
          required: true,
          description: "The carry value (typically 1, but could be higher for multi-addend)",
        },
      },
      example: {
        action: "carry",
        params: { column: 1, value: 1 },
      },
      useCase:
        "When a column sum exceeds 9, show the carry digit above the next column.",
    },
    borrow: {
      description: "Perform a borrow operation (for subtraction)",
      params: {
        from: {
          type: "number",
          required: true,
          description: "Column to borrow FROM (the column that decreases by 1)",
        },
        to: {
          type: "number",
          required: true,
          description: "Column to borrow TO (the column that gains 10)",
        },
      },
      example: {
        action: "borrow",
        params: { from: 1, to: 0 },
      },
      useCase:
        "When you can't subtract a larger digit from a smaller one, borrow from the next column.",
    },
    highlight_column: {
      description: "Highlight a column to draw attention to it",
      params: {
        column: {
          type: "number",
          required: true,
          description: "Column index (0 = ones, 1 = tens, etc.)",
        },
        duration: {
          type: "number",
          required: false,
          description: "How long to highlight in milliseconds",
          default: 2000,
        },
      },
      example: {
        action: "highlight_column",
        params: { column: 0, duration: 3000 },
      },
      useCase:
        "Before discussing a column, highlight it so the student knows where to look.",
    },
    reset: {
      description: "Reset the problem to initial state",
      params: {},
      example: { action: "reset", params: {} },
      useCase: "Start over to demonstrate again or try a different approach.",
    },
  },
};

// ============================================
// Definition
// ============================================

export const columnMathDefinition = definePlayground({
  id: "column-math",
  name: "Column Math",
  icon: "🔢",
  description: "Visual column addition & subtraction with regrouping",
  grades: "1-4",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: ColumnMath,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type ColumnMathDefinition = typeof columnMathDefinition;
export type ColumnMathConfig = Config;
export type ColumnMathState = State;
