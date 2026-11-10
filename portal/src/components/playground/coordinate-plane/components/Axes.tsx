import { memo } from "react";

import { COLORS, DIMENSIONS } from "../constants";
import type { ViewBox } from "../utils";

interface AxesProps {
  view: ViewBox;
  labels?: { x: string; y: string };
  tickInterval?: number;
  showTickLabels?: boolean;
}

/**
 * Coordinate axes with tick marks and labels
 */
export const Axes = memo(function Axes({
  view,
  labels = { x: "x", y: "y" },
  tickInterval = 1,
  showTickLabels = true,
}: AxesProps) {
  const { xMin, xMax, yMin, yMax, width, height } = view;

  const xToPixel = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
  const yToPixel = (y: number) => ((yMax - y) / (yMax - yMin)) * height;

  // Calculate axis positions (clamp to visible area)
  const xAxisY = Math.max(0, Math.min(height, yToPixel(0)));
  const yAxisX = Math.max(0, Math.min(width, xToPixel(0)));

  // Check if axes are visible
  const showXAxis = yMin <= 0 && yMax >= 0;
  const showYAxis = xMin <= 0 && xMax >= 0;

  // Generate tick positions
  const xTicks: number[] = [];
  const yTicks: number[] = [];

  for (
    let x = Math.ceil(xMin / tickInterval) * tickInterval;
    x <= xMax;
    x += tickInterval
  ) {
    if (x !== 0) xTicks.push(x); // Skip 0 (origin)
  }

  for (
    let y = Math.ceil(yMin / tickInterval) * tickInterval;
    y <= yMax;
    y += tickInterval
  ) {
    if (y !== 0) yTicks.push(y); // Skip 0 (origin)
  }

  // Common text styles to prevent selection during drag
  const textStyle: React.CSSProperties = {
    userSelect: "none",
    pointerEvents: "none",
  };

  return (
    <g className="axes" style={{ userSelect: "none" }}>
      {/* X-axis */}
      {showXAxis && (
        <g className="x-axis">
          <line
            x1={0}
            y1={xAxisY}
            x2={width}
            y2={xAxisY}
            stroke={COLORS.axis}
            strokeWidth={DIMENSIONS.axisWidth}
          />
          {/* Arrow head - extends beyond axis end */}
          <polygon
            points={`${width},${xAxisY - 4} ${width + 8},${xAxisY} ${width},${xAxisY + 4}`}
            fill={COLORS.axis}
          />
          {/* Axis label */}
          <text
            x={width - 4}
            y={xAxisY - 10}
            textAnchor="end"
            fontSize="12"
            fontWeight="500"
            fill={COLORS.axisLabel}
            style={textStyle}
          >
            {labels.x}
          </text>
          {/* Tick marks */}
          {xTicks.map((x) => {
            const px = xToPixel(x);
            return (
              <g key={`x-tick-${x}`}>
                <line
                  x1={px}
                  y1={xAxisY - DIMENSIONS.tickLength / 2}
                  x2={px}
                  y2={xAxisY + DIMENSIONS.tickLength / 2}
                  stroke={COLORS.axis}
                  strokeWidth={1}
                />
                {showTickLabels && (
                  <text
                    x={px}
                    y={xAxisY + DIMENSIONS.tickLabelOffset}
                    textAnchor="middle"
                    fontSize="10"
                    fill={COLORS.axisLabel}
                    style={textStyle}
                  >
                    {x}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Y-axis */}
      {showYAxis && (
        <g className="y-axis">
          <line
            x1={yAxisX}
            y1={0}
            x2={yAxisX}
            y2={height}
            stroke={COLORS.axis}
            strokeWidth={DIMENSIONS.axisWidth}
          />
          {/* Arrow head - extends beyond axis end */}
          <polygon
            points={`${yAxisX - 4},0 ${yAxisX},-8 ${yAxisX + 4},0`}
            fill={COLORS.axis}
          />
          {/* Axis label */}
          <text
            x={yAxisX + 10}
            y={12}
            textAnchor="start"
            fontSize="12"
            fontWeight="500"
            fill={COLORS.axisLabel}
            style={textStyle}
          >
            {labels.y}
          </text>
          {/* Tick marks */}
          {yTicks.map((y) => {
            const py = yToPixel(y);
            return (
              <g key={`y-tick-${y}`}>
                <line
                  x1={yAxisX - DIMENSIONS.tickLength / 2}
                  y1={py}
                  x2={yAxisX + DIMENSIONS.tickLength / 2}
                  y2={py}
                  stroke={COLORS.axis}
                  strokeWidth={1}
                />
                {showTickLabels && (
                  <text
                    x={yAxisX - DIMENSIONS.tickLabelOffset / 2}
                    y={py + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill={COLORS.axisLabel}
                    style={textStyle}
                  >
                    {y}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Origin label */}
      {showXAxis && showYAxis && (
        <text
          x={yAxisX - 8}
          y={xAxisY + 12}
          textAnchor="end"
          fontSize="10"
          fill={COLORS.axisLabel}
          style={textStyle}
        >
          0
        </text>
      )}
    </g>
  );
});
