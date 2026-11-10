/**
 * BezierTrack - Handles track geometry and path calculations
 */

import type {
  Point,
  TrackPosition,
  TrackPoint,
  TrackBounds,
  BezierSegment,
  TrackDefinition,
} from './types';

export class BezierTrack {
  public segments: BezierSegment[];
  public width: number;
  public name: string;
  public points: TrackPoint[] = [];
  public length: number = 0;

  constructor(definition: TrackDefinition) {
    this.segments = definition.segments;
    this.width = definition.width || 80;
    this.name = definition.name;

    this.calculateTrackData();
  }

  /**
   * Pre-calculate sampled points along the track for efficient lookups
   */
  private calculateTrackData(): void {
    this.points = [];
    this.length = 0;

    const samplesPerSegment = 50;

    this.segments.forEach((seg) => {
      for (let i = 0; i < samplesPerSegment; i++) {
        const t = i / samplesPerSegment;
        const point = this.bezierPoint(seg, t);
        const tangent = this.bezierTangent(seg, t);
        const angle = Math.atan2(tangent.y, tangent.x);

        if (this.points.length > 0) {
          const prev = this.points[this.points.length - 1];
          this.length += Math.hypot(point.x - prev.x, point.y - prev.y);
        }

        this.points.push({
          x: point.x,
          y: point.y,
          angle: angle,
          distance: this.length,
          curvature: this.calculateCurvature(seg, t),
        });
      }
    });

    // Close the loop
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    this.length += Math.hypot(first.x - last.x, first.y - last.y);
  }

  /**
   * Calculate point on cubic bezier curve at parameter t
   */
  private bezierPoint(seg: BezierSegment, t: number): Point {
    const [p0, p1, p2, p3] = seg;
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }

  /**
   * Calculate tangent vector at parameter t
   */
  private bezierTangent(seg: BezierSegment, t: number): Point {
    const [p0, p1, p2, p3] = seg;
    const mt = 1 - t;
    return {
      x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
    };
  }

  /**
   * Calculate curvature at parameter t
   */
  private calculateCurvature(seg: BezierSegment, t: number): number {
    const [p0, p1, p2, p3] = seg;
    const mt = 1 - t;

    // First derivative
    const dx = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const dy = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);

    // Second derivative
    const ddx = 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x);
    const ddy = 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y);

    // Curvature formula: |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
    const denom = Math.pow(dx * dx + dy * dy, 1.5);
    if (denom < 0.0001) return 0;

    return Math.abs(dx * ddy - dy * ddx) / denom;
  }

  /**
   * Get position and angle at a given progress along the track
   */
  getPosition(progress: number, laneOffset: number = 0): TrackPosition {
    // Normalize progress to track length
    const normalizedProgress = ((progress % this.length) + this.length) % this.length;

    // Find the two closest points
    let idx = 0;
    for (let i = 0; i < this.points.length; i++) {
      if (this.points[i].distance > normalizedProgress) {
        idx = i;
        break;
      }
    }

    const p1 = this.points[(idx - 1 + this.points.length) % this.points.length];
    const p2 = this.points[idx];

    // Interpolate between points
    const segDist = p2.distance - p1.distance;
    const t = segDist > 0 ? (normalizedProgress - p1.distance) / segDist : 0;

    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;

    // Properly interpolate angle to handle -π/π boundary crossover
    const angle = this.lerpAngle(p1.angle, p2.angle, t);
    const curvature = p1.curvature + (p2.curvature - p1.curvature) * t;

    // Apply lane offset (perpendicular to direction)
    const perpAngle = angle + Math.PI / 2;
    const offsetX = Math.cos(perpAngle) * laneOffset * (this.width / 3);
    const offsetY = Math.sin(perpAngle) * laneOffset * (this.width / 3);

    return {
      x: x + offsetX,
      y: y + offsetY,
      angle: angle,
      curvature: curvature,
    };
  }

  /**
   * Properly interpolate between two angles, handling the -π/π boundary
   */
  private lerpAngle(a1: number, a2: number, t: number): number {
    let diff = a2 - a1;

    // Normalize the difference to be between -π and π
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    return a1 + diff * t;
  }

  /**
   * Get the bounding box of the track
   */
  getBounds(): TrackBounds {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    this.points.forEach((p) => {
      minX = Math.min(minX, p.x - this.width);
      minY = Math.min(minY, p.y - this.width);
      maxX = Math.max(maxX, p.x + this.width);
      maxY = Math.max(maxY, p.y + this.width);
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Draw the bezier path on a canvas context
   */
  drawPath(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    this.segments.forEach((seg, i) => {
      const [p0, p1, p2, p3] = seg;
      if (i === 0) ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    });
    ctx.closePath();
  }
}
