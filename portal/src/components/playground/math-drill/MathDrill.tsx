import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'motion/react';

import type { PlaygroundComponentProps } from '../types';
import {
  AnswerInput,
  FeedbackOverlay,
  ProblemDisplay,
} from './components';
import {
  type actionSchemas,
  type Config,
  type Fraction,
  isFraction,
  type MathDrillAction,
  type Operand,
  type Problem,
  type State,
} from './schema';
import { useMathDrillActions } from './useMathDrillActions';
import { generateProblem } from './utils';

const ADVANCE_DELAY_MS = 800;
const DEFAULT_PROBLEM_COUNT = 10;

type Props = PlaygroundComponentProps<Config, State, typeof actionSchemas>;

export function MathDrill({
  config,
  state: initialState,
  onChange,
  onEvent,
  pendingAction,
  onActionComplete,
}: Props) {
  const [localState, setLocalState] = useState<State>(initialState);
  const [feedback, setFeedback] = useState<"none" | "correct" | "incorrect">(
    "none"
  );
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [userAnswer, setUserAnswer] = useState<string | Fraction>("");

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const configHashRef = useRef<string>("");

  const getConfigHash = useCallback((c: Config) => {
    return JSON.stringify({
      operations: c.operations,
      numberTypes: c.numberTypes,
      operandRange: c.operandRange,
      fractionConfig: c.fractionConfig,
      inputType: c.inputType,
      problemCount: c.problemCount,
      timeLimitSeconds: c.timeLimitSeconds,
    });
  }, []);

  const generateAllProblems = useCallback(
    (count: number): Problem[] => {
      const problems: Problem[] = [];
      for (let i = 0; i < count; i++) {
        problems.push(generateProblem(config));
      }
      return problems;
    },
    [config]
  );

  useEffect(() => {
    const newHash = getConfigHash(config);
    if (newHash !== configHashRef.current) {
      configHashRef.current = newHash;
      const count = config.problemCount ?? DEFAULT_PROBLEM_COUNT;
      const problems = generateAllProblems(count);
      const now = Date.now();

      const newState: State = {
        problems,
        currentIndex: 0,
        results: [],
        completed: false,
        startedAt: now,
        completedAt: null,
      };

      setLocalState(newState);
      setFeedback("none");
      onChange?.(newState);

      // Emit drill_started event
      onEvent?.({
        type: "drill_started",
        problemCount: count,
        operations: config.operations,
        hasTimeLimit: !!config.timeLimitSeconds,
      });

      if (config.timeLimitSeconds) {
        setTimeRemaining(config.timeLimitSeconds);
      } else {
        setTimeRemaining(null);
      }
    }
  }, [config, getConfigHash, generateAllProblems, onChange, onEvent]);

  const { processAction } = useMathDrillActions({
    state: localState,
    config,
    onEvent,
  });

  useEffect(() => {
    if (pendingAction?.actions) {
      for (const action of pendingAction.actions) {
        processAction(action as MathDrillAction);
      }
      onActionComplete?.();
    }
  }, [pendingAction, processAction, onActionComplete]);

  useEffect(() => {
    if (!config.timeLimitSeconds || localState.completed) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) return prev;

        const newTime = prev - 1;
        if (newTime <= 0) {
          setLocalState((prevState) => {
            const now = Date.now();
            const completed: State = {
              ...prevState,
              completed: true,
              completedAt: now,
            };

            const correct =
              completed.results?.filter((r) => r.correct).length ?? 0;
            const total = completed.results?.length ?? 0;
            onEvent?.({
              type: "drill_complete",
              correct,
              total,
              accuracy: total > 0 ? correct / total : 0,
              timeElapsed: config.timeLimitSeconds ?? 0,
            });

            onChange?.(completed);
            return completed;
          });
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [config.timeLimitSeconds, localState.completed, onEvent, onChange]);

  useEffect(() => {
    const currentProblem = localState.problems?.[localState.currentIndex];
    if (currentProblem) {
      setUserAnswer(
        isFraction(currentProblem.correctAnswer)
          ? { numerator: 0, denominator: 1 }
          : ""
      );
    }
  }, [localState.currentIndex, localState.problems]);

  const handleAnswerChange = useCallback((value: string | Fraction) => {
    setUserAnswer(value);
  }, []);

  const handleSubmit = useCallback(
    (directAnswer?: Operand) => {
      const currentProblem = localState.problems?.[localState.currentIndex];
      if (!currentProblem || localState.completed || feedback !== "none")
        return;

      let answer: Operand;
      if (directAnswer !== undefined) {
        answer = directAnswer;
      } else if (typeof userAnswer === "string") {
        const parsed = parseInt(userAnswer, 10);
        if (isNaN(parsed)) return;
        answer = parsed;
      } else {
        if (userAnswer.numerator === 0) return;
        answer = userAnswer;
      }

      const isCorrect = checkAnswerCorrect(currentProblem, answer, config);
      setFeedback(isCorrect ? "correct" : "incorrect");

      const result = {
        problemId: currentProblem.id,
        userAnswer: answer,
        correct: isCorrect,
        answeredAt: Date.now(),
      };

      // Emit problem_answered event
      onEvent?.({
        type: "problem_answered",
        problemIndex: localState.currentIndex,
        total: localState.problems?.length ?? 0,
        isCorrect,
      });

      // Record result immediately
      setLocalState((prev) => ({
        ...prev,
        results: [...(prev.results ?? []), result],
      }));

      // Advance to next problem after delay
      setTimeout(() => {
        setFeedback("none");
        setLocalState((prev) => {
          const newIndex = prev.currentIndex + 1;
          const isComplete = newIndex >= (prev.problems?.length ?? 0);

          const newState: State = {
            ...prev,
            currentIndex: isComplete ? prev.currentIndex : newIndex,
            completed: isComplete,
            completedAt: isComplete ? Date.now() : null,
          };

          if (isComplete) {
            const correct = prev.results?.filter((r) => r.correct).length ?? 0;
            const total = prev.results?.length ?? 0;
            const timeElapsed = prev.startedAt
              ? (Date.now() - prev.startedAt) / 1000
              : 0;

            onEvent?.({
              type: "drill_complete",
              correct,
              total,
              accuracy: total > 0 ? correct / total : 0,
              timeElapsed,
            });
          }

          onChange?.(newState);
          return newState;
        });
      }, ADVANCE_DELAY_MS);
    },
    [localState, userAnswer, config, feedback, onEvent, onChange]
  );

  const currentProblem = localState.problems?.[localState.currentIndex];
  const totalProblems = localState.problems?.length ?? 0;
  const currentNumber = localState.currentIndex + 1;
  const correctCount = localState.results?.filter((r) => r.correct).length ?? 0;
  const resultsLength = localState.results?.length ?? 0;
  const accuracy =
    resultsLength > 0 ? Math.round((correctCount / resultsLength) * 100) : 0;

  if (localState.completed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Complete!</h2>
          <div className="text-4xl font-bold text-primary-600 mb-2">
            {correctCount} / {resultsLength}
          </div>
          <div className="text-lg text-gray-500">{accuracy}% correct</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
        <div className="text-sm font-medium text-gray-600">
          Problem {currentNumber} of {totalProblems}
        </div>
        {timeRemaining !== null && (
          <div
            className={`text-sm font-mono font-medium ${
              timeRemaining <= 10 ? "text-red-500" : "text-gray-600"
            }`}
          >
            {formatTime(timeRemaining)}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-12 mt-8">
        <AnimatePresence mode="wait">
          {currentProblem && (
            <motion.div
              key={currentProblem.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="text-4xl"
            >
              <ProblemDisplay
                problem={currentProblem}
                showAnswer={feedback === "incorrect"}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {currentProblem && (
          <AnswerInput
            problem={currentProblem}
            config={config}
            value={userAnswer}
            onChange={handleAnswerChange}
            onSubmit={handleSubmit}
            disabled={feedback !== "none"}
            feedback={feedback}
          />
        )}
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex justify-center">
        <div className="text-sm text-gray-400">
          {correctCount} / {resultsLength} correct
          {resultsLength > 0 && <span className="ml-2">({accuracy}%)</span>}
        </div>
      </div>

      <FeedbackOverlay feedback={feedback} />
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function checkAnswerCorrect(
  problem: Problem,
  userAnswer: Operand,
  config: Config
): boolean {
  const correct = problem.correctAnswer;

  if (typeof correct === "number" && typeof userAnswer === "number") {
    return correct === userAnswer;
  }

  if (isFraction(correct) && isFraction(userAnswer)) {
    const requireSimplified = config.fractionConfig?.requireSimplified ?? true;

    if (requireSimplified) {
      const normalizedCorrect = normalizeFraction(correct);
      const normalizedUser = normalizeFraction(userAnswer);
      return (
        normalizedCorrect.numerator === normalizedUser.numerator &&
        normalizedCorrect.denominator === normalizedUser.denominator
      );
    } else {
      const correctValue =
        (correct.whole ?? 0) + correct.numerator / correct.denominator;
      const userValue =
        (userAnswer.whole ?? 0) + userAnswer.numerator / userAnswer.denominator;
      return Math.abs(correctValue - userValue) < 0.0001;
    }
  }

  return false;
}

function normalizeFraction(f: Fraction): Fraction {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const whole = f.whole ?? 0;
  const totalNumerator = whole * f.denominator + f.numerator;
  const g = gcd(Math.abs(totalNumerator), f.denominator);
  return {
    numerator: totalNumerator / g,
    denominator: f.denominator / g,
  };
}
