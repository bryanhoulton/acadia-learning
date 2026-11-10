import React, { useState } from 'react';

import { Check } from 'lucide-react-native';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Voices } from '@/utils/voices';

interface VoiceSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  currentVoiceId: string;
  onVoiceChange: (voiceId: string) => void;
}

export function VoiceSettingsModal({
  visible,
  onClose,
  currentVoiceId,
  onVoiceChange,
}: VoiceSettingsModalProps) {
  const [selectedVoiceId, setSelectedVoiceId] = useState(currentVoiceId);
  const insets = useSafeAreaInsets();

  const handleSave = () => {
    onVoiceChange(selectedVoiceId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 24 }]}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.headerButton}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Voice Settings</Text>
          <Pressable onPress={handleSave} hitSlop={8}>
            <Text style={[styles.headerButton, styles.headerButtonPrimary]}>
              Done
            </Text>
          </Pressable>
        </View>

        {/* Voice List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <Text style={styles.sectionTitle}>Select Voice</Text>
          {Object.entries(Voices).map(([voiceId, voiceName]) => {
            const isSelected = selectedVoiceId === voiceId;
            return (
              <Pressable
                key={voiceId}
                onPress={() => setSelectedVoiceId(voiceId)}
                style={[styles.option, isSelected && styles.optionSelected]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {voiceName}
                </Text>
                {isSelected && <Check size={20} color="#3b82f6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    fontSize: 17,
    color: "#3b82f6",
  },
  headerButtonPrimary: {
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#171717",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#737373",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  optionSelected: {
    backgroundColor: "#eff6ff",
    borderColor: "#3b82f6",
  },
  optionText: {
    fontSize: 17,
    color: "#171717",
  },
  optionTextSelected: {
    fontWeight: "600",
  },
});
