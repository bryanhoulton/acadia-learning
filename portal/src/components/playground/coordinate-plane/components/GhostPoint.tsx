import { memo } from "react";

import { COLORS, DIMENSIONS } from "../constants";
import { formatCoordinate, type ViewBox } from "../utils";

interface GhostPointProps {
  x: number;
  y: number;
  view: ViewBox;
  label?: string;
  showCoordinates?: boolean;
}

/**
 * Ghost preview point - shows where a point will be placed
 * Lower opacity + dashed stroke = "potential, not actual"
 */
export const GhostPoint = memo(function GhostPoint({
  x,
  y,
  view,
  label,
  showCoordinates = true,
}: GhostPointProps) {
  const xToPixel = (mathX: number) =>
    ((mathX - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (mathY: number) =>
    ((view.yMax - mathY) / (view.yMax - view.yMin)) * view.height;

  const px = xToPixel(x);
  const py = yToPixel(y);

  return (
    <g className="ghost-point" style={{ pointerEvents: "none" }}>
      {/* Crosshair guides */}
      <line
        x1={px}
        y1={0}
        x2={px}
        y2={view.height}
        stroke={COLORS.ghost}
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.5}
      />
      <line
        x1={0}
        y1={py}
        x2={view.width}
        y2={py}
        stroke={COLORS.ghost}
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.5}
      />

      {/* Ghost point - dashed outline indicates potential */}
      <circle
        cx={px}
        cy={py}
        r={DIMENSIONS.pointRadius}
        fill="rgba(59, 130, 246, 0.2)"
        stroke={COLORS.ghost}
        strokeWidth={2}
        strokeDasharray="3 2"
      />

      {/* Label */}
      {label && (
        <text
          x={px}
          y={py - DIMENSIONS.pointRadius - DIMENSIONS.labelOffset}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={COLORS.ghost}
          opacity={0.7}
        >
          {label}
        </text>
      )}

      {/* Coordinate display */}
      {showCoordinates &&
        (() => {
          const coordText = `(${formatCoordinate(x)}, ${formatCoordinate(y)})`;
          const textWidth = coordText.length * 6.6 + 12;

          return (
            <g>
              <rect
                x={px + DIMENSIONS.pointRadius + 4}
                y={py - 10}
                width={textWidth}
                height={20}
                rx={4}
                fill="rgba(107, 114, 128, 0.9)"
              />
              <text
                x={px + DIMENSIONS.pointRadius + 10}
                y={py + 4}
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                fill="white"
                style={{ userSelect: "none" }}
              >
                {coordText}
              </text>
            </g>
          );
        })()}
    </g>
  );
});
