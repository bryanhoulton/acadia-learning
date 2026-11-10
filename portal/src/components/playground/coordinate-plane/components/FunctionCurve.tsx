import { memo, useEffect, useMemo, useRef, useState } from "react";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

import { COLORS, DIMENSIONS, TIMING } from "../constants";
import {
  findXIntercepts,
  findYIntercept,
  parseFunction,
  pointsToPath,
  sampleFunction,
  type SpecialPoint,
  type ViewBox,
} from "../utils";

interface FunctionCurveProps {
  equation: string;
  color?: string;
  view: ViewBox;
  visible?: boolean;
  showIntercepts?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  /** Optional domain restriction for piecewise functions */
  domain?: {
    min?: number;
    max?: number;
  };
}

/**
 * Renders a function curve on the coordinate plane
 * Handles parsing, sampling, and drawing with proper discontinuity handling
 */
export const FunctionCurve = memo(function FunctionCurve({
  equation,
  color = COLORS.functions[0],
  view,
  visible = true,
  showIntercepts = true,
  isSelected = false,
  onSelect,
  domain,
}: FunctionCurveProps) {
  const [isHovered, setIsHovered] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);

  // Spring for drawing animation
  const drawProgress = useMotionValue(0);
  const springProgress = useSpring(drawProgress, {
    stiffness: 100,
    damping: 30,
  });

  // Derive strokeDashoffset from spring progress
  const strokeDashoffset = useTransform(
    springProgress,
    (progress) => pathLength * (1 - progress),
  );

  // Parse and sample the function
  const { path, intercepts, parseError } = useMemo(() => {
    const parsed = parseFunction(equation);
    if (!parsed) {
      return { path: "", intercepts: [] as SpecialPoint[], parseError: true };
    }

    // Apply domain restrictions, clamped to view bounds
    const sampleXMin = Math.max(view.xMin, domain?.min ?? -Infinity);
    const sampleXMax = Math.min(view.xMax, domain?.max ?? Infinity);

    // If domain is entirely outside view, return empty
    if (sampleXMin >= sampleXMax) {
      return { path: "", intercepts: [] as SpecialPoint[], parseError: false };
    }

    const points = sampleFunction(
      parsed,
      sampleXMin,
      sampleXMax,
      view.yMin,
      view.yMax,
      300,
    );
    const pathData = pointsToPath(points, view);

    // Find special points (within domain)
    const foundIntercepts: SpecialPoint[] = [];
    if (showIntercepts) {
      const xInts = findXIntercepts(parsed, sampleXMin, sampleXMax);
      // Only show y-intercept if x=0 is within domain
      if (sampleXMin <= 0 && sampleXMax >= 0) {
        const yInt = findYIntercept(parsed);
        if (yInt && yInt.y >= view.yMin && yInt.y <= view.yMax) {
          foundIntercepts.push(yInt);
        }
      }
      foundIntercepts.push(...xInts);
    }

    return { path: pathData, intercepts: foundIntercepts, parseError: false };
  }, [equation, view, showIntercepts, domain]);

  // Measure path length and trigger drawing animation
  useEffect(() => {
    if (pathRef.current && path) {
      const length = pathRef.current.getTotalLength();
      setPathLength(length);
      // Reset and animate
      drawProgress.set(0);
      drawProgress.set(1);
    }
  }, [path, drawProgress]);

  if (!visible || parseError) {
    return null;
  }

  const strokeWidth =
    isHovered || isSelected
      ? DIMENSIONS.functionWidthHover
      : DIMENSIONS.functionWidth;

  // Convert intercept coordinates to pixels
  const xToPixel = (x: number) =>
    ((x - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (y: number) =>
    ((view.yMax - y) / (view.yMax - view.yMin)) * view.height;

  return (
    <motion.g
      className="function-curve"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onClick={onSelect}
      style={{ cursor: onSelect ? "pointer" : "default" }}
    >
      {/* Invisible wider path for easier hover/click */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={DIMENSIONS.pointHitArea}
        style={{ pointerEvents: "stroke" }}
      />

      {/* Visible curve with drawing animation */}
      <motion.path
        ref={pathRef}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength || 1}
        style={{
          strokeDashoffset: pathLength ? strokeDashoffset : 0,
          pointerEvents: "none",
        }}
      />

      {/* Intercept markers */}
      {showIntercepts &&
        intercepts.map((intercept, idx) => {
          const px = xToPixel(intercept.x);
          const py = yToPixel(intercept.y);

          // Ensure intercept is in visible area
          if (px < 0 || px > view.width || py < 0 || py > view.height) {
            return null;
          }

          return (
            <g key={`intercept-${idx}`} className="intercept-marker">
              {/* Marker circle */}
              <circle
                cx={px}
                cy={py}
                r={DIMENSIONS.interceptRadius}
                fill="white"
                stroke={
                  intercept.type === "y-intercept" ? COLORS.intercept : color
                }
                strokeWidth={2}
              />
              {/* Label on hover */}
              {(isHovered || isSelected) &&
                (() => {
                  const coordText = `(${intercept.x}, ${intercept.y})`;
                  const textWidth = coordText.length * 6.6 + 8;

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
                        height={18}
                        rx={4}
                        fill="rgba(0,0,0,0.8)"
                      />
                      <text
                        x={px + 12}
                        y={py - 7}
                        fontSize="11"
                        fill="white"
                        fontFamily="monospace"
                        style={{ userSelect: "none" }}
                      >
                        {coordText}
                      </text>
                    </g>
                  );
                })()}
            </g>
          );
        })}
    </motion.g>
  );
});
