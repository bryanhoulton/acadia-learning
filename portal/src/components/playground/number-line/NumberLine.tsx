/**
 * NumberLine Component
 *
 * An interactive number line visualization that supports:
 * - Draggable points with snap-to-tick
 * - Point placement mode with ghost preview
 * - Jump arcs between points (that follow when points move)
 * - Configurable range, tick intervals, and interactions
 * - Ephemeral actions (highlights, animated jumps, comparisons)
 *
 * @example
 * <NumberLine
 *   config={config}
 *   state={state}
 *   onChange={setState}
 *   pendingAction={action}
 *   onActionComplete={handleComplete}
 * />
 */

import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import { AnimatePresence } from 'framer-motion';

import type { PlaygroundComponentProps } from '../types';
import {
  ActionOverlays,
  Axis,
  ClickableAxisArea,
  DraggablePoint,
  GhostPoint,
  JumpArc,
  Region,
  TickMark,
} from './components';
import {
  PADDING_X,
  POINT_COLORS,
  SVG_HEIGHT,
  SVG_WIDTH,
} from './constants';
import {
  actionSchemas,
  type Config,
  type Jump,
  type Point,
  type State,
} from './schema';
import { useNumberLineActions } from './useNumberLineActions';
import {
  calculateOptimalLabelInterval,
  calculateOptimalTickInterval,
  generateTicks,
  getNextLabel,
  snapToTick,
  useNumberLineScale,
} from './utils';

// ============================================
// Main Component
// ============================================

export function NumberLine({
  config,
  state,
  onChange,
  onEvent,
  pendingAction,
  onActionComplete,
}: PlaygroundComponentProps<Config, State, typeof actionSchemas>) {
  const mainLine = config.lines[0];
  const [min, max] = mainLine?.range ?? [-10, 10];

  // Scale functions for converting between values and SVG coordinates
  const { scale, invert } = useNumberLineScale(min, max);

  // UI state - placement mode enabled by default when config allows it
  const [placementMode, setPlacementMode] = useState(
    config.allowPointPlacement !== false
  );

  // Action management (highlights, animated jumps, etc.)
  const { highlights, jumps } = useNumberLineActions({
    pendingAction,
    onActionComplete,
    placementMode,
    onSetPlacementMode: setPlacementMode,
  });

  // Helper to get X position for a point by ID (for action overlays)
  const getPointX = useCallback(
    (pointId: string): number | null => {
      const point = state.points.find((p) => p.id === pointId);
      return point ? scale(point.value) : null;
    },
    [state.points, scale]
  );

  // Calculate optimal tick and label intervals based on range and width
  const tickInterval = useMemo(
    () => calculateOptimalTickInterval(min, max, mainLine.tickInterval),
    [min, max, mainLine.tickInterval]
  );

  const labelInterval = useMemo(
    () =>
      calculateOptimalLabelInterval(
        min,
        max,
        tickInterval,
        mainLine.labelInterval
      ),
    [min, max, tickInterval, mainLine.labelInterval]
  );
  const [ghostX, setGhostX] = useState<number | null>(null);

  // Track live point values during drag (for final state)
  const [livePointValues, setLivePointValues] = useState<
    Record<string, number>
  >({});

  // Track animated X positions during drag (for smooth arc tracking)
  const [animatedPointX, setAnimatedPointX] = useState<Record<string, number>>(
    {}
  );

  // Snap helper - uses the calculated tick interval
  const snap = useCallback(
    (value: number) =>
      snapToTick(
        value,
        tickInterval,
        min,
        max,
        mainLine.snapToTicks,
        mainLine.minIncrement
      ),
    [tickInterval, mainLine.snapToTicks, mainLine.minIncrement, min, max]
  );

  // Generate tick values using calculated interval
  const ticks = useMemo(
    () => generateTicks(min, max, tickInterval),
    [min, max, tickInterval]
  );

  // Build a map of point ID → current value (including live drag values)
  const pointValueMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const point of state.points) {
      map[point.id] = livePointValues[point.id] ?? point.value;
    }
    return map;
  }, [state.points, livePointValues]);

  // Resolve jump X position - uses animated X during drag for smooth tracking
  const resolveJumpX = useCallback(
    (jump: Jump, which: "from" | "to"): number | null => {
      const pointId = which === "from" ? jump.fromPointId : jump.toPointId;
      const staticValue = which === "from" ? jump.from : jump.to;

      if (pointId) {
        // Use animated X if available (during drag), otherwise calculate from value
        if (animatedPointX[pointId] !== undefined) {
          return animatedPointX[pointId];
        }
        const value = pointValueMap[pointId];
        return value !== undefined ? scale(value) : null;
      }
      return staticValue !== undefined ? scale(staticValue) : null;
    },
    [pointValueMap, animatedPointX, scale]
  );

  // Resolve jump value for label calculation
  const resolveJumpValue = useCallback(
    (jump: Jump, which: "from" | "to"): number | null => {
      const pointId = which === "from" ? jump.fromPointId : jump.toPointId;
      const staticValue = which === "from" ? jump.from : jump.to;

      if (pointId) {
        return pointValueMap[pointId] ?? null;
      }
      return staticValue ?? null;
    },
    [pointValueMap]
  );

  // ============================================
  // Event Handlers
  // ============================================

  const handleHover = useCallback(
    (x: number | null) => {
      if (x === null) {
        setGhostX(null);
      } else {
        const value = invert(x);
        const snappedValue = snap(value);
        setGhostX(scale(snappedValue));
      }
    },
    [invert, snap, scale]
  );

  const handlePlacePoint = useCallback(
    (x: number) => {
      if (!placementMode || !onChange) return;

      const value = invert(x);
      const snappedValue = snap(value);

      // Auto-assign label and color
      const existingLabels = state.points.map((p) => p.label);
      const newLabel = getNextLabel(existingLabels);
      const colorIndex = state.points.length % POINT_COLORS.length;
      const newColor = POINT_COLORS[colorIndex];

      const newPoint: Point = {
        id: `point-${Date.now()}`,
        line: mainLine.id,
        value: snappedValue,
        label: newLabel,
        color: newColor,
      };

      onChange({
        ...state,
        points: [...state.points, newPoint],
      });

      // Emit point_placed event
      onEvent?.({
        type: "point_placed",
        pointId: newPoint.id,
        label: newLabel,
        value: snappedValue,
      });
    },
    [placementMode, onChange, onEvent, invert, snap, mainLine.id, state]
  );

  const handleDrag = useCallback(
    (id: string, currentValue: number, animatedX: number) => {
      setLivePointValues((prev) => ({ ...prev, [id]: currentValue }));
      setAnimatedPointX((prev) => ({ ...prev, [id]: animatedX }));
    },
    []
  );

  const handleDragEnd = useCallback(
    (id: string, newValue: number) => {
      if (!onChange) return;

      // Clear live tracking
      setLivePointValues((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setAnimatedPointX((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      const movedPoint = state.points.find((p) => p.id === id);

      onChange({
        ...state,
        points: state.points.map((p) =>
          p.id === id ? { ...p, value: newValue } : p
        ),
      });

      // Emit point_moved event
      onEvent?.({
        type: "point_moved",
        pointId: id,
        label: movedPoint?.label,
        value: newValue,
      });
    },
    [onChange, onEvent, state]
  );

  const handleRemovePoint = useCallback(
    (id: string) => {
      if (!onChange) return;

      // Remove point and any jumps that reference it
      onChange({
        ...state,
        points: state.points.filter((p) => p.id !== id),
        jumps: state.jumps.filter(
          (j) => j.fromPointId !== id && j.toPointId !== id
        ),
      });
    },
    [onChange, state]
  );

  // ============================================
  // Render
  // ============================================

  return (
    <div className="w-full h-full flex flex-col">
      {/* SVG Canvas */}
      <div className="flex-1 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-full lg:max-w-4xl select-none"
          preserveAspectRatio="xMidYMid meet"
          style={{ userSelect: "none" }}
        >
          {/* Interactive click area */}
          <ClickableAxisArea
            onHover={handleHover}
            onClick={handlePlacePoint}
            enabled={placementMode && config.allowPointPlacement}
          />

          {/* Axis with arrows */}
          <Axis showLeftArrow showRightArrow />

          {/* Tick marks */}
          <AnimatePresence mode="popLayout">
            {ticks.map((value) => {
              // Check if this tick should have a label using calculated label interval
              const isLabeled =
                mainLine.showLabels && Math.abs(value % labelInterval) < 0.0001; // Handle floating point
              return (
                <TickMark
                  key={value}
                  x={scale(value)}
                  value={value}
                  isLabeled={isLabeled}
                  centerX={SVG_WIDTH / 2}
                />
              );
            })}
          </AnimatePresence>

          {/* Regions (shaded intervals) */}
          <AnimatePresence>
            {config.showRegions !== false &&
              state.regions.map((region) => (
                <Region
                  key={region.id}
                  fromX={scale(region.from)}
                  toX={scale(region.to)}
                  color={region.color}
                  shaded={region.shaded}
                />
              ))}
          </AnimatePresence>

          {/* Action overlays (highlights, animated jumps from actions) */}
          <ActionOverlays
            highlights={highlights}
            jumps={jumps}
            scale={scale}
            getPointX={getPointX}
          />

          {/* Jump arcs */}
          <AnimatePresence>
            {config.showJumps &&
              state.jumps.map((jump) => {
                // Use animated X positions for smooth arc tracking
                const fromX = resolveJumpX(jump, "from");
                const toX = resolveJumpX(jump, "to");

                // Use values for label calculation
                const fromValue = resolveJumpValue(jump, "from");
                const toValue = resolveJumpValue(jump, "to");

                if (
                  fromX === null ||
                  toX === null ||
                  fromValue === null ||
                  toValue === null
                ) {
                  return null;
                }

                const jumpDistance = toValue - fromValue;
                const jumpLabel =
                  jumpDistance >= 0 ? `+${jumpDistance}` : `${jumpDistance}`;

                return (
                  <JumpArc
                    key={jump.id}
                    fromX={fromX}
                    toX={toX}
                    lineWidth={SVG_WIDTH - 2 * PADDING_X}
                    label={jumpLabel}
                    color={jump.color}
                  />
                );
              })}
          </AnimatePresence>

          {/* Ghost point preview */}
          <GhostPoint
            x={ghostX ?? 0}
            visible={placementMode && ghostX !== null}
          />

          {/* Draggable points */}
          <AnimatePresence>
            {state.points.map((point) => (
              <DraggablePoint
                key={point.id}
                point={point}
                scale={scale}
                invert={invert}
                tickInterval={tickInterval}
                snapToTicks={mainLine.snapToTicks}
                minIncrement={mainLine.minIncrement}
                min={min}
                max={max}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                onRemove={handleRemovePoint}
                allowRemoval={config.allowPointRemoval}
                allowDragging={config.allowPointDragging !== false}
                showLabel={config.showPointLabels !== false}
                showDragTooltip={config.showDragTooltip !== false}
              />
            ))}
          </AnimatePresence>
        </svg>
      </div>
    </div>
  );
}
