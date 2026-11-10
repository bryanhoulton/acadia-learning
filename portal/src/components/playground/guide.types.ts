/**
 * Playground Guide Type System
 *
 * Every playground must define a PlaygroundGuide that describes:
 * - What the playground is and when to use it
 * - How to configure it (config schema)
 * - How to populate state (state schema)
 * - Visual details for LLMs that can't see the rendered output
 * - Common configurations and tips
 *
 * This ensures consistent, complete documentation across all playgrounds.
 */

// ============================================
// Core Guide Types
// ============================================

/** Grade range the playground is designed for */
export interface GradeRange {
  /** Primary target grades (e.g., "K-3", "6-8") */
  primary: string;
  /** Extended grades where it can still be useful */
  extended: string;
}

/** Example scenario showing how to use the playground */
export interface ExampleScenario {
  /** The math concept being taught */
  concept: string;
  /** How to set up the playground for this concept */
  setup: string;
  /** Target grade level */
  grade: string;
}

/** Example configuration with full props */
export interface ExampleConfiguration<TProps> {
  /** Name of this example */
  name: string;
  /** What concept it demonstrates */
  concept: string;
  /** The actual props to use */
  props: TProps;
  /** Pedagogical notes for tutors */
  pedagogy: string;
}

/** Description of a config or state property */
export interface PropertyDoc {
  /** What this property does */
  description: string;
  /** TypeScript type (for display) */
  type: string;
  /** Whether this property is required */
  required?: boolean;
  /** Default value if not specified */
  default?: string;
  /** Example value */
  example?: unknown;
  /** Note about size property behavior */
  sizeNote?: string;
  /** Important note about this property */
  important?: string;
}

/** Documentation for a group of related properties */
export interface PropertyGroupDoc {
  /** Group description */
  description: string;
  /** Properties in this group */
  properties: Record<string, PropertyDoc>;
  /** Example object showing the group */
  example?: unknown;
}

/** Visual rendering details for LLMs */
export interface VisualDetails {
  /** Overall dimensions or layout description */
  layout: string;
  /** Key visual elements and how they appear */
  elements: Record<string, string>;
  /** Automatic behaviors the playground performs */
  automaticBehaviors: string[];
  /** Color palette or theming info */
  colors?: Record<string, string>;
}

/** Interaction permission presets */
export interface InteractionPreset {
  /** What this preset enables */
  description: string;
  /** The permission flags to set */
  permissions: Record<string, boolean>;
}

/** Tips for configuring specific aspects */
export interface ConfigurationTips {
  /** Category of tips (e.g., "range_selection", "tick_interval") */
  [category: string]: string[];
}

/** Documentation for an action parameter */
export interface ActionParamDoc {
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

/** Documentation for a playground action */
export interface ActionDoc {
  /** What this action does */
  description: string;
  /** Parameters for the action */
  params: Record<string, ActionParamDoc>;
  /** Example action call */
  example: { action: string; params: Record<string, unknown> };
  /** When to use this action */
  useCase: string;
}
