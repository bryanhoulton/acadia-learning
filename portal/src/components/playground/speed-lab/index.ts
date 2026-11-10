/**
 * Speed Lab Playground
 *
 * Interactive physics lab exploring speed, weight, and friction
 * through vehicle building and racing.
 */

export { speedLabDefinition } from "./definition";
export type {
  SpeedLabConfig,
  SpeedLabDefinition,
  SpeedLabState,
} from "./definition";

export { SpeedLab } from "./SpeedLab";
export { speedLabLogic } from "./speedLabLogic";

export {
  type ActionName,
  actionSchemas,
  type CarConfig,
  type Config,
  ConfigSchema,
  type DynamicQuestion,
  type QuizProgress,
  type SpeedLabAction,
  type StatAdjustments,
  type State,
  StateSchema,
} from "./schema";
