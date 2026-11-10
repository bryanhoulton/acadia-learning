import { memo, useMemo } from "react";

import { COLORS, DIMENSIONS } from "../constants";
import {
  parseFunction,
  parseInequality,
  sampleFunction,
  type ViewBox,
} from "../utils";

interface RegionProps {
  inequality: string;
  color?: string;
  opacity?: number;
  view: ViewBox;
  visible?: boolean;
}

/**
 * Shaded region for inequalities
 * Fills the area above or below a function curve
 */
export const Region = memo(function Region({
  inequality,
  color = COLORS.regionFill,
  opacity = 0.15,
  view,
  visible = true,
}: RegionProps) {
  // Parse and generate the region path
  const { path, boundaryPath, isValid } = useMemo(() => {
    const parsed = parseInequality(inequality);
    if (!parsed) {
      // Try parsing as just a function equation for boundary display
      const fn = parseFunction(inequality);
      if (!fn) return { path: "", boundaryPath: "", isValid: false };

      const points = sampleFunction(
        fn,
        view.xMin,
        view.xMax,
        view.yMin,
        view.yMax,
        200,
      );
      const boundary = generateBoundaryPath(points, view);
      return { path: "", boundaryPath: boundary, isValid: false };
    }

    const { fn, type } = parsed;
    const points = sampleFunction(
      fn,
      view.xMin,
      view.xMax,
      view.yMin,
      view.yMax,
      200,
    );

    // Generate the fill region
    const regionPath = generateRegionPath(points, type, view);
    const boundaryLine = generateBoundaryPath(points, view);

    return { path: regionPath, boundaryPath: boundaryLine, isValid: true };
  }, [inequality, view]);

  if (!visible) return null;

  // Determine if boundary should be dashed (strict inequality)
  const isStrict =
    (inequality.includes(">") && !inequality.includes("=")) ||
    (inequality.includes("<") && !inequality.includes("="));

  return (
    <g className="region">
      {/* Shaded fill area */}
      {isValid && path && (
        <path d={path} fill={color} fillOpacity={opacity} stroke="none" />
      )}

      {/* Boundary line */}
      {boundaryPath && (
        <path
          d={boundaryPath}
          fill="none"
          stroke={color.replace(/[\d.]+\)$/, "0.6)")} // Slightly more opaque for boundary
          strokeWidth={DIMENSIONS.regionStrokeWidth}
          strokeDasharray={isStrict ? "6 4" : "none"}
          strokeLinecap="round"
        />
      )}
    </g>
  );
});

/**
 * Generate SVG path for the shaded region
 */
function generateRegionPath(
  points: { x: number; y: number; valid: boolean }[],
  inequalityType: ">" | ">=" | "<" | "<=" | "=",
  view: ViewBox,
): string {
  const validPoints = points.filter((p) => p.valid);
  if (validPoints.length < 2) return "";

  const xToPixel = (x: number) =>
    ((x - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (y: number) =>
    ((view.yMax - y) / (view.yMax - view.yMin)) * view.height;

  // Build path along the curve
  const pathPoints = validPoints.map((p) => ({
    px: xToPixel(p.x),
    py: yToPixel(p.y),
  }));

  // Determine fill direction
  const fillAbove = inequalityType === ">" || inequalityType === ">=";

  // Start path at first point
  let path = `M ${pathPoints[0].px} ${pathPoints[0].py}`;

  // Draw along curve
  for (let i = 1; i < pathPoints.length; i++) {
    path += ` L ${pathPoints[i].px} ${pathPoints[i].py}`;
  }

  // Close the region
  const lastPoint = pathPoints[pathPoints.length - 1];
  const firstPoint = pathPoints[0];

  if (fillAbove) {
    // Fill to top of view
    path += ` L ${lastPoint.px} 0`;
    path += ` L ${firstPoint.px} 0`;
  } else {
    // Fill to bottom of view
    path += ` L ${lastPoint.px} ${view.height}`;
    path += ` L ${firstPoint.px} ${view.height}`;
  }

  path += " Z";

  return path;
}

/**
 * Generate SVG path for the boundary curve only
 */
function generateBoundaryPath(
  points: { x: number; y: number; valid: boolean }[],
  view: ViewBox,
): string {
  const xToPixel = (x: number) =>
    ((x - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (y: number) =>
    ((view.yMax - y) / (view.yMax - view.yMin)) * view.height;

  const segments: string[] = [];
  let currentSegment: string[] = [];
  let inSegment = false;

  for (const point of points) {
    if (point.valid) {
      const px = xToPixel(point.x);
      const py = yToPixel(point.y);

      if (!inSegment) {
        currentSegment = [`M ${px} ${py}`];
        inSegment = true;
      } else {
        currentSegment.push(`L ${px} ${py}`);
      }
    } else {
      if (inSegment && currentSegment.length > 1) {
        segments.push(currentSegment.join(" "));
      }
      currentSegment = [];
      inSegment = false;
    }
  }

  if (inSegment && currentSegment.length > 1) {
    segments.push(currentSegment.join(" "));
  }

  return segments.join(" ");
}
