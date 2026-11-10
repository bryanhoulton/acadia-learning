import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from "../types";
import { MathDrill } from "./MathDrill";
import {
  actionSchemas,
  type Config,
  ConfigSchema,
  type State,
  StateSchema,
} from "./schema";

const DEFAULT_STATE: State = {
  problems: [],
  currentIndex: 0,
  results: [],
  completed: false,
  startedAt: null,
  completedAt: null,
};

const DEFAULT_CONFIG: Config = {
  operations: ["addition", "subtraction"],
  numberTypes: ["integer"],
  operandRange: { min: 0, max: 10 },
  inputType: "type",
  problemCount: 10,
};

const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "basic-facts",
    name: "Basic Facts",
    description: "Addition and subtraction with small numbers (10 problems)",
    grades: "K-2",
    tags: ["beginner", "addition", "subtraction"],
    config: {
      operations: ["addition", "subtraction"],
      numberTypes: ["integer"],
      operandRange: { min: 0, max: 10 },
      inputType: "multiple-choice",
      multipleChoiceConfig: { numOptions: 4, distractorStrategy: "near-miss" },
      problemCount: 10,
    },
    state: DEFAULT_STATE,
  },
  {
    id: "times-tables",
    name: "Times Tables",
    description: "Multiplication facts 1-12 (15 problems)",
    grades: "3-4",
    tags: ["multiplication", "times-tables"],
    config: {
      operations: ["multiplication"],
      numberTypes: ["integer"],
      operandRange: { min: 1, max: 12 },
      inputType: "type",
      problemCount: 15,
    },
    state: DEFAULT_STATE,
  },
  {
    id: "fraction-practice",
    name: "Fraction Practice",
    description: "Add and subtract fractions (10 problems)",
    grades: "3-5",
    tags: ["fractions", "addition", "subtraction"],
    config: {
      operations: ["addition", "subtraction"],
      numberTypes: ["fraction"],
      operandRange: { min: 1, max: 10 },
      fractionConfig: {
        maxDenominator: 8,
        sameDenominator: true,
        allowImproper: false,
        requireSimplified: true,
      },
      inputType: "multiple-choice",
      multipleChoiceConfig: { numOptions: 4, distractorStrategy: "near-miss" },
      problemCount: 10,
    },
    state: DEFAULT_STATE,
  },
  {
    id: "speed-challenge",
    name: "Speed Challenge",
    description: "All operations, 60 second time limit",
    grades: "4-6",
    tags: ["challenge", "timed", "all-operations"],
    config: {
      operations: ["addition", "subtraction", "multiplication", "division"],
      numberTypes: ["integer"],
      operandRange: { min: 1, max: 12 },
      inputType: "type",
      timeLimitSeconds: 60,
    },
    state: DEFAULT_STATE,
  },
];

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "K-6",
    extended: "K-8",
  },
  interactionModel:
    "Agent configures a drill, student works through problems autonomously, agent checks results when needed.",
  cognitiveLevel: "Procedural fluency - Building automaticity with operations",
  bestFor: [
    "Quick math fact practice",
    "Building computational fluency",
    "Assessment of fact knowledge",
    "Warm-up or cool-down activity",
  ],
  whenToUse: [
    "Student needs to practice math facts",
    "Quick assessment of operational fluency",
    "Filling time between activities",
    "Student requests practice or drill",
  ],
  whenNotToUse: [
    "Teaching new concepts",
    "Student is frustrated or anxious",
    "Deep conceptual understanding is needed",
    "Agent needs to intervene during problems",
  ],
  exampleScenarios: [
    {
      concept: "Times tables practice",
      setup:
        "operations: ['multiplication'], operandRange: { min: 1, max: 12 }, problemCount: 15",
      grade: "3-4",
    },
    {
      concept: "Basic addition/subtraction",
      setup:
        "operations: ['addition', 'subtraction'], operandRange: { min: 0, max: 10 }, inputType: 'multiple-choice', problemCount: 10",
      grade: "K-2",
    },
    {
      concept: "Timed all-operations challenge",
      setup:
        "operations: ['addition', 'subtraction', 'multiplication', 'division'], timeLimitSeconds: 60",
      grade: "4-6",
    },
  ],
  visualDetails: {
    layout: `Simple centered layout:
- Header: Progress counter (X of Y) and optional countdown timer
- Center: Large problem display
- Below: Input area (number pad or multiple choice)
- Footer: Running score (X/Y correct)
- End: Completion screen with final score`,
    elements: {
      progress: "Shows current problem number and total (e.g., '3 of 10')",
      timer:
        "Countdown timer showing remaining time (only when timeLimitSeconds is set)",
      problem:
        "Large math expression rendered with KaTeX. Format: operand1 ⚬ operand2 = ?",
      numberPad: "3x4 grid of buttons for type-in answers",
      multipleChoice: "2x2 grid of answer options",
      feedback: "Brief correct/incorrect indicator on answer",
      completion:
        "Final screen showing total correct, total attempted, and percentage",
    },
    automaticBehaviors: [
      "Problems auto-advance after ~800ms feedback delay",
      "Drill ends when all problems answered or time runs out",
      "Problems are generated upfront based on config",
    ],
    colors: {
      correct: "#22c55e (green-500)",
      incorrect: "#ef4444 (red-500)",
    },
  },
  configSchema: {
    core: {
      description: "Problem generation settings",
      properties: {
        operations: {
          description: "Which operations to include",
          type: "array of 'addition' | 'subtraction' | 'multiplication' | 'division'",
          required: true,
          example: "['addition', 'subtraction']",
        },
        numberTypes: {
          description: "Types of numbers to use",
          type: "array of 'integer' | 'fraction' | 'mixed'",
          required: true,
          example: "['integer']",
        },
        operandRange: {
          description: "Range for operands",
          type: "{ min: number, max: number }",
          required: true,
          default: "{ min: 0, max: 12 }",
        },
        fractionConfig: {
          description: "Settings for fraction problems (when using fractions)",
          type: "{ maxDenominator, sameDenominator, allowImproper, requireSimplified }",
          default:
            "{ maxDenominator: 12, sameDenominator: true, allowImproper: false, requireSimplified: true }",
        },
      },
    },
    displayOptions: {
      description: "How student enters answers",
      properties: {
        inputType: {
          description: "Input method",
          type: "'type' | 'multiple-choice'",
          default: "'type'",
        },
        multipleChoiceConfig: {
          description:
            "Multiple choice settings (when inputType is 'multiple-choice')",
          type: "{ numOptions: 2-6, distractorStrategy: 'random' | 'near-miss' }",
          default: "{ numOptions: 4, distractorStrategy: 'near-miss' }",
        },
      },
    },
    interactionPermissions: {
      description: "End conditions (use one or the other)",
      properties: {
        problemCount: {
          description: "Fixed number of problems",
          type: "number (1-100)",
          default: "10",
        },
        timeLimitSeconds: {
          description: "Time limit in seconds (drill ends when time runs out)",
          type: "number (10-600)",
          example: "60 for a one-minute challenge",
        },
      },
    },
  },
  stateSchema: {
    drillProgress: {
      description: "Current drill state",
      properties: {
        problems: {
          description: "All problems (generated upfront)",
          type: "Problem[]",
          required: true,
        },
        currentIndex: {
          description: "Current problem index (0-based)",
          type: "number",
          required: true,
        },
        results: {
          description: "Results for answered problems",
          type: "ResultEntry[]",
          required: true,
        },
        completed: {
          description: "Whether drill is finished",
          type: "boolean",
          required: true,
        },
      },
    },
  },
  configurationTips: {
    grade_levels: [
      "K-2: addition/subtraction, 0-10, multiple-choice, 10 problems",
      "3-4: multiplication/division, 1-12, type input, 15 problems",
      "4-6: all operations, timed challenges",
    ],
    input_type: [
      "multiple-choice: Faster, less frustrating, good for K-2",
      "type: Better for fluency, requires recall not recognition",
    ],
    end_conditions: [
      "problemCount: Use for targeted practice (e.g., 10-20 problems)",
      "timeLimitSeconds: Use for speed challenges (e.g., 60 seconds)",
      "Only set one - if both set, whichever happens first ends the drill",
    ],
  },
  interactionPresets: {
    problem_count: {
      description: "Fixed number of problems",
      permissions: { problemCount: true },
    },
    timed: {
      description: "Time-limited drill",
      permissions: { timeLimitSeconds: true },
    },
  },
  exampleConfigurations: [
    {
      name: "Basic Facts",
      concept: "Addition and subtraction practice",
      props: {
        config: {
          operations: ["addition", "subtraction"],
          numberTypes: ["integer"],
          operandRange: { min: 0, max: 10 },
          inputType: "multiple-choice",
          multipleChoiceConfig: {
            numOptions: 4,
            distractorStrategy: "near-miss",
          },
          problemCount: 10,
        },
        state: DEFAULT_STATE,
      },
      pedagogy: "Multiple choice reduces frustration for younger learners.",
    },
    {
      name: "Times Tables",
      concept: "Multiplication fact fluency",
      props: {
        config: {
          operations: ["multiplication"],
          numberTypes: ["integer"],
          operandRange: { min: 1, max: 12 },
          inputType: "type",
          problemCount: 15,
        },
        state: DEFAULT_STATE,
      },
      pedagogy: "Type input requires recall, building stronger fluency.",
    },
  ],
  commonMistakes: [
    "Setting both problemCount and timeLimitSeconds - use one or the other",
    "Using type input for K-1 students - multiple-choice is more appropriate",
    "Setting fractionConfig when numberTypes doesn't include 'fraction'",
  ],
  actions: {
    get_results: {
      description:
        "Get current drill results. Returns results_response event with: completed, correct, total, accuracy, timeElapsed, results[]",
      params: {},
      example: { action: "get_results", params: {} },
      useCase:
        "Check how the student is doing, get final results after completion",
    },
  },
};

export const mathDrillDefinition = definePlayground({
  id: "math-drill",
  name: "Math Drill",
  icon: "⚡",
  description: "Quick math fact practice - configure, run, check results",
  grades: "K-6",
  enabled: true,
  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },
  defaultConfig: DEFAULT_CONFIG,
  defaultState: DEFAULT_STATE,
  presets,
  component: MathDrill,
  guide,
});

export type MathDrillConfig = Config;
export type MathDrillState = State;
