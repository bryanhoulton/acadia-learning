/**
 * DraggablePoint Component
 *
 * An interactive point that can be dragged along the number line.
 * Supports smooth snapping to ticks, removal on double-click, and displays
 * a tooltip with the current value while dragging.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { motion, useMotionValue, useSpring } from "framer-motion";

import type { Point } from "../schema";
import { COLORS, LINE_Y, POINT_RADIUS } from "../constants";
import { screenToSvgCoords, snapToTick } from "../utils";

/** Spring config for smooth snapping */
const SNAP_SPRING = { stiffness: 800, damping: 35 };

interface DraggablePointProps {
  point: Point;
  scale: (value: number) => number;
  invert: (x: number) => number;
  tickInterval: number;
  snapToTicks: boolean;
  /** Minimum increment for point movement (used when snapToTicks is false) */
  minIncrement?: number;
  min: number;
  max: number;
  /** Called continuously during drag with the animated X position */
  onDrag: (id: string, currentValue: number, animatedX: number) => void;
  onDragEnd: (id: string, newValue: number) => void;
  onRemove?: (id: string) => void;
  allowRemoval?: boolean;
  /** Allow dragging the point (if false, point is locked) */
  allowDragging?: boolean;
  /** Show label inside the point */
  showLabel?: boolean;
  /** Show tooltip with value while dragging */
  showDragTooltip?: boolean;
}

export function DraggablePoint({
  point,
  scale,
  invert,
  tickInterval,
  snapToTicks,
  minIncrement,
  min,
  max,
  onDrag,
  onDragEnd,
  onRemove,
  allowRemoval = false,
  allowDragging = true,
  showLabel = true,
  showDragTooltip = true,
}: DraggablePointProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const svgRef = useRef<SVGGElement>(null);

  // The target X position (snapped)
  const displayValue = dragValue ?? point.value;
  const targetX = scale(displayValue);

  // Spring-animated X position for smooth snapping
  const motionX = useMotionValue(targetX);
  const springX = useSpring(motionX, SNAP_SPRING);

  // Update the motion value when target changes
  useEffect(() => {
    motionX.set(targetX);
  }, [targetX, motionX]);

  // Subscribe to spring changes to report animated position for arc tracking
  useEffect(() => {
    if (!isDragging) return;

    const unsubscribe = springX.on("change", (latestX) => {
      onDrag(point.id, displayValue, latestX);
    });

    return unsubscribe;
  }, [isDragging, springX, onDrag, point.id, displayValue]);

  // Snap helper
  const snap = useCallback(
    (value: number) =>
      snapToTick(value, tickInterval, min, max, snapToTicks, minIncrement),
    [tickInterval, min, max, snapToTicks, minIncrement]
  );

  // Clear dragValue when point.value catches up after state update
  useEffect(() => {
    if (dragValue !== null && point.value === dragValue) {
      setDragValue(null);
    }
  }, [point.value, dragValue]);

  const minX = scale(min);
  const maxX = scale(max);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!allowDragging) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      setDragValue(point.value);
    },
    [point.value, allowDragging]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !svgRef.current) return;

      const svg = svgRef.current.ownerSVGElement;
      const coords = screenToSvgCoords(e.clientX, e.clientY, svg);
      if (!coords) return;

      // Clamp to valid range and snap
      const clampedX = Math.max(minX, Math.min(maxX, coords.x));
      const rawValue = invert(clampedX);
      const snappedValue = snap(rawValue);

      setDragValue(snappedValue);
    },
    [isDragging, invert, snap, minX, maxX]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      (e.target as SVGElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);

      if (dragValue !== null) {
        onDragEnd(point.id, dragValue);
      }
    },
    [isDragging, onDragEnd, point.id, dragValue]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (allowRemoval && onRemove) {
        onRemove(point.id);
      }
    },
    [allowRemoval, onRemove, point.id]
  );

  // Determine cursor based on interaction permissions
  const getCursor = () => {
    if (!allowDragging) return "default";
    return isDragging ? "grabbing" : "grab";
  };

  return (
    <motion.g
      ref={svgRef}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      style={{ userSelect: "none" }}
    >
      {/* Point circle - uses spring X for smooth snapping */}
      <motion.circle
        cx={springX}
        cy={LINE_Y}
        r={POINT_RADIUS}
        fill={point.color || COLORS.defaultPoint}
        stroke="white"
        strokeWidth={3}
        style={{
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
          cursor: getCursor(),
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* Label - inside point if short, above point if long */}
      {showLabel &&
        point.label &&
        (point.label.length > 3 ? (
          // Long label: position above the point in black
          <motion.text
            x={springX}
            y={LINE_Y - POINT_RADIUS - 8}
            textAnchor="middle"
            dominantBaseline="auto"
            fontSize={12}
            fontWeight={600}
            fill="#1f2937"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {point.label}
          </motion.text>
        ) : (
          // Short label: inside the point in white
          <motion.text
            x={springX}
            y={LINE_Y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={700}
            fill="white"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {point.label}
          </motion.text>
        ))}

      {/* Value tooltip (shown while dragging) - uses spring X */}
      {showDragTooltip && isDragging && (
        <DragTooltip springX={springX} value={displayValue} />
      )}
    </motion.g>
  );
}

/**
 * DragTooltip Sub-component
 *
 * Shows the current value below the point while dragging.
 * Uses motion values for smooth tracking.
 */
function DragTooltip({
  springX,
  value,
}: {
  springX: ReturnType<typeof useSpring>;
  value: number;
}) {
  // Derive the rect X from spring X
  const rectX = useMotionValue(0);

  useEffect(() => {
    const unsubscribe = springX.on("change", (x) => {
      rectX.set(x - 20);
    });
    // Initialize
    rectX.set(springX.get() - 20);
    return unsubscribe;
  }, [springX, rectX]);

  return (
    <g style={{ pointerEvents: "none" }}>
      <motion.rect
        x={rectX}
        y={LINE_Y + POINT_RADIUS + 8}
        width={40}
        height={22}
        rx={4}
        fill="#1f2937"
      />
      <motion.text
        x={springX}
        y={LINE_Y + POINT_RADIUS + 23}
        textAnchor="middle"
        fontSize={11}
        fill="white"
        fontWeight={500}
        style={{ userSelect: "none" }}
      >
        {value}
      </motion.text>
    </g>
  );
}
