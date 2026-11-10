/**
 * Canvas block type definitions
 * These types should stay in sync with portal/src/components/playground/canvas/schema.ts
 */

// ============================================
// Text Block
// ============================================

export interface TextBlock {
  type: "text";
  text: string;
  size?: number;
}

// ============================================
// Math Block
// ============================================

export interface MathBlock {
  type: "math";
  latex: string;
  size?: number;
}

// ============================================
// Question Block
// ============================================

export interface QuestionBlock {
  type: "question";
  question: string;
  placeholder?: string;
  user_answer?: string;
  correct_answer?: string;
}

// ============================================
// Multiple Choice Block
// ============================================

export interface MultipleChoiceBlock {
  type: "multiple_choice";
  question: string;
  options: string[];
  correct_answer: string;
  user_answer?: string;
}

// Legacy alias
export type MultipleChoiceQuestionBlock = MultipleChoiceBlock;

// ============================================
// Graph Block
// ============================================

export interface Equation {
  equation: string;
  color: string;
}

export interface Point {
  x: number;
  y: number;
  label?: string | null;
  color: string;
}

// Legacy alias
export type PointWithColor = Point;

export interface GraphBlock {
  type: "graph";
  equations?: Equation[];
  points?: Point[];
  viewport_left: number;
  viewport_right: number;
  viewport_top: number;
  viewport_bottom: number;
}

// ============================================
// Table Block
// ============================================

export interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

// ============================================
// Timeline Block
// ============================================

export interface TimelineItem {
  title: string;
  description?: string;
  date: string;
  filled?: boolean;
}

export interface TimelineBlock {
  type: "timeline";
  title?: string;
  color?: string;
  items: TimelineItem[];
}

// ============================================
// Number Line Block
// ============================================

export interface NumberLineMark {
  value: number;
  label?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg";
}

export interface NumberLineSegment {
  start: number;
  end: number;
  label?: string | null;
  color?: string;
  startType?: "open" | "closed";
  endType?: "open" | "closed";
}

export interface NumberLineRay {
  value: number;
  direction: "left" | "right";
  label?: string | null;
  color?: string;
  type?: "open" | "closed";
}

export interface NumberLineBlock {
  type: "number_line";
  min: number;
  max: number;
  step?: number | null;
  marks?: NumberLineMark[];
  segments?: NumberLineSegment[];
  rays?: NumberLineRay[];
  title?: string | null;
}

// ============================================
// Fraction Block
// ============================================

export interface Fraction {
  numerator: number;
  denominator: number;
  fillColor?: string;
}

export interface FractionBlock {
  type: "fraction";
  fractions: Fraction[];
  diagram_type?: "pie" | "grid";
  show_label?: boolean;
}

// ============================================
// Combined Types
// ============================================

export type Data =
  | TextBlock
  | MathBlock
  | QuestionBlock
  | MultipleChoiceBlock
  | GraphBlock
  | TableBlock
  | TimelineBlock
  | NumberLineBlock
  | FractionBlock;

// Legacy alias
export type BlockData = Data;

export interface Block {
  data: Data;
  index: number;
}

export interface CanvasContent {
  blocks: Block[];
}

// Legacy alias
export type CanvasState = CanvasContent;
