/**
 * AreaModel Component
 *
 * Main component for the Area Model / Fraction playground.
 *
 * This playground displays partitioned shapes (rectangles, circles, bars)
 * for visualizing fractions, multiplication, and part-whole relationships.
 *
 * ## Visual Structure
 *
 * Minimal, borderless design with centered content:
 * ```
 *                   [Title]
 *               ┌──┬──┬──┬──┐
 *               │██│██│██│  │  <- Shape with grid
 *               ├──┼──┼──┼──┤
 *               │██│██│██│  │
 *               └──┴──┴──┴──┘
 *                  [6/8]
 *
 *            ╭─────────────────╮
 *            │ ●●●● | Clear +  │  <- Floating toolbar
 *            ╰─────────────────╯
 * ```
 *
 * ## Interaction Modes
 *
 * The playground supports several configurable interaction modes:
 *
 * - **View Only**: No interaction, just display
 * - **Click to Shade**: Click cells individually
 * - **Drag to Shade**: Click and drag to paint multiple cells
 * - **Full Control**: All features enabled
 *
 * ## Configuration
 *
 * Teachers can control:
 * - Which shape types are available (rectangle, circle, bar)
 * - What interactions are allowed (shading, adding shapes, etc.)
 * - Visual options (grid lines, fraction labels, fixed dimensions)
 * - Available colors for shading
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { PlaygroundComponentProps } from '../types';
import {
  BarShape,
  CircleShape,
  ColorPicker,
  RectangleShape,
  ShapeContainer,
} from './components';
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
} from './constants';
import {
  actionSchemas,
  type AreaModelColorKey,
  type AreaShape,
  type Config,
  type FractionDisplayFormat,
  type ShadedCell,
  type State,
} from './schema';
import { useAreaModelActions } from './useAreaModelActions';
import {
  addShadedCell,
  formatShapeFraction,
  getCellColor,
  removeShadedCell,
} from './utils';

type Props = PlaygroundComponentProps<Config, State, typeof actionSchemas>;

// ============================================
// Custom Hooks
// ============================================

interface PaintingState {
  shapeId: string;
  mode: "fill" | "erase";
  color: AreaModelColorKey;
  visitedCells: Set<string>;
}

/**
 * Hook for managing drag-to-paint state.
 * Returns the current painting state and handlers for starting/continuing/stopping painting.
 */
function usePainting(allowDragShading: boolean) {
  const paintingRef = useRef<PaintingState | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [paintMode, setPaintMode] = useState<"fill" | "erase" | null>(null);

  const startPainting = useCallback(
    (
      shapeId: string,
      mode: "fill" | "erase",
      color: AreaModelColorKey,
      cellKey: string
    ) => {
      if (!allowDragShading) return;

      paintingRef.current = {
        shapeId,
        mode,
        color,
        visitedCells: new Set([cellKey]),
      };
      setIsPainting(true);
      setPaintMode(mode);
    },
    [allowDragShading]
  );

  const stopPainting = useCallback(() => {
    paintingRef.current = null;
    setIsPainting(false);
    setPaintMode(null);
  }, []);

  const getPaintingState = useCallback(() => paintingRef.current, []);

  const addVisitedCell = useCallback((cellKey: string) => {
    if (paintingRef.current) {
      paintingRef.current.visitedCells.add(cellKey);
    }
  }, []);

  return {
    isPainting,
    paintMode,
    paintingRef,
    startPainting,
    stopPainting,
    getPaintingState,
    addVisitedCell,
  };
}

// ============================================
// Main Component
// ============================================

export function AreaModel({
  config,
  state,
  onChange,
  onEvent,
  pendingAction,
  onActionComplete,
}: Props) {
  // === Extract config with defaults ===

  // Display Options
  const showFractionLabels = config.showFractionLabels;
  const fractionDisplay: FractionDisplayFormat =
    config.fractionDisplay ?? "improper";
  const showGridLines = config.showGridLines ?? true;
  const showOverlap = config.showOverlap ?? true;
  const overlapColor = config.overlapColor ?? "purple";
  const fixedDimensions = config.fixedDimensions;

  // Interaction Permissions
  const allowShading = config.allowShading;
  const allowColorChange = config.allowColorChange ?? allowShading;
  const allowAddingShapes = config.allowAddingShapes ?? config.multipleShapes;
  const allowRemovingShapes = config.allowRemovingShapes ?? false;
  const allowClear = config.allowClear ?? false;
  const allowDragShading = config.allowDragShading ?? allowShading;

  // Constraints
  const shapeType = config.shapeType;
  const maxShapes = config.maxShapes;
  const availableColors = config.availableColors ?? ["blue", "red", "green"];

  // === State ===
  const activeColor = state.activeColor ?? "blue";

  // === Computed values ===
  const dimensions = useMemo(
    () => ({
      width: fixedDimensions?.width ?? DEFAULT_WIDTH,
      height: fixedDimensions?.height ?? DEFAULT_HEIGHT,
    }),
    [fixedDimensions]
  );

  // === Painting state ===
  const {
    isPainting,
    paintMode,
    startPainting,
    stopPainting,
    getPaintingState,
    addVisitedCell,
  } = usePainting(allowDragShading);

  // === Debounced event emission ===
  const shadingDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const emitAreaShadedEvent = useCallback(
    (shapes: AreaShape[]) => {
      if (!onEvent) return;

      // Clear any pending debounce
      if (shadingDebounceRef.current) {
        clearTimeout(shadingDebounceRef.current);
      }

      // Debounce the event emission by 500ms
      shadingDebounceRef.current = setTimeout(() => {
        // Calculate shaded state for each shape
        const shadedState = shapes.map((shape) => {
          const totalCells =
            (shape.partitions?.horizontal ?? 1) *
            (shape.partitions?.vertical ?? 1);
          const shadedCount = shape.shadedCells?.length ?? 0;
          const percentage =
            totalCells > 0 ? Math.round((shadedCount / totalCells) * 100) : 0;

          return {
            shapeId: shape.id,
            shapeType: shape.type,
            totalCells,
            shadedCount,
            percentage,
          };
        });

        // Calculate overall percentage across all shapes
        const totalCellsAll = shadedState.reduce(
          (sum, s) => sum + s.totalCells,
          0
        );
        const shadedCountAll = shadedState.reduce(
          (sum, s) => sum + s.shadedCount,
          0
        );
        const overallPercentage =
          totalCellsAll > 0
            ? Math.round((shadedCountAll / totalCellsAll) * 100)
            : 0;

        onEvent({
          type: "area_shaded",
          shapes: shadedState,
          overallPercentage,
        });
      }, 500);
    },
    [onEvent]
  );

  // === Actions state ===
  const { cellHighlights, regionHighlights, shapePulses, dividers } =
    useAreaModelActions({
      pendingAction,
      onActionComplete,
      onSetActiveColor: (color) => {
        if (onChange && availableColors.includes(color as AreaModelColorKey)) {
          onChange({ ...state, activeColor: color as AreaModelColorKey });
        }
      },
    });

  // === Event Handlers ===

  const handleCellInteraction = useCallback(
    (
      shapeId: string,
      row: number,
      col: number,
      type: "down" | "enter" | "up"
    ) => {
      if (!onChange || !allowShading) return;

      const shape = state.shapes.find((s) => s.id === shapeId);
      if (!shape) return;

      const cellKey = `${row}-${col}`;
      const currentCellColor = getCellColor(shape.shadedCells, row, col);

      if (type === "down") {
        // Determine mode based on first cell:
        // - If cell is same color as active color → erase
        // - If cell is empty or different color → fill with active color
        const mode = currentCellColor === activeColor ? "erase" : "fill";

        // Start drag painting if allowed
        if (allowDragShading) {
          startPainting(shapeId, mode, activeColor, cellKey);
        }

        // Apply to first cell immediately
        const newShapes = state.shapes.map((s) => {
          if (s.id !== shapeId) return s;

          if (mode === "erase") {
            return {
              ...s,
              shadedCells: removeShadedCell(s.shadedCells || [], row, col),
            };
          } else {
            return {
              ...s,
              shadedCells: addShadedCell(s.shadedCells, row, col, activeColor),
            };
          }
        });

        onChange({ ...state, shapes: newShapes });
        emitAreaShadedEvent(newShapes);
      } else if (type === "enter" && allowDragShading) {
        const paintState = getPaintingState();
        if (!paintState || paintState.shapeId !== shapeId) return;
        if (paintState.visitedCells.has(cellKey)) return;
        if (row < 0 || col < 0) return;

        addVisitedCell(cellKey);

        const { mode, color } = paintState;
        const cellColor = getCellColor(shape.shadedCells, row, col);

        // Only apply if the cell state matches our mode:
        // - In fill mode: skip if cell already has the target color
        // - In erase mode: skip if cell is empty or has a different color
        if (mode === "fill" && cellColor === color) return;
        if (mode === "erase" && cellColor !== color) return;

        const newShapes = state.shapes.map((s) => {
          if (s.id !== shapeId) return s;

          if (mode === "erase") {
            return {
              ...s,
              shadedCells: removeShadedCell(s.shadedCells || [], row, col),
            };
          } else {
            return {
              ...s,
              shadedCells: addShadedCell(s.shadedCells, row, col, color),
            };
          }
        });

        onChange({ ...state, shapes: newShapes });
        emitAreaShadedEvent(newShapes);
      } else if (type === "up") {
        stopPainting();
      }
    },
    [
      onChange,
      allowShading,
      allowDragShading,
      state,
      activeColor,
      startPainting,
      stopPainting,
      getPaintingState,
      addVisitedCell,
      emitAreaShadedEvent,
    ]
  );

  const handleSegmentClick = useCallback(
    (shapeId: string, segment: number) => {
      if (!onChange || !allowShading) return;

      const newShapes = state.shapes.map((shape) => {
        if (shape.id !== shapeId) return shape;

        const existingCell = shape.shadedCells?.find((c) => c.col === segment);

        // If segment has the same color as active color → erase
        // If segment is empty or different color → fill with active color
        if (existingCell?.color === activeColor) {
          // Erase
          return {
            ...shape,
            shadedCells: shape.shadedCells?.filter((c) => c.col !== segment),
          };
        } else if (existingCell) {
          // Different color → change to active color
          return {
            ...shape,
            shadedCells: shape.shadedCells?.map((c) =>
              c.col === segment ? { ...c, color: activeColor } : c
            ),
          };
        } else {
          // Empty → fill with active color
          const newCell: ShadedCell = {
            row: 0,
            col: segment,
            color: activeColor,
          };
          return {
            ...shape,
            shadedCells: [...(shape.shadedCells || []), newCell],
          };
        }
      });

      onChange({ ...state, shapes: newShapes });
      emitAreaShadedEvent(newShapes);
    },
    [onChange, allowShading, state, activeColor, emitAreaShadedEvent]
  );

  const handleColorChange = useCallback(
    (color: AreaModelColorKey) => {
      if (!onChange) return;
      onChange({ ...state, activeColor: color });
    },
    [onChange, state]
  );

  const handleAddShape = useCallback(() => {
    if (!onChange || !allowAddingShapes || state.shapes.length >= maxShapes)
      return;

    const newShape: AreaShape = {
      id: `shape-${Date.now()}`,
      type: shapeType,
      partitions: { horizontal: 2, vertical: 2 },
      shadedCells: [],
    };

    onChange({ ...state, shapes: [...state.shapes, newShape] });
  }, [onChange, allowAddingShapes, state, maxShapes, shapeType]);

  const handleRemoveShape = useCallback(
    (shapeId: string) => {
      if (!onChange || !allowRemovingShapes || state.shapes.length <= 1) return;
      onChange({
        ...state,
        shapes: state.shapes.filter((s) => s.id !== shapeId),
      });
    },
    [onChange, allowRemovingShapes, state]
  );

  const handleClearShading = useCallback(() => {
    if (!onChange || !allowClear) return;
    onChange({
      ...state,
      shapes: state.shapes.map((s) => ({ ...s, shadedCells: [] })),
    });
  }, [onChange, allowClear, state]);

  // === Render ===

  // Only show color picker if colors are available
  const hasColorsToShow = allowColorChange && availableColors.length > 0;
  const hasAddButton = allowAddingShapes && state.shapes.length < maxShapes;
  const showFloatingToolbar = hasColorsToShow || allowClear || hasAddButton;

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* Canvas Area - centered */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div className="flex gap-8 flex-wrap justify-center items-center">
          {state.shapes.map((shape) => {
            // Use explicit label override if set (for special cases like multiplication overlap),
            // otherwise auto-compute from actual shaded cells (reactive to changes)
            const fraction =
              shape.labels?.shaded ??
              formatShapeFraction(shape, fractionDisplay);
            const paintingState = getPaintingState();
            const isShapePainting =
              isPainting && paintingState?.shapeId === shape.id;

            return (
              <ShapeContainer
                key={shape.id}
                shape={shape}
                width={dimensions.width}
                height={dimensions.height}
                fraction={fraction}
                showFractionLabels={showFractionLabels}
                showRemoveButton={
                  allowRemovingShapes && state.shapes.length > 1
                }
                onRemove={() => handleRemoveShape(shape.id)}
              >
                {shape.type === "rectangle" && (
                  <RectangleShape
                    shape={shape}
                    width={dimensions.width}
                    height={dimensions.height}
                    showOverlap={showOverlap}
                    overlapColor={overlapColor}
                    showGridLines={showGridLines}
                    allowShading={allowShading}
                    activeColor={activeColor}
                    isPainting={isShapePainting}
                    paintMode={paintMode}
                    onCellInteraction={(row, col, type) =>
                      handleCellInteraction(shape.id, row, col, type)
                    }
                    cellHighlights={cellHighlights}
                    regionHighlights={regionHighlights}
                    shapePulses={shapePulses}
                    dividers={dividers}
                  />
                )}

                {shape.type === "circle" && (
                  <CircleShape
                    shape={shape}
                    size={Math.min(dimensions.width, dimensions.height)}
                    allowShading={allowShading}
                    activeColor={activeColor}
                    onSegmentClick={(seg) => handleSegmentClick(shape.id, seg)}
                  />
                )}

                {shape.type === "bar" && (
                  <BarShape
                    shape={shape}
                    width={dimensions.width}
                    height={dimensions.height / 3}
                    allowShading={allowShading}
                    activeColor={activeColor}
                    onSegmentClick={(seg) => handleSegmentClick(shape.id, seg)}
                  />
                )}
              </ShapeContainer>
            );
          })}
        </div>
      </div>

      {/* Floating Toolbar */}
      {showFloatingToolbar && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-white rounded-full shadow-lg border border-neutral-200">
          {hasColorsToShow && (
            <ColorPicker
              colors={availableColors}
              activeColor={activeColor}
              onColorChange={handleColorChange}
            />
          )}
          {hasColorsToShow && (allowClear || hasAddButton) && (
            <div className="w-px h-6 bg-neutral-200" />
          )}
          {allowClear && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-full text-neutral-600 hover:bg-neutral-100 transition-colors"
              onClick={handleClearShading}
            >
              Clear
            </button>
          )}
          {hasAddButton && (
            <button
              className="px-3 py-1 text-xs font-medium rounded-full text-neutral-600 hover:bg-neutral-100 transition-colors"
              onClick={handleAddShape}
            >
              + Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}
