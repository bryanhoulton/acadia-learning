import { memo } from "react";

import { COLORS, DIMENSIONS } from "../constants";
import type { ViewBox } from "../utils";

interface GridProps {
  view: ViewBox;
  majorInterval?: number;
  minorInterval?: number;
  showMinor?: boolean;
}

/**
 * Grid background for coordinate plane
 * Renders major and optional minor grid lines
 */
export const Grid = memo(function Grid({
  view,
  majorInterval = 1,
  minorInterval = 0.5,
  showMinor = false,
}: GridProps) {
  const { xMin, xMax, yMin, yMax, width, height } = view;

  const xToPixel = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
  const yToPixel = (y: number) => ((yMax - y) / (yMax - yMin)) * height;

  // Generate grid lines
  const majorVerticals: number[] = [];
  const majorHorizontals: number[] = [];
  const minorVerticals: number[] = [];
  const minorHorizontals: number[] = [];

  // Major vertical lines
  for (
    let x = Math.ceil(xMin / majorInterval) * majorInterval;
    x <= xMax;
    x += majorInterval
  ) {
    majorVerticals.push(x);
  }

  // Major horizontal lines
  for (
    let y = Math.ceil(yMin / majorInterval) * majorInterval;
    y <= yMax;
    y += majorInterval
  ) {
    majorHorizontals.push(y);
  }

  // Minor grid lines
  if (showMinor) {
    for (
      let x = Math.ceil(xMin / minorInterval) * minorInterval;
      x <= xMax;
      x += minorInterval
    ) {
      if (!majorVerticals.includes(x)) {
        minorVerticals.push(x);
      }
    }
    for (
      let y = Math.ceil(yMin / minorInterval) * minorInterval;
      y <= yMax;
      y += minorInterval
    ) {
      if (!majorHorizontals.includes(y)) {
        minorHorizontals.push(y);
      }
    }
  }

  return (
    <g className="grid">
      {/* Minor grid lines (render first, behind major) */}
      {showMinor && (
        <g className="grid-minor">
          {minorVerticals.map((x) => (
            <line
              key={`mv-${x}`}
              x1={xToPixel(x)}
              y1={0}
              x2={xToPixel(x)}
              y2={height}
              stroke={COLORS.gridMinor}
              strokeWidth={DIMENSIONS.gridWidth * 0.5}
            />
          ))}
          {minorHorizontals.map((y) => (
            <line
              key={`mh-${y}`}
              x1={0}
              y1={yToPixel(y)}
              x2={width}
              y2={yToPixel(y)}
              stroke={COLORS.gridMinor}
              strokeWidth={DIMENSIONS.gridWidth * 0.5}
            />
          ))}
        </g>
      )}

      {/* Major grid lines */}
      <g className="grid-major">
        {majorVerticals.map((x) => (
          <line
            key={`v-${x}`}
            x1={xToPixel(x)}
            y1={0}
            x2={xToPixel(x)}
            y2={height}
            stroke={COLORS.grid}
            strokeWidth={DIMENSIONS.gridWidth}
          />
        ))}
        {majorHorizontals.map((y) => (
          <line
            key={`h-${y}`}
            x1={0}
            y1={yToPixel(y)}
            x2={width}
            y2={yToPixel(y)}
            stroke={COLORS.grid}
            strokeWidth={DIMENSIONS.gridWidth}
          />
        ))}
      </g>
    </g>
  );
});
