import React from 'react';

import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';

import type { Size } from './lib/types';
import { cn } from './lib/utils';

const sizes = {
  sm: { height: 48, fontSize: 14, paddingHorizontal: 12 },
  md: { height: 56, fontSize: 18, paddingHorizontal: 16 },
  lg: { height: 64, fontSize: 22, paddingHorizontal: 20 },
};

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  size?: Size;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  autoFocus?: boolean;
  className?: string;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  size = "md",
  error = false,
  errorMessage,
  disabled = false,
  keyboardType = "default",
  autoFocus = false,
  className,
}: TextInputProps) {
  const sizeConfig = sizes[size];

  return (
    <View className={cn("flex-1", className)}>
      {label && (
        <Text className="text-sm pl-2 font-semibold text-neutral-900 mb-1">
          {label}
        </Text>
      )}
      <RNTextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType}
        editable={!disabled}
        autoFocus={autoFocus}
        placeholderTextColor="#a3a3a3"
        style={[
          styles.input,
          {
            height: sizeConfig.height,
            fontSize: sizeConfig.fontSize,
            paddingHorizontal: sizeConfig.paddingHorizontal,
          },
          error && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
      />
      {error && errorMessage && (
        <Text className="text-xs text-error-500 mt-1">{errorMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 16,
    color: "#171717",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  inputDisabled: {
    opacity: 0.5,
    backgroundColor: "#f5f5f5",
    borderColor: "#e5e5e5",
  },
});
