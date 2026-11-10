/**
 * AnswerInput
 *
 * Wrapper component that renders the appropriate input based on config.
 * - IntegerInput for integer problems with type input
 * - FractionInput for fraction problems with type input
 * - MultipleChoiceInput for multiple choice mode
 */

import type {
  Config,
  Fraction,
  Operand,
  Problem,
} from '../schema';
import { isFraction } from '../schema';
import { FractionInput } from './FractionInput';
import { IntegerInput } from './IntegerInput';
import { MultipleChoiceInput } from './MultipleChoiceInput';

interface AnswerInputProps {
  /** Current problem */
  problem: Problem;
  /** Config for determining input type */
  config: Config;
  /** Current user answer (string for integers, Fraction for fractions) */
  value: string | Fraction;
  /** Called when value changes */
  onChange: (value: string | Fraction) => void;
  /** Called when user submits (optionally with a direct answer to bypass state) */
  onSubmit: (directAnswer?: Operand) => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Feedback state for multiple choice */
  feedback?: "none" | "correct" | "incorrect";
}

export function AnswerInput({
  problem,
  config,
  value,
  onChange,
  onSubmit,
  disabled = false,
  feedback = "none",
}: AnswerInputProps) {
  // Multiple choice mode
  if (config.inputType === "multiple-choice" && problem.options) {
    // Convert value to Operand for comparison
    const selectedOperand: Operand | null =
      typeof value === "string"
        ? value.length > 0
          ? parseInt(value, 10)
          : null
        : value.numerator > 0
          ? value
          : null;

    return (
      <MultipleChoiceInput
        options={problem.options}
        selected={selectedOperand}
        onSelect={(option) => {
          if (isFraction(option)) {
            onChange(option);
          } else {
            onChange(option.toString());
          }
        }}
        onSubmit={(directAnswer) => onSubmit(directAnswer)}
        disabled={disabled}
        correctAnswer={problem.correctAnswer}
        showFeedback={feedback !== "none"}
      />
    );
  }

  // Type input mode - determine if integer or fraction based on answer type
  const answerIsFraction = isFraction(problem.correctAnswer);

  if (answerIsFraction) {
    // Ensure value is a Fraction
    const fractionValue: Fraction =
      typeof value === "string" ? { numerator: 0, denominator: 1 } : value;

    return (
      <FractionInput
        value={fractionValue}
        onChange={onChange}
        onSubmit={onSubmit}
        disabled={disabled}
      />
    );
  }

  // Integer input
  const stringValue = typeof value === "string" ? value : "";

  return (
    <IntegerInput
      value={stringValue}
      onChange={onChange}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  );
}
