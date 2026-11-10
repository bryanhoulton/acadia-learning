# Playground Architecture

This document describes the type-safe playground architecture. Every playground follows a single-source-of-truth pattern where types are inferred from Zod schemas.

Playgrounds have configuration, state, and actions. Agents can set up playgrounds for the user to interact with, and state is synced back to the agent. Notably, the agent is NOT interrupted with the new state - the agent must re-request the state to view the latest version. However, each playground is outfitted with a set of events that are emitted to the agent, interrupting it and forcing it to pay attention to the event.

## Core Principles

1. **Zod schemas are the source of truth** - TypeScript types are inferred using `z.infer<>`, never manually duplicated
2. **One definition object per playground** - All metadata, schemas, presets, and guide content in one place
3. **Strongly typed throughout** - No `any` types, ever
4. **Actions are a dictionary** - Action schemas keyed by action name for easy lookup

## File Structure

Each playground folder contains:

```
my-playground/
  definition.ts    # Single source of truth - metadata, schemas, presets, guide, component
  schema.ts        # Zod schemas + inferred type exports
  MyPlayground.tsx # Component using PlaygroundComponentProps<Config, State, Actions>
  actions.ts       # Runtime action state + defaults (NOT type definitions)
  index.ts         # Clean exports
  components/      # Sub-components
  constants.ts     # Constants
  utils.ts         # Utilities
```

**Files you should NOT have:**

- `types.ts` - Types are inferred from Zod schemas
- `defaults.ts` - Presets live in definition.ts
- `guide.ts` - Guide content lives in definition.ts

## Creating a New Playground

### Step 1: Create schema.ts

Define Zod schemas for config, state, and actions. Export inferred types.

```typescript
import { z } from "zod";
import type { ActionsToUnion } from "../types";

// Config schema
export const ConfigSchema = z.object({
  // ... your config fields
});

// State schema
export const StateSchema = z.object({
  // ... your state fields
});

// Actions as a dictionary: action name -> params schema
export const actionSchemas = {
  highlight_item: z.object({
    itemId: z.string(),
    duration: z.number().optional(),
  }),
  clear_highlights: z.object({}),
} as const;

// Inferred types - export these for use in components
export type Config = z.infer<typeof ConfigSchema>;
export type State = z.infer<typeof StateSchema>;
export type ActionSchemas = typeof actionSchemas;
export type ActionName = keyof ActionSchemas;

// Union type for action hooks - provides full type safety in switch statements
export type MyPlaygroundAction = ActionsToUnion<typeof actionSchemas>;
```

### Step 2: Create the Component

Use `PlaygroundComponentProps` from the root types - never redefine props manually.

```typescript
import type { PlaygroundComponentProps } from "../types";
import { actionSchemas, type Config, type State } from "./schema";

type Props = PlaygroundComponentProps<Config, State, typeof actionSchemas>;

export function MyPlayground({
  config,
  state,
  onChange,
  pendingAction,
  onActionComplete,
}: Props) {
  // Component implementation
}
```

### Step 3: Create definition.ts

This is the single source of truth. Use `definePlayground()` for type inference.

```typescript
import {
  definePlayground,
  type PlaygroundGuideContent,
  type PlaygroundPreset,
} from "../types";
import { MyPlayground } from "./MyPlayground";
import {
  actionSchemas,
  ConfigSchema,
  StateSchema,
  type Config,
  type State,
} from "./schema";

// Presets - strongly typed
const presets: PlaygroundPreset<Config, State>[] = [
  {
    id: "default",
    name: "Default",
    description: "Default configuration",
    config: {
      /* ... */
    },
    state: {
      /* ... */
    },
  },
];

// Guide content - strongly typed
const guide: PlaygroundGuideContent<Config, State> = {
  gradeRange: { primary: "K-8", extended: "K-12" },
  interactionModel: "Description of how students interact",
  // ... rest of guide
};

// Definition - use definePlayground() for type inference
export const myPlaygroundDefinition = definePlayground({
  id: "my-playground",
  name: "My Playground",
  icon: "🎮",
  description: "What this playground does",
  grades: "K-12",
  enabled: true,

  schemas: {
    config: ConfigSchema,
    state: StateSchema,
    actions: actionSchemas,
  },

  defaultConfig: presets[0].config,
  defaultState: presets[0].state,
  presets,

  component: MyPlayground,
  guide,
});

// Export inferred types
export type MyPlaygroundConfig = Config;
export type MyPlaygroundState = State;
```

### Step 4: Create actions.ts (if needed)

Only contains runtime state for rendering actions - NOT type definitions. Action types are derived from Zod schemas using `ActionsToUnion` in schema.ts.

```typescript
/**
 * Action Runtime State
 *
 * This file contains only:
 * - Runtime state interfaces for tracking active animations
 * - Initial state constants
 * - Default values for action params
 *
 * Action schemas and types are defined in schema.ts using ActionsToUnion.
 */

// Runtime state for rendering (not schema definitions)
export interface ActiveHighlight {
  id: string;
  itemId: string;
  expiresAt: number;
}

export interface ActionState {
  highlights: ActiveHighlight[];
}

export const INITIAL_ACTION_STATE: ActionState = {
  highlights: [],
};

// Default values for action params
export const ACTION_DEFAULTS = {
  highlight_item: { duration: 2000 },
} as const;
```

### Step 5: Create index.ts

Clean exports from definition and schema.

```typescript
// Definition is the single source of truth
export {
  myPlaygroundDefinition,
  type MyPlaygroundConfig,
  type MyPlaygroundState,
} from "./definition";

// Component
export { MyPlayground } from "./MyPlayground";

// Schemas and types
export {
  ConfigSchema,
  StateSchema,
  actionSchemas,
  type Config,
  type State,
  type ActionName,
  type MyPlaygroundAction,
} from "./schema";

// Action runtime state and defaults
export * from "./actions";
```

## Key Types from Root

The root `playground/types.ts` provides:

- `PlaygroundDefinition<TId, TConfigSchema, TStateSchema, TActions>` - Generic definition type
- `PlaygroundComponentProps<TConfig, TState, TActions>` - Component props type
- `PlaygroundPreset<TConfig, TState>` - Preset type
- `PlaygroundGuideContent<TConfig, TState>` - Guide content type
- `ActionSchemas` - Dictionary type for actions
- `ActionsToUnion<TActions>` - Derives a discriminated union from action schemas
- `definePlayground()` - Helper for type inference

### ActionsToUnion

Use `ActionsToUnion` to derive a strongly-typed discriminated union from your action schemas dictionary. This is useful in action logic where you need to switch on action types with full type safety.

```typescript
// In schema.ts
import { z } from "zod";
import type { ActionsToUnion } from "../types";

export const actionSchemas = {
  highlight_value: z.object({
    value: z.number(),
    duration: z.number().optional(),
  }),
  animate_jump: z.object({ from: z.number(), to: z.number() }),
  clear_highlights: z.object({}),
} as const;

// Derive the union type
export type MyPlaygroundAction = ActionsToUnion<typeof actionSchemas>;
// Results in:
// | { action: "highlight_value"; params: { value: number; duration?: number } }
// | { action: "animate_jump"; params: { from: number; to: number } }
// | { action: "clear_highlights"; params: {} }
```

Then in your action hook:

```typescript
import type { MyPlaygroundAction } from "./schema";

const processAction = useCallback((action: MyPlaygroundAction) => {
  switch (action.action) {
    case "highlight_value":
      // TypeScript knows action.params has { value: number; duration?: number }
      console.log(action.params.value);
      break;
    case "animate_jump":
      // TypeScript knows action.params has { from: number; to: number }
      console.log(action.params.from, action.params.to);
      break;
  }
}, []);
```

### TypedAction vs ActionsToUnion

There's an important distinction between these two types:

- **`TypedAction<TActions>`** - Used in `PlaygroundComponentProps` for `pendingAction.actions`. This is a single interface where `action` is the union of all names and `params` is the union of all param types. It doesn't preserve the correlation between action name and params.

- **`ActionsToUnion<TActions>`** - A proper discriminated union where each variant has its specific action name correlated with its params. This enables TypeScript's type narrowing in switch statements.

```typescript
// Given:
const actionSchemas = {
  foo: z.object({ a: z.number() }),
  bar: z.object({ b: z.string() }),
} as const;

// TypedAction<typeof actionSchemas> produces:
// { action: "foo" | "bar"; params: { a: number } | { b: string } }
// (No correlation - TypeScript can't narrow params based on action)

// ActionsToUnion<typeof actionSchemas> produces:
// | { action: "foo"; params: { a: number } }
// | { action: "bar"; params: { b: string } }
// (Proper discriminated union - TypeScript narrows correctly)
```

**In action hooks**, cast from `TypedAction` to your playground's action union:

```typescript
import type { TypedAction } from "../types";
import { actionSchemas, type MyPlaygroundAction } from "./schema";

type PendingAction = { actions: TypedAction<typeof actionSchemas>[] } | null;

// In useEffect processing pendingAction:
for (const actionItem of pendingAction.actions) {
  // Cast to discriminated union for type narrowing in switch
  const typedAction = actionItem as MyPlaygroundAction;
  processAction(typedAction);
}
```

This cast is safe because:

1. The action is validated upstream before reaching the component
2. Each concrete action item has matching action/params at runtime
3. We're narrowing from a broader type to a more specific one

## Verification Checklist

Run these checks to verify your playground is correctly implemented:

### 1. No `any` types

```bash
# Should return no matches in your playground folder
rg "any" portal/src/components/playground/my-playground/ --type ts
```

### 2. No manual type definitions duplicating Zod

```bash
# Should NOT find interface/type definitions that mirror your Zod schemas
# (e.g., no `interface Config { ... }` when you have ConfigSchema)
rg "^export (interface|type) (Config|State|.*Action) " portal/src/components/playground/my-playground/
```

### 3. Types.ts should not exist

```bash
# Should return "No such file"
ls portal/src/components/playground/my-playground/types.ts
```

### 4. Defaults.ts should not exist

```bash
# Should return "No such file"
ls portal/src/components/playground/my-playground/defaults.ts
```

### 5. Guide.ts should not exist

```bash
# Should return "No such file"
ls portal/src/components/playground/my-playground/guide.ts
```

### 6. Component uses PlaygroundComponentProps

```bash
# Should find `PlaygroundComponentProps` import in the component
rg "PlaygroundComponentProps" portal/src/components/playground/my-playground/*.tsx
```

### 7. Presets are strongly typed

```bash
# Should find `PlaygroundPreset<Config, State>[]` in definition.ts
rg "PlaygroundPreset<Config, State>" portal/src/components/playground/my-playground/definition.ts
```

### 8. Definition uses definePlayground

```bash
# Should find `definePlayground({` in definition.ts
rg "definePlayground\(\{" portal/src/components/playground/my-playground/definition.ts
```

### 9. No lint errors

```bash
# Run TypeScript type checking on the folder
yarn tsc --noEmit
```

### 10. Actions use dictionary pattern

```bash
# Should find `actionSchemas = {` with `as const` in schema.ts
rg "actionSchemas = \{" portal/src/components/playground/my-playground/schema.ts
```

## Complex Playgrounds: Game Engine Pattern

For playgrounds with complex state (animations, physics, real-time updates), **always separate the state manager from the UI**. This follows game design principles where game logic runs independently of rendering.

### Architecture

```
my-complex-playground/
├── definition.ts        # Metadata, schemas, presets, guide
├── schema.ts            # External interface (Zod schemas)
├── MyPlayground.tsx     # Main component - wires engine to renderers
├── index.ts
│
├── engine/              # GAME LOGIC (pure TypeScript, no React)
│   ├── types.ts         # Internal game types (runtime only, not Zod)
│   ├── GameState.ts     # State manager class with all mutable state
│   ├── simulation.ts    # Game loop - tick(), dispatch actions
│   └── [domain].ts      # Domain logic (physics, math, etc.)
│
├── hooks/               # React bridge
│   ├── useGameEngine.ts # Creates engine, runs loop, returns snapshot
│   └── useCamera.ts     # Camera state (if needed for pan/zoom)
│
└── renderer/            # PURE RENDERING (stateless React components)
    ├── EntityRenderer.tsx
    ├── UIOverlay.tsx
    └── index.ts
```

### Key Principles

1. **Engine owns the truth** - The game engine holds all mutable state. React components only receive read-only snapshots.

2. **Renderers are stateless** - Renderer components receive state as props and render. No `useState`, no logic, no side effects.

3. **Actions flow one way** - User input → dispatch to engine → engine updates state → React re-renders from snapshot.

4. **Simulation is independent** - The engine's `tick()` runs at a fixed timestep, decoupled from React's render cycle.

### Example: Engine

```typescript
// engine/GameState.ts
export class GameStateManager {
  private state: InternalGameState;

  constructor(config: Config, initialState: State) {
    this.state = this.initializeFromExternal(config, initialState);
  }

  // Called every frame by simulation loop
  tick(deltaTime: number): void {
    if (this.state.status !== "running") return;
    // Update positions, physics, timers, etc.
  }

  // Handle user/AI actions
  dispatch(action: GameAction): void {
    switch (action.type) {
      case "START":
        this.state.status = "running";
        break;
      case "RESET":
        this.reset();
        break;
      // ...
    }
  }

  // Read-only snapshot for React
  getSnapshot(): GameStateSnapshot {
    return { ...this.state }; // Shallow copy or structured clone
  }

  // Sync subset back to playground system
  getExternalState(): State {
    return {
      // Only fields that need to persist externally
    };
  }
}
```

### Example: React Bridge Hook

```typescript
// hooks/useGameEngine.ts
export function useGameEngine({ config, state, onChange }: Props) {
  const engineRef = useRef<GameStateManager | null>(null);
  const [snapshot, setSnapshot] = useState<GameStateSnapshot>(/* initial */);

  // Initialize engine once
  useEffect(() => {
    engineRef.current = new GameStateManager(config, state);
    return () => engineRef.current?.destroy?.();
  }, []);

  // Run game loop
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;

      engineRef.current?.tick(delta);
      setSnapshot(engineRef.current!.getSnapshot());

      // Sync external state periodically
      onChange?.(engineRef.current!.getExternalState());

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [onChange]);

  const dispatch = useCallback((action: GameAction) => {
    engineRef.current?.dispatch(action);
  }, []);

  return { snapshot, dispatch };
}
```

### Example: Stateless Renderer

```typescript
// renderer/CarRenderer.tsx
interface Props {
  position: Vec2;
  rotation: number;
  speed: number;
}

export function CarRenderer({ position, rotation, speed }: Props) {
  // Pure rendering - no state, no logic
  return (
    <g transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}>
      <image href="/car.svg" width={32} height={16} x={-16} y={-8} />
    </g>
  );
}
```

### Why This Pattern?

| Benefit           | Explanation                                                       |
| ----------------- | ----------------------------------------------------------------- |
| **Testable**      | Engine logic can be unit tested without React/DOM                 |
| **Deterministic** | Same inputs = same outputs, no render-timing bugs                 |
| **Extensible**    | Add replay, slow-mo, or multiplayer without touching renderers    |
| **Performant**    | Simulation runs at fixed timestep, rendering at display refresh   |
| **Camera-ready**  | Pan/zoom is just a transform on render, doesn't affect game state |

### When to Use This Pattern

Use the game engine pattern when your playground has:

- Real-time animations or physics
- Complex state with many interdependent values
- Time-based simulation (racing, timers, etc.)
- Camera controls (pan/zoom)
- Need for replay or deterministic behavior

For simple playgrounds (static displays, click-to-reveal), the standard pattern is sufficient.

---

## Migration Guide

To migrate an existing playground to this pattern:

1. **Create schema.ts** - Move Zod schemas from existing schema.ts, convert action union to dictionary
2. **Update component** - Change props to use `PlaygroundComponentProps<Config, State, typeof actionSchemas>`
3. **Create definition.ts** - Consolidate metadata, presets (from defaults.ts), and guide (from guide.ts)
4. **Slim down actions.ts** - Remove type definitions, keep only runtime state and defaults
5. **Update index.ts** - Export from definition.ts and schema.ts
6. **Delete redundant files** - Remove types.ts, defaults.ts, guide.ts
7. **Run verification checklist** - Ensure all checks pass
