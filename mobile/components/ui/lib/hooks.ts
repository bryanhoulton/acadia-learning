import {
  useCallback,
  useState,
} from 'react';

import * as Haptics from 'expo-haptics';

interface UseButtonProps {
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
}

export function useButton({ disabled, loading, onPress }: UseButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = useCallback(() => {
    if (!disabled && !loading) {
      setIsPressed(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [disabled, loading]);

  const handlePressOut = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handlePress = useCallback(() => {
    if (!disabled && !loading && onPress) {
      onPress();
    }
  }, [disabled, loading, onPress]);

  return {
    isPressed,
    handlePressIn,
    handlePressOut,
    handlePress,
  };
}

interface UseSometimesControlledProps<T> {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
}

export function useSometimesControlled<T>({
  value,
  defaultValue,
  onChange,
}: UseSometimesControlledProps<T>) {
  const [internalValue, setInternalValue] = useState<T | undefined>(
    defaultValue
  );

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleChange = useCallback(
    (newValue: T) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [isControlled, onChange]
  );

  return [currentValue, handleChange] as const;
}
