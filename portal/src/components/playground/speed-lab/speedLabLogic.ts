import { actions, kea, key, listeners, path, props, reducers } from "kea";

import { DEFAULT_CAR_CONFIG, VEHICLE_ARCHETYPES } from "./data";
import {
  type CarConfig,
  type Config,
  PAGE_ORDER,
  type PageId,
  type StatAdjustments,
  type State,
} from "./schema";
import type { speedLabLogicType } from "./speedLabLogicType";
import { DEFAULT_STAT_ADJUSTMENTS } from "./utils";

export interface SpeedLabLogicProps {
  id: string;
  initialState: State;
  config: Config;
  onStateChange?: (state: State) => void;
}

export const speedLabLogic = kea<speedLabLogicType>([
  path((key) => ["playground", "speedLab", key]),
  key((props) => props.id),
  props({} as SpeedLabLogicProps),

  actions({
    // Navigation
    goToMilestone: (page: PageId) => ({ page }),
    goToNextMilestone: true,
    goToPreviousMilestone: true,

    // Vehicle
    selectVehicle: (vehicleId: string) => ({ vehicleId }),
    selectVehicleByIndex: (index: number) => ({ index }),

    // Car config
    setCarConfig: (carConfig: CarConfig) => ({ carConfig }),
    setWeightAdjustment: (weightAdjustment: number) => ({ weightAdjustment }),
    setTireType: (tireType: number) => ({ tireType }),

    // Stat adjustments
    setStatAdjustment: (stat: keyof StatAdjustments, value: number) => ({
      stat,
      value,
    }),
    resetAdjustments: true,
    resetBuild: true,

    // Quiz
    setQuizQuestion: (question: State["dynamicQuestion"]) => ({ question }),
    answerQuestion: (questionId: string, isCorrect: boolean) => ({
      questionId,
      isCorrect,
    }),
    endQuiz: true,
    clearDynamicQuestion: true,

    // Hints
    showHint: (text: string) => ({ text }),
    clearHint: true,

    // Reset
    playAgain: true,

    // Sync from external source (playground props)
    syncState: (state: State) => ({ state }),
  }),

  reducers(({ props }) => ({
    currentPage: [
      props.initialState.currentPage,
      {
        goToMilestone: (_, { page }) => page,
        goToNextMilestone: (state) => {
          const currentIndex = PAGE_ORDER.indexOf(state as PageId);
          if (currentIndex < PAGE_ORDER.length - 1) {
            return PAGE_ORDER[currentIndex + 1] as PageId;
          }
          return state;
        },
        goToPreviousMilestone: (state) => {
          const currentIndex = PAGE_ORDER.indexOf(state as PageId);
          if (currentIndex > 0) {
            return PAGE_ORDER[currentIndex - 1] as PageId;
          }
          return state;
        },
        playAgain: () => "welcome" as PageId,
        syncState: (_, { state }) => state.currentPage,
      },
    ],

    selectedVehicleId: [
      props.initialState.selectedVehicleId,
      {
        selectVehicle: (_, { vehicleId }) => vehicleId,
        selectVehicleByIndex: (_, { index }) => {
          const vehicle = VEHICLE_ARCHETYPES[index];
          return vehicle ? vehicle.id : VEHICLE_ARCHETYPES[0].id;
        },
        syncState: (_, { state }) => state.selectedVehicleId,
      },
    ],

    carConfig: [
      props.initialState.carConfig,
      {
        setCarConfig: (_, { carConfig }) => carConfig,
        setWeightAdjustment: (state, { weightAdjustment }) => ({
          ...state,
          weightAdjustment,
        }),
        setTireType: (state, { tireType }) => ({ ...state, tireType }),
        resetBuild: () => DEFAULT_CAR_CONFIG,
        playAgain: () => DEFAULT_CAR_CONFIG,
        syncState: (_, { state }) => state.carConfig,
      },
    ],

    statAdjustments: [
      props.initialState.statAdjustments,
      {
        setStatAdjustment: (state, { stat, value }) => ({
          ...state,
          [stat]: value,
        }),
        resetAdjustments: () => DEFAULT_STAT_ADJUSTMENTS,
        resetBuild: () => DEFAULT_STAT_ADJUSTMENTS,
        selectVehicle: () => DEFAULT_STAT_ADJUSTMENTS,
        selectVehicleByIndex: () => DEFAULT_STAT_ADJUSTMENTS,
        playAgain: () => DEFAULT_STAT_ADJUSTMENTS,
        syncState: (_, { state }) => state.statAdjustments,
      },
    ],

    quizProgress: [
      props.initialState.quizProgress,
      {
        answerQuestion: (state, { questionId, isCorrect }) => ({
          answered: state.answered.includes(questionId)
            ? state.answered
            : [...state.answered, questionId],
          correct:
            isCorrect && !state.correct.includes(questionId)
              ? [...state.correct, questionId]
              : state.correct,
        }),
        playAgain: () => ({ answered: [], correct: [] }),
        syncState: (_, { state }) => state.quizProgress,
      },
    ],

    dynamicQuestion: [
      props.initialState.dynamicQuestion,
      {
        setQuizQuestion: (_, { question }) => question,
        clearDynamicQuestion: () => null,
        playAgain: () => null,
        syncState: (_, { state }) => state.dynamicQuestion,
      },
    ],

    quizEnded: [
      props.initialState.quizEnded,
      {
        endQuiz: () => true,
        playAgain: () => false,
        syncState: (_, { state }) => state.quizEnded,
      },
    ],

    hintText: [
      props.initialState.hintText,
      {
        showHint: (_, { text }) => text,
        clearHint: () => null,
        playAgain: () => null,
        syncState: (_, { state }) => state.hintText,
      },
    ],
  })),

  listeners(({ values, props }) => ({
    // Notify parent of state changes for any action that modifies state
    goToMilestone: () => notifyStateChange(values, props),
    goToNextMilestone: () => notifyStateChange(values, props),
    goToPreviousMilestone: () => notifyStateChange(values, props),
    selectVehicle: () => notifyStateChange(values, props),
    selectVehicleByIndex: () => notifyStateChange(values, props),
    setCarConfig: () => notifyStateChange(values, props),
    setWeightAdjustment: () => notifyStateChange(values, props),
    setTireType: () => notifyStateChange(values, props),
    setStatAdjustment: () => notifyStateChange(values, props),
    resetAdjustments: () => notifyStateChange(values, props),
    resetBuild: () => notifyStateChange(values, props),
    setQuizQuestion: () => notifyStateChange(values, props),
    answerQuestion: () => notifyStateChange(values, props),
    endQuiz: () => notifyStateChange(values, props),
    clearDynamicQuestion: () => notifyStateChange(values, props),
    showHint: () => notifyStateChange(values, props),
    clearHint: () => notifyStateChange(values, props),
    playAgain: () => notifyStateChange(values, props),
  })),
]);

// Helper to build state object and notify parent
function notifyStateChange(
  values: {
    currentPage: string;
    selectedVehicleId: string;
    carConfig: CarConfig;
    statAdjustments: StatAdjustments;
    quizProgress: State["quizProgress"];
    dynamicQuestion: State["dynamicQuestion"];
    quizEnded: boolean;
    hintText: string | null;
  },
  props: SpeedLabLogicProps
) {
  const state: State = {
    currentPage: values.currentPage as PageId,
    selectedVehicleId: values.selectedVehicleId,
    carConfig: values.carConfig,
    statAdjustments: values.statAdjustments,
    quizProgress: values.quizProgress,
    dynamicQuestion: values.dynamicQuestion,
    quizEnded: values.quizEnded,
    hintText: values.hintText,
  };
  props.onStateChange?.(state);
}
