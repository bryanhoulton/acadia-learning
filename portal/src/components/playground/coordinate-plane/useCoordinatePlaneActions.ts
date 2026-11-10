/**
 * useCoordinatePlaneActions Hook
 *
 * Actions are currently disabled for the coordinate plane component.
 * This hook provides empty state for compatibility.
 */

import { useEffect } from 'react';

import type { TypedAction } from '../types';
import { actionSchemas } from './schema';

interface UseCoordinatePlaneActionsOptions {
  /** Pending action from parent */
  pendingAction?: { actions: TypedAction<typeof actionSchemas>[] } | null;
  /** Callback when action completes */
  onActionComplete?: () => void;
  /** Callback to set active tool */
  onSetTool?: (tool: "select" | "point" | "trace") => void;
}

interface UseCoordinatePlaneActionsReturn {
  /** Current point highlights to render (empty - actions disabled) */
  pointHighlights: never[];
  /** Current function highlights to render (empty - actions disabled) */
  functionHighlights: never[];
  /** Current region highlights to render (empty - actions disabled) */
  regionHighlights: never[];
  /** Current traces to render (empty - actions disabled) */
  traces: never[];
  /** Current distance indicators to render (empty - actions disabled) */
  distances: never[];
  /** Manually clear all actions (no-op - actions disabled) */
  clearAll: () => void;
}

/**
 * No-op hook for coordinate plane actions.
 * Actions are disabled - this hook just calls onActionComplete immediately.
 */
export function useCoordinatePlaneActions({
  pendingAction,
  onActionComplete,
}: UseCoordinatePlaneActionsOptions): UseCoordinatePlaneActionsReturn {
  // Immediately complete any pending actions since actions are disabled
  useEffect(() => {
    if (pendingAction) {
      onActionComplete?.();
    }
  }, [pendingAction, onActionComplete]);

  return {
    pointHighlights: [],
    functionHighlights: [],
    regionHighlights: [],
    traces: [],
    distances: [],
    clearAll: () => {},
  };
}
