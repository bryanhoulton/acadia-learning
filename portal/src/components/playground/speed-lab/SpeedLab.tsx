/**
 * SpeedLab Playground Component
 *
 * Main entry point for the Speed Lab playground.
 * Uses Kea logic to manage state outside of React's rendering path,
 * preventing infinite loops from callback prop changes.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';

import {
  useActions,
  useValues,
} from 'kea';
import {
  AnimatePresence,
  motion,
} from 'motion/react';

import type { PlaygroundComponentProps } from '../types';
import { BuildStep } from './BuildStep';
import { VEHICLE_ARCHETYPES } from './data';
import { QuizStep } from './QuizStep';
import {
  type actionSchemas,
  type Config,
  type PageId,
  type SpeedLabAction,
  type State,
} from './schema';
import { SimulationStep } from './SimulationStep';
import { speedLabLogic } from './speedLabLogic';
import { VictoryStep } from './VictoryStep';
import { WelcomeStep } from './WelcomeStep';

/**
 * SpeedLab Playground Component
 *
 * Renders the Speed Lab experience as an embeddable playground.
 * State is managed via Kea logic, with changes propagated to parent via onChange.
 */
export function SpeedLab({
  config,
  state,
  onChange,
  onEvent,
  pendingAction,
  onActionComplete,
}: PlaygroundComponentProps<Config, State, typeof actionSchemas>) {
  // Generate a stable ID for this instance
  const instanceId = useId();

  // Create logic instance with initial state
  const logic = speedLabLogic({
    id: instanceId,
    initialState: state,
    config,
    onStateChange: onChange,
  });

  const {
    currentPage,
    selectedVehicleId,
    carConfig,
    statAdjustments,
    quizProgress,
    dynamicQuestion,
    quizEnded,
    hintText,
  } = useValues(logic);

  const {
    goToMilestone,
    goToNextMilestone,
    selectVehicleByIndex,
    setCarConfig,
    setStatAdjustment,
    resetAdjustments,
    setQuizQuestion,
    answerQuestion,
    playAgain,
    clearHint,
    syncState,
  } = useActions(logic);

  // Track if this is a sync from external state vs internal change
  const lastExternalStateRef = useRef<State>(state);

  // Refs for stable callbacks that need current values
  const carConfigRef = useRef(carConfig);
  useEffect(() => {
    carConfigRef.current = carConfig;
  }, [carConfig]);

  // Sync external state changes into the logic (when controlled from parent)
  useEffect(() => {
    // Only sync if the external state actually changed (not from our own changes)
    if (state !== lastExternalStateRef.current) {
      const hasExternalChange =
        state.currentPage !== currentPage ||
        state.selectedVehicleId !== selectedVehicleId ||
        JSON.stringify(state.carConfig) !== JSON.stringify(carConfig);

      if (hasExternalChange) {
        syncState(state);
      }
      lastExternalStateRef.current = state;
    }
  }, [state, currentPage, selectedVehicleId, carConfig, syncState]);

  // Process pending actions
  const processedActionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pendingAction?.actions?.length) return;

    for (const typedAction of pendingAction.actions) {
      const actionKey = JSON.stringify(typedAction);
      if (processedActionsRef.current.has(actionKey)) continue;
      processedActionsRef.current.add(actionKey);

      const action = typedAction as SpeedLabAction;

      switch (action.action) {
        case "set_page":
          goToMilestone(action.params.id as PageId);
          break;
        case "set_quiz_question":
          setQuizQuestion({
            id: action.params.id,
            question: action.params.question,
            options: action.params.options,
            correctId: action.params.correctId,
            explanation: action.params.explanation || "",
            type: action.params.type || "choice",
          });
          break;
      }
    }

    onActionComplete?.();
  }, [pendingAction, onActionComplete, goToMilestone, setQuizQuestion]);

  // Auto-clear hint after 5 seconds
  useEffect(() => {
    if (hintText) {
      const timeout = setTimeout(() => clearHint(), 5000);
      return () => clearTimeout(timeout);
    }
  }, [hintText, clearHint]);

  // Get current vehicle data
  const selectedVehicle = useMemo(
    () =>
      VEHICLE_ARCHETYPES.find((v) => v.id === selectedVehicleId) ??
      VEHICLE_ARCHETYPES[0],
    [selectedVehicleId]
  );

  const selectedVehicleIndex = useMemo(() => {
    const idx = VEHICLE_ARCHETYPES.findIndex((v) => v.id === selectedVehicleId);
    return idx >= 0 ? idx : 0; // Fallback to first vehicle if not found
  }, [selectedVehicleId]);

  // Stable callback handlers that dispatch to logic
  const handleSelectVehicle = useMemo(
    () => (index: number) => selectVehicleByIndex(index),
    [selectVehicleByIndex]
  );

  const handleSetCarConfig = useMemo(
    () =>
      (
        configOrUpdater:
          | typeof carConfig
          | ((prev: typeof carConfig) => typeof carConfig)
      ) => {
        if (typeof configOrUpdater === "function") {
          setCarConfig(configOrUpdater(carConfigRef.current));
        } else {
          setCarConfig(configOrUpdater);
        }
      },
    [setCarConfig]
  );

  const handleSetStatAdjustment = useMemo(
    () => (stat: keyof typeof statAdjustments, value: number) =>
      setStatAdjustment(stat, value),
    [setStatAdjustment]
  );

  const handleResetAdjustments = useMemo(
    () => () => resetAdjustments(),
    [resetAdjustments]
  );

  const handleQuizAnswer = useMemo(
    () => (questionId: string, _answerId: string, isCorrect: boolean) =>
      answerQuestion(questionId, isCorrect),
    [answerQuestion]
  );

  const handlePlayAgain = useMemo(() => () => playAgain(), [playAgain]);

  const handleGoToNextMilestone = useMemo(
    () => () => goToNextMilestone(),
    [goToNextMilestone]
  );

  const handleGoBack = useMemo(
    () => () => goToMilestone("build"),
    [goToMilestone]
  );

  // Forward user actions to the agent via onEvent
  const handleUserAction = useMemo(
    () => (action: string, data?: Record<string, unknown>) => {
      console.debug("[SpeedLab] User action:", action, data);
      onEvent?.({ type: action, ...data });
    },
    [onEvent]
  );

  // Placeholder handlers for navigation actions (handled by parent context)
  const handleLeave = useCallback(() => {
    onEvent?.({ type: "leave_lab" });
  }, [onEvent]);
  const handleEndSession = useCallback(() => {
    onEvent?.({ type: "end_session" });
  }, [onEvent]);
  const handleGoHome = useCallback(() => {
    onEvent?.({ type: "go_home" });
  }, [onEvent]);
  const handleDynamicQuestionShown = useCallback(() => {}, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hint display */}
      {hintText && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center mx-4 mt-4 shrink-0">
          <p className="text-blue-700">{hintText}</p>
        </div>
      )}

      {/* Step content - flex-1 and min-h-0 must be on this wrapper, not inside AnimatePresence */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            className="h-full flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {currentPage === "welcome" && (
              <WelcomeStep
                onComplete={handleGoToNextMilestone}
                onUserAction={handleUserAction}
              />
            )}

            {currentPage === "build" && (
              <BuildStep
                selectedVehicleIndex={selectedVehicleIndex}
                onSelectVehicle={handleSelectVehicle}
                carConfig={carConfig}
                onSetCarConfig={handleSetCarConfig}
                statAdjustments={statAdjustments}
                onSetStatAdjustment={handleSetStatAdjustment}
                onResetAdjustments={handleResetAdjustments}
                onComplete={handleGoToNextMilestone}
                onUserAction={handleUserAction}
              />
            )}

            {currentPage === "simulation" && (
              <SimulationStep
                carConfig={carConfig}
                vehicleName={selectedVehicle.name}
                vehicleIcon={selectedVehicle.icon}
                vehicleDefaultWeight={selectedVehicle.defaultWeight}
                vehicleBaseStats={selectedVehicle.baseStats}
                onComplete={handleGoToNextMilestone}
                onUserAction={handleUserAction}
                onGoBack={handleGoBack}
                contained
              />
            )}

            {currentPage === "victory" && (
              <VictoryStep
                vehicle={selectedVehicle}
                stats={selectedVehicle.baseStats}
                statAdjustments={statAdjustments}
                bestTime={null}
                onPlayAgain={handlePlayAgain}
                onLeave={handleLeave}
                onComplete={handleGoToNextMilestone}
              />
            )}

            {currentPage === "quiz" && (
              <QuizStep
                progress={quizProgress}
                onAnswer={handleQuizAnswer}
                onComplete={handleGoToNextMilestone}
                onPlayAgain={handlePlayAgain}
                onLeave={handleLeave}
                onUserAction={handleUserAction}
                dynamicQuestion={
                  dynamicQuestion
                    ? { ...dynamicQuestion, source: "agent" as const }
                    : null
                }
                onDynamicQuestionShown={handleDynamicQuestionShown}
                quizEnded={quizEnded}
                selectedVehicleId={selectedVehicle.id}
                vehicleName={selectedVehicle.name}
                vehicleDefaultWeight={selectedVehicle.defaultWeight}
                carConfig={carConfig}
                onEndSession={handleEndSession}
                onGoHome={handleGoHome}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
