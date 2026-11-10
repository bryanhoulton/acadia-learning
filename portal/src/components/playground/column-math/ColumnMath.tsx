/**
 * ColumnMath
 *
 * Visual tool for column arithmetic.
 * Supports both agent-controlled mode and interactive student mode.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'motion/react';

import type { PlaygroundComponentProps } from '../types';
import {
  actionSchemas,
  type ColumnMathAction,
  type Config,
  type State,
} from './schema';

// ============================================
// Constants
// ============================================

const PLACE_VALUE_LABELS = [
  "ones",
  "tens",
  "hundreds",
  "thousands",
  "ten thousands",
  "hundred thousands",
  "millions",
];

// ============================================
// Helper Functions
// ============================================

function getDigits(num: number, maxDigits: number): number[] {
  const digits: number[] = [];
  let n = num;
  for (let i = 0; i < maxDigits; i++) {
    digits.push(n % 10);
    n = Math.floor(n / 10);
  }
  return digits;
}

function calculateCorrectAnswer(
  operation: "addition" | "subtraction",
  operands: number[]
): number {
  if (operation === "addition") {
    return operands.reduce((a, b) => a + b, 0);
  }
  return operands[0] - operands[1];
}

/** Calculate the correct carries for addition (carry[col] = carry going INTO column col) */
function calculateCorrectCarries(
  operands: number[],
  maxDigits: number
): (number | null)[] {
  const allDigits = operands.map((n) => getDigits(n, maxDigits));
  const carries: (number | null)[] = Array(maxDigits + 1).fill(null);

  let carry = 0;
  for (let col = 0; col < maxDigits; col++) {
    let sum = carry;
    for (const digits of allDigits) {
      sum += digits[col];
    }
    carry = Math.floor(sum / 10);
    // The carry goes to the NEXT column
    if (carry > 0) {
      carries[col + 1] = carry;
    }
  }

  return carries;
}

// ============================================
// Props Type
// ============================================

type Props = PlaygroundComponentProps<Config, State, typeof actionSchemas>;

// ============================================
// Answer Input Component
// ============================================

interface AnswerInputProps {
  value: number | null;
  isActive: boolean;
  isCompleted: boolean;
  isCorrect: boolean | null;
  onInput: (digit: number) => void;
  onClick: () => void;
  canEdit: boolean;
}

function AnswerInput({
  value,
  isActive,
  isCompleted,
  isCorrect,
  onInput,
  onClick,
  canEdit,
}: AnswerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      onInput(parseInt(e.key, 10));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length === 1 && val >= "0" && val <= "9") {
      onInput(parseInt(val, 10));
    }
  };

  // Determine color based on completion state
  const getTextColor = () => {
    if (!isCompleted) return "text-gray-800";
    if (isCorrect === true) return "text-emerald-600";
    if (isCorrect === false) return "text-red-600";
    return "text-gray-800";
  };

  // Active input (show input field)
  if (isActive) {
    return (
      <motion.input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]"
        className="w-12 h-14 text-4xl font-bold text-center bg-transparent border-b-2 border-dashed border-blue-400 focus:outline-none focus:border-blue-500"
        maxLength={1}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        value={value !== null ? String(value) : ""}
        transition={{ duration: 0.3 }}
      />
    );
  }

  // Already answered - clickable to edit
  if (value !== null) {
    return (
      <motion.span
        transition={{ duration: 0.3 }}
        className={`text-4xl font-bold ${getTextColor()} ${canEdit ? "cursor-pointer hover:opacity-70" : ""}`}
        onClick={canEdit ? onClick : undefined}
      >
        {value}
      </motion.span>
    );
  }

  // Inactive placeholder - clickable if can edit
  return (
    <span
      className={`text-4xl text-gray-200 ${canEdit ? "cursor-pointer hover:text-gray-400" : ""}`}
      onClick={canEdit ? onClick : undefined}
    >
      _
    </span>
  );
}

// ============================================
// Main Component
// ============================================

export function ColumnMath({
  config,
  state,
  onChange,
  onEvent,
  pendingAction,
  onActionComplete,
}: Props) {
  const {
    operation,
    operands,
    showPlaceValues,
    showRegrouping,
    interactive,
    autoSolve = false,
  } = config;

  // Compute maxDigits based on the operands (not the answer)
  const maxDigits = useMemo(() => {
    const maxOperand = Math.max(...operands, 0);
    return maxOperand === 0 ? 1 : Math.floor(Math.log10(maxOperand)) + 1;
  }, [operands]);

  // UI state (not exposed to agent)
  const [highlightedColumn, setHighlightedColumn] = useState<number | null>(
    null
  );

  // Internal state for interactive mode
  const [internalAnswerDigits, setInternalAnswerDigits] = useState<
    (number | null)[]
  >(() => Array(maxDigits + 1).fill(null));
  const [internalCarries, setInternalCarries] = useState<(number | null)[]>(
    () => Array(maxDigits + 1).fill(null)
  );
  const [internalCurrentColumn, setInternalCurrentColumn] = useState<
    number | null
  >(0);
  const [internalCompleted, setInternalCompleted] = useState(false);
  const [internalIsCorrect, setInternalIsCorrect] = useState<boolean | null>(
    null
  );

  // Reset internal state when operands change
  useEffect(() => {
    setInternalAnswerDigits(Array(maxDigits + 1).fill(null));
    setInternalCarries(Array(maxDigits + 1).fill(null));
    setInternalCurrentColumn(0);
    setInternalCompleted(false);
    setInternalIsCorrect(null);
  }, [operands, maxDigits]);

  const isAddition = operation === "addition";
  const operationSymbol = isAddition ? "+" : "−";

  // Original operand digits (for display)
  const displayDigits = useMemo(
    () => operands.map((n) => getDigits(n, maxDigits)),
    [operands, maxDigits]
  );

  // Calculate correct answer and digits
  const correctAnswer = useMemo(
    () => calculateCorrectAnswer(operation, operands),
    [operation, operands]
  );
  const correctDigits = useMemo(
    () => getDigits(correctAnswer, maxDigits + 1),
    [correctAnswer, maxDigits]
  );

  // Calculate correct carries for addition
  const correctCarries = useMemo(
    () =>
      isAddition
        ? calculateCorrectCarries(operands, maxDigits)
        : Array(maxDigits + 1).fill(null),
    [isAddition, operands, maxDigits]
  );

  // Total columns to display (expand if answer overflows)
  const answerDigitCount = correctDigits.findLastIndex((d) => d !== 0) + 1;
  const totalColumns = Math.max(maxDigits, answerDigitCount);

  // Determine what to display based on mode:
  // - interactive: student types answers, use internal state
  // - non-interactive + autoSolve: show completed answer immediately
  // - non-interactive + !autoSolve: agent-controlled mode, use state values from agent actions
  const showSolvedAnswer = !interactive && autoSolve;

  // In agent-controlled mode (!interactive && !autoSolve), use state values from agent actions
  const agentAnswerDigits = state?.answerDigits ?? [];
  const agentCarries = state?.carries ?? [];
  const agentDisplayDigits = state?.displayDigits;

  // Effective display digits: use agent state for borrow operations in agent mode
  const effectiveDisplayDigits = useMemo(() => {
    if (
      !interactive &&
      !autoSolve &&
      agentDisplayDigits &&
      agentDisplayDigits.length > 0
    ) {
      return agentDisplayDigits;
    }
    return displayDigits;
  }, [interactive, autoSolve, agentDisplayDigits, displayDigits]);

  const answerDigits = showSolvedAnswer
    ? correctDigits
    : interactive
      ? internalAnswerDigits
      : agentAnswerDigits.length > 0
        ? agentAnswerDigits
        : Array(maxDigits + 1).fill(null);
  const carries = showSolvedAnswer
    ? correctCarries
    : interactive
      ? internalCarries
      : agentCarries.length > 0
        ? agentCarries
        : Array(maxDigits + 1).fill(null);
  const currentColumn = interactive ? internalCurrentColumn : null;

  // Check if agent has set all answer digits (for completion status)
  const agentCompleted =
    !interactive &&
    !autoSolve &&
    agentAnswerDigits.length > 0 &&
    agentAnswerDigits
      .slice(0, totalColumns)
      .every(
        (d, i) => d !== null || (i >= maxDigits && correctDigits[i] === 0)
      );

  const completed = showSolvedAnswer
    ? true
    : interactive
      ? internalCompleted
      : agentCompleted;

  // Column indices (right to left visually, but stored left to right)
  const columnIndices = Array.from(
    { length: totalColumns },
    (_, i) => totalColumns - 1 - i
  );

  // Handle clicking on a column to select it for editing
  const handleColumnSelect = useCallback(
    (column: number) => {
      if (!interactive) return;

      // If already completed, reset completion state to allow editing
      if (internalCompleted) {
        setInternalCompleted(false);
        setInternalIsCorrect(null);
      }

      setInternalCurrentColumn(column);
    },
    [interactive, internalCompleted]
  );

  // Check if all required digits are filled
  const checkCompletion = useCallback(
    (digits: (number | null)[]) => {
      // Check if all columns up to the answer length are filled
      for (let i = 0; i < totalColumns; i++) {
        // Skip leading zeros in the answer that don't need to be filled
        if (i >= maxDigits && correctDigits[i] === 0) continue;
        if (digits[i] === null) return false;
      }
      return true;
    },
    [totalColumns, maxDigits, correctDigits]
  );

  // Handle student digit input (interactive mode only)
  const handleDigitInput = useCallback(
    (column: number, digit: number) => {
      if (!interactive || column !== internalCurrentColumn) return;

      // Accept any digit
      const newAnswerDigits = [...internalAnswerDigits];
      newAnswerDigits[column] = digit;
      setInternalAnswerDigits(newAnswerDigits);

      // Emit digit_filled event
      const placeValue =
        column < PLACE_VALUE_LABELS.length
          ? PLACE_VALUE_LABELS[column]
          : `place_${column}`;
      const isCorrectDigit = digit === correctDigits[column];
      onEvent?.({
        type: "digit_filled",
        column,
        placeValue,
        digit,
        isCorrect: isCorrectDigit,
      });

      // Auto-populate carry for addition (show correct carries as hints)
      if (isAddition && correctCarries[column + 1] !== null) {
        const newCarries = [...internalCarries];
        newCarries[column + 1] = correctCarries[column + 1];
        setInternalCarries(newCarries);
      }

      // Check if all digits are now filled
      if (checkCompletion(newAnswerDigits)) {
        // Check if all digits match the correct answer
        const isCorrect = newAnswerDigits.every(
          (d, i) =>
            d === correctDigits[i] || (d === null && correctDigits[i] === 0)
        );
        setInternalCurrentColumn(null);
        setInternalCompleted(true);
        setInternalIsCorrect(isCorrect);
        onChange?.({ completed: true, isCorrect });
      } else {
        // Move to next unfilled column, or stay if editing
        const nextColumn = column + 1;
        if (nextColumn < totalColumns && newAnswerDigits[nextColumn] === null) {
          setInternalCurrentColumn(nextColumn);
        } else {
          // Find next unfilled column
          const nextUnfilled = newAnswerDigits.findIndex(
            (d, i) =>
              d === null &&
              i < totalColumns &&
              !(i >= maxDigits && correctDigits[i] === 0)
          );
          if (nextUnfilled !== -1) {
            setInternalCurrentColumn(nextUnfilled);
          } else {
            setInternalCurrentColumn(null);
          }
        }
      }
    },
    [
      interactive,
      internalCurrentColumn,
      internalAnswerDigits,
      internalCarries,
      correctDigits,
      correctCarries,
      totalColumns,
      maxDigits,
      isAddition,
      onChange,
      onEvent,
      checkCompletion,
    ]
  );

  // Process pending actions from the agent
  useEffect(() => {
    if (!pendingAction?.actions) return;

    // Get current state values (for agent-controlled mode)
    let newAnswerDigits = [
      ...(state?.answerDigits ?? Array(maxDigits + 1).fill(null)),
    ];
    let newCarries = [...(state?.carries ?? Array(maxDigits + 1).fill(null))];
    let newDisplayDigits = state?.displayDigits
      ? state.displayDigits.map((row) => [...row])
      : displayDigits.map((row) => [...row]);

    // Ensure arrays are large enough
    while (newAnswerDigits.length <= maxDigits) {
      newAnswerDigits.push(null);
    }
    while (newCarries.length <= maxDigits) {
      newCarries.push(null);
    }

    let stateChanged = false;

    for (const actionItem of pendingAction.actions) {
      // Cast to discriminated union for type narrowing
      const action = actionItem as ColumnMathAction;

      switch (action.action) {
        case "set_answer": {
          const { column, value } = action.params;
          // Ensure array is large enough
          while (newAnswerDigits.length <= column) {
            newAnswerDigits.push(null);
          }
          newAnswerDigits[column] = value;
          stateChanged = true;
          break;
        }

        case "carry": {
          const { column, value } = action.params;
          // Ensure array is large enough
          while (newCarries.length <= column) {
            newCarries.push(null);
          }
          newCarries[column] = value;
          stateChanged = true;
          break;
        }

        case "borrow": {
          const { from, to } = action.params;
          // Borrow from one column to another (for subtraction)
          // The 'from' column decreases by 1, the 'to' column gains 10
          if (newDisplayDigits[0] && from < newDisplayDigits[0].length) {
            // Get the current value in the 'from' column of the first operand (minuend)
            const fromValue = newDisplayDigits[0][from];
            if (fromValue !== null && fromValue > 0) {
              newDisplayDigits[0][from] = fromValue - 1;
              // Add 10 to the 'to' column
              const toValue = newDisplayDigits[0][to];
              if (toValue !== null) {
                newDisplayDigits[0][to] = toValue + 10;
              }
              stateChanged = true;
            }
          }
          break;
        }

        case "highlight_column": {
          const col = action.params.column;
          const duration = action.params.duration ?? 2000;
          setHighlightedColumn(col);
          setTimeout(() => setHighlightedColumn(null), duration);
          break;
        }

        case "reset": {
          if (interactive) {
            setInternalAnswerDigits(Array(maxDigits + 1).fill(null));
            setInternalCarries(Array(maxDigits + 1).fill(null));
            setInternalCurrentColumn(0);
            setInternalCompleted(false);
            setInternalIsCorrect(null);
          }
          // Reset agent state
          newAnswerDigits = Array(maxDigits + 1).fill(null);
          newCarries = Array(maxDigits + 1).fill(null);
          newDisplayDigits = displayDigits.map((row) => [...row]);
          stateChanged = true;
          break;
        }
      }
    }

    // Update state if any agent actions modified it
    if (stateChanged && onChange) {
      // Check if all answer digits are now filled (for completion)
      const allFilled = newAnswerDigits
        .slice(0, totalColumns)
        .every(
          (d, i) => d !== null || (i >= maxDigits && correctDigits[i] === 0)
        );

      // Check correctness if all filled
      const isCorrect = allFilled
        ? newAnswerDigits
            .slice(0, totalColumns)
            .every(
              (d, i) =>
                d === correctDigits[i] || (d === null && correctDigits[i] === 0)
            )
        : null;

      onChange({
        completed: allFilled,
        isCorrect,
        answerDigits: newAnswerDigits,
        carries: newCarries,
        displayDigits: newDisplayDigits,
      });
    }

    onActionComplete?.();
  }, [
    pendingAction,
    onActionComplete,
    maxDigits,
    onChange,
    state,
    displayDigits,
    totalColumns,
    correctDigits,
    interactive,
  ]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8">
      <div className="p-6">
        <table className="border-collapse">
          <tbody>
            {/* Carry row (addition only) */}
            {isAddition && showRegrouping && (
              <tr>
                <td className="w-10" />
                {columnIndices.map((col) => (
                  <td
                    key={`carry-${col}`}
                    className="h-8 align-bottom text-center px-1"
                  >
                    <AnimatePresence>
                      {carries[col] !== null && (
                        <motion.span
                          initial={{ opacity: 0, y: -10, scale: 0.5 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-sm font-semibold text-amber-500"
                        >
                          {carries[col]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </td>
                ))}
              </tr>
            )}

            {/* Operand rows */}
            {effectiveDisplayDigits.map((digits, rowIdx) => (
              <tr key={`operand-${rowIdx}`}>
                {/* Operator column */}
                <td className="w-10 text-center align-middle pr-2">
                  {rowIdx === operands.length - 1 && (
                    <span className="text-3xl font-bold text-gray-400">
                      {operationSymbol}
                    </span>
                  )}
                </td>

                {/* Digit columns */}
                {columnIndices.map((col) => {
                  const digitValue = digits[col];
                  const isCurrentColumn = interactive && currentColumn === col;
                  const isHighlighted =
                    highlightedColumn === col || isCurrentColumn;

                  return (
                    <td
                      key={`op-${rowIdx}-${col}`}
                      className={`text-center px-1 py-0.5 transition-colors duration-200
                        ${isHighlighted ? "bg-blue-50 rounded" : ""}
                      `}
                    >
                      <div className="w-14 h-14 flex items-center justify-center">
                        <span className="text-4xl font-bold text-gray-800">
                          {digitValue ?? ""}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Separator line */}
            <tr>
              <td className="w-10" />
              <td colSpan={totalColumns} className="py-2">
                <div className="h-0.5 bg-gray-800" />
              </td>
            </tr>

            {/* Answer row */}
            <tr>
              <td className="w-10 text-center align-middle">
                <AnimatePresence>
                  {completed && internalIsCorrect === true && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-emerald-500 text-xl"
                    >
                      ✓
                    </motion.span>
                  )}
                  {completed && internalIsCorrect === false && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-red-500 text-xl"
                    >
                      ✗
                    </motion.span>
                  )}
                  {completed && internalIsCorrect === null && !interactive && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-emerald-500 text-xl"
                    >
                      ✓
                    </motion.span>
                  )}
                </AnimatePresence>
              </td>
              {columnIndices.map((col) => {
                const digit = answerDigits[col];
                // Column is active if it's the current selected column
                const isCurrentColumn = interactive && currentColumn === col;
                const isHighlighted =
                  highlightedColumn === col || isCurrentColumn;
                const isActive = isCurrentColumn && !completed;

                return (
                  <td
                    key={`answer-${col}`}
                    className={`text-center px-1 py-0.5 transition-colors duration-200
                      ${isHighlighted ? "bg-blue-50 rounded" : ""}
                    `}
                  >
                    <div className="w-14 h-14 flex items-center justify-center">
                      {interactive ? (
                        <AnswerInput
                          value={digit}
                          isActive={isActive}
                          isCompleted={completed}
                          isCorrect={internalIsCorrect}
                          onInput={(d) => handleDigitInput(col, d)}
                          onClick={() => handleColumnSelect(col)}
                          canEdit={interactive && !isActive}
                        />
                      ) : (
                        <AnimatePresence mode="wait">
                          {digit !== null ? (
                            <motion.span
                              key={digit}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`text-4xl font-bold ${completed ? "text-emerald-600" : "text-gray-800"}`}
                            >
                              {digit}
                            </motion.span>
                          ) : (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-4xl text-gray-200"
                            >
                              _
                            </motion.span>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Place value labels */}
            {showPlaceValues && (
              <tr>
                <td className="w-10" />
                {columnIndices.map((col) => {
                  const isCurrentColumn = interactive && currentColumn === col;
                  return (
                    <td key={`label-${col}`} className="text-center px-1 pt-2">
                      <span
                        className={`text-[10px] capitalize
                          ${
                            highlightedColumn === col || isCurrentColumn
                              ? "text-blue-500 font-medium"
                              : "text-gray-400"
                          }
                        `}
                      >
                        {col < PLACE_VALUE_LABELS.length
                          ? PLACE_VALUE_LABELS[col]
                          : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ColumnMath;
