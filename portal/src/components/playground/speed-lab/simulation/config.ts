/**
 * Configuration and constants for the race simulation
 */

import type {
  AIBehaviorConfig,
  AICompetitorConfig,
  CarPhysicsConfig,
  CarTypeStats,
  RenderConfig,
  StartPosition,
  TrackDefinition,
} from './types';

// ============================================================================
// GAME SETTINGS
// ============================================================================

export const GAME_CONFIG = {
  totalLaps: 2,
  logInterval: 10, // seconds between state logs
};

// ============================================================================
// VIEWPORT SETTINGS
// ============================================================================

export const VIEWPORT_CONFIG = {
  minZoom: 0.2,
  maxZoom: 5,
  zoomStep: 1.2,
  defaultFollowCar: "user",
  followZoom: 1.2, // 20% closer when following
};

// ============================================================================
// CAR TYPES - Base stats for different vehicle types
// ============================================================================

export const CAR_TYPES: Record<string, CarTypeStats> = {
  racer: {
    topSpeed: 200,
    acceleration: 140,
    handling: 0.9,
  },
  muscle: {
    topSpeed: 190,
    acceleration: 160,
    handling: 0.7,
  },
  sport: {
    topSpeed: 180,
    acceleration: 130,
    handling: 0.85,
  },
  truck: {
    topSpeed: 150,
    acceleration: 100,
    handling: 0.6,
  },
};

// ============================================================================
// WEIGHT MODIFIERS - Maps weight category to physics modifier
// ============================================================================

export const WEIGHT_MODIFIERS: Record<string, number> = {
  light: 0.8,
  normal: 1.0,
  heavy: 1.2,
};

// ============================================================================
// TIRE FRICTION MODIFIERS - Maps tire type to friction coefficient
// ============================================================================

export const TIRE_MODIFIERS: Record<string, number> = {
  slick: 0.6,
  sport: 0.8,
  grip: 1.0,
};

// ============================================================================
// AI COMPETITORS - Pre-configured AI opponent cars
// Uses actual weights in pounds (like user cars) for consistent physics
// ============================================================================

export const AI_COMPETITORS: AICompetitorConfig[] = [
  // Speedy: Light car with slick tires - blazing fast on straights, struggles in curves
  {
    id: "speedy",
    name: "Speedy",
    color: "#3b82f6",
    type: "racer",
    weight: 1200,
    tires: "slick",
    skill: 0.97,
  },
  // Grippy: Heavy car with grip tires - slow to accelerate but dominates curves
  {
    id: "grippy",
    name: "Grippy",
    color: "#22c55e",
    type: "sport",
    weight: 2400,
    tires: "grip",
    skill: 0.97,
  },
  // Balanced: Medium weight with sport tires - consistent all-around performer
  {
    id: "balanced",
    name: "Balanced",
    color: "#a855f7",
    type: "sport",
    weight: 1800,
    tires: "sport",
    skill: 0.97,
  },
];

// ============================================================================
// STARTING GRID POSITIONS
// ============================================================================

export const STARTING_GRID: StartPosition[] = [
  { offset: 0, lane: 0 },
  { offset: -15, lane: 1 },
  { offset: -15, lane: -1 },
  { offset: -30, lane: 0.5 },
  { offset: -30, lane: -0.5 },
  { offset: -45, lane: 1 },
];

// ============================================================================
// TRACK DEFINITIONS
// ============================================================================

export const TRACK_DEFINITIONS: Record<string, TrackDefinition> = {
  circuit: {
    name: "Grand Circuit",
    width: 75,
    segments: [
      // Start 1/4 into the straight - main straight section
      [
        { x: 300, y: 500 },
        { x: 450, y: 500 },
        { x: 550, y: 500 },
        { x: 700, y: 500 },
      ],
      // First corner (turn 1)
      [
        { x: 700, y: 500 },
        { x: 850, y: 500 },
        { x: 900, y: 450 },
        { x: 900, y: 350 },
      ],
      // Back section with chicane
      [
        { x: 900, y: 350 },
        { x: 900, y: 250 },
        { x: 850, y: 200 },
        { x: 750, y: 200 },
      ],
      [
        { x: 750, y: 200 },
        { x: 650, y: 200 },
        { x: 600, y: 150 },
        { x: 500, y: 150 },
      ],
      [
        { x: 500, y: 150 },
        { x: 400, y: 150 },
        { x: 350, y: 200 },
        { x: 250, y: 200 },
      ],
      // Hairpin
      [
        { x: 250, y: 200 },
        { x: 100, y: 200 },
        { x: 50, y: 300 },
        { x: 50, y: 400 },
      ],
      // Return to start straight (connects back to 1/4 point)
      [
        { x: 50, y: 400 },
        { x: 50, y: 480 },
        { x: 100, y: 500 },
        { x: 300, y: 500 },
      ],
    ],
  },

  oval: {
    name: "Classic Oval",
    width: 80,
    segments: [
      // Top straight
      [
        { x: 200, y: 200 },
        { x: 350, y: 200 },
        { x: 500, y: 200 },
        { x: 650, y: 200 },
      ],
      // Right curve
      [
        { x: 650, y: 200 },
        { x: 800, y: 200 },
        { x: 850, y: 300 },
        { x: 850, y: 400 },
      ],
      [
        { x: 850, y: 400 },
        { x: 850, y: 500 },
        { x: 800, y: 600 },
        { x: 650, y: 600 },
      ],
      // Bottom straight
      [
        { x: 650, y: 600 },
        { x: 500, y: 600 },
        { x: 350, y: 600 },
        { x: 200, y: 600 },
      ],
      // Left curve
      [
        { x: 200, y: 600 },
        { x: 50, y: 600 },
        { x: 0, y: 500 },
        { x: 0, y: 400 },
      ],
      [
        { x: 0, y: 400 },
        { x: 0, y: 300 },
        { x: 50, y: 200 },
        { x: 200, y: 200 },
      ],
    ],
  },
};

// ============================================================================
// CAR PHYSICS CONSTANTS
// ============================================================================

export const CAR_PHYSICS: CarPhysicsConfig = {
  maxLaneOffset: 1.2,
  wallScrapePenalty: 0.95,
  curvatureSpeedFactor: 50,
  minCurveFactor: 0.3,
  brakeForceFactor: 1.5,
};

// ============================================================================
// AI BEHAVIOR CONSTANTS
// ============================================================================

export const AI_CONFIG: AIBehaviorConfig = {
  reactionTimeMin: 0.3,
  reactionTimeMax: 0.6,
  skillVariationRange: 0.1,
  minSkill: 0.7,
  maxSkill: 1.05,
  curvatureThreshold: 0.01,
};

// ============================================================================
// RENDER CONSTANTS
// ============================================================================

export const RENDER_CONFIG: RenderConfig = {
  grassColor: "#166534",
  asphaltColor: "#374151",
  edgeColor: "#dc2626",
  laneMarkingColor: "rgba(255,255,255,0.3)",
  carLength: 30,
  carWidth: 16,
  speedLineThreshold: 100,
};
