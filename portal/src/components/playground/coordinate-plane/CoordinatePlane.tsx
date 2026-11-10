import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AnimatePresence } from 'framer-motion';
// Icons
import {
  Eye,
  EyeOff,
  MousePointer2,
  Plus,
  Scan,
} from 'lucide-react';

import type { PlaygroundComponentProps } from '../types';
import {
  Axes,
  DraggablePoint,
  FunctionCurve,
  GhostPoint,
  Grid,
  LinePath,
  Region,
  SpecialMarker,
  TraceMode,
} from './components';
import {
  COLORS,
  TIMING,
} from './constants';
import {
  actionSchemas,
  type Config,
  type CoordinatePoint,
  type State,
} from './schema';
import { useCoordinatePlaneActions } from './useCoordinatePlaneActions';
import {
  findIntersections,
  generatePointLabel,
  parseFunction,
  pixelToMath,
  snapCoordinates,
  type ViewBox,
} from './utils';

type Tool = "select" | "point" | "trace";

type Props = PlaygroundComponentProps<Config, State, typeof actionSchemas>;

/**
 * Coordinate Plane Playground
 *
 * A pedagogically-focused interactive coordinate plane for:
 * - Graphing functions (linear, quadratic, polynomial, etc.)
 * - Plotting and manipulating points
 * - Exploring function values with trace mode
 * - Shading inequality regions
 * - Finding intersections
 */
export function CoordinatePlane({
  config,
  state,
  onChange,
  onEvent,
  pendingAction,
  onActionComplete,
}: Props) {
  const [xMin, xMax] = config.xRange;
  const [yMin, yMax] = config.yRange;

  // Local UI state (can be controlled via state.activeTool)
  const [activeTool, setActiveTool] = useState<Tool>(
    state.activeTool || "select"
  );

  // Action management (currently disabled - just completes immediately)
  useCoordinatePlaneActions({
    pendingAction,
    onActionComplete,
  });

  // Sync activeTool when state.activeTool prop changes (e.g., preset switch)
  useEffect(() => {
    if (state.activeTool) {
      setActiveTool(state.activeTool);
    }
  }, [state.activeTool]);
  const [ghostPosition, setGhostPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(
    null
  );
  const [showAddFunctionModal, setShowAddFunctionModal] = useState(false);
  const [newFunctionInput, setNewFunctionInput] = useState("");

  // Pedagogical tool settings (with defaults)
  const pedagogicalTools = config.pedagogicalTools ?? {
    traceMode: true,
    showIntercepts: true,
    showIntersections: true,
  };

  // Grid config
  const gridConfig = config.gridConfig ?? {
    majorInterval: 1,
    showMinorGrid: false,
    minorInterval: 0.5,
  };

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // SVG dimensions with padding for axes labels and tick marks
  const PADDING = 40; // Padding on all sides for labels
  const CONTENT_SIZE = 420; // Actual graph area
  const SVG_SIZE = CONTENT_SIZE + PADDING * 2; // Total SVG size (500)

  const view: ViewBox = useMemo(
    () => ({
      xMin,
      xMax,
      yMin,
      yMax,
      width: CONTENT_SIZE,
      height: CONTENT_SIZE,
    }),
    [xMin, xMax, yMin, yMax, CONTENT_SIZE]
  );

  // Calculate intersections between visible functions
  const intersections = useMemo(() => {
    const visibleFunctions = state.functions.filter((f) => f.visible !== false);
    const allIntersections: { x: number; y: number }[] = [];

    for (let i = 0; i < visibleFunctions.length; i++) {
      for (let j = i + 1; j < visibleFunctions.length; j++) {
        const fn1 = parseFunction(visibleFunctions[i].equation);
        const fn2 = parseFunction(visibleFunctions[j].equation);

        if (fn1 && fn2) {
          const ints = findIntersections(fn1, fn2, xMin, xMax);
          allIntersections.push(...ints.map((p) => ({ x: p.x, y: p.y })));
        }
      }
    }

    return allIntersections;
  }, [state.functions, xMin, xMax]);

  // Get next available point label
  const nextPointLabel = useMemo(() => {
    const existingLabels = state.points
      .map((p) => p.label)
      .filter((l): l is string => !!l);
    return generatePointLabel(existingLabels);
  }, [state.points]);

  // State update helper
  const updateState = useCallback(
    (updates: Partial<State>) => {
      onChange?.({ ...state, ...updates });
    },
    [state, onChange]
  );

  // Handle canvas pointer move (for ghost preview and trace)
  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (activeTool !== "point") {
        setGhostPosition(null);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      // Convert to SVG coordinates, then subtract padding to get content coordinates
      const svgX = ((e.clientX - rect.left) / rect.width) * SVG_SIZE - PADDING;
      const svgY = ((e.clientY - rect.top) / rect.height) * SVG_SIZE - PADDING;

      let { x, y } = pixelToMath(svgX, svgY, view);

      // Snap to grid if enabled
      if (config.snapToGrid) {
        const snapped = snapCoordinates(x, y, 1);
        x = snapped.x;
        y = snapped.y;
      }

      // Clamp to visible area
      x = Math.max(xMin, Math.min(xMax, x));
      y = Math.max(yMin, Math.min(yMax, y));

      setGhostPosition({ x, y });
    },
    [
      activeTool,
      view,
      config.snapToGrid,
      xMin,
      xMax,
      yMin,
      yMax,
      SVG_SIZE,
      PADDING,
    ]
  );

  const handleCanvasPointerLeave = useCallback(() => {
    setGhostPosition(null);
  }, []);

  // Handle canvas click (for placing points)
  const handleCanvasClick = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Deselect if clicking on empty space
      if (activeTool === "select") {
        setSelectedPointId(null);
        setSelectedFunctionId(null);
        return;
      }

      if (activeTool !== "point" || !config.allowPointPlot) return;

      const rect = e.currentTarget.getBoundingClientRect();
      // Convert to SVG coordinates, then subtract padding to get content coordinates
      const svgX = ((e.clientX - rect.left) / rect.width) * SVG_SIZE - PADDING;
      const svgY = ((e.clientY - rect.top) / rect.height) * SVG_SIZE - PADDING;

      let { x, y } = pixelToMath(svgX, svgY, view);

      if (config.snapToGrid) {
        const snapped = snapCoordinates(x, y, 1);
        x = snapped.x;
        y = snapped.y;
      }

      // Add new point
      const newPoint: CoordinatePoint = {
        id: `point-${Date.now()}`,
        x,
        y,
        label: nextPointLabel,
        color: COLORS.point,
        draggable: true,
      };

      updateState({
        points: [...state.points, newPoint],
      });

      // Emit point_placed event
      onEvent?.({
        type: "point_placed",
        pointId: newPoint.id,
        label: newPoint.label,
        x,
        y,
      });

      // Switch back to select tool after placing
      setActiveTool("select");
      setGhostPosition(null);
    },
    [
      activeTool,
      config.allowPointPlot,
      config.snapToGrid,
      view,
      nextPointLabel,
      state.points,
      updateState,
      onEvent,
      SVG_SIZE,
      PADDING,
    ]
  );

  // Handle point drag end
  const handlePointDragEnd = useCallback(
    (id: string, newX: number, newY: number) => {
      const movedPoint = state.points.find((p) => p.id === id);
      const updatedPoints = state.points.map((p) =>
        p.id === id ? { ...p, x: newX, y: newY } : p
      );
      updateState({ points: updatedPoints });

      // Emit point_moved event
      onEvent?.({
        type: "point_moved",
        pointId: id,
        label: movedPoint?.label,
        x: newX,
        y: newY,
      });
    },
    [state.points, updateState, onEvent]
  );

  // Handle point removal (double-click)
  const handlePointRemove = useCallback(
    (id: string) => {
      const updatedPoints = state.points.filter((p) => p.id !== id);
      updateState({ points: updatedPoints });
      // Clear selection if removed point was selected
      if (selectedPointId === id) {
        setSelectedPointId(null);
      }
    },
    [state.points, updateState, selectedPointId]
  );

  // Handle point selection
  const handlePointSelect = useCallback((id: string) => {
    setSelectedPointId(id);
    setSelectedFunctionId(null);
  }, []);

  // Handle function selection
  const handleFunctionSelect = useCallback((id: string) => {
    setSelectedFunctionId(id);
    setSelectedPointId(null);
  }, []);

  // Toggle function visibility
  const handleToggleFunctionVisibility = useCallback(
    (id: string) => {
      const updatedFunctions = state.functions.map((f) =>
        f.id === id ? { ...f, visible: f.visible === false ? true : false } : f
      );
      updateState({ functions: updatedFunctions });
    },
    [state.functions, updateState]
  );

  // Add new function
  const handleAddFunction = useCallback(() => {
    if (!newFunctionInput.trim()) return;

    // Validate the function can be parsed
    const parsed = parseFunction(newFunctionInput);
    if (!parsed) {
      // Could show an error here
      return;
    }

    const colorIndex = state.functions.length % COLORS.functions.length;
    const newFunction = {
      id: `fn-${Date.now()}`,
      equation: newFunctionInput,
      color: COLORS.functions[colorIndex],
      visible: true,
    };

    updateState({
      functions: [...state.functions, newFunction],
    });

    setNewFunctionInput("");
    setShowAddFunctionModal(false);
  }, [newFunctionInput, state.functions, updateState]);

  // Show toolbar if any interactive features are enabled
  const showToolbar = config.allowPointPlot || pedagogicalTools.traceMode;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col overflow-hidden"
    >
      {/* Tool selection toolbar */}
      {showToolbar && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-neutral-50/50">
          <ToolButton
            icon={<MousePointer2 className="w-4 h-4" />}
            label="Select"
            active={activeTool === "select"}
            onClick={() => setActiveTool("select")}
          />
          {config.allowPointPlot && (
            <ToolButton
              icon={<Plus className="w-4 h-4" />}
              label="Add Point"
              active={activeTool === "point"}
              onClick={() => setActiveTool("point")}
            />
          )}
          {pedagogicalTools.traceMode && (
            <ToolButton
              icon={<Scan className="w-4 h-4" />}
              label="Trace"
              active={activeTool === "trace"}
              onClick={() => setActiveTool("trace")}
            />
          )}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas container - takes all available space */}
        <div className="flex-1 flex items-center justify-center p-4">
          {/* Graph wrapper - full height, centered */}
          <div className="h-full aspect-square max-w-full flex items-center justify-center">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
              className="w-full h-full"
              style={{
                aspectRatio: "1",
                userSelect: "none",
              }}
              onPointerMove={handleCanvasPointerMove}
              onPointerLeave={handleCanvasPointerLeave}
              onPointerUp={handleCanvasClick}
            >
              {/* Clip path definition for graph boundaries */}
              <defs>
                <clipPath id="graph-clip">
                  <rect
                    x={PADDING}
                    y={PADDING}
                    width={CONTENT_SIZE}
                    height={CONTENT_SIZE}
                  />
                </clipPath>
              </defs>

              {/* Content group with padding offset */}
              <g transform={`translate(${PADDING}, ${PADDING})`}>
                {/* Grid */}
                {config.gridEnabled && (
                  <Grid
                    view={view}
                    majorInterval={gridConfig.majorInterval}
                    minorInterval={gridConfig.minorInterval}
                    showMinor={gridConfig.showMinorGrid}
                  />
                )}

                {/* Axes */}
                <Axes view={view} labels={config.axisLabels} />

                {/* Clipped content group - functions, regions, lines stay within grid */}
                <g
                  clipPath="url(#graph-clip)"
                  transform={`translate(${-PADDING}, ${-PADDING})`}
                >
                  <g transform={`translate(${PADDING}, ${PADDING})`}>
                    {/* Regions (inequality shading) */}
                    {state.regions.map((region) => (
                      <Region
                        key={region.id}
                        inequality={region.inequality}
                        color={region.color}
                        opacity={region.opacity}
                        view={view}
                        visible={region.shaded}
                      />
                    ))}

                    {/* Lines */}
                    {state.lines.map((line) => (
                      <LinePath
                        key={line.id}
                        points={line.points}
                        view={view}
                        color={line.color}
                        style={line.style}
                      />
                    ))}

                    {/* Functions */}
                    <AnimatePresence>
                      {state.functions.map((fn) => (
                        <FunctionCurve
                          key={fn.id}
                          equation={fn.equation}
                          color={fn.color}
                          view={view}
                          visible={fn.visible}
                          showIntercepts={pedagogicalTools.showIntercepts}
                          isSelected={selectedFunctionId === fn.id}
                          onSelect={() => handleFunctionSelect(fn.id)}
                          domain={fn.domain}
                        />
                      ))}
                    </AnimatePresence>
                  </g>
                </g>

                {/* Intersection markers */}
                {pedagogicalTools.showIntersections &&
                  intersections.map((int, i) => (
                    <SpecialMarker
                      key={`int-${i}`}
                      x={int.x}
                      y={int.y}
                      type="intersection"
                      view={view}
                    />
                  ))}

                {/* Intercept markers from state */}
                {state.markers?.intercepts?.map((intercept, i) => (
                  <SpecialMarker
                    key={`intercept-${i}`}
                    x={intercept.x}
                    y={intercept.y}
                    type="intercept"
                    label={intercept.label}
                    view={view}
                  />
                ))}

                {/* Ghost point preview */}
                {ghostPosition && activeTool === "point" && (
                  <GhostPoint
                    x={ghostPosition.x}
                    y={ghostPosition.y}
                    view={view}
                    label={nextPointLabel}
                    showCoordinates={config.showCoordinates}
                  />
                )}
              </g>

              {/* Points layer - separate group for proper z-ordering */}
              <g transform={`translate(${PADDING}, ${PADDING})`}>
                <AnimatePresence>
                  {state.points.map((point) => (
                    <DraggablePoint
                      key={point.id}
                      id={point.id}
                      x={point.x}
                      y={point.y}
                      label={point.label}
                      color={point.color}
                      draggable={point.draggable}
                      view={view}
                      snapToGrid={config.snapToGrid}
                      showCoordinates={config.showCoordinates}
                      onDragEnd={handlePointDragEnd}
                      onSelect={handlePointSelect}
                      onRemove={handlePointRemove}
                      removable={config.allowPointRemoval ?? true}
                      isSelected={selectedPointId === point.id}
                    />
                  ))}
                </AnimatePresence>
              </g>

              {/* Trace mode overlay - rendered last to capture pointer events */}
              <g transform={`translate(${PADDING}, ${PADDING})`}>
                <TraceMode
                  equations={state.functions
                    .filter((f) => f.visible !== false)
                    .map((f) => f.equation)}
                  view={view}
                  active={activeTool === "trace"}
                />
              </g>
            </svg>
          </div>
        </div>

        {/* Side panel - Function list */}
        {state.functions.length > 0 && (
          <div className="w-56 overflow-y-auto">
            <div className="p-2 space-y-1">
              {state.functions.map((fn) => (
                <div
                  key={fn.id}
                  className={`
                    flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer
                    transition-colors duration-100
                    ${
                      selectedFunctionId === fn.id
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-neutral-50"
                    }
                    ${fn.visible === false ? "opacity-50" : ""}
                  `}
                  onClick={() => handleFunctionSelect(fn.id)}
                >
                  <div
                    className="w-3 h-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: fn.color }}
                  />
                  <span className="font-mono text-xs flex-1 truncate">
                    {fn.equation}
                  </span>
                  <button
                    className="p-1 hover:bg-neutral-200 rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFunctionVisibility(fn.id);
                    }}
                  >
                    {fn.visible === false ? (
                      <EyeOff className="w-3 h-3 text-neutral-400" />
                    ) : (
                      <Eye className="w-3 h-3 text-neutral-400" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Function Modal */}
      {showAddFunctionModal && (
        <div
          className="absolute inset-0 bg-black/20 flex items-center justify-center z-50"
          onClick={() => setShowAddFunctionModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-4 w-80"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: `slideUp ${TIMING.comfortable}ms ease-out`,
            }}
          >
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">
              Add Function
            </h3>
            <input
              type="text"
              value={newFunctionInput}
              onChange={(e) => setNewFunctionInput(e.target.value)}
              placeholder="y = 2x + 1"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddFunction();
                if (e.key === "Escape") setShowAddFunctionModal(false);
              }}
            />
            <p className="text-xs text-neutral-500 mt-2">
              Examples: y = x^2, y = 2x + 1, y = sin(x)
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-100 hover:bg-neutral-200 transition-colors"
                onClick={() => setShowAddFunctionModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                onClick={handleAddFunction}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// Tool button component
function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md
        transition-colors duration-100
        ${
          active
            ? "bg-blue-100 text-blue-700"
            : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
        }
      `}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
