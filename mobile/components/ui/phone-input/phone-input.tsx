import React, { useMemo, useState, useRef } from 'react';

import { ChevronDown } from 'lucide-react-native';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SelectModal, SelectOption } from '../select';
import { countries } from './countries';
import type { PhoneInputProps } from './phone-input.types';
import { usePhoneInput } from './use-phone-input';

const sizes = {
  sm: { height: 48, fontSize: 14, flagSize: 20, paddingHorizontal: 12 },
  md: { height: 56, fontSize: 18, flagSize: 24, paddingHorizontal: 16 },
  lg: { height: 64, fontSize: 22, flagSize: 28, paddingHorizontal: 20 },
};

export function PhoneInput({
  value = "",
  onChange,
  variant = "default",
  size = "md",
  disabled = false,
  error = false,
  errorMessage,
  label,
  placeholder = "Phone number",
  defaultCountryCode = "US",
  autoFocus = false,
}: PhoneInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  
  const {
    countryCode,
    handlePhoneChange,
    formattedNumber,
    handleCountryChange,
  } = usePhoneInput({
    value,
    onChange,
    defaultCountryCode,
    disabled,
  });

  const sizeConfig = sizes[size];

  // Convert countries to SelectOption format
  const countryOptions: SelectOption<string>[] = useMemo(
    () =>
      countries.map((country) => ({
        label: `${country.flag} ${country.name} ${country.dialCode}`,
        value: country.code,
      })),
    []
  );

  const handleSelectCountry = (code: string) => {
    const country = countries.find((c) => c.code === code);
    if (country) {
      handleCountryChange(country);
      setTimeout(() => {
        setModalVisible(false);
        // Focus the input after selecting country
        inputRef.current?.focus();
      }, 300);
    }
  };

  const handleContainerPress = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  return (
    <View className="gap-2">
      {label && (
        <Text className="text-sm font-semibold text-neutral-900 mb-1 pl-2">
          {label}
        </Text>
      )}

      <Pressable
        onPress={handleContainerPress}
        style={[
          styles.container,
          { height: sizeConfig.height },
          isFocused && styles.containerFocused,
          error && styles.containerError,
          disabled && styles.containerDisabled,
        ]}
      >
        {/* Country selector button */}
        <Pressable
          onPress={() => !disabled && setModalVisible(true)}
          disabled={disabled}
          style={styles.countryButton}
        >
          <Text style={{ fontSize: sizeConfig.flagSize }}>
            {countryCode.flag}
          </Text>
          <Text
            style={[
              styles.dialCode,
              { fontSize: sizeConfig.fontSize },
              disabled && styles.textDisabled,
            ]}
          >
            {countryCode.dialCode}
          </Text>
          <ChevronDown
            size={16}
            color={disabled ? "#a3a3a3" : "#737373"}
            strokeWidth={2.5}
          />
        </Pressable>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Phone number input */}
        <TextInput
          ref={inputRef}
          value={formattedNumber}
          onChangeText={handlePhoneChange}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder={placeholder}
          placeholderTextColor="#a3a3a3"
          editable={!disabled}
          autoFocus={autoFocus}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.input,
            {
              fontSize: sizeConfig.fontSize,
              paddingRight: sizeConfig.paddingHorizontal,
            },
            disabled && styles.textDisabled,
          ]}
        />
      </Pressable>

      <SelectModal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        options={countryOptions}
        value={countryCode.code}
        onSelect={handleSelectCountry}
      />

      {error && errorMessage && (
        <Text className="text-xs text-error-500 mt-1 pl-2">{errorMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d4d4d4',
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerFocused: {
    borderColor: '#171717',
    borderWidth: 2,
  },
  containerError: {
    borderColor: '#ef4444',
  },
  containerDisabled: {
    opacity: 0.5,
    backgroundColor: '#f5f5f5',
    borderColor: '#e5e5e5',
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  dialCode: {
    color: '#171717',
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: '50%',
    backgroundColor: '#e5e5e5',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingLeft: 16,
    color: '#171717',
  },
  textDisabled: {
    color: '#a3a3a3',
  },
});
