/**
 * MultipleChoiceInput
 *
 * Multiple choice buttons for answer selection.
 * Renders options with KaTeX for fractions.
 */

import {
  useCallback,
  useEffect,
  useMemo,
} from 'react';

import katex from 'katex';
import { motion } from 'motion/react';

import {
  operandsEqual,
  operandToLatex,
} from '../fraction-utils';
import type { Operand } from '../schema';

interface MultipleChoiceInputProps {
  /** Available options */
  options: Operand[];
  /** Currently selected option */
  selected: Operand | null;
  /** Called when an option is selected */
  onSelect: (option: Operand) => void;
  /** Called after selection with the selected answer (auto-submits) */
  onSubmit: (answer: Operand) => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Correct answer (for showing feedback) */
  correctAnswer?: Operand;
  /** Show correct/incorrect feedback */
  showFeedback?: boolean;
}

export function MultipleChoiceInput({
  options,
  selected,
  onSelect,
  onSubmit,
  disabled = false,
  correctAnswer,
  showFeedback = false,
}: MultipleChoiceInputProps) {
  // Handle keyboard shortcuts (1-4)
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= options.length) {
        const option = options[num - 1];
        onSelect(option);
        // Auto-submit with the selected option directly (no delay needed)
        onSubmit(option);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options, onSelect, onSubmit, disabled]);

  const handleSelect = useCallback(
    (option: Operand) => {
      if (disabled) return;
      onSelect(option);
      // Auto-submit with the selected option directly (no delay needed)
      onSubmit(option);
    },
    [onSelect, onSubmit, disabled]
  );

  // Render options in a grid
  const gridCols = options.length <= 2 ? "grid-cols-2" : "grid-cols-2";

  return (
    <div className={`grid ${gridCols} gap-6 w-full max-w-2xl`}>
      {options.map((option, index) => (
        <OptionButton
          key={index}
          option={option}
          index={index}
          isSelected={selected !== null && operandsEqual(selected, option)}
          isCorrect={
            correctAnswer !== undefined && operandsEqual(correctAnswer, option)
          }
          showFeedback={showFeedback}
          disabled={disabled}
          onClick={() => handleSelect(option)}
        />
      ))}
    </div>
  );
}

interface OptionButtonProps {
  option: Operand;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  showFeedback: boolean;
  disabled: boolean;
  onClick: () => void;
}

function OptionButton({
  option,
  isSelected,
  isCorrect,
  showFeedback,
  disabled,
  onClick,
}: OptionButtonProps) {
  const html = useMemo(() => {
    const latex = operandToLatex(option);
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  }, [option]);

  // Determine button styling based on state
  const getButtonStyle = () => {
    if (showFeedback) {
      if (isCorrect) {
        return "bg-green-100 border-green-500 text-green-700";
      }
      if (isSelected && !isCorrect) {
        return "bg-red-100 border-red-500 text-red-700";
      }
    }

    if (isSelected) {
      return "bg-primary-100 border-primary-500 text-primary-700";
    }

    return "bg-white border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300";
  };

  return (
    <motion.button
      type="button"
      className={`
        flex items-center justify-center
        aspect-square w-full
        rounded-xl border-3
        font-semibold text-xl
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        min-h-[140px]
        cursor-pointer
        select-none
        ${getButtonStyle()}
      `}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      animate={
        showFeedback && isCorrect
          ? { scale: [1, 1.05, 1] }
          : showFeedback && isSelected && !isCorrect
            ? { x: [0, -5, 5, -5, 5, 0] }
            : {}
      }
      transition={{ duration: 0.3 }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Math content - pointer-events: none ensures clicks pass through to button */}
      <span
        className="text-4xl -mt-8"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          transform: "scale(3)",
          pointerEvents: "none",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </motion.button>
  );
}
