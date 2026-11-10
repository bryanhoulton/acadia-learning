/**
 * Speed Lab Utility Functions
 *
 * Contains helper functions for:
 * - Stat calculations
 * - Victory helpers
 * - Race helpers
 */

import { DEFAULT_STAT_ADJUSTMENTS } from './data';
import type {
  StatAdjustments,
  VehicleStats,
} from './schema';

// Re-export for convenience
export { DEFAULT_STAT_ADJUSTMENTS };

// ============================================================================
// STAT CALCULATIONS
// ============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate final stats from base stats + adjustments
 */
function calculateBuildStats(
  baseStats: VehicleStats,
  adjustments: StatAdjustments
): VehicleStats {
  return {
    topSpeed: clamp(baseStats.topSpeed + adjustments.topSpeed, 0, 100),
    acceleration: clamp(
      baseStats.acceleration + adjustments.acceleration,
      0,
      100
    ),
    handling: clamp(baseStats.handling + adjustments.handling, 0, 100),
  };
}

/**
 * Tire friction coefficients by tire type
 * 0 = slick (low), 1 = sport (medium), 2 = grip (high)
 */
const TIRE_FRICTION = [0.6, 0.8, 1.0];

/**
 * Calculate effective stats accounting for car config (weight and tires)
 *
 * Weight affects acceleration: lighter = faster acceleration
 * Tires affect handling: higher friction = better handling
 */
export function calculateEffectiveStats(
  baseStats: VehicleStats,
  adjustments: StatAdjustments,
  carConfig: { weightAdjustment: number; tireType: number },
  defaultWeight: number
): VehicleStats {
  // First apply stat adjustments
  const buildStats = calculateBuildStats(baseStats, adjustments);

  // Calculate actual weight
  const actualWeight = defaultWeight + carConfig.weightAdjustment;

  // Weight modifier: lighter cars accelerate faster
  // Base weight reference is 2000 lbs (1 ton)
  const weightRatio = 2000 / actualWeight;
  const accelerationModifier = clamp(weightRatio, 0.7, 1.3);

  // Tire friction affects handling
  const tireFriction = TIRE_FRICTION[carConfig.tireType] ?? 0.8;
  const handlingModifier = tireFriction;

  return {
    topSpeed: buildStats.topSpeed,
    acceleration: clamp(
      Math.round(buildStats.acceleration * accelerationModifier),
      0,
      250
    ),
    handling: clamp(Math.round(buildStats.handling * handlingModifier), 0, 100),
  };
}

// ============================================================================
// VICTORY HELPERS
// ============================================================================

/**
 * Generate "What Helped" bullets based on stat adjustments
 */
export function getWhatHelped(
  adjustments: StatAdjustments,
  stats: VehicleStats
): string[] {
  const helps: string[] = [];

  if (adjustments.topSpeed > 10) {
    helps.push(
      "🏎️ Your high top speed helped you blaze down the straightaways!"
    );
  }
  if (adjustments.acceleration > 10) {
    helps.push("🚀 Your boosted acceleration got you off the line fast!");
  }
  if (adjustments.handling > 10) {
    helps.push("🎯 Your improved handling kept you stable in turns!");
  }

  if (stats.topSpeed > 80 && stats.acceleration > 80 && stats.handling > 80) {
    helps.push("⭐ Your balanced build dominated every part of the track!");
  }

  if (helps.length === 0) {
    helps.push("🏁 Your base vehicle stats carried you through!");
  }

  return helps.slice(0, 3);
}

/**
 * Generate replay suggestions based on current stats
 */
export function getReplaySuggestions(stats: VehicleStats): string[] {
  const suggs: string[] = [];

  if (stats.topSpeed < 70) {
    suggs.push("Try maxing out speed for a fast run!");
  }
  if (stats.handling < 70) {
    suggs.push("Boost handling to see how it helps in turns!");
  }
  if (stats.acceleration < 70) {
    suggs.push("Try more acceleration for a quicker start!");
  }

  suggs.push("Try a different vehicle to compare!");

  return suggs.slice(0, 2);
}
