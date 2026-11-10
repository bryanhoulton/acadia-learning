/**
 * IntegerInput
 *
 * Number pad input for integer answers.
 * Touch-friendly with large buttons.
 */

import { Delete } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect } from "react";

interface IntegerInputProps {
  /** Current value as string */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Called when user submits answer */
  onSubmit: () => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function IntegerInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  autoFocus = true,
}: IntegerInputProps) {
  // Handle keyboard input
  useEffect(() => {
    if (!autoFocus || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      if (e.key >= "0" && e.key <= "9") {
        onChange(value + e.key);
      } else if (e.key === "Backspace") {
        onChange(value.slice(0, -1));
      } else if (e.key === "Enter") {
        if (value.length > 0) {
          onSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [value, onChange, onSubmit, disabled, autoFocus]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (!disabled) {
        onChange(value + digit);
      }
    },
    [value, onChange, disabled],
  );

  const handleBackspace = useCallback(() => {
    if (!disabled) {
      onChange(value.slice(0, -1));
    }
  }, [value, onChange, disabled]);

  const handleSubmit = useCallback(() => {
    if (!disabled && value.length > 0) {
      onSubmit();
    }
  }, [value, onSubmit, disabled]);

  const buttonClass =
    "flex items-center justify-center w-16 h-16 rounded-xl text-2xl font-semibold transition-colors select-none";
  const digitClass = `${buttonClass} bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-200 text-gray-800`;
  const actionClass = `${buttonClass} bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600`;
  const submitClass = `${buttonClass} bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white`;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Display current input */}
      <div className="w-48 h-16 flex items-center justify-center bg-white border-2 border-gray-300 rounded-xl">
        <span className="text-3xl font-bold text-gray-800 tabular-nums">
          {value || <span className="text-gray-300">?</span>}
        </span>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <motion.button
            key={digit}
            className={digitClass}
            onClick={() => handleDigit(digit)}
            disabled={disabled}
            whileTap={{ scale: 0.95 }}
          >
            {digit}
          </motion.button>
        ))}

        {/* Bottom row: backspace, 0, submit */}
        <motion.button
          className={actionClass}
          onClick={handleBackspace}
          disabled={disabled}
          whileTap={{ scale: 0.95 }}
          aria-label="Backspace"
        >
          <Delete className="w-6 h-6" />
        </motion.button>

        <motion.button
          className={digitClass}
          onClick={() => handleDigit("0")}
          disabled={disabled}
          whileTap={{ scale: 0.95 }}
        >
          0
        </motion.button>

        <motion.button
          className={submitClass}
          onClick={handleSubmit}
          disabled={disabled || value.length === 0}
          whileTap={{ scale: 0.95 }}
          aria-label="Submit"
        >
          ✓
        </motion.button>
      </div>
    </div>
  );
}
