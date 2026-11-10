/**
 * Text Workspace Definition
 *
 * SINGLE SOURCE OF TRUTH for the text-workspace playground.
 * Types are inferred from Zod schemas - no manual type duplication.
 */

import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from '../types';
import {
  type Config,
  ConfigSchema,
  type State,
  StateSchema,
} from './schema';
import { TextWorkspace } from './TextWorkspace';

// ============================================
// Presets
// ============================================

const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "default",
    name: "Reading & Highlighting",
    description: "Interactive reading with highlight and annotation tools",
    grades: "3-12",
    tags: ["reading", "highlight", "comprehension"],
    config: {
      mode: "reading",
      passage: {
        text: `The Solar System consists of the Sun and the celestial objects bound to it by gravity. These objects include eight planets, their moons, dwarf planets, asteroids, comets, and other smaller bodies.

The four inner planets—Mercury, Venus, Earth, and Mars—are called terrestrial planets because they have solid, rocky surfaces. The four outer planets—Jupiter, Saturn, Uranus, and Neptune—are called gas giants because they are much larger and are composed mostly of gases.

Earth is the only planet known to support life. It has liquid water on its surface and an atmosphere that protects it from harmful radiation. The distance from Earth to the Sun is about 93 million miles, a distance that allows temperatures suitable for life.`,
        title: "The Solar System",
        source: "Science Weekly",
      },
      readingTools: ["highlight"],
      writingTools: ["outline", "word-count"],
      responseTypes: ["short-answer", "evidence-based"],
      structuredWriting: {
        enabled: true,
        template: "paragraph",
      },
    },
    state: {
      highlights: [],
      annotations: [],
      responses: [],
      composition: {
        outline: [],
        draft: "",
      },
    },
  },
  {
    id: "reading-comprehension",
    name: "Reading Comprehension",
    description: "Science passage for practicing reading strategies",
    grades: "5-8",
    tags: ["reading", "science", "comprehension"],
    config: {
      mode: "reading",
      passage: {
        text: `Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy stored in glucose. This process occurs primarily in the leaves of plants, within specialized organelles called chloroplasts.

During photosynthesis, plants absorb carbon dioxide from the air through tiny pores called stomata. They also take in water from the soil through their roots. Using the energy from sunlight, plants combine these simple molecules to produce glucose and release oxygen as a byproduct.

The overall equation for photosynthesis can be written as: 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂

This process is essential for life on Earth. Not only does it produce the food that sustains most living organisms, but it also releases the oxygen we breathe. Without photosynthesis, life as we know it would not exist.`,
        title: "Understanding Photosynthesis",
        source: "Biology Fundamentals",
      },
      readingTools: ["highlight"],
      writingTools: [],
      responseTypes: ["evidence-based"],
      structuredWriting: {
        enabled: false,
        template: "paragraph",
      },
    },
    state: {
      highlights: [],
      annotations: [],
      responses: [],
      composition: {
        outline: [],
        draft: "",
      },
    },
  },
  {
    id: "essay-writing",
    name: "Essay Writing with Outline",
    description: "Structured essay writing with outline support",
    grades: "6-12",
    tags: ["writing", "essay", "outline"],
    config: {
      mode: "writing",
      passage: undefined,
      readingTools: [],
      writingTools: ["outline", "word-count"],
      responseTypes: [],
      structuredWriting: {
        enabled: true,
        template: "essay",
      },
    },
    state: {
      highlights: [],
      annotations: [],
      responses: [],
      composition: {
        outline: ["Introduction: Hook the reader", "Thesis statement"],
        draft: "",
      },
    },
  },
  {
    id: "simple-writing",
    name: "Free Writing",
    description: "Simple writing mode with word count tracking",
    grades: "K-12",
    tags: ["writing", "free-write"],
    config: {
      mode: "writing",
      passage: undefined,
      readingTools: [],
      writingTools: ["word-count"],
      responseTypes: [],
      structuredWriting: {
        enabled: false,
        template: "paragraph",
      },
    },
    state: {
      highlights: [],
      annotations: [],
      responses: [],
      composition: {
        outline: [],
        draft: "",
      },
    },
  },
  {
    id: "view-only",
    name: "View Only (Presentation)",
    description: "Pre-highlighted passage for demonstration",
    grades: "K-12",
    tags: ["presentation", "view-only"],
    config: {
      mode: "reading",
      passage: {
        text: `In mathematics, a fraction represents a part of a whole. The top number is called the numerator, and it tells us how many parts we have. The bottom number is called the denominator, and it tells us how many equal parts the whole is divided into.

For example, in the fraction 3/4, the numerator is 3 and the denominator is 4. This means we have 3 parts out of a whole that is divided into 4 equal parts.

When comparing fractions with the same denominator, we can simply compare the numerators. The fraction with the larger numerator is greater. For example, 5/8 is greater than 3/8 because 5 is greater than 3.`,
        title: "Understanding Fractions",
        source: "Math Basics",
      },
      readingTools: [],
      writingTools: [],
      responseTypes: [],
      structuredWriting: {
        enabled: false,
        template: "paragraph",
      },
    },
    state: {
      highlights: [
        {
          id: "h1",
          start: 47,
          end: 63,
          text: "part of a whole",
          color: "yellow",
          note: "Definition of fraction",
        },
        {
          id: "h2",
          start: 69,
          end: 78,
          text: "numerator",
          color: "blue",
          note: "Numerator",
        },
        {
          id: "h3",
          start: 150,
          end: 161,
          text: "denominator",
          color: "green",
          note: "Denominator",
        },
      ],
      annotations: [],
      responses: [],
      composition: {
        outline: [],
        draft: "",
      },
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
    "A reading and writing workspace. In reading mode, students can read passages and highlight text with notes. In writing mode, students can create structured outlines and compose drafts.",
  cognitiveLevel:
    "Symbolic/Abstract - Engages with text comprehension and written expression",

  bestFor: [
    "Reading comprehension exercises",
    "Close reading with text annotation",
    "Evidence-based responses requiring highlighting",
    "Structured essay writing with outlines",
    "Paragraph writing practice",
    "Teaching annotation and note-taking strategies",
    "Summarization exercises",
  ],

  whenToUse: [
    "Student needs to read and analyze a passage",
    "Want students to identify key information by highlighting",
    "Teaching close reading strategies",
    "Student needs to write with structure (outline → draft)",
    "Evidence-based questions requiring text citation",
    "Reading comprehension practice",
  ],

  whenNotToUse: [
    "Teaching math concepts requiring visual manipulation",
    "Need interactive graphs or number lines",
    "Concept benefits from concrete manipulatives",
    "Short answer questions without passage context (use canvas instead)",
    "Multiple choice quizzes without passages (use canvas instead)",
  ],

  exampleScenarios: [
    {
      concept: "Reading comprehension with main idea identification",
      setup:
        "Set mode to 'reading', provide a passage about a topic, enable 'highlight' in readingTools. Ask student to highlight the main idea in yellow and supporting details in blue.",
      grade: "4-6",
    },
    {
      concept: "Evidence-based writing response",
      setup:
        "Set mode to 'reading' with a passage, enable highlighting. Ask student to highlight evidence that supports a claim, then discuss their highlights.",
      grade: "5-8",
    },
    {
      concept: "Essay writing with outline",
      setup:
        "Set mode to 'writing', enable structuredWriting with template 'essay'. Student creates an outline first, then writes their draft.",
      grade: "6-12",
    },
    {
      concept: "Paragraph writing practice",
      setup:
        "Set mode to 'writing', enable structuredWriting with template 'paragraph'. Simpler structure for younger students.",
      grade: "3-5",
    },
  ],

  visualDetails: {
    layout: `
      Text Workspace has two main modes:
      
      READING MODE:
      ┌─────────────────────────────────────────────────────┐
      │ ┌─────────────────────────────────────────────────┐ │
      │ │ 📖 Understanding Photosynthesis                 │ │
      │ │ Source: Biology Fundamentals                    │ │
      │ └─────────────────────────────────────────────────┘ │
      │                                                     │
      │ Photosynthesis is the process by which green       │
      │ plants convert [HIGHLIGHTED: light energy] into     │
      │ chemical energy. This occurs in the [HIGHLIGHTED:   │
      │ chloroplasts] of plant cells...                     │
      │                                                     │
      │ ┌──────────────────┐                                │
      │ │ 🖍️ Highlight Tool │ <- floating toolbar          │
      │ │ 🟡 🔵 🟢 🟣       │ <- color options              │
      │ └──────────────────┘                                │
      └─────────────────────────────────────────────────────┘
      
      WRITING MODE:
      ┌─────────────────────────────────────────────────────┐
      │ ┌─────────────────────────────────────────────────┐ │
      │ │ Outline                                         │ │
      │ │ 1. Introduction: Hook the reader               │ │
      │ │ 2. Body paragraph 1                            │ │
      │ │ 3. Body paragraph 2                            │ │
      │ │ 4. Conclusion                                  │ │
      │ │ [+ Add item]                                    │ │
      │ └─────────────────────────────────────────────────┘ │
      │                                                     │
      │ ┌─────────────────────────────────────────────────┐ │
      │ │ Start writing your essay...                     │ │
      │ │                                                 │ │
      │ │ _                                               │ │
      │ │                                                 │ │
      │ │                              Words: 0          │ │
      │ └─────────────────────────────────────────────────┘ │
      └─────────────────────────────────────────────────────┘
    `,
    elements: {
      passage:
        "The main text content in reading mode. Displays title, source, and body text.",
      highlightToolbar:
        "Floating toolbar with highlight tool toggle and color selection (yellow, blue, green, pink).",
      highlights:
        "Colored background spans on selected text. Can have notes attached.",
      highlightPopover:
        "Appears when clicking a highlight - allows changing color, adding notes, or deleting.",
      outline:
        "Structured list in writing mode. Items can be reordered by dragging.",
      writingArea: "Textarea for composing draft with word count indicator.",
    },
    automaticBehaviors: [
      "Text selection creates highlights when highlight tool is active",
      "Highlights snap to word boundaries for cleaner selection",
      "Clicking a highlight opens the popover for editing",
      "Word count updates automatically as student types",
      "Outline items can be dragged to reorder",
    ],
    colors: {
      yellow: "Primary highlight color - main ideas",
      blue: "Secondary highlight - supporting details",
      green: "Tertiary highlight - examples/evidence",
      pink: "Quaternary highlight - questions/unknowns",
    },
  },

  configSchema: {
    core: {
      description: "Essential configuration for the text workspace",
      properties: {
        mode: {
          description:
            "Workspace mode: 'reading' for passage analysis, 'writing' for composition, 'editing' for text revision",
          type: '"reading" | "writing" | "editing"',
          required: true,
          default: '"reading"',
        },
        "passage.text": {
          description: "The passage text content (required for reading mode)",
          type: "string",
          required: false,
        },
        "passage.title": {
          description: "Title displayed above the passage",
          type: "string",
          required: false,
        },
        "passage.source": {
          description: "Source attribution (e.g., 'Science Weekly')",
          type: "string",
          required: false,
        },
      },
    },
    displayOptions: {
      description: "Control what features are visible",
      properties: {
        "structuredWriting.enabled": {
          description: "Whether to show the outline editor in writing mode",
          type: "boolean",
          required: true,
          default: "false",
        },
        "structuredWriting.template": {
          description: "Template type: 'paragraph', 'essay', or 'summary'",
          type: '"paragraph" | "essay" | "summary"',
          required: true,
          default: '"paragraph"',
        },
      },
    },
    interactionPermissions: {
      description: "Control what the student can do",
      properties: {
        readingTools: {
          description:
            "Available reading tools. Currently only 'highlight' is supported.",
          type: 'Array<"highlight">',
          required: true,
          default: "[]",
          example: '["highlight"]',
        },
        writingTools: {
          description: "Available writing tools",
          type: 'Array<"outline" | "spellcheck" | "word-count">',
          required: true,
          default: "[]",
          example: '["outline", "word-count"]',
        },
        responseTypes: {
          description: "Types of responses the student can provide",
          type: 'Array<"multiple-choice" | "short-answer" | "evidence-based">',
          required: true,
          default: "[]",
        },
      },
    },
  },

  stateSchema: {
    highlights: {
      description: "User-created text highlights",
      properties: {
        "highlights[].id": {
          description: "Unique identifier for the highlight",
          type: "string",
          required: true,
        },
        "highlights[].start": {
          description: "Character index where highlight starts",
          type: "number",
          required: true,
        },
        "highlights[].end": {
          description: "Character index where highlight ends",
          type: "number",
          required: true,
        },
        "highlights[].text": {
          description: "The actual highlighted text content",
          type: "string",
          required: true,
        },
        "highlights[].color": {
          description: "Highlight color: 'yellow', 'blue', 'green', or 'pink'",
          type: "string",
          required: true,
        },
        "highlights[].note": {
          description: "Optional note attached to the highlight",
          type: "string",
          required: false,
        },
      },
      example: {
        id: "h1",
        start: 47,
        end: 63,
        text: "light energy",
        color: "yellow",
        note: "Key concept - this is what plants convert",
      },
    },
    annotations: {
      description: "User-created annotations (currently unused)",
      properties: {
        "annotations[].id": {
          description: "Unique identifier",
          type: "string",
          required: true,
        },
        "annotations[].position": {
          description: "Character position",
          type: "number",
          required: true,
        },
        "annotations[].text": {
          description: "Annotation text",
          type: "string",
          required: true,
        },
      },
    },
    composition: {
      description: "Writing composition state",
      properties: {
        "composition.outline": {
          description: "Array of outline items as strings",
          type: "string[]",
          required: false,
          default: "[]",
        },
        "composition.draft": {
          description: "The written draft content",
          type: "string",
          required: false,
          default: '""',
        },
      },
      example: {
        outline: [
          "Introduction: Hook with a question",
          "Main point: Plants convert sunlight",
          "Evidence: Chloroplasts contain chlorophyll",
          "Conclusion: Summary and significance",
        ],
        draft: "Have you ever wondered how plants make their own food?",
      },
    },
  },

  configurationTips: {
    mode_selection: [
      "Use 'reading' mode when you have a passage for the student to analyze",
      "Use 'writing' mode for composition exercises without a passage",
      "Use 'editing' mode when revising existing text (less common)",
    ],
    reading_setup: [
      "Always provide passage.text for reading mode",
      "Include passage.title and passage.source for context",
      "Enable ['highlight'] in readingTools to allow annotation",
      "Start with an empty highlights array - let student create their own",
    ],
    writing_setup: [
      "Set mode to 'writing' and leave passage undefined",
      "Enable structuredWriting.enabled: true for outline support",
      "Choose appropriate template: 'paragraph' for simple, 'essay' for longer",
      "Include ['outline', 'word-count'] in writingTools",
    ],
    highlight_strategy: [
      "Teach students to use different colors for different purposes",
      "Yellow for main ideas, blue for supporting details",
      "Green for evidence/examples, pink for questions",
      "Encourage adding notes to explain why text was highlighted",
    ],
  },

  interactionPresets: {
    reading_only: {
      description: "View-only passage with no tools (for presentation)",
      permissions: {},
    },
    highlight_enabled: {
      description: "Reading with highlighting for close reading",
      permissions: {
        highlight: true,
      },
    },
    writing_structured: {
      description: "Writing with outline support",
      permissions: {
        outline: true,
        wordCount: true,
        structuredWritingEnabled: true,
      },
    },
    writing_free: {
      description: "Free writing without outline",
      permissions: {
        wordCount: true,
        structuredWritingEnabled: false,
      },
    },
  },

  exampleConfigurations: [
    {
      name: "Reading Comprehension with Highlighting",
      concept: "Close reading and main idea identification",
      props: {
        config: presets[0].config,
        state: presets[0].state,
      },
      pedagogy:
        "Students read the passage and highlight key information. Ask them to highlight the main idea in yellow and supporting details in blue. Then discuss what they identified.",
    },
    {
      name: "Essay Writing with Outline",
      concept: "Structured essay composition",
      props: {
        config: presets[2].config,
        state: presets[2].state,
      },
      pedagogy:
        "Provide a starter outline for the essay structure. Student can modify the outline and then write their draft. The outline helps scaffold the writing process.",
    },
    {
      name: "Pre-highlighted Passage (Presentation)",
      concept: "Show annotations as examples",
      props: {
        config: presets[4].config,
        state: presets[4].state,
      },
      pedagogy:
        "Use pre-highlighted passages to demonstrate annotation strategies. Show students what good highlighting looks like before they practice on their own.",
    },
  ],

  commonMistakes: [
    "Setting mode to 'reading' without providing a passage - shows empty state",
    "Forgetting to include 'highlight' in readingTools - students can't annotate",
    "Not initializing composition state in writing mode - may cause errors",
    "Using text-workspace for math problems - use canvas or specialized playgrounds instead",
    "Providing highlights with incorrect start/end positions - won't display correctly",
    "Making passage text too short for meaningful highlighting exercises",
    "Not explaining the purpose of different highlight colors to students",
  ],
};

// ============================================
// Definition
// ============================================

export const textWorkspaceDefinition = definePlayground({
  id: "text-workspace",
  name: "Text Workspace",
  icon: "📝",
  description:
    "Reading passages with highlighting and writing composition with outlines",
  grades: "K-12",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: null,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: TextWorkspace,
  guide,
});

// ============================================
// Type Exports (inferred from definition)
// ============================================

export type TextWorkspaceDefinition = typeof textWorkspaceDefinition;
export type TextWorkspaceConfig = Config;
export type TextWorkspaceState = State;
