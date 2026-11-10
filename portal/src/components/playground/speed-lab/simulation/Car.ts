/**
 * Car - Handles car physics, state, and AI behavior
 */

import {
  AI_CONFIG,
  CAR_PHYSICS,
} from './config';
import type { BezierTrack } from './Track';
import type {
  CarConfig,
  CarState,
  StartPosition,
  TrackPosition,
} from './types';

export class Car {
  // Identity
  public id: string;
  public name: string;
  public color: string;
  public isUser: boolean;

  // Base physics properties
  private baseTopSpeed: number;
  private baseAcceleration: number;
  private baseHandling: number;

  // Modifiers
  public weightMod: number;
  public frictionMod: number;
  private skill: number;

  // Calculated effective stats
  public topSpeed: number = 0;
  public acceleration: number = 0;
  public handling: number = 0;

  // Race state
  public trackProgress: number = 0;
  public laneOffset: number = 0;
  public velocity: number = 0;
  public lap: number = 1;
  public position: number = 1;
  public finished: boolean = false;
  public finishTime: number | null = null;

  // AI state
  private targetLane: number = 0;
  private reactionTimer: number = 0;
  private skillVariation: number = 0;

  constructor(config: CarConfig) {
    this.id = config.id;
    this.name = config.name;
    this.color = config.color;
    this.isUser = config.isUser || false;

    // Base physics properties
    this.baseTopSpeed = config.topSpeed || 180;
    this.baseAcceleration = config.acceleration || 120;
    this.baseHandling = config.handling || 0.8;

    // Modifiers
    this.weightMod = config.weightMod || 1;
    this.frictionMod = config.frictionMod || 0.8;
    this.skill = config.skill || 1;

    // Calculate effective stats
    this.recalculateStats();
  }

  /**
   * Recalculate effective stats from base + modifiers
   *
   * Physics design:
   * - Weight affects acceleration significantly (heavier = much slower to speed up)
   * - Weight affects top speed slightly (heavier = slightly lower top speed)
   * - Friction affects handling (grip in curves) significantly
   * - Friction has minimal effect on straight-line speed (slick tires are actually faster on straights!)
   */
  public recalculateStats(): void {
    // Weight effect: heavier cars accelerate slower and have slightly lower top speed
    // Using square root to make the effect noticeable but not extreme
    // weightMod of 0.5 (light) → accel multiplier 1.41, weightMod of 1.5 (heavy) → accel multiplier 0.82
    const weightAccelFactor = 1 / Math.sqrt(this.weightMod);
    const weightSpeedFactor = 1 / Math.pow(this.weightMod, 0.3); // Subtle top speed reduction for heavy cars

    this.topSpeed = this.baseTopSpeed * weightSpeedFactor;
    this.acceleration = this.baseAcceleration * weightAccelFactor;
    this.handling = this.baseHandling * this.frictionMod;
  }

  /**
   * Reset car state for a new race
   */
  public reset(startPosition: StartPosition): void {
    this.trackProgress = startPosition.offset;
    this.laneOffset = startPosition.lane;
    this.velocity = 0;
    this.lap = 1;
    this.position = 1;
    this.finished = false;
    this.finishTime = null;
    this.targetLane = startPosition.lane;
    this.reactionTimer = 0;
    this.skillVariation = 0;
  }

  /**
   * Update car physics and state
   */
  public update(
    dt: number,
    track: BezierTrack,
    elapsedTime: number,
    totalLaps: number
  ): void {
    if (this.finished) return;

    const pos = track.getPosition(this.trackProgress, this.laneOffset);

    // AI behavior
    if (!this.isUser) {
      this.updateAI(dt, pos, track);
    }

    // Calculate target speed based on curvature
    // In curves: friction matters A LOT - low grip cars must slow down significantly
    // On straights: friction matters less - all tires perform similarly
    const baseCurveFactor = Math.max(
      CAR_PHYSICS.minCurveFactor,
      1 - pos.curvature * CAR_PHYSICS.curvatureSpeedFactor
    );

    // Friction affects how much curvature slows you down
    // High friction (1.0): can take curves at ~90% speed
    // Low friction (0.6): must slow to ~60% in curves
    // On straights (curveFactor ≈ 1): friction has minimal effect
    const curveGripBonus = this.frictionMod; // 0.6 to 1.0
    const effectiveCurveFactor =
      baseCurveFactor + (1 - baseCurveFactor) * (curveGripBonus - 0.5);

    // Clamp to valid range
    const curveFactor = Math.max(
      CAR_PHYSICS.minCurveFactor,
      Math.min(1, effectiveCurveFactor)
    );

    const targetSpeed = this.topSpeed * curveFactor * this.skill;

    // Accelerate or brake
    if (this.velocity < targetSpeed) {
      this.velocity += this.acceleration * dt * this.skill;
      this.velocity = Math.min(this.velocity, targetSpeed);
    } else {
      // Braking force: higher friction tires brake more effectively
      const brakeForce =
        this.acceleration * CAR_PHYSICS.brakeForceFactor * this.frictionMod;
      this.velocity -= brakeForce * dt;
      this.velocity = Math.max(this.velocity, targetSpeed * 0.8);
    }

    // Apply handling for lane changes
    const laneDiff = this.targetLane - this.laneOffset;
    const laneSpeed = this.handling * 2 * dt;
    this.laneOffset +=
      Math.sign(laneDiff) * Math.min(Math.abs(laneDiff), laneSpeed);

    // Clamp to track bounds (wall collision)
    if (Math.abs(this.laneOffset) > CAR_PHYSICS.maxLaneOffset) {
      this.laneOffset = Math.sign(this.laneOffset) * CAR_PHYSICS.maxLaneOffset;
      this.velocity *= CAR_PHYSICS.wallScrapePenalty;
    }

    // Update position
    this.trackProgress += this.velocity * dt;

    // Check lap completion
    if (this.trackProgress >= track.length) {
      this.trackProgress -= track.length;
      this.lap++;

      if (this.lap > totalLaps) {
        this.finished = true;
        this.finishTime = elapsedTime;
        this.lap = totalLaps;
      }
    }
  }

  /**
   * Update AI decision making
   */
  private updateAI(dt: number, pos: TrackPosition, track: BezierTrack): void {
    this.reactionTimer -= dt;

    if (this.reactionTimer <= 0) {
      // Reset reaction timer with randomness
      this.reactionTimer =
        AI_CONFIG.reactionTimeMin +
        Math.random() * (AI_CONFIG.reactionTimeMax - AI_CONFIG.reactionTimeMin);

      // Random skill variation (driver inconsistency)
      this.skillVariation =
        (Math.random() - 0.5) * AI_CONFIG.skillVariationRange;

      // Look ahead for curves
      const lookAhead = track.getPosition(
        this.trackProgress + this.velocity * 2,
        0
      );

      // Choose lane based on upcoming curvature
      if (lookAhead.curvature > AI_CONFIG.curvatureThreshold) {
        // In curves, try to take racing line
        this.targetLane = -Math.sign(lookAhead.curvature) * 0.5;
      } else {
        // On straights, slight random variation
        this.targetLane = (Math.random() - 0.5) * 0.3;
      }

      // Add some randomness for car avoidance
      this.targetLane += (Math.random() - 0.5) * 0.2;
    }

    // Apply skill variation
    this.skill = Math.max(
      AI_CONFIG.minSkill,
      Math.min(AI_CONFIG.maxSkill, this.skill + this.skillVariation)
    );
  }

  /**
   * Get current state for serialization
   */
  public getState(): CarState {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      isUser: this.isUser,
      position: this.position,
      lap: this.lap,
      velocity: Math.round(this.velocity),
      topSpeed: Math.round(this.topSpeed),
      acceleration: Math.round(this.acceleration),
      handling: parseFloat(this.handling.toFixed(2)),
      finished: this.finished,
      finishTime: this.finishTime,
      trackProgress: this.trackProgress,
      laneOffset: this.laneOffset,
    };
  }
}
