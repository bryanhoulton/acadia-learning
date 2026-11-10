import {
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  UseVerificationCodeInputProps,
  UseVerificationCodeInputReturn,
} from './verification-code-input.types';

export function useVerificationCodeInput({
  value = "",
  onChange,
  length,
  disabled = false,
  autoFocus = false,
}: UseVerificationCodeInputProps): UseVerificationCodeInputReturn {
  const [inputValue, setInputValue] = useState(value);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRefs = Array.from({ length }, () => useRef<any>(null));

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRefs[0]?.current?.focus();
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (text: string) => {
    // Only allow digits
    const sanitized = text.replace(/[^0-9]/g, "").slice(0, length);
    setInputValue(sanitized);
    onChange?.(sanitized);
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && index > 0 && !inputValue[index]) {
      inputRefs[index - 1]?.current?.focus();
    }
  };

  return {
    inputValue,
    handleChange,
    handleKeyPress,
    inputRefs,
    focusedIndex,
    setFocusedIndex,
  };
}
