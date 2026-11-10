/**
 * useNumberLineActions Hook
 *
 * Manages ephemeral action state for the number line component.
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
  type ActiveHighlight,
  type ActiveJump,
  INITIAL_ACTION_STATE,
} from './actions';
import {
  actionSchemas,
  type NumberLineAction,
} from './schema';

/**
 * Typed pending action from PlaygroundComponentProps.
 * Uses TypedAction which is what the component receives.
 */
type PendingAction = { actions: TypedAction<typeof actionSchemas>[] } | null;

interface UseNumberLineActionsOptions {
  /** Pending action from parent (typed from PlaygroundComponentProps) */
  pendingAction?: PendingAction;
  /** Callback when action completes */
  onActionComplete?: () => void;
  /** Current placement mode state */
  placementMode?: boolean;
  /** Callback to set placement mode */
  onSetPlacementMode?: (enabled: boolean) => void;
}

interface UseNumberLineActionsReturn {
  /** Current highlights to render */
  highlights: ActiveHighlight[];
  /** Current animated jumps to render */
  jumps: ActiveJump[];
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

export function useNumberLineActions({
  pendingAction,
  onActionComplete,
  placementMode,
  onSetPlacementMode,
}: UseNumberLineActionsOptions): UseNumberLineActionsReturn {
  const [state, setState] = useState<ActionState>(INITIAL_ACTION_STATE);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const processedActionsRef = useRef<Set<string>>(new Set());

  /**
   * Remove an item by ID
   */
  const removeItem = useCallback((id: string, type: "highlight" | "jump") => {
    setState((prev) => ({
      ...prev,
      highlights:
        type === "highlight"
          ? prev.highlights.filter((h) => h.id !== id)
          : prev.highlights,
      jumps:
        type === "jump" ? prev.jumps.filter((j) => j.id !== id) : prev.jumps,
    }));
    // Clear the timeout reference
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  /**
   * Schedule removal of an item after duration
   */
  const scheduleRemoval = useCallback(
    (id: string, type: "highlight" | "jump", duration: number) => {
      const timeout = setTimeout(() => {
        removeItem(id, type);
      }, duration);
      timeoutsRef.current.set(id, timeout);
    },
    [removeItem],
  );

  /**
   * Process an incoming action
   */
  const processAction = useCallback(
    (action: NumberLineAction) => {
      const now = Date.now();

      switch (action.action) {
        case "highlight_value": {
          const id = generateId("hv");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.highlight_value.duration;
          const highlight: ActiveHighlight = {
            id,
            type: "value",
            value: action.params.value,
            color: action.params.color ?? ACTION_DEFAULTS.highlight_value.color,
            label: action.params.label,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            highlights: [...prev.highlights, highlight],
          }));
          scheduleRemoval(id, "highlight", duration);
          break;
        }

        case "highlight_point": {
          const id = generateId("hp");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.highlight_point.duration;
          const highlight: ActiveHighlight = {
            id,
            type: "point",
            pointId: action.params.pointId,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            highlights: [...prev.highlights, highlight],
          }));
          scheduleRemoval(id, "highlight", duration);
          break;
        }

        case "animate_jump": {
          const id = generateId("j");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.animate_jump.duration;
          const distance = action.params.to - action.params.from;
          const label =
            action.params.label ??
            (distance >= 0 ? `+${distance}` : `${distance}`);

          const jump: ActiveJump = {
            id,
            from: action.params.from,
            to: action.params.to,
            color: action.params.color ?? ACTION_DEFAULTS.animate_jump.color,
            label,
            phase: "enter",
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            jumps: [...prev.jumps, jump],
          }));

          // Transition to hold phase after enter animation
          setTimeout(() => {
            setState((prev) => ({
              ...prev,
              jumps: prev.jumps.map((j) =>
                j.id === id ? { ...j, phase: "hold" as const } : j,
              ),
            }));
          }, 600);

          // Transition to exit phase before removal (with 1s for slow fade)
          setTimeout(() => {
            setState((prev) => ({
              ...prev,
              jumps: prev.jumps.map((j) =>
                j.id === id ? { ...j, phase: "exit" as const } : j,
              ),
            }));
          }, duration - 1000);

          scheduleRemoval(id, "jump", duration);
          break;
        }

        case "pulse_tick": {
          const id = generateId("pt");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.pulse_tick.duration;
          const highlight: ActiveHighlight = {
            id,
            type: "tick",
            value: action.params.value,
            color: action.params.color ?? ACTION_DEFAULTS.pulse_tick.color,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            highlights: [...prev.highlights, highlight],
          }));
          scheduleRemoval(id, "highlight", duration);
          break;
        }

        case "show_comparison": {
          const id = generateId("cmp");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.show_comparison.duration;
          const highlight: ActiveHighlight = {
            id,
            type: "comparison",
            from: action.params.value1,
            to: action.params.value2,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            highlights: [...prev.highlights, highlight],
          }));
          scheduleRemoval(id, "highlight", duration);
          break;
        }

        case "highlight_range": {
          const id = generateId("hr");
          const duration =
            action.params.duration ?? ACTION_DEFAULTS.highlight_range.duration;
          const highlight: ActiveHighlight = {
            id,
            type: "range",
            from: action.params.from,
            to: action.params.to,
            color: action.params.color ?? ACTION_DEFAULTS.highlight_range.color,
            label: action.params.label,
            expiresAt: now + duration,
          };
          setState((prev) => ({
            ...prev,
            highlights: [...prev.highlights, highlight],
          }));
          scheduleRemoval(id, "highlight", duration);
          break;
        }

        case "clear_highlights": {
          // Clear all timeouts
          timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
          timeoutsRef.current.clear();
          // Reset state
          setState(INITIAL_ACTION_STATE);
          break;
        }

        case "set_placement_mode": {
          if (onSetPlacementMode) {
            // If enabled is specified, use it; otherwise toggle
            const newEnabled = action.params.enabled ?? !placementMode;
            onSetPlacementMode(newEnabled);
          }
          break;
        }
      }
    },
    [scheduleRemoval, placementMode, onSetPlacementMode],
  );

  /**
   * Clear all active actions
   */
  const clearAll = useCallback(() => {
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();
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

    // Process each action in the batch and track the longest duration
    const actionItems = pendingAction.actions || [];
    let maxDuration = 0;

    for (const actionItem of actionItems) {
      // Cast to NumberLineAction (discriminated union) for type narrowing in switch.
      // TypedAction has union params; ActionsToUnion preserves action-to-params correlation.
      const typedAction = actionItem as NumberLineAction;
      processAction(typedAction);

      // Calculate duration for this action
      let actionDuration = 0;
      switch (typedAction.action) {
        case "highlight_value":
          actionDuration =
            typedAction.params.duration ??
            ACTION_DEFAULTS.highlight_value.duration;
          break;
        case "highlight_point":
          actionDuration =
            typedAction.params.duration ??
            ACTION_DEFAULTS.highlight_point.duration;
          break;
        case "animate_jump":
          actionDuration =
            typedAction.params.duration ??
            ACTION_DEFAULTS.animate_jump.duration;
          break;
        case "pulse_tick":
          actionDuration =
            typedAction.params.duration ?? ACTION_DEFAULTS.pulse_tick.duration;
          break;
        case "show_comparison":
          actionDuration =
            typedAction.params.duration ??
            ACTION_DEFAULTS.show_comparison.duration;
          break;
        case "highlight_range":
          actionDuration =
            typedAction.params.duration ??
            ACTION_DEFAULTS.highlight_range.duration;
          break;
        case "clear_highlights":
        case "set_placement_mode":
          // Instant actions
          actionDuration = 0;
          break;
      }
      maxDuration = Math.max(maxDuration, actionDuration);
    }

    // Notify parent that action was handled after the longest duration
    if (maxDuration > 0) {
      const completionTimeout = setTimeout(() => {
        onActionComplete?.();
      }, maxDuration);

      // Store timeout for cleanup
      timeoutsRef.current.set("completion", completionTimeout);
    } else {
      // Instant actions complete immediately
      onActionComplete?.();
    }
  }, [pendingAction, processAction, onActionComplete]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  return {
    highlights: state.highlights,
    jumps: state.jumps,
    clearAll,
  };
}
