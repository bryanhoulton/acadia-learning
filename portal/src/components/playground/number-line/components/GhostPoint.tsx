/**
 * GhostPoint Component
 *
 * A semi-transparent preview point shown when hovering
 * in placement mode to indicate where a new point will be placed.
 */

import { AnimatePresence, motion } from "framer-motion";

import { COLORS, LINE_Y, POINT_RADIUS } from "../constants";

interface GhostPointProps {
  x: number;
  visible: boolean;
}

export function GhostPoint({ x, visible }: GhostPointProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.circle
          cx={x}
          cy={LINE_Y}
          r={POINT_RADIUS}
          fill={COLORS.ghostPoint}
          stroke="rgba(59, 130, 246, 0.6)"
          strokeWidth={2}
          strokeDasharray="4 2"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          style={{ pointerEvents: "none" }}
        />
      )}
    </AnimatePresence>
  );
}
