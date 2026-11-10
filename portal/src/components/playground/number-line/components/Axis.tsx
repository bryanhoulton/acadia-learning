/**
 * Axis Component
 *
 * Renders the main horizontal axis line with optional arrow endpoints.
 */

import { motion } from "framer-motion";

import { COLORS, LINE_Y, PADDING_X, SVG_WIDTH } from "../constants";

interface AxisProps {
  showLeftArrow?: boolean;
  showRightArrow?: boolean;
}

export function Axis({
  showLeftArrow = true,
  showRightArrow = true,
}: AxisProps) {
  const leftX = PADDING_X;
  const rightX = SVG_WIDTH - PADDING_X;
  const arrowSize = 6;

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Main horizontal line */}
      <line
        x1={leftX - (showLeftArrow ? 0 : 10)}
        y1={LINE_Y}
        x2={rightX + (showRightArrow ? 0 : 10)}
        y2={LINE_Y}
        stroke={COLORS.axis}
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Left arrow */}
      {showLeftArrow && (
        <motion.polygon
          points={`
            ${leftX - 15},${LINE_Y}
            ${leftX},${LINE_Y - arrowSize}
            ${leftX},${LINE_Y + arrowSize}
          `}
          fill={COLORS.axis}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
        />
      )}

      {/* Right arrow */}
      {showRightArrow && (
        <motion.polygon
          points={`
            ${rightX + 15},${LINE_Y}
            ${rightX},${LINE_Y - arrowSize}
            ${rightX},${LINE_Y + arrowSize}
          `}
          fill={COLORS.axis}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
        />
      )}
    </g>
  );
}
