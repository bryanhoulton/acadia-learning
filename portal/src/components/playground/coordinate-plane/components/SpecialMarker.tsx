import { memo, useState } from "react";

import { COLORS, DIMENSIONS, TIMING } from "../constants";
import { formatCoordinate, type ViewBox } from "../utils";

interface SpecialMarkerProps {
  x: number;
  y: number;
  type: "intercept" | "intersection" | "vertex" | "custom";
  label?: string;
  view: ViewBox;
  color?: string;
}

/**
 * Special marker for intercepts, intersections, vertices, etc.
 * Shows coordinate on hover
 */
export const SpecialMarker = memo(function SpecialMarker({
  x,
  y,
  type,
  label,
  view,
  color,
}: SpecialMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);

  const xToPixel = (mathX: number) =>
    ((mathX - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (mathY: number) =>
    ((view.yMax - mathY) / (view.yMax - view.yMin)) * view.height;

  const px = xToPixel(x);
  const py = yToPixel(y);

  // Determine color based on type
  let markerColor = color;
  if (!markerColor) {
    switch (type) {
      case "intercept":
        markerColor = COLORS.intercept;
        break;
      case "intersection":
        markerColor = COLORS.intersection;
        break;
      case "vertex":
        markerColor = COLORS.vertex;
        break;
      default:
        markerColor = COLORS.point;
    }
  }

  // Different shapes for different types
  const renderMarker = () => {
    switch (type) {
      case "intersection":
        // Diamond shape for intersections
        return (
          <g>
            <rect
              x={px - DIMENSIONS.intersectionRadius}
              y={py - DIMENSIONS.intersectionRadius}
              width={DIMENSIONS.intersectionRadius * 2}
              height={DIMENSIONS.intersectionRadius * 2}
              transform={`rotate(45 ${px} ${py})`}
              fill={markerColor}
              stroke="white"
              strokeWidth={2}
            />
          </g>
        );

      case "vertex":
        // Star/asterisk for vertices
        return (
          <g>
            <circle
              cx={px}
              cy={py}
              r={DIMENSIONS.interceptRadius + 2}
              fill="white"
              stroke={markerColor}
              strokeWidth={2}
            />
            <circle
              cx={px}
              cy={py}
              r={DIMENSIONS.interceptRadius - 2}
              fill={markerColor}
            />
          </g>
        );

      case "intercept":
      default:
        // Circle for intercepts and custom
        return (
          <circle
            cx={px}
            cy={py}
            r={DIMENSIONS.interceptRadius}
            fill="white"
            stroke={markerColor}
            strokeWidth={2}
          />
        );
    }
  };

  return (
    <g
      className="special-marker"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      style={{ cursor: "pointer" }}
    >
      {/* Hit area */}
      <circle cx={px} cy={py} r={DIMENSIONS.pointHitArea} fill="transparent" />

      {/* Marker */}
      {renderMarker()}

      {/* Label */}
      {label && (
        <text
          x={px}
          y={py - DIMENSIONS.interceptRadius - 6}
          textAnchor="middle"
          fontSize="10"
          fontWeight="500"
          fill={markerColor}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label}
        </text>
      )}

      {/* Coordinate tooltip on hover */}
      {isHovered &&
        (() => {
          const coordText = `(${formatCoordinate(x)}, ${formatCoordinate(y)})`;
          const textWidth = coordText.length * 6.6 + 12;

          return (
            <g
              style={{
                opacity: 1,
                transition: `opacity ${TIMING.fast}ms`,
              }}
            >
              <rect
                x={px + 8}
                y={py - 20}
                width={textWidth}
                height={20}
                rx={4}
                fill="rgba(17, 24, 39, 0.9)"
              />
              <text
                x={px + 14}
                y={py - 6}
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                fill="white"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {coordText}
              </text>
            </g>
          );
        })()}
    </g>
  );
});
