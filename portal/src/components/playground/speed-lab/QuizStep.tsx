/**
 * QuizStep - Interactive speed quiz with agent-driven questions
 *
 * Features:
 * - Two-column layout: quiz on left, car view on right
 * - Supports dynamic agent-generated questions
 * - Students can answer by clicking or speaking (voice handled by agent)
 *
 * Flow:
 * 1. Quiz starts, agent sends first question
 * 2. After answering: wait for agent to send next question
 * 3. Student can end quiz anytime by clicking "Done" or saying "I'm done"
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  Brain,
  Loader2,
  Mic,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "slate-ui";

import {
  TIRE_OPTIONS,
  VEHICLE_ARCHETYPES,
  WEIGHT_ADJUSTMENT_OPTIONS,
  weightToFraction,
} from "./data";
import type { CarConfig } from "./schema";
import { VehicleCanvas } from "./three";

// ============================================================================
// TYPES
// ============================================================================

export interface QuizQuestion {
  id: string;
  type: "choice" | "thisThat";
  question: string;
  options: { id: string; text: string }[];
  correctId: string;
  explanation: string;
}

export interface QuizProgress {
  answered: string[];
  correct: string[];
}

/** Dynamic question sent by the agent */
export interface DynamicQuestion extends QuizQuestion {
  source: "agent";
}

interface QuizStepProps {
  progress: QuizProgress;
  onAnswer: (questionId: string, answerId: string, isCorrect: boolean) => void;
  onComplete: () => void;
  onPlayAgain: () => void;
  onLeave: () => void;
  onUserAction: (action: string, data?: Record<string, unknown>) => void;
  /** Dynamic question from agent */
  dynamicQuestion: DynamicQuestion | null;
  /** Called when dynamic question is displayed */
  onDynamicQuestionShown: () => void;
  /** Agent has signaled quiz is complete */
  quizEnded: boolean;
  /** Current vehicle for context */
  selectedVehicleId: string;
  /** Session summary data */
  vehicleName: string;
  vehicleDefaultWeight: number;
  carConfig: CarConfig;
  /** End the entire session (disconnect agent) */
  onEndSession: () => void;
  /** Go back to home page */
  onGoHome: () => void;
}

type QuizMode = "static" | "waiting" | "dynamic";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function QuizStep({
  progress,
  onAnswer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onComplete,
  onPlayAgain,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onLeave,
  onUserAction,
  dynamicQuestion,
  onDynamicQuestionShown,
  quizEnded,
  selectedVehicleId,
  vehicleName,
  vehicleDefaultWeight,
  carConfig,
  onEndSession,
  onGoHome,
}: QuizStepProps) {
  // Quiz mode: waiting (for agent question), dynamic (showing agent question)
  const [mode, setMode] = useState<QuizMode>("waiting");

  // Current question from agent
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(
    null
  );

  // Answer state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // Track questions shown (for progress display)
  const [questionsShown, setQuestionsShown] = useState<QuizQuestion[]>([]);

  // Request first question when quiz starts
  useEffect(() => {
    if (questionsShown.length === 0 && mode === "waiting") {
      // Tell agent we're ready for the first question
      onUserAction("quiz_started", {
        vehicleId: selectedVehicleId,
        vehicleName,
        carConfig,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which question IDs we've already shown to avoid duplicates
  const shownQuestionIds = useRef<Set<string>>(new Set());

  // Ref for the right column to position the floating car canvas
  const rightColumnRef = useRef<HTMLDivElement>(null);

  // Handle incoming dynamic question from agent
  useEffect(() => {
    if (dynamicQuestion && !shownQuestionIds.current.has(dynamicQuestion.id)) {
      // Mark as shown to prevent duplicates
      shownQuestionIds.current.add(dynamicQuestion.id);

      setCurrentQuestion(dynamicQuestion);
      setQuestionsShown((prev) => [...prev, dynamicQuestion]);
      setMode("dynamic");
      setSelectedAnswer(null);
      setShowFeedback(false);
      onDynamicQuestionShown();
    }
  }, [dynamicQuestion, onDynamicQuestionShown]);

  // Check if current question is answered (by click or agent evaluation)
  const isCurrentAnswered = currentQuestion
    ? progress.answered.includes(currentQuestion.id)
    : false;

  // Update feedback display when agent evaluates a verbal answer
  useEffect(() => {
    if (isCurrentAnswered && !showFeedback) {
      setShowFeedback(true);
    }
  }, [isCurrentAnswered, showFeedback]);

  // Handle click answer
  const handleAnswer = useCallback(
    (answerId: string) => {
      if (showFeedback || isCurrentAnswered || !currentQuestion) return;

      setSelectedAnswer(answerId);
      setShowFeedback(true);

      const isCorrect = answerId === currentQuestion.correctId;
      const selectedOption = currentQuestion.options.find(
        (o) => o.id === answerId
      );
      const correctOption = currentQuestion.options.find(
        (o) => o.id === currentQuestion.correctId
      );

      onAnswer(currentQuestion.id, answerId, isCorrect);
      onUserAction("answer_quiz", {
        questionId: currentQuestion.id,
        questionText: currentQuestion.question,
        answerId,
        answerText: selectedOption?.text,
        correctAnswerId: currentQuestion.correctId,
        correctAnswerText: correctOption?.text,
        isCorrect,
        mode,
        vehicleId: selectedVehicleId,
        vehicleName,
      });
    },
    [
      showFeedback,
      isCurrentAnswered,
      currentQuestion,
      onAnswer,
      onUserAction,
      mode,
      selectedVehicleId,
      vehicleName,
    ]
  );

  // Handle "Next" - enter waiting mode for agent's next question
  const handleNext = useCallback(() => {
    if (!showFeedback || !currentQuestion) return;

    setMode("waiting");
    onUserAction("ready_for_next_question", {
      previousQuestionId: currentQuestion.id,
      wasCorrect: progress.correct.includes(currentQuestion.id),
      totalAnswered: progress.answered.length,
      totalCorrect: progress.correct.length,
      vehicleId: selectedVehicleId,
    });
  }, [
    showFeedback,
    currentQuestion,
    progress,
    onUserAction,
    selectedVehicleId,
  ]);

  // Handle "Done with Quiz" button
  const handleEndQuiz = useCallback(() => {
    onUserAction("end_quiz", {
      totalAnswered: progress.answered.length,
      totalCorrect: progress.correct.length,
      vehicleId: selectedVehicleId,
    });
    // Show completion immediately - don't wait for agent confirmation
    setMode("static"); // Reset mode so we show completion screen
  }, [onUserAction, progress, selectedVehicleId]);

  // Show completion screen when quiz ends
  if (quizEnded) {
    const score = progress.correct.length;
    const total = progress.answered.length;
    const isPerfect = score === total && total > 0;

    // Calculate session summary data
    const finalWeight = vehicleDefaultWeight + carConfig.weightAdjustment;
    const weightFraction = weightToFraction(finalWeight);
    const weightAdjustmentOption = WEIGHT_ADJUSTMENT_OPTIONS.find(
      (o) => o.value === carConfig.weightAdjustment
    );
    const tireOption = TIRE_OPTIONS[carConfig.tireType] || TIRE_OPTIONS[1];

    return (
      <div className="h-full relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-50 via-white to-green-50" />

        {/* Confetti for good performance */}
        {(isPerfect || score >= total * 0.7) &&
          Array.from({ length: 15 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                left: `${10 + Math.random() * 80}%`,
                backgroundColor: ["#f59e0b", "#10b981", "#3b82f6", "#ec4899"][
                  i % 4
                ],
              }}
              initial={{ y: -20, opacity: 0 }}
              animate={{
                y: [0, 500],
                opacity: [1, 1, 0],
                rotate: [0, 360],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                delay: Math.random() * 1.5,
                repeat: Infinity,
              }}
            />
          ))}

        <div className="relative z-10 h-full flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-lg w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="mb-4"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full shadow-lg">
                <Trophy className="w-10 h-10 text-white" />
              </div>
            </motion.div>

            <h3 className="text-3xl font-bold text-gray-900 mb-2">
              Speed Lab Complete!
            </h3>
            <p className="text-gray-500 mb-6">
              Great work on your car science adventure!
            </p>

            {/* Session Summary Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border-2 border-gray-100 shadow-sm p-5 mb-6 text-left"
            >
              <h4 className="font-bold text-gray-800 mb-4 text-center">
                📊 Your Session Summary
              </h4>

              <div className="grid grid-cols-2 gap-3">
                {/* Car Built */}
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    🚗 Car Built
                  </p>
                  <p className="font-bold text-gray-900">{vehicleName}</p>
                </div>

                {/* Final Weight */}
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-xs text-amber-600 font-medium mb-1">
                    ⚖️ Final Weight
                  </p>
                  <p className="font-bold text-gray-900">{weightFraction}</p>
                  <p className="text-xs text-gray-500">
                    {weightAdjustmentOption?.value === 0
                      ? "Stock"
                      : weightAdjustmentOption?.label}
                  </p>
                </div>

                {/* Tires */}
                <div className="bg-purple-50 rounded-xl p-3">
                  <p className="text-xs text-purple-600 font-medium mb-1">
                    🛞 Tires
                  </p>
                  <p className="font-bold text-gray-900">{tireOption.name}</p>
                  <p className="text-xs text-gray-500">
                    Grip: {tireOption.frictionLabel}
                  </p>
                </div>

                {/* Quiz Score */}
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-xs text-green-600 font-medium mb-1">
                    🧠 Quiz Score
                  </p>
                  <p className="font-bold text-gray-900">
                    {score} / {total}
                  </p>
                  <p className="text-xs text-gray-500">
                    {total === 0
                      ? "No questions"
                      : `${Math.round((score / total) * 100)}% correct`}
                  </p>
                </div>
              </div>

              {/* Encouragement message */}
              <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                <p className="text-sm text-gray-600">
                  {total === 0
                    ? "🎯 Ready to try some math questions next time!"
                    : isPerfect
                      ? "🌟 Perfect score! You're a fraction master!"
                      : score >= total * 0.7
                        ? "🎉 Great job! You really understand fractions and car science!"
                        : "💪 Nice effort! Keep practicing fractions!"}
                </p>
              </div>
            </motion.div>

            {/* Exit Options */}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                onClick={onPlayAgain}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                <RotateCcw className="w-5 h-5" />
                Play Again
              </button>
              <button
                onClick={onGoHome}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-white border-2 border-blue-200 rounded-xl font-medium text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-all"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Go to Home
              </button>
              <button
                onClick={onEndSession}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl font-bold text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
              >
                End Session
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Say "end session" or "go home" to your tutor anytime!
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Waiting for agent's next question
  if (mode === "waiting") {
    return (
      <div className="h-full relative">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-white to-amber-50" />

        <div className="relative z-10 h-full flex flex-col p-6 pt-14 max-w-6xl mx-auto">
          {/* Header - centered across full width */}
          <div className="flex flex-col items-center mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Speed Quiz</h2>
            </div>
            <QuizProgressIndicator
              questionsShown={questionsShown}
              progress={progress}
            />
          </div>

          {/* Two-column layout for content - overflow visible for floating car */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-6 overflow-visible">
            {/* Left column - Quiz content (3/5 width on md+) */}
            <div className="md:col-span-3 flex flex-col">
              {/* Waiting card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100 flex-1 flex items-center justify-center"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                      <Mic className="w-10 h-10 text-blue-600" />
                    </div>
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-blue-400"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>
                  <div>
                    <p className="text-xl font-medium text-gray-900 mb-1">
                      {questionsShown.length === 0
                        ? "Get Ready!"
                        : "Listening..."}
                    </p>
                    <p className="text-gray-500">
                      {questionsShown.length === 0
                        ? "Your tutor is preparing a question for you"
                        : "Say your answer or wait for the next question"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 px-4 py-2 rounded-full">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {questionsShown.length === 0
                        ? "Getting first question..."
                        : "Getting next question..."}
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Done button */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleEndQuiz}
                  className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                >
                  Done with Quiz
                </button>
              </div>
            </div>

            {/* Right column - Car view (2/5 width on md+) - high z-index for floating car */}
            <div
              ref={rightColumnRef}
              className="hidden md:block md:col-span-2 overflow-visible relative z-20"
            >
              <CarSidePanel
                vehicleId={selectedVehicleId}
                vehicleName={vehicleName}
                carConfig={carConfig}
                vehicleDefaultWeight={vehicleDefaultWeight}
                columnRef={rightColumnRef}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Safety check - if no question yet, show waiting state
  if (!currentQuestion) {
    return null; // This shouldn't happen as mode would be "waiting", but just in case
  }

  // Show current question (from agent)
  return (
    <div className="h-full relative">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-50 via-white to-blue-50" />

      <div className="relative z-10 h-full flex flex-col p-6 pt-14 max-w-6xl mx-auto">
        {/* Header - centered across full width */}
        <div className="flex flex-col items-center mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Speed Quiz</h2>
          </div>
          <QuizProgressIndicator
            questionsShown={questionsShown}
            progress={progress}
            currentQuestionId={currentQuestion?.id}
          />
        </div>

        {/* Two-column layout for content - overflow visible for floating car */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-6 overflow-visible">
          {/* Left column - Quiz content (3/5 width on md+) */}
          <div className="md:col-span-3 flex flex-col">
            {/* Voice input indicator */}
            <ListeningIndicator />

            {/* Question card */}
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mt-4 flex-1"
            >
              <p className="text-lg font-medium text-gray-900 mb-6">
                {currentQuestion.question}
              </p>

              <div
                className={cn(
                  "grid gap-3",
                  currentQuestion.type === "thisThat"
                    ? "grid-cols-2"
                    : "grid-cols-1"
                )}
              >
                {currentQuestion.options.map((option) => {
                  const isSelected = selectedAnswer === option.id;
                  const isCorrect = option.id === currentQuestion.correctId;
                  const showCorrect = showFeedback && isCorrect;
                  const showWrong = showFeedback && isSelected && !isCorrect;
                  const agentEvaluated = isCurrentAnswered && !selectedAnswer;
                  const showAgentCorrect = agentEvaluated && isCorrect;

                  return (
                    <motion.button
                      key={option.id}
                      whileHover={!showFeedback ? { scale: 1.02 } : {}}
                      whileTap={!showFeedback ? { scale: 0.98 } : {}}
                      onClick={() => handleAnswer(option.id)}
                      disabled={showFeedback}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-amber-400",
                        showCorrect || showAgentCorrect
                          ? "border-green-500 bg-green-50"
                          : showWrong
                            ? "border-red-400 bg-red-50"
                            : isSelected
                              ? "border-amber-500 bg-amber-50"
                              : "border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/50"
                      )}
                    >
                      <span
                        className={cn(
                          "font-medium",
                          showCorrect || showAgentCorrect
                            ? "text-green-700"
                            : showWrong
                              ? "text-red-700"
                              : "text-gray-900"
                        )}
                      >
                        {option.text}
                      </span>
                      {(showCorrect || showAgentCorrect) && (
                        <span className="ml-2 inline-flex items-center">
                          <Sparkles className="w-4 h-4 text-green-500" />
                        </span>
                      )}
                      {showWrong && (
                        <span className="ml-2 text-red-500">✗</span>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <AnimatePresence>
                {showFeedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "mt-6 p-4 rounded-xl",
                      progress.correct.includes(currentQuestion.id)
                        ? "bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200"
                        : "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200"
                    )}
                  >
                    <p className="font-bold mb-1">
                      {progress.correct.includes(currentQuestion.id)
                        ? "🎉 Correct!"
                        : "🤔 Not quite!"}
                    </p>
                    <p className="text-sm text-gray-700">
                      {currentQuestion.explanation}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Action buttons */}
            <div className="flex justify-between mt-6">
              <button
                onClick={handleEndQuiz}
                className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                Done with Quiz
              </button>
              <button
                onClick={handleNext}
                disabled={!showFeedback}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all",
                  showFeedback
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg hover:shadow-xl hover:scale-[1.02]"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                Next Question
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right column - Car view (2/5 width on md+) - high z-index for floating car */}
          <div
            ref={rightColumnRef}
            className="hidden md:block md:col-span-2 overflow-visible relative z-20"
          >
            <CarSidePanel
              vehicleId={selectedVehicleId}
              vehicleName={vehicleName}
              carConfig={carConfig}
              vehicleDefaultWeight={vehicleDefaultWeight}
              columnRef={rightColumnRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CAR SIDE PANEL - Compact side panel with 3D car view
// ============================================================================

/** Hook to track element position for floating car canvas */
function useColumnPosition(ref: React.RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState({
    top: 120,
    left: 0,
    width: 250,
    height: 320,
  });

  useEffect(() => {
    const updatePosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      // Canvas should be wider than column to allow overflow
      // Center the car in the column area, with extra width for floating effect
      const overflowWidth = 50; // Extra width on each side for overflow
      setPosition({
        top: rect.top + 70, // Below the header
        left: rect.left - overflowWidth,
        width: rect.width + overflowWidth * 2,
        height: Math.min(rect.height * 0.8, 320), // Slightly smaller height
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    // Also update on scroll in case of any scroll containers
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [ref]);

  return position;
}

function CarSidePanel({
  vehicleId,
  vehicleName,
  carConfig,
  vehicleDefaultWeight,
  columnRef,
}: {
  vehicleId: string;
  vehicleName: string;
  carConfig: CarConfig;
  vehicleDefaultWeight: number;
  columnRef: React.RefObject<HTMLDivElement | null>;
}) {
  const vehicle = VEHICLE_ARCHETYPES.find((v) => v.id === vehicleId);
  const canvasPosition = useColumnPosition(columnRef);

  if (!vehicle) return null;

  const finalWeight = vehicleDefaultWeight + carConfig.weightAdjustment;
  const weightFraction = weightToFraction(finalWeight);
  const tireOption = TIRE_OPTIONS[carConfig.tireType] ?? TIRE_OPTIONS[1];

  return (
    <>
      {/* Header with specs - in normal flow */}
      <div className="bg-white/95 backdrop-blur rounded-xl shadow-sm border border-gray-200 px-4 py-3 relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-800">{vehicleName}</h3>
            <p className="text-xs text-gray-500">Your Build</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-gray-600">
            <span>⚖️ {weightFraction}</span>
            <span>
              {tireOption.icon} {tireOption.frictionLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 3D View - fixed overlay, dynamically positioned based on column */}
      <div
        className="fixed z-30"
        style={{
          top: canvasPosition.top,
          left: canvasPosition.left,
          width: canvasPosition.width,
          height: canvasPosition.height,
        }}
      >
        <VehicleCanvas
          modelPath={vehicle.modelPath}
          buildingStep={999}
          totalSteps={1}
          bodyColor={vehicle.defaultColor}
          containerClassName="w-full h-full"
        />
      </div>
    </>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Shows progress dots for questions */
function QuizProgressIndicator({
  questionsShown,
  progress,
  currentQuestionId,
}: {
  questionsShown: QuizQuestion[];
  progress: QuizProgress;
  currentQuestionId?: string;
}) {
  if (questionsShown.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <span>{progress.answered.length} answered</span>
      <div className="flex gap-1">
        {questionsShown.map((q) => (
          <div
            key={q.id}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              progress.correct.includes(q.id)
                ? "bg-green-500"
                : progress.answered.includes(q.id)
                  ? "bg-red-400"
                  : q.id === currentQuestionId
                    ? "bg-yellow-500"
                    : "bg-gray-300"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Visual indicator that voice input is active */
function ListeningIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center gap-2 py-2 px-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200"
    >
      <div className="relative">
        <Mic className="w-4 h-4 text-blue-600" />
        <motion.div
          className="absolute -inset-1 rounded-full border border-blue-400"
          animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.2, 0.8] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </div>
      <span className="text-sm text-blue-700 font-medium">
        You can also speak your answer
      </span>
    </motion.div>
  );
}
