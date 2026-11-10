import React, { useRef, useState, useEffect } from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { VerificationCodeInputProps } from './verification-code-input.types';

const sizes = {
  sm: { height: 48, fontSize: 20, gap: 8 },
  md: { height: 56, fontSize: 24, gap: 10 },
  lg: { height: 64, fontSize: 28, gap: 12 },
};

export function VerificationCodeInput({
  value = "",
  onChange,
  length = 6,
  size = "md",
  disabled = false,
  error = false,
  errorMessage,
  label,
  autoFocus = false,
}: VerificationCodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  const sizeConfig = sizes[size];
  const digits = inputValue.split("");
  const cursorIndex = digits.length;

  // Sync with external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Cursor blink animation
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    if (isFocused && cursorIndex < length) {
      cursorOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 0 }),
          withTiming(1, { duration: 500 }),
          withTiming(0, { duration: 100 }),
          withTiming(0, { duration: 400 })
        ),
        -1,
        false
      );
    } else {
      cursorOpacity.value = 0;
    }
  }, [isFocused, cursorIndex, length]);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  const handleChange = (text: string) => {
    const sanitized = text.replace(/[^0-9]/g, "").slice(0, length);
    setInputValue(sanitized);
    onChange?.(sanitized);
  };

  const handlePress = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      <Pressable onPress={handlePress} style={styles.inputContainer}>
        {/* Hidden input that captures all keyboard input */}
        <TextInput
          ref={inputRef}
          value={inputValue}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={length}
          editable={!disabled}
          autoFocus={autoFocus}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={styles.hiddenInput}
          caretHidden
        />

        {/* Visual digit boxes */}
        <View style={[styles.boxContainer, { gap: sizeConfig.gap }]}>
          {Array.from({ length }).map((_, index) => {
            const isFilled = index < digits.length;
            const isCurrentBox = index === cursorIndex && isFocused;
            const digit = digits[index];

            return (
              <View
                key={index}
                style={[
                  styles.box,
                  { height: sizeConfig.height },
                  isFilled && styles.boxFilled,
                  isCurrentBox && styles.boxActive,
                  error && styles.boxError,
                  disabled && styles.boxDisabled,
                ]}
              >
                {digit ? (
                  <Text
                    style={[
                      styles.digit,
                      { fontSize: sizeConfig.fontSize },
                      disabled && styles.digitDisabled,
                    ]}
                  >
                    {digit}
                  </Text>
                ) : isCurrentBox ? (
                  <Animated.View style={[styles.cursor, cursorStyle]} />
                ) : null}
              </View>
            );
          })}
        </View>
      </Pressable>

      {error && errorMessage && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171717',
    marginBottom: 4,
    paddingLeft: 8,
  },
  inputContainer: {
    position: 'relative',
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
  },
  boxContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d4d4d4',
    borderRadius: 12,
  },
  boxFilled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#171717',
  },
  boxActive: {
    borderColor: '#171717',
    borderWidth: 2,
  },
  boxError: {
    borderColor: '#ef4444',
  },
  boxDisabled: {
    opacity: 0.5,
    backgroundColor: '#f5f5f5',
  },
  digit: {
    fontWeight: '700',
    color: '#171717',
  },
  digitDisabled: {
    color: '#a3a3a3',
  },
  cursor: {
    width: 2,
    height: 28,
    backgroundColor: '#171717',
    borderRadius: 1,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
    paddingLeft: 8,
  },
});
