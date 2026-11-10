/**
 * Race Simulation Module
 * 
 * Exports all simulation components for use in SimulationStep
 */

// Types
export type {
  Point,
  TrackPosition,
  TrackPoint,
  TrackBounds,
  BezierSegment,
  TrackDefinition,
  CarConfig as SimCarConfig,
  StartPosition,
  CarState,
  ViewportState,
  RacePhase,
  GameState,
  GameStateUpdate,
  AICompetitorConfig,
  CarTypeStats,
  RenderConfig,
  CarPhysicsConfig,
  AIBehaviorConfig,
} from './types';

// Classes
export { BezierTrack } from './Track';
export { Car } from './Car';
export { Renderer } from './Renderer';
export { Viewport } from './Viewport';

// Config
export {
  GAME_CONFIG,
  VIEWPORT_CONFIG,
  CAR_TYPES,
  WEIGHT_MODIFIERS,
  TIRE_MODIFIERS,
  AI_COMPETITORS,
  STARTING_GRID,
  TRACK_DEFINITIONS,
  CAR_PHYSICS,
  AI_CONFIG,
  RENDER_CONFIG,
} from './config';

// Hook
export { useGameEngine } from './useGameEngine';
