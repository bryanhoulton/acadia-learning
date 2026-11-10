/**
 * Type definitions for the race simulation
 */

// ============================================================================
// BASIC GEOMETRY TYPES
// ============================================================================

/** 2D point */
export interface Point {
  x: number;
  y: number;
}

/** Position on track with angle and curvature */
export interface TrackPosition {
  x: number;
  y: number;
  angle: number;
  curvature: number;
}

/** Sampled point along the track */
export interface TrackPoint {
  x: number;
  y: number;
  angle: number;
  distance: number;
  curvature: number;
}

/** Track bounding box */
export interface TrackBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ============================================================================
// TRACK TYPES
// ============================================================================

/** Bezier curve segment (4 control points) */
export type BezierSegment = [Point, Point, Point, Point];

/** Track definition from config */
export interface TrackDefinition {
  name: string;
  width: number;
  segments: BezierSegment[];
}

// ============================================================================
// CAR TYPES
// ============================================================================

/** Car configuration for initialization */
export interface CarConfig {
  id: string;
  name: string;
  color: string;
  isUser?: boolean;
  topSpeed?: number;
  acceleration?: number;
  handling?: number;
  weightMod?: number;
  frictionMod?: number;
  skill?: number;
}

/** Starting grid position */
export interface StartPosition {
  offset: number;
  lane: number;
}

/** Car state for serialization/display */
export interface CarState {
  id: string;
  name: string;
  color: string;
  isUser: boolean;
  position: number;
  lap: number;
  velocity: number;
  topSpeed: number;
  acceleration: number;
  handling: number;
  finished: boolean;
  finishTime: number | null;
  trackProgress: number;
  laneOffset: number;
}

// ============================================================================
// VIEWPORT TYPES
// ============================================================================

/** Viewport state for rendering */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

// ============================================================================
// GAME STATE TYPES
// ============================================================================

/** Race phase */
export type RacePhase = "ready" | "countdown" | "racing" | "finished";

/** Complete game state snapshot */
export interface GameState {
  phase: RacePhase;
  elapsedTime: number;
  totalLaps: number;
  trackName: string;
  cars: CarState[];
  userCar: CarState | null;
  top3: Array<{
    name: string;
    position: number;
    lap: number;
    velocity: number;
    finished: boolean;
    finishTime: number | null;
  }>;
  raceProgress: number;
}

/** Game state update event */
export interface GameStateUpdate {
  type: "state_update";
  state: GameState;
}

// ============================================================================
// CONFIG TYPES
// ============================================================================

/** AI competitor definition */
export interface AICompetitorConfig {
  id: string;
  name: string;
  color: string;
  type: string;
  /** Weight in pounds (e.g., 1500 for ¾ ton) */
  weight: number;
  tires: string;
  skill: number;
}

/** Car type base stats */
export interface CarTypeStats {
  topSpeed: number;
  acceleration: number;
  handling: number;
}

/** Render configuration */
export interface RenderConfig {
  grassColor: string;
  asphaltColor: string;
  edgeColor: string;
  laneMarkingColor: string;
  carLength: number;
  carWidth: number;
  speedLineThreshold: number;
}

/** Car physics constants */
export interface CarPhysicsConfig {
  maxLaneOffset: number;
  wallScrapePenalty: number;
  curvatureSpeedFactor: number;
  minCurveFactor: number;
  brakeForceFactor: number;
}

/** AI behavior configuration */
export interface AIBehaviorConfig {
  reactionTimeMin: number;
  reactionTimeMax: number;
  skillVariationRange: number;
  minSkill: number;
  maxSkill: number;
  curvatureThreshold: number;
}
