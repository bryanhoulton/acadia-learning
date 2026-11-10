import { useState } from 'react';

import { Check, ChevronDown } from 'lucide-react-native';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from './lib/utils';

export interface SelectOption<T = string> {
  label: string;
  value: T;
}

export interface SelectProps<T = string> {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  label?: string;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  className?: string;
}

export interface SelectModalProps<T = string> {
  open: boolean;
  onClose: () => void;
  options: SelectOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
}

export function SelectModal<T = string>({
  open,
  onClose,
  options,
  value,
  onSelect,
}: SelectModalProps<T>) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Drag Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={String(option.value) + String(index)}
                onPress={() => onSelect(option.value)}
                style={[styles.option, isSelected && styles.optionSelected]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && <Check size={20} color="#ffffff" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function Select<T = string>({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  label,
  error = false,
  errorMessage,
  disabled = false,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayText = selectedOption?.label || placeholder;

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setTimeout(() => setOpen(false), 200);
  };

  return (
    <View className={className}>
      {label && (
        <Text className="text-sm pl-2 font-semibold text-neutral-900 mb-1">
          {label}
        </Text>
      )}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={[
          styles.trigger,
          error && styles.triggerError,
          disabled && styles.triggerDisabled,
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            !selectedOption && styles.triggerPlaceholder,
          ]}
        >
          {displayText}
        </Text>
        <ChevronDown size={20} color="#737373" />
      </Pressable>

      <SelectModal
        open={open}
        onClose={() => setOpen(false)}
        options={options}
        value={value}
        onSelect={handleSelect}
      />

      {error && errorMessage && (
        <Text className="text-xs text-error-500 mt-1">{errorMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d4d4d4",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: "#3b82f6",
  },
  optionText: {
    fontSize: 17,
    color: "#525252",
  },
  optionTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
  },

  // Trigger styles
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 9999,
  },
  triggerError: {
    borderColor: "#ef4444",
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    fontSize: 17,
    color: "#171717",
  },
  triggerPlaceholder: {
    color: "#a3a3a3",
  },
});
