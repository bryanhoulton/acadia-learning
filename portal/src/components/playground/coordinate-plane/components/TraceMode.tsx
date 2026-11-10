import { memo, useCallback, useRef, useState } from "react";

import { COLORS, DIMENSIONS, TIMING } from "../constants";
import {
  formatCoordinate,
  parseFunction,
  pixelToMath,
  snapToGrid,
  type ViewBox,
} from "../utils";

interface TraceModeProps {
  equations: string[];
  view: ViewBox;
  active: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
}

/**
 * Trace mode - follow along functions to explore values
 * Shows (x, f(x)) as user moves cursor along the plane
 */
export const TraceMode = memo(function TraceMode({
  equations,
  view,
  active,
  snapToGrid: shouldSnap = true,
  gridSize = 1,
}: TraceModeProps) {
  const [traceX, setTraceX] = useState<number | null>(null);

  const groupRef = useRef<SVGGElement>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!active || !groupRef.current) return;

      const svg = groupRef.current.ownerSVGElement;
      if (!svg) return;

      // Use SVG's coordinate transformation to properly handle viewBox and transforms
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;

      const ctm = groupRef.current.getScreenCTM();
      if (!ctm) return;

      const svgPoint = point.matrixTransform(ctm.inverse());

      let { x } = pixelToMath(svgPoint.x, svgPoint.y, view);

      if (shouldSnap) {
        x = snapToGrid(x, gridSize);
      }

      // Clamp to view
      x = Math.max(view.xMin, Math.min(view.xMax, x));
      setTraceX(x);
    },
    [active, view, shouldSnap, gridSize],
  );

  const handlePointerLeave = useCallback(() => {
    setTraceX(null);
  }, []);

  if (!active) return null;

  const xToPixel = (x: number) =>
    ((x - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (y: number) =>
    ((view.yMax - y) / (view.yMax - view.yMin)) * view.height;

  // Parse all functions
  const parsedFunctions = equations
    .map((eq, i) => ({
      fn: parseFunction(eq),
      equation: eq,
      color: COLORS.functions[i % COLORS.functions.length],
    }))
    .filter((f) => f.fn !== null);

  // Calculate trace points
  const tracePoints =
    traceX !== null
      ? parsedFunctions
          .map(({ fn, color }) => {
            const y = fn!.evaluate(traceX);
            if (y === null || y < view.yMin || y > view.yMax) return null;
            return { x: traceX, y, color };
          })
          .filter((p) => p !== null)
      : [];

  return (
    <g
      ref={groupRef}
      className="trace-mode"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ cursor: "crosshair" }}
    >
      {/* Invisible rect to capture pointer events */}
      <rect
        x={0}
        y={0}
        width={view.width}
        height={view.height}
        fill="transparent"
        style={{ pointerEvents: "all" }}
      />

      {/* Vertical trace line */}
      {traceX !== null && (
        <line
          x1={xToPixel(traceX)}
          y1={0}
          x2={xToPixel(traceX)}
          y2={view.height}
          stroke={COLORS.traceLine}
          strokeWidth={1}
          strokeDasharray="4 4"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Trace points on each function */}
      {tracePoints.map((point, i) => {
        if (!point) return null;
        const px = xToPixel(point.x);
        const py = yToPixel(point.y);
        const coordText = `(${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})`;
        const textWidth = coordText.length * 6.6 + 12;

        return (
          <g key={i} style={{ pointerEvents: "none", userSelect: "none" }}>
            {/* Horizontal guide to y-axis */}
            <line
              x1={0}
              y1={py}
              x2={px}
              y2={py}
              stroke={COLORS.traceLine}
              strokeWidth={1}
              strokeDasharray="4 4"
            />

            {/* Trace point */}
            <circle
              cx={px}
              cy={py}
              r={DIMENSIONS.interceptRadius}
              fill={point.color}
              stroke="white"
              strokeWidth={2}
              style={{
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))",
              }}
            />

            {/* Coordinate label */}
            <g
              style={{
                transition: `opacity ${TIMING.fast}ms`,
              }}
            >
              <rect
                x={px + 10}
                y={py - 28}
                width={textWidth}
                height={24}
                rx={4}
                fill="rgba(17, 24, 39, 0.95)"
              />
              <text
                x={px + 16}
                y={py - 12}
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                fill="white"
                style={{ userSelect: "none" }}
              >
                {coordText}
              </text>
            </g>
          </g>
        );
      })}

      {/* X value indicator at bottom */}
      {traceX !== null &&
        (() => {
          const xText = `x = ${formatCoordinate(traceX)}`;
          const xTextWidth = xText.length * 6.6 + 12;

          return (
            <g style={{ pointerEvents: "none", userSelect: "none" }}>
              <rect
                x={xToPixel(traceX) - xTextWidth / 2}
                y={view.height - 24}
                width={xTextWidth}
                height={20}
                rx={4}
                fill="rgba(17, 24, 39, 0.9)"
              />
              <text
                x={xToPixel(traceX)}
                y={view.height - 10}
                textAnchor="middle"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                fill="white"
                style={{ userSelect: "none" }}
              >
                {xText}
              </text>
            </g>
          );
        })()}
    </g>
  );
});
