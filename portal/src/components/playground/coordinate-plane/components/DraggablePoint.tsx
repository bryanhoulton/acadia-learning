import { memo, useCallback, useEffect, useRef, useState } from "react";

import { motion, useMotionValue, useSpring } from "framer-motion";

import { COLORS, DIMENSIONS, INTERACTION } from "../constants";
import {
  formatCoordinate,
  pixelToMath,
  snapCoordinates,
  type ViewBox,
} from "../utils";

/** Spring config for smooth snapping */
const SNAP_SPRING = { stiffness: 800, damping: 35 };

interface DraggablePointProps {
  id: string;
  x: number;
  y: number;
  label?: string;
  color?: string;
  draggable?: boolean;
  removable?: boolean;
  view: ViewBox;
  snapToGrid?: boolean;
  gridSize?: number;
  showCoordinates?: boolean;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
  isSelected?: boolean;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Interactive draggable point with direct manipulation
 * Uses spring animations for smooth snapping
 */
export const DraggablePoint = memo(function DraggablePoint({
  id,
  x,
  y,
  label,
  color = COLORS.point,
  draggable = false,
  removable = false,
  view,
  snapToGrid = true,
  gridSize = 1,
  showCoordinates = true,
  onDragEnd,
  onSelect,
  onRemove,
  isSelected = false,
}: DraggablePointProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const svgRef = useRef<SVGGElement>(null);

  // Convert math coords to pixels
  const xToPixel = (mathX: number) =>
    ((mathX - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (mathY: number) =>
    ((view.yMax - mathY) / (view.yMax - view.yMin)) * view.height;

  // Get current display position (during drag, show snapped position)
  const displayX = dragState ? dragState.currentX : x;
  const displayY = dragState ? dragState.currentY : y;
  const targetPx = xToPixel(displayX);
  const targetPy = yToPixel(displayY);

  // Spring-animated positions for smooth snapping
  const motionPx = useMotionValue(targetPx);
  const motionPy = useMotionValue(targetPy);
  const springPx = useSpring(motionPx, SNAP_SPRING);
  const springPy = useSpring(motionPy, SNAP_SPRING);

  // Update motion values when target changes
  useEffect(() => {
    motionPx.set(targetPx);
    motionPy.set(targetPy);
  }, [targetPx, targetPy, motionPx, motionPy]);

  // Handle double-click to remove
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!removable || !onRemove) return;
      e.preventDefault();
      e.stopPropagation();
      onRemove(id);
    },
    [removable, onRemove, id],
  );

  // Handle pointer down - start potential drag
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!draggable) {
        onSelect?.(id);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Capture pointer for tracking outside element
      (e.target as Element).setPointerCapture(e.pointerId);

      setDragState({
        isDragging: false, // Not dragging until threshold met
        startX: e.clientX,
        startY: e.clientY,
        currentX: x,
        currentY: y,
      });
    },
    [draggable, id, x, y, onSelect],
  );

  // Handle pointer move - track drag with continuous snapping
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;

      // Get SVG element to calculate coordinates
      const svg = svgRef.current?.closest("svg");
      if (!svg) return;

      // Use SVG's built-in coordinate transformation to properly handle
      // viewBox scaling and the parent's padding transform
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;

      // Get the screen CTM of our <g> element (which is inside the padding-offset group)
      // and use its inverse to transform screen coords to local SVG coords
      const ctm = svgRef.current?.getScreenCTM();
      if (!ctm) return;

      const svgPoint = point.matrixTransform(ctm.inverse());

      // Convert to math coordinates
      let { x: mathX, y: mathY } = pixelToMath(svgPoint.x, svgPoint.y, view);

      // Apply continuous snapping during drag
      if (snapToGrid) {
        const snapped = snapCoordinates(mathX, mathY, gridSize);
        mathX = snapped.x;
        mathY = snapped.y;
      }

      // Clamp to visible area
      mathX = Math.max(view.xMin, Math.min(view.xMax, mathX));
      mathY = Math.max(view.yMin, Math.min(view.yMax, mathY));

      // Check if we've exceeded drag threshold
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isDragging = distance > INTERACTION.dragThreshold;

      setDragState({
        ...dragState,
        isDragging,
        currentX: mathX,
        currentY: mathY,
      });
    },
    [dragState, view, snapToGrid, gridSize],
  );

  // Handle pointer up - commit drag
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;

      (e.target as Element).releasePointerCapture(e.pointerId);

      if (dragState.isDragging) {
        // Commit the new position
        onDragEnd?.(id, dragState.currentX, dragState.currentY);
      } else {
        // Was a click, not a drag
        onSelect?.(id);
      }

      setDragState(null);
    },
    [dragState, id, onDragEnd, onSelect],
  );

  // Visual states
  const isDragging = dragState?.isDragging ?? false;
  const showCoords = showCoordinates && (isHovered || isDragging || isSelected);

  // Point appearance based on state - keep original color, just change size
  const pointColor = color;
  const radius = isDragging
    ? DIMENSIONS.pointRadiusDrag
    : isHovered
      ? DIMENSIONS.pointRadiusHover
      : DIMENSIONS.pointRadius;

  return (
    <motion.g
      ref={svgRef}
      className="draggable-point"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 800, damping: 25 }}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
        userSelect: "none",
      }}
    >
      {/* Invisible hit area - generous for forgiveness */}
      <motion.circle
        cx={springPx}
        cy={springPy}
        r={DIMENSIONS.pointHitArea}
        fill="transparent"
      />

      {/* Selection ring */}
      {isSelected && (
        <motion.circle
          cx={springPx}
          cy={springPy}
          r={radius + 4}
          fill="none"
          stroke={pointColor}
          strokeWidth={2}
          strokeOpacity={0.3}
        />
      )}

      {/* Main point - uses spring positions for smooth snapping */}
      <motion.circle
        cx={springPx}
        cy={springPy}
        r={radius}
        fill={pointColor}
        stroke="white"
        strokeWidth={2}
        style={{
          filter: isDragging
            ? "drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
            : "none",
        }}
        animate={{ r: radius }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />

      {/* Label (centered inside the point, white text) */}
      {label && (
        <motion.text
          x={springPx}
          y={springPy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="10"
          fontWeight="700"
          fill="white"
          style={{
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {label}
        </motion.text>
      )}

      {/* Coordinate display (show during interaction) */}
      {showCoords && (
        <CoordinateTooltip
          springPx={springPx}
          springPy={springPy}
          displayX={displayX}
          displayY={displayY}
          radius={radius}
        />
      )}
    </motion.g>
  );
});

/**
 * Coordinate tooltip that follows the spring-animated position
 */
function CoordinateTooltip({
  springPx,
  springPy,
  displayX,
  displayY,
  radius,
}: {
  springPx: ReturnType<typeof useSpring>;
  springPy: ReturnType<typeof useSpring>;
  displayX: number;
  displayY: number;
  radius: number;
}) {
  const coordText = `(${formatCoordinate(displayX)}, ${formatCoordinate(displayY)})`;
  // ~6.6px per character for 11px monospace font, plus padding
  const textWidth = coordText.length * 6.6 + 12;

  // Derive rect position from spring
  const rectX = useMotionValue(0);
  const rectY = useMotionValue(0);
  const textX = useMotionValue(0);
  const textY = useMotionValue(0);

  useEffect(() => {
    const unsubX = springPx.on("change", (px) => {
      rectX.set(px + radius + 4);
      textX.set(px + radius + 10);
    });
    const unsubY = springPy.on("change", (py) => {
      rectY.set(py - 10);
      textY.set(py + 4);
    });
    // Initialize
    rectX.set(springPx.get() + radius + 4);
    textX.set(springPx.get() + radius + 10);
    rectY.set(springPy.get() - 10);
    textY.set(springPy.get() + 4);

    return () => {
      unsubX();
      unsubY();
    };
  }, [springPx, springPy, rectX, rectY, textX, textY, radius]);

  return (
    <g style={{ pointerEvents: "none" }}>
      <motion.rect
        x={rectX}
        y={rectY}
        width={textWidth}
        height={20}
        rx={4}
        fill="rgba(17, 24, 39, 0.9)"
      />
      <motion.text
        x={textX}
        y={textY}
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fill="white"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {coordText}
      </motion.text>
    </g>
  );
}
