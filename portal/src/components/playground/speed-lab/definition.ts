/**
 * Speed Lab Playground Definition
 *
 * SINGLE SOURCE OF TRUTH for the speed-lab playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from '../types';
import {
  actionSchemas,
  type Config,
  ConfigSchema,
  PAGE_IDS,
  type State,
  StateSchema,
} from './schema';
import { SpeedLab } from './SpeedLab';

// ============================================
// Presets
// ============================================

/** Default state shared across presets */
const DEFAULT_STATE_BASE: Omit<State, "currentPage"> = {
  selectedVehicleId: "racingcar",
  carConfig: { weightAdjustment: 0, tireType: 1 },
  statAdjustments: { topSpeed: 0, acceleration: 0, handling: 0 },
  quizProgress: { answered: [], correct: [] },
  dynamicQuestion: null,
  quizEnded: false,
  hintText: null,
};

const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "default",
    name: "Full Speed Lab",
    description: "Complete Speed Lab experience with all pages",
    grades: "3-8",
    tags: ["physics", "fractions", "interactive"],
    config: {
      allowedPages: [...PAGE_IDS], // All pages
      trackLength: 1000,
      allowVehicleSwitch: true,
      allowStatAdjustment: true,
      agentControlledQuiz: true,
    },
    state: {
      ...DEFAULT_STATE_BASE,
      currentPage: "welcome",
    },
  },
  {
    id: "build-only",
    name: "Vehicle Builder",
    description: "Focus on building and testing vehicles without quiz",
    grades: "3-5",
    tags: ["physics", "exploration"],
    config: {
      allowedPages: ["welcome", "build", "simulation", "victory"],
      trackLength: 1000,
      allowVehicleSwitch: true,
      allowStatAdjustment: true,
      agentControlledQuiz: false,
    },
    state: {
      ...DEFAULT_STATE_BASE,
      currentPage: "welcome",
    },
  },
  {
    id: "quiz-practice",
    name: "Fraction Quiz Practice",
    description: "Jump straight to the fraction quiz for practice",
    grades: "4-6",
    tags: ["fractions", "quiz", "practice"],
    config: {
      allowedPages: ["quiz"],
      trackLength: 1000,
      allowVehicleSwitch: false,
      allowStatAdjustment: false,
      agentControlledQuiz: true,
    },
    state: {
      ...DEFAULT_STATE_BASE,
      currentPage: "quiz",
    },
  },
];

// ============================================
// Guide Content
// ============================================

const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: {
    primary: "3-6",
    extended: "K-8",
  },

  interactionModel:
    "Multi-phase interactive lab: Welcome → Build → Simulate → Victory → Quiz. Students select vehicles, adjust weight/tires, run physics simulations, and answer fraction questions about car science.",

  cognitiveLevel:
    "Applied/Experiential - Students learn physics concepts through hands-on vehicle customization and see real-time consequences in simulation.",

  bestFor: [
    "Teaching fractions in applied contexts (weight as fractions of tons, friction as decimals/fractions)",
    "Introducing physics concepts: weight, friction, acceleration",
    "Making math tangible through vehicle building and racing",
    "Engaging students who prefer hands-on, game-like learning",
    "Cross-curricular lessons combining math and science",
  ],

  whenToUse: [
    "Introducing or reinforcing fraction concepts",
    "Teaching about weight, mass, and their effects on motion",
    "Explaining friction coefficients in accessible terms",
    "When students need motivation through gamification",
    "For formative assessment of fraction understanding",
  ],

  whenNotToUse: [
    "When teaching abstract fraction operations without context",
    "For pure computation practice (use math-drill instead)",
    "When limited time doesn't allow full exploration",
    "For students who need more structured, step-by-step instruction",
  ],

  exampleScenarios: [
    {
      concept: "Fractions of weight: Understanding ¾ ton",
      setup:
        "Start with Welcome, guide through Build phase. Have student select a race car and discuss its weight in fractions of tons.",
      grade: "4-5",
    },
    {
      concept: "Comparing friction values as fractions",
      setup:
        "In Build phase, have student compare tire options (0.6, 0.8, 1.0 friction) and convert to fractions (⅗, ⅘, 1).",
      grade: "5-6",
    },
    {
      concept: "Weight affects acceleration",
      setup:
        "Have student build two configurations: light car vs heavy car with same tires. Run simulation and compare results.",
      grade: "3-5",
    },
  ],

  visualDetails: {
    layout: `
      The Speed Lab renders as a full-height container with phase-specific content:
      - Welcome: Intro screen with start button
      - Build: Vehicle selector, 3D model preview, weight/tire controls
      - Simulation: 2D racing view with physics-based car movement
      - Quiz: Question cards with answer options, 3D car preview
    `,
    elements: {
      vehicleCanvas: "3D rendered LEGO vehicle model using Three.js",
      controls: "Slider-based controls for weight and tire selection",
      raceTrack: "2D track with checkpoints and finish line",
      quizCards: "Animated question cards with multiple choice or A/B options",
    },
    automaticBehaviors: [
      "Vehicles automatically rotate in preview mode",
      "Race physics calculates based on weight and friction",
      "Quiz progress tracked with visual indicators",
      "Hints auto-dismiss after 5 seconds",
    ],
    colors: {
      primary: "#f59e0b", // Amber for speed theme
      success: "#22c55e",
      info: "#3b82f6",
      background: "gradient from amber to white",
    },
  },

  configSchema: {
    core: {
      description: "Core lab configuration",
      properties: {
        allowedPages: {
          description: "Which pages to include in this lab instance",
          type: "PageId[]",
          required: true,
        },
        trackLength: {
          description: "Track length in meters for simulation",
          type: "number",
        },
      },
    },
    displayOptions: {
      description: "Display customization",
      properties: {
        allowVehicleSwitch: {
          description: "Whether user can switch between vehicles",
          type: "boolean",
        },
        allowStatAdjustment: {
          description: "Whether user can adjust vehicle stats",
          type: "boolean",
        },
      },
    },
    interactionPermissions: {
      description: "What the student can do",
      properties: {
        agentControlledQuiz: {
          description: "Whether quiz progression is controlled by the agent",
          type: "boolean",
          required: true,
        },
      },
    },
  },

  stateSchema: {
    navigation: {
      description: "Current position in the lab",
      properties: {
        currentPage: {
          description: "Currently displayed page",
          type: "PageId",
          required: true,
        },
      },
    },
    vehicle: {
      description: "Vehicle configuration",
      properties: {
        selectedVehicleId: {
          description: "ID of the selected vehicle",
          type: "string",
          required: true,
        },
        carConfig: {
          description: "Weight and tire configuration",
          type: "{ weightAdjustment: number, tireType: number }",
          required: true,
        },
      },
    },
    quiz: {
      description: "Quiz state",
      properties: {
        quizProgress: {
          description: "Questions answered and correct",
          type: "{ answered: string[], correct: string[] }",
          required: true,
        },
        dynamicQuestion: {
          description: "Current agent-generated question",
          type: "DynamicQuestion | null",
        },
        quizEnded: {
          description: "Whether quiz has ended",
          type: "boolean",
        },
      },
    },
  },

  configurationTips: {
    pages: [
      "Use all 4 pages for full experience",
      "Use ['build', 'simulation'] for focused physics exploration",
      "Use ['quiz'] only for fraction practice",
    ],
    agent_control: [
      "Set agentControlledQuiz: true for guided, personalized questions",
      "Set agentControlledQuiz: false for self-paced exploration",
    ],
  },

  interactionPresets: {
    guided_full: {
      description: "Full agent-guided experience through all phases",
      permissions: {
        allowVehicleSwitch: true,
        allowStatAdjustment: true,
        agentControlledQuiz: true,
      },
    },
    free_exploration: {
      description: "Student-driven exploration without agent quiz control",
      permissions: {
        allowVehicleSwitch: true,
        allowStatAdjustment: true,
        agentControlledQuiz: false,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "Full Guided Lab",
      concept: "Complete Speed Lab with agent guidance",
      props: {
        config: presets[0].config,
        state: presets[0].state,
      },
      pedagogy:
        "Agent guides student through each phase, asking personalized questions in the quiz.",
    },
    {
      name: "Quick Build & Race",
      concept: "Skip intro, jump to building and racing",
      props: {
        config: presets[1].config,
        state: { ...presets[1].state, currentPage: "build" as const },
      },
      pedagogy:
        "For students who want hands-on exploration without quiz assessment.",
    },
  ],

  commonMistakes: [
    "Setting allowedPages but not including current page",
    "Not sending quiz questions when agentControlledQuiz is true",
  ],

  actions: {
    set_page: {
      description: "Navigate to a specific page in the lab",
      params: {
        id: {
          type: "PageId",
          required: true,
          description:
            "Page to navigate to: 'welcome', 'build', 'simulation', or 'quiz'",
        },
      },
      example: { action: "set_page", params: { id: "build" } },
      useCase: "Direct student to a specific phase of the lab",
    },
    set_quiz_question: {
      description: "Send a quiz question to the student",
      params: {
        id: {
          type: "string",
          required: true,
          description: "Unique question ID",
        },
        question: {
          type: "string",
          required: true,
          description: "Question text",
        },
        options: {
          type: "{ id: string, text: string }[]",
          required: true,
          description: "Answer options",
        },
        correctId: {
          type: "string",
          required: true,
          description: "ID of correct answer",
        },
      },
      example: {
        action: "set_quiz_question",
        params: {
          id: "q1",
          question: "What fraction is 1500 lbs of 1 ton (2000 lbs)?",
          options: [
            { id: "a", text: "½" },
            { id: "b", text: "¾" },
            { id: "c", text: "⅔" },
          ],
          correctId: "b",
          explanation: "1500 ÷ 2000 = 0.75 = ¾",
        },
      },
      useCase:
        "Present a personalized quiz question based on student's car build",
    },
  },
};

// ============================================
// Definition
// ============================================

export const speedLabDefinition = definePlayground({
  id: "speed-lab",
  name: "Speed Lab",
  icon: "🏎️",
  description:
    "Interactive physics lab exploring speed, weight, and friction through vehicle building and racing",
  grades: "3-8",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: SpeedLab,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type SpeedLabDefinition = typeof speedLabDefinition;
export type SpeedLabConfig = Config;
export type SpeedLabState = State;
