/**
 * FractionInput
 *
 * Input for fraction answers with separate numerator and denominator fields.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ArrowUpDown,
  Delete,
} from 'lucide-react';
import { motion } from 'motion/react';

import type { Fraction } from '../schema';

interface FractionInputProps {
  /** Current value */
  value: Fraction;
  /** Called when value changes */
  onChange: (value: Fraction) => void;
  /** Called when user submits answer */
  onSubmit: () => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

type FocusField = "numerator" | "denominator";

export function FractionInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  autoFocus = true,
}: FractionInputProps) {
  const [focusedField, setFocusedField] = useState<FocusField>("numerator");

  // Convert number to string for display
  const numStr =
    value.numerator === 0 && focusedField !== "numerator"
      ? ""
      : value.numerator.toString();
  const denomStr =
    value.denominator === 1 && focusedField !== "denominator"
      ? ""
      : value.denominator.toString();

  // Handle keyboard input
  useEffect(() => {
    if (!autoFocus || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      if (e.key >= "0" && e.key <= "9") {
        const digit = e.key;
        if (focusedField === "numerator") {
          const newNum = parseInt(numStr + digit, 10) || 0;
          onChange({ ...value, numerator: newNum });
        } else {
          const newDenom = parseInt(denomStr + digit, 10) || 1;
          onChange({ ...value, denominator: Math.max(1, newDenom) });
        }
      } else if (e.key === "Backspace") {
        if (focusedField === "numerator") {
          const newNum = parseInt(numStr.slice(0, -1), 10) || 0;
          onChange({ ...value, numerator: newNum });
        } else {
          const newDenom = parseInt(denomStr.slice(0, -1), 10) || 1;
          onChange({ ...value, denominator: Math.max(1, newDenom) });
        }
      } else if (
        e.key === "Tab" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        setFocusedField((prev) =>
          prev === "numerator" ? "denominator" : "numerator"
        );
      } else if (e.key === "Enter") {
        if (value.numerator > 0 && value.denominator > 0) {
          onSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    value,
    onChange,
    onSubmit,
    disabled,
    autoFocus,
    focusedField,
    numStr,
    denomStr,
  ]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (disabled) return;

      if (focusedField === "numerator") {
        const newNum = parseInt(numStr + digit, 10) || 0;
        onChange({ ...value, numerator: newNum });
      } else {
        const newDenom = parseInt(denomStr + digit, 10) || 1;
        onChange({ ...value, denominator: Math.max(1, newDenom) });
      }
    },
    [value, onChange, disabled, focusedField, numStr, denomStr]
  );

  const handleBackspace = useCallback(() => {
    if (disabled) return;

    if (focusedField === "numerator") {
      const newNum = parseInt(numStr.slice(0, -1), 10) || 0;
      onChange({ ...value, numerator: newNum });
    } else {
      const newDenom = parseInt(denomStr.slice(0, -1), 10) || 1;
      onChange({ ...value, denominator: Math.max(1, newDenom) });
    }
  }, [value, onChange, disabled, focusedField, numStr, denomStr]);

  const toggleFocus = useCallback(() => {
    setFocusedField((prev) =>
      prev === "numerator" ? "denominator" : "numerator"
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (!disabled && value.numerator > 0 && value.denominator > 0) {
      onSubmit();
    }
  }, [value, onSubmit, disabled]);

  const buttonClass =
    "flex items-center justify-center w-14 h-14 rounded-xl text-xl font-semibold transition-colors select-none";
  const digitClass = `${buttonClass} bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-200 text-gray-800`;
  const actionClass = `${buttonClass} bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600`;

  const fieldClass = (field: FocusField) =>
    `w-16 h-10 text-center text-2xl font-bold rounded-lg transition-colors ${
      focusedField === field
        ? "bg-primary-100 border-2 border-primary-500 text-primary-700"
        : "bg-gray-100 border-2 border-gray-200 text-gray-600"
    }`;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Fraction display */}
      <div className="flex flex-col items-center">
        {/* Numerator */}
        <button
          className={fieldClass("numerator")}
          onClick={() => setFocusedField("numerator")}
          disabled={disabled}
        >
          {value.numerator || <span className="text-gray-300">?</span>}
        </button>

        {/* Fraction bar */}
        <div className="w-20 h-1 bg-gray-800 my-1 rounded-full" />

        {/* Denominator */}
        <button
          className={fieldClass("denominator")}
          onClick={() => setFocusedField("denominator")}
          disabled={disabled}
        >
          {value.denominator > 1 ? (
            value.denominator
          ) : (
            <span className="text-gray-300">?</span>
          )}
        </button>
      </div>

      {/* Number pad with toggle and submit */}
      <div className="flex gap-4">
        {/* Number pad */}
        <div className="grid grid-cols-3 gap-1.5">
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

          <motion.button
            className={actionClass}
            onClick={handleBackspace}
            disabled={disabled}
            whileTap={{ scale: 0.95 }}
            aria-label="Backspace"
          >
            <Delete className="w-5 h-5" />
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
            className={actionClass}
            onClick={toggleFocus}
            disabled={disabled}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle numerator/denominator"
          >
            <ArrowUpDown className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Submit button */}
        <motion.button
          className="w-16 h-full rounded-xl bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-bold text-xl disabled:opacity-50"
          onClick={handleSubmit}
          disabled={disabled || value.numerator === 0 || value.denominator < 1}
          whileTap={{ scale: 0.95 }}
        >
          ✓
        </motion.button>
      </div>
    </div>
  );
}
