/**
 * Action Overlay Components
 *
 * Visual components for ephemeral highlights and animations
 * triggered by playground actions.
 */

import { AnimatePresence, motion } from "framer-motion";

import type { ActiveHighlight, ActiveJump } from "../actions";
import { AXIS_Y } from "../constants";

// ============================================
// Value Highlight
// ============================================

interface ValueHighlightProps {
  highlight: ActiveHighlight;
  scale: (value: number) => number;
}

export function ValueHighlight({ highlight, scale }: ValueHighlightProps) {
  if (highlight.value === undefined) return null;

  const x = scale(highlight.value);
  const color = highlight.color || "#3b82f6";

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.3 }}
    >
      {/* Pulsing ring - pulses 3 times then holds */}
      <motion.circle
        cx={x}
        cy={AXIS_Y}
        r={20}
        fill="none"
        stroke={color}
        strokeWidth={3}
        initial={{ r: 10, opacity: 1 }}
        animate={{
          r: [10, 25, 10],
          opacity: [1, 0.3, 1],
        }}
        transition={{
          duration: 1,
          repeat: 2,
          ease: "easeInOut",
        }}
      />
      {/* Center dot */}
      <motion.circle cx={x} cy={AXIS_Y} r={6} fill={color} />
      {/* Label if provided - positioned above axis */}
      {highlight.label && (
        <motion.text
          x={x}
          y={AXIS_Y - 35}
          textAnchor="middle"
          fill={color}
          fontSize={14}
          fontWeight={600}
          initial={{ y: AXIS_Y - 25, opacity: 0 }}
          animate={{ y: AXIS_Y - 35, opacity: 1 }}
        >
          {highlight.label}
        </motion.text>
      )}
    </motion.g>
  );
}

// ============================================
// Point Highlight (pulsing ring around existing point)
// ============================================

interface PointHighlightProps {
  highlight: ActiveHighlight;
  pointX: number | null;
}

export function PointHighlight({
  pointX,
}: PointHighlightProps) {
  if (pointX === null) return null;

  return (
    <motion.circle
      cx={pointX}
      cy={AXIS_Y}
      r={24}
      fill="none"
      stroke="#f59e0b"
      strokeWidth={3}
      initial={{ r: 20, opacity: 0 }}
      animate={{
        r: [20, 30, 20],
        opacity: [0.8, 0.3, 0.8],
      }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.8,
        repeat: 2,
        ease: "easeInOut",
      }}
    />
  );
}

// ============================================
// Tick Pulse
// ============================================

interface TickPulseProps {
  highlight: ActiveHighlight;
  scale: (value: number) => number;
}

export function TickPulse({ highlight, scale }: TickPulseProps) {
  if (highlight.value === undefined) return null;

  const x = scale(highlight.value);
  const color = highlight.color || "#f59e0b";

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Glowing background */}
      <motion.rect
        x={x - 15}
        y={AXIS_Y - 20}
        width={30}
        height={40}
        rx={4}
        fill={color}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 0.6, repeat: 2 }}
      />
      {/* Emphasized tick line */}
      <motion.line
        x1={x}
        y1={AXIS_Y - 15}
        x2={x}
        y2={AXIS_Y + 15}
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        initial={{ scaleY: 0.5 }}
        animate={{ scaleY: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: 2 }}
      />
    </motion.g>
  );
}

// ============================================
// Range Highlight
// ============================================

interface RangeHighlightProps {
  highlight: ActiveHighlight;
  scale: (value: number) => number;
}

export function RangeHighlight({ highlight, scale }: RangeHighlightProps) {
  if (highlight.from === undefined || highlight.to === undefined) return null;

  const x1 = scale(Math.min(highlight.from, highlight.to));
  const x2 = scale(Math.max(highlight.from, highlight.to));
  const color = highlight.color || "rgba(59, 130, 246, 0.3)";

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Shaded region */}
      <motion.rect
        x={x1}
        y={AXIS_Y - 30}
        width={x2 - x1}
        height={60}
        fill={color}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        style={{ transformOrigin: `${x1}px center` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      {/* Bracket lines */}
      <motion.line
        x1={x1}
        y1={AXIS_Y - 25}
        x2={x1}
        y2={AXIS_Y + 25}
        stroke="#3b82f6"
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      />
      <motion.line
        x1={x2}
        y1={AXIS_Y - 25}
        x2={x2}
        y2={AXIS_Y + 25}
        stroke="#3b82f6"
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      />
      {/* Label */}
      {highlight.label && (
        <motion.text
          x={(x1 + x2) / 2}
          y={AXIS_Y - 40}
          textAnchor="middle"
          fill="#3b82f6"
          fontSize={13}
          fontWeight={600}
          initial={{ opacity: 0, y: AXIS_Y - 30 }}
          animate={{ opacity: 1, y: AXIS_Y - 40 }}
          transition={{ delay: 0.3 }}
        >
          {highlight.label}
        </motion.text>
      )}
    </motion.g>
  );
}

// ============================================
// Comparison Highlight
// ============================================

interface ComparisonHighlightProps {
  highlight: ActiveHighlight;
  scale: (value: number) => number;
}

export function ComparisonHighlight({
  highlight,
  scale,
}: ComparisonHighlightProps) {
  if (highlight.from === undefined || highlight.to === undefined) return null;

  const x1 = scale(highlight.from);
  const x2 = scale(highlight.to);
  const midX = (x1 + x2) / 2;

  // Determine comparison symbol
  let symbol: string;
  if (highlight.from < highlight.to) {
    symbol = "<";
  } else if (highlight.from > highlight.to) {
    symbol = ">";
  } else {
    symbol = "=";
  }

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Connecting line */}
      <motion.line
        x1={x1}
        y1={AXIS_Y - 45}
        x2={x2}
        y2={AXIS_Y - 45}
        stroke="#6b7280"
        strokeWidth={2}
        strokeDasharray="4 4"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
      />
      {/* Markers at each value */}
      <motion.circle
        cx={x1}
        cy={AXIS_Y - 45}
        r={4}
        fill="#3b82f6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3 }}
      />
      <motion.circle
        cx={x2}
        cy={AXIS_Y - 45}
        r={4}
        fill="#ef4444"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3 }}
      />
      {/* Comparison symbol */}
      <motion.text
        x={midX}
        y={AXIS_Y - 60}
        textAnchor="middle"
        fill="#374151"
        fontSize={20}
        fontWeight={700}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        {symbol}
      </motion.text>
      {/* Value labels */}
      <motion.text
        x={x1}
        y={AXIS_Y - 55}
        textAnchor="middle"
        fill="#3b82f6"
        fontSize={12}
        fontWeight={600}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {highlight.from}
      </motion.text>
      <motion.text
        x={x2}
        y={AXIS_Y - 55}
        textAnchor="middle"
        fill="#ef4444"
        fontSize={12}
        fontWeight={600}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {highlight.to}
      </motion.text>
    </motion.g>
  );
}

// ============================================
// Animated Jump Arc
// ============================================

interface AnimatedJumpProps {
  jump: ActiveJump;
  scale: (value: number) => number;
}

export function AnimatedJump({ jump, scale }: AnimatedJumpProps) {
  const fromX = scale(jump.from);
  const toX = scale(jump.to);

  // Calculate arc dimensions
  const distance = Math.abs(toX - fromX);
  const arcHeight = Math.min(60, Math.max(30, distance * 0.4));
  const midX = (fromX + toX) / 2;

  // Create arc path
  const direction = toX > fromX ? 1 : -1;
  const path = `M ${fromX} ${AXIS_Y} Q ${midX} ${AXIS_Y - arcHeight} ${toX} ${AXIS_Y}`;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: jump.phase === "exit" ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: jump.phase === "exit" ? 1.0 : 0.3 }}
    >
      {/* Arc path */}
      <motion.path
        d={path}
        fill="none"
        stroke={jump.color}
        strokeWidth={3}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: jump.phase === "enter" ? 1 : 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      {/* Arrowhead at end */}
      <motion.polygon
        points={`${toX},${AXIS_Y} ${toX - 8 * direction},${AXIS_Y - 6} ${toX - 8 * direction},${AXIS_Y + 6}`}
        fill={jump.color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5 }}
      />
      {/* Label at apex */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <rect
          x={midX - 20}
          y={AXIS_Y - arcHeight - 22}
          width={40}
          height={20}
          rx={4}
          fill="white"
          stroke={jump.color}
          strokeWidth={1.5}
        />
        <text
          x={midX}
          y={AXIS_Y - arcHeight - 8}
          textAnchor="middle"
          fill={jump.color}
          fontSize={12}
          fontWeight={600}
        >
          {jump.label}
        </text>
      </motion.g>
    </motion.g>
  );
}

// ============================================
// Main Overlay Container
// ============================================

interface ActionOverlaysProps {
  highlights: ActiveHighlight[];
  jumps: ActiveJump[];
  scale: (value: number) => number;
  getPointX: (pointId: string) => number | null;
}

export function ActionOverlays({
  highlights,
  jumps,
  scale,
  getPointX,
}: ActionOverlaysProps) {
  return (
    <g className="action-overlays">
      <AnimatePresence>
        {/* Render highlights */}
        {highlights.map((highlight) => {
          switch (highlight.type) {
            case "value":
              return (
                <ValueHighlight
                  key={highlight.id}
                  highlight={highlight}
                  scale={scale}
                />
              );
            case "point":
              return (
                <PointHighlight
                  key={highlight.id}
                  highlight={highlight}
                  pointX={
                    highlight.pointId ? getPointX(highlight.pointId) : null
                  }
                />
              );
            case "tick":
              return (
                <TickPulse
                  key={highlight.id}
                  highlight={highlight}
                  scale={scale}
                />
              );
            case "range":
              return (
                <RangeHighlight
                  key={highlight.id}
                  highlight={highlight}
                  scale={scale}
                />
              );
            case "comparison":
              return (
                <ComparisonHighlight
                  key={highlight.id}
                  highlight={highlight}
                  scale={scale}
                />
              );
            default:
              return null;
          }
        })}

        {/* Render animated jumps */}
        {jumps.map((jump) => (
          <AnimatedJump key={jump.id} jump={jump} scale={scale} />
        ))}
      </AnimatePresence>
    </g>
  );
}
