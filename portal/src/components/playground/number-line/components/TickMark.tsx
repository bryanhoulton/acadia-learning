/**
 * TickMark Component
 *
 * Renders a single tick mark with optional label.
 * Animates in/out from the appropriate direction based on position.
 */

import { motion } from "framer-motion";

import { COLORS, LABEL_OFFSET, LINE_Y, TICK_HEIGHT } from "../constants";

interface TickMarkProps {
  /** SVG x-coordinate for this tick */
  x: number;
  /** The numeric value at this tick */
  value: number;
  /** Whether to show the label below the tick */
  isLabeled: boolean;
  /** Center x-coordinate for determining animation direction */
  centerX: number;
}

export function TickMark({ x, value, isLabeled, centerX }: TickMarkProps) {
  const tickHeight = isLabeled ? TICK_HEIGHT : TICK_HEIGHT * 0.6;

  // Animate from left or right based on position relative to center
  const isLeftSide = x < centerX;
  const entryOffset = isLeftSide ? -30 : 30;

  return (
    <motion.g
      initial={{ opacity: 0, x: x + entryOffset }}
      animate={{ opacity: 1, x }}
      exit={{ opacity: 0, x: x + entryOffset }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{ pointerEvents: "none" }}
    >
      {/* Tick line */}
      <line
        x1={0}
        y1={LINE_Y - tickHeight / 2}
        x2={0}
        y2={LINE_Y + tickHeight / 2}
        stroke={isLabeled ? COLORS.axis : COLORS.tick}
        strokeWidth={isLabeled ? 2 : 1}
        strokeLinecap="round"
      />

      {/* Label */}
      {isLabeled && <TickLabel value={value} />}
    </motion.g>
  );
}

/**
 * TickLabel Sub-component
 *
 * Renders the numeric label, handling negative sign positioning
 * so numbers are centered on the tick mark.
 */
function TickLabel({ value }: { value: number }) {
  const isNegative = value < 0;
  const displayValue = Number.isInteger(value)
    ? Math.abs(value)
    : Math.abs(value).toFixed(1);

  // Calculate offset for minus sign based on number width
  // Approximate: ~7px per character for 12px font
  const numChars = String(displayValue).length;
  const minusOffset = (numChars * 7) / 2 + 2;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
    >
      {/* Minus sign (positioned to left of number) */}
      {isNegative && (
        <text
          x={-minusOffset}
          y={LINE_Y + LABEL_OFFSET}
          textAnchor="end"
          fontSize={12}
          fontWeight={500}
          fill={COLORS.tickLabel}
          style={{ userSelect: "none" }}
        >
          −
        </text>
      )}

      {/* Number (centered on tick) */}
      <text
        x={0}
        y={LINE_Y + LABEL_OFFSET}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        fill={COLORS.tickLabel}
        style={{ userSelect: "none" }}
      >
        {displayValue}
      </text>
    </motion.g>
  );
}
