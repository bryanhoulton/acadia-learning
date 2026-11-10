export * from "./types";
export { PlaygroundRenderer } from "./PlaygroundRenderer";
export { PlaygroundReplayer } from "./PlaygroundReplayer";
export {
  createPlayground,
  getDefaultProps,
  getGuidesPayload,
  getPlaygroundPresets,
  type Playground,
  PLAYGROUND_METADATA,
  type PlaygroundId,
} from "./registry";

// Canvas-specific exports needed by external files
export { type Block, BlockRenderer } from "./canvas";
