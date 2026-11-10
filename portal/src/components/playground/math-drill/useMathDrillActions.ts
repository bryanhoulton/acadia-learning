import { useCallback } from "react";

import type { PlaygroundEvent } from "../types";
import type { Config, MathDrillAction, State } from "./schema";
import { type Operand } from "./schema";

interface UseMathDrillActionsProps {
  state: State;
  config: Config;
  onEvent?: (event: PlaygroundEvent) => void;
}

function operandToString(operand: Operand): string {
  if (typeof operand === "number") {
    return operand.toString();
  }
  if (operand.whole && operand.whole !== 0) {
    return `${operand.whole} ${operand.numerator}/${operand.denominator}`;
  }
  return `${operand.numerator}/${operand.denominator}`;
}

function operationToSymbol(op: string): string {
  switch (op) {
    case "addition":
      return "+";
    case "subtraction":
      return "-";
    case "multiplication":
      return "×";
    case "division":
      return "÷";
    default:
      return op;
  }
}

export function useMathDrillActions({
  state,
  onEvent,
}: UseMathDrillActionsProps) {
  const processAction = useCallback(
    (action: MathDrillAction) => {
      if (action.action === "get_results") {
        const correct = state.results.filter((r) => r.correct).length;
        const total = state.results.length;
        const accuracy = total > 0 ? correct / total : 0;
        const timeElapsed = state.startedAt
          ? ((state.completedAt ?? Date.now()) - state.startedAt) / 1000
          : 0;

        const results = state.results.map((result) => {
          const problem = state.problems.find((p) => p.id === result.problemId);
          if (!problem) {
            return {
              problem: "Unknown",
              userAnswer: operandToString(result.userAnswer),
              correctAnswer: "Unknown",
              correct: result.correct,
            };
          }

          const problemStr = `${operandToString(problem.operand1)} ${operationToSymbol(problem.operation)} ${operandToString(problem.operand2)}`;

          return {
            problem: problemStr,
            userAnswer: operandToString(result.userAnswer),
            correctAnswer: operandToString(problem.correctAnswer),
            correct: result.correct,
          };
        });

        onEvent?.({
          type: "results_response",
          completed: state.completed,
          correct,
          total,
          accuracy,
          timeElapsed,
          results,
        });
      }
    },
    [state, onEvent]
  );

  return { processAction };
}
