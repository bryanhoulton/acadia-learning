/**
 * JumpArc Component
 *
 * Renders a curved arc between two points on the number line,
 * with an arrow head at the destination and a label showing the distance.
 * Arc height grows with jump width but asymptotically approaches a maximum.
 */

import { COLORS, JUMP_HEIGHT, LINE_Y } from "../constants";

interface JumpArcProps {
  fromX: number;
  toX: number;
  /** Total width of the number line (unused but kept for API consistency) */
  lineWidth: number;
  label?: string;
  color?: string;
}

/** Maximum arc height in pixels */
const MAX_ARC_HEIGHT = JUMP_HEIGHT * 2;

/**
 * Calculates arc height that grows continuously but asymptotically.
 *
 * For small jumps: height ≈ width/2 (nearly semicircular)
 * For large jumps: height approaches MAX_ARC_HEIGHT asymptotically
 *
 * Uses tanh for smooth transition: tanh(x) ≈ x for small x, → 1 for large x
 */
function calculateArcHeight(jumpWidth: number): number {
  // tanh(width / (2 * max)) gives us:
  // - Small width: tanh(small) ≈ small, so height ≈ width/2
  // - Large width: tanh(large) → 1, so height → max
  const normalized = jumpWidth / (2 * MAX_ARC_HEIGHT);
  return MAX_ARC_HEIGHT * Math.tanh(normalized);
}

/**
 * Calculates the arrow rotation angle based on the arc's tangent near the endpoint.
 *
 * At the exact endpoint, the ellipse tangent is vertical, but we want to show
 * the direction of approach. We calculate the tangent at a small angle θ before
 * the endpoint to get a visually meaningful tilt.
 *
 * For an ellipse parameterized as x = cx + rx*cos(θ), y = cy - ry*sin(θ):
 * - Velocity at θ (traveling with decreasing θ): (rx*sin(θ), ry*cos(θ))
 * - Angle from vertical = atan(vx/vy) = atan(rx*sin(θ) / (ry*cos(θ)))
 */
function calculateArrowAngle(rx: number, ry: number, goingRight: boolean): number {
  // Calculate tangent angle at θ = 0.15 radians (~8.6°) before the endpoint
  // This gives a visually meaningful tilt that shows the arc's curvature
  const theta = 0.15;

  // Velocity components at θ (traveling from left to right along top of arc)
  const vx = rx * Math.sin(theta);
  const vy = ry * Math.cos(theta);

  // Angle from vertical (pointing straight down)
  const angleFromVertical = Math.atan2(vx, vy) * (180 / Math.PI);

  // Cap the angle to avoid extreme tilts on very flat arcs
  const cappedAngle = Math.min(angleFromVertical, 30);

  // Going right: arriving from upper-left, tangent points to lower-right
  //   -> arrow should tilt clockwise (positive rotation)
  // Going left: arriving from upper-right, tangent points to lower-left
  //   -> arrow should tilt counterclockwise (negative rotation)
  return goingRight ? cappedAngle : -cappedAngle;
}

export function JumpArc({
  fromX,
  toX,
  label,
  color = COLORS.jump,
}: JumpArcProps) {
  const jumpWidth = Math.abs(toX - fromX);
  const goingRight = toX > fromX;
  const midX = (fromX + toX) / 2;

  // Height grows continuously but asymptotes to MAX_ARC_HEIGHT
  const ry = calculateArcHeight(jumpWidth);
  const rx = jumpWidth / 2; // horizontal radius spans the full width

  // For label positioning
  const peakHeight = ry;

  // SVG arc: A rx ry x-rotation large-arc sweep-flag x y
  // Using separate rx/ry allows elliptical arcs for flattened jumps
  // sweep = 1 for clockwise (going up), 0 for counter-clockwise
  const sweepFlag = goingRight ? 1 : 0;
  const arcPath = `M ${fromX} ${LINE_Y} A ${rx} ${ry} 0 0 ${sweepFlag} ${toX} ${LINE_Y}`;

  // Arrow rotation: points down toward axis, tilted to follow arc tangent
  const arrowRotation = calculateArrowAngle(rx, ry, goingRight);

  return (
    <g>
      {/* Arc path */}
      <path
        d={arcPath}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />

      {/* Arrow head (points downward at destination, tilted to follow arc) */}
      <g transform={`translate(${toX}, ${LINE_Y - 2}) rotate(${arrowRotation})`}>
        <polygon points="-6,-5 6,-5 0,6" fill={color} />
      </g>

      {/* Label at arc peak */}
      {label && (
        <text
          x={midX}
          y={LINE_Y - peakHeight - 8}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={color}
          style={{ userSelect: "none" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
