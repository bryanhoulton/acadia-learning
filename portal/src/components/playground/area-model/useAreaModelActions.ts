/**
 * useAreaModelActions Hook
 *
 * Manages ephemeral action state for the area model component.
 * Handles processing incoming actions, managing lifecycles (timeouts),
 * and providing the current visual state.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { TypedAction } from '../types';
import {
  ACTION_DEFAULTS,
  type ActionState,
  type ActiveCellHighlight,
  type ActiveComparison,
  type ActiveDivider,
  type ActiveFillAnimation,
  type ActiveFractionHighlight,
  type ActiveRegionHighlight,
  type ActiveShapePulse,
  INITIAL_ACTION_STATE,
} from './actions';
import {
  actionSchemas,
  type AreaModelAction,
} from './schema';

/**
 * Typed pending action from PlaygroundComponentProps.
 * Uses TypedAction which is what the component receives.
 */
type PendingAction = { actions: TypedAction<typeof actionSchemas>[] } | null;

interface UseAreaModelActionsOptions {
  /** Pending action from parent (typed from PlaygroundComponentProps) */
  pendingAction?: PendingAction;
  /** Callback when action completes */
  onActionComplete?: () => void;
  /** Callback to set active color */
  onSetActiveColor?: (color: string) => void;
}

interface UseAreaModelActionsReturn {
  /** Current cell highlights to render */
  cellHighlights: ActiveCellHighlight[];
  /** Current region highlights to render */
  regionHighlights: ActiveRegionHighlight[];
  /** Current shape pulses to render */
  shapePulses: ActiveShapePulse[];
  /** Current comparisons to render */
  comparisons: ActiveComparison[];
  /** Current fill animations to render */
  fillAnimations: ActiveFillAnimation[];
  /** Current fraction highlights to render */
  fractionHighlights: ActiveFractionHighlight[];
  /** Current dividers to render */
  dividers: ActiveDivider[];
  /** Manually clear all actions */
  clearAll: () => void;
}

// Counter for generating sequential IDs
let actionCounter = 0;

/**
 * Generate a unique ID for action tracking
 * Uses short sequential IDs like preset elements (p1, f1, j1)
 */
function generateId(prefix: string = "a"): string {
  return `${prefix}${++actionCounter}`;
}

export function useAreaModelActions({
  pendingAction,
  onActionComplete,
  onSetActiveColor,
}: UseAreaModelActionsOptions): UseAreaModelActionsReturn {
  const [state, setState] = useState<ActionState>(INITIAL_ACTION_STATE);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const intervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const processedActionsRef = useRef<Set<string>>(new Set());

  /**
   * Remove an item by ID and type
   */
  const removeItem = useCallback(
    (
      id: string,
      type:
        | "cellHighlight"
        | "regionHighlight"
        | "shapePulse"
        | "comparison"
        | "fillAnimation"
        | "fractionHighlight"
        | "divider"
    ) => {
      setState((prev) => ({
        ...prev,
        cellHighlights:
          type === "cellHighlight"
            ? prev.cellHighlights.filter((h) => h.id !== id)
            : prev.cellHighlights,
        regionHighlights:
          type === "regionHighlight"
            ? prev.regionHighlights.filter((h) => h.id !== id)
            : prev.regionHighlights,
        shapePulses:
          type === "shapePulse"
            ? prev.shapePulses.filter((p) => p.id !== id)
            : prev.shapePulses,
        comparisons:
          type === "comparison"
            ? prev.comparisons.filter((c) => c.id !== id)
            : prev.comparisons,
        fillAnimations:
          type === "fillAnimation"
            ? prev.fillAnimations.filter((a) => a.id !== id)
            : prev.fillAnimations,
        fractionHighlights:
          type === "fractionHighlight"
            ? prev.fractionHighlights.filter((h) => h.id !== id)
            : prev.fractionHighlights,
        dividers:
          type === "divider"
            ? prev.dividers.filter((d) => d.id !== id)
            : prev.dividers,
      }));

      // Clear timeout/interval references
      const timeout = timeoutsRef.current.get(id);
      if (timeout) {
        clearTimeout(timeout);
        timeoutsRef.current.delete(id);
      }
      const interval = intervalsRef.current.get(id);
      if (interval) {
        clearInterval(interval);
        intervalsRef.current.delete(id);
      }
    },
    []
  );

  /**
   * Schedule removal of an item after duration
   */
  const scheduleRemoval = useCallback(
    (
      id: string,
      type:
        | "cellHighlight"
        | "regionHighlight"
        | "shapePulse"
        | "comparison"
        | "fillAnimation"
        | "fractionHighlight"
        | "divider",
      duration: number
    ) => {
      const timeout = setTimeout(() => {
        removeItem(id, type);
      }, duration);
      timeoutsRef.current.set(id, timeout);
    },
    [removeItem]
  );

  /**
   * Process an incoming action
   */
  const processAction = useCallback(
    (action: AreaModelAction) => {
      const now = Date.now();

      switch (action.action) {
        case "highlight_cell": {
          const id = generateId("hc");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.highlight_cell.duration;
          const highlight: ActiveCellHighlight = {
            id,
            shapeId: action.params.shapeId,
            row: action.params.row,
            col: action.params.col,
            color: action.params.color ?? ACTION_DEFAULTS.highlight_cell.color,
            label: action.params.label,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            cellHighlights: [...prev.cellHighlights, highlight],
          }));
          scheduleRemoval(id, "cellHighlight", duration);
          break;
        }

        case "highlight_region": {
          const id = generateId("hr");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.highlight_region.duration;
          const highlight: ActiveRegionHighlight = {
            id,
            shapeId: action.params.shapeId,
            cells: action.params.cells,
            color:
              action.params.color ?? ACTION_DEFAULTS.highlight_region.color,
            label: action.params.label,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            regionHighlights: [...prev.regionHighlights, highlight],
          }));
          scheduleRemoval(id, "regionHighlight", duration);
          break;
        }

        case "pulse_shape": {
          const id = generateId("ps");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.pulse_shape.duration;
          const pulse: ActiveShapePulse = {
            id,
            shapeId: action.params.shapeId,
            color: action.params.color,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            shapePulses: [...prev.shapePulses, pulse],
          }));
          scheduleRemoval(id, "shapePulse", duration);
          break;
        }

        case "show_comparison": {
          const id = generateId("cmp");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.show_comparison.duration;
          const comparison: ActiveComparison = {
            id,
            shapeId1: action.params.shapeId1,
            shapeId2: action.params.shapeId2,
            label: action.params.label,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            comparisons: [...prev.comparisons, comparison],
          }));
          scheduleRemoval(id, "comparison", duration);
          break;
        }

        case "animate_fill": {
          const id = generateId("af");
          const stepDelay =
            action.params.stepDelay ?? ACTION_DEFAULTS.animate_fill.stepDelay;
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.animate_fill.duration;
          const totalDuration =
            stepDelay * action.params.cells.length + duration;

          const animation: ActiveFillAnimation = {
            id,
            shapeId: action.params.shapeId,
            cells: action.params.cells,
            color: action.params.color,
            currentIndex: 0,
            expiresAt: now + totalDuration,
          };

          setState((prev) => ({
            ...prev,
            fillAnimations: [...prev.fillAnimations, animation],
          }));

          // Animate through cells
          let currentIndex = 0;
          const interval = setInterval(() => {
            currentIndex++;
            if (currentIndex >= action.params.cells.length) {
              clearInterval(interval);
              intervalsRef.current.delete(id);
              return;
            }
            setState((prev) => ({
              ...prev,
              fillAnimations: prev.fillAnimations.map((a) =>
                a.id === id ? { ...a, currentIndex } : a
              ),
            }));
          }, stepDelay);

          intervalsRef.current.set(id, interval);
          scheduleRemoval(id, "fillAnimation", totalDuration);
          break;
        }

        case "highlight_fraction": {
          const id = generateId("hfr");
          const duration =
            action.params.duration ??
            ACTION_DEFAULTS.highlight_fraction.duration;
          const highlight: ActiveFractionHighlight = {
            id,
            shapeId: action.params.shapeId,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            fractionHighlights: [...prev.fractionHighlights, highlight],
          }));
          scheduleRemoval(id, "fractionHighlight", duration);
          break;
        }

        case "show_divider": {
          const id = generateId("div");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.show_divider.duration;
          const divider: ActiveDivider = {
            id,
            shapeId: action.params.shapeId,
            orientation: action.params.orientation,
            position: action.params.position,
            color: action.params.color ?? ACTION_DEFAULTS.show_divider.color,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            dividers: [...prev.dividers, divider],
          }));
          scheduleRemoval(id, "divider", duration);
          break;
        }

        case "clear_highlights": {
          // Clear all timeouts and intervals
          timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
          intervalsRef.current.forEach((interval) => clearInterval(interval));
          timeoutsRef.current.clear();
          intervalsRef.current.clear();
          // Reset state
          setState(INITIAL_ACTION_STATE);
          break;
        }

        case "set_brush_color": {
          if (onSetActiveColor) {
            onSetActiveColor(action.params.color);
          }
          break;
        }
      }
    },
    [scheduleRemoval, onSetActiveColor]
  );

  /**
   * Clear all active actions
   */
  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    intervalsRef.current.forEach((interval) => clearInterval(interval));
    timeoutsRef.current.clear();
    intervalsRef.current.clear();
    setState(INITIAL_ACTION_STATE);
  }, []);

  /**
   * Process pending action(s) when they change
   */
  useEffect(() => {
    if (!pendingAction) return;

    // Create a key for deduplication
    const actionKey = JSON.stringify(pendingAction);

    // Skip if we've already processed this exact action batch
    if (processedActionsRef.current.has(actionKey)) return;

    // Mark as processed
    processedActionsRef.current.add(actionKey);

    // Clean up old processed actions (keep last 10)
    if (processedActionsRef.current.size > 10) {
      const entries = Array.from(processedActionsRef.current);
      entries.slice(0, entries.length - 10).forEach((key) => {
        processedActionsRef.current.delete(key);
      });
    }

    // Process each action in the batch
    const actionItems = pendingAction.actions || [];
    for (const actionItem of actionItems) {
      // Cast to AreaModelAction (discriminated union) for type narrowing in switch.
      // TypedAction has union params; ActionsToUnion preserves action-to-params correlation.
      const typedAction = actionItem as AreaModelAction;
      processAction(typedAction);
    }

    // Notify parent that action was handled
    onActionComplete?.();
  }, [pendingAction, processAction, onActionComplete]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      intervals.forEach((interval) => clearInterval(interval));
      timeouts.clear();
      intervals.clear();
    };
  }, []);

  return {
    cellHighlights: state.cellHighlights,
    regionHighlights: state.regionHighlights,
    shapePulses: state.shapePulses,
    comparisons: state.comparisons,
    fillAnimations: state.fillAnimations,
    fractionHighlights: state.fractionHighlights,
    dividers: state.dividers,
    clearAll,
  };
}
