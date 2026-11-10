/**
 * PlaygroundRenderer
 *
 * Renders the appropriate playground component based on the playground type.
 * Uses the playground registry to dynamically load components.
 */

import type { ComponentType } from 'react';

import { Feather } from 'lucide-react';
import { EmptyState } from 'slate-ui';

import {
  getPlaygroundComponent,
  isValidPlaygroundId,
  type Playground,
  type PlaygroundId,
} from './registry';
import type {
  LooseActionPayload,
  PlaygroundEvent,
} from './types';

/**
 * Container class configuration per playground type.
 * Most playgrounds use centered layout, but some need custom styling.
 */
const CONTAINER_CLASSES: Partial<Record<PlaygroundId, string>> = {
  flowchart: "relative min-h-0 flex-1",
  "speed-lab": "h-full",
};

const DEFAULT_CONTAINER_CLASS = "h-full flex items-center justify-center";

interface PlaygroundRendererProps {
  /** The playground state to render (includes pendingAction) */
  playground: Playground | null;
  /** Called when the playground state changes (user interaction) */
  onChange?: (playground: Playground) => void;
  /** Called when an action completes */
  onActionComplete?: () => void;
  /** Called when a playground emits an event (race complete, drill finished, etc.) */
  onEvent?: (event: PlaygroundEvent) => void;
  /** Whether question inputs are disabled (for canvas type) */
  questionsDisabled?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * Generic props type for dynamic component rendering.
 * Uses loose typing since we're dynamically dispatching based on playground.type.
 */
interface GenericPlaygroundProps {
  config: unknown;
  state: unknown;
  onChange?: (state: unknown) => void;
  onEvent?: (event: PlaygroundEvent) => void;
  pendingAction?: LooseActionPayload | null;
  onActionComplete?: () => void;
  // Playground-specific props
  questionsDisabled?: boolean;
}

export function PlaygroundRenderer({
  playground,
  onChange,
  onActionComplete,
  onEvent,
  questionsDisabled = false,
  className = "",
}: PlaygroundRendererProps) {
  // Empty state - return nothing
  if (!playground) {
    return null;
  }

  // Special case: canvas with no blocks should not render
  if (
    playground.type === "canvas" &&
    (!playground.state.blocks || playground.state.blocks.length === 0)
  ) {
    return null;
  }

  // Validate playground type
  if (!isValidPlaygroundId(playground.type)) {
    return (
      <div className={`${className} h-full flex items-center justify-center`}>
        <EmptyState
          icon={Feather}
          title={`Unknown playground type "${playground.type}"`}
        />
      </div>
    );
  }

  // Get the component from the registry
  // Cast to generic component type for dynamic rendering
  const Component = getPlaygroundComponent(
    playground.type
  ) as ComponentType<GenericPlaygroundProps>;

  // Get container class for this playground type
  const containerClass =
    CONTAINER_CLASSES[playground.type] ?? DEFAULT_CONTAINER_CLASS;

  // Build props for the component
  const componentProps: GenericPlaygroundProps = {
    config: playground.config,
    state: playground.state,
    onChange: onChange
      ? (state: unknown) =>
          onChange({
            type: playground.type,
            config: playground.config,
            state,
          } as Playground)
      : undefined,
    pendingAction: playground.pendingAction as LooseActionPayload | undefined,
    onActionComplete,
    // Generic event handler for all playgrounds
    onEvent,
    // Playground-specific props
    ...(playground.type === "canvas" && { questionsDisabled }),
  };

  // Flowchart needs inline styles
  const containerStyle =
    playground.type === "flowchart"
      ? { width: "100%", height: "100%" }
      : undefined;

  return (
    <div className={`${className} ${containerClass}`} style={containerStyle}>
      <Component {...componentProps} />
    </div>
  );
}

export default PlaygroundRenderer;
