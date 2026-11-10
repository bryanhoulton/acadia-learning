import React from 'react';

import {
  Camera,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  Settings,
} from 'lucide-react-native';
import {
  TouchableOpacity,
  View,
} from 'react-native';

interface ClassroomMenuProps {
  microphoneEnabled: boolean;
  onToggleMicrophone: () => void;
  onLeave: () => void;
  onSettings?: () => void;
  onCamera?: () => void;
  onChat?: () => void;
}

export function ClassroomMenu({
  microphoneEnabled,
  onToggleMicrophone,
  onLeave,
  onSettings,
  onCamera,
  onChat,
}: ClassroomMenuProps) {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 40,
        alignSelf: "center",
        backgroundColor: "#ffffff",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        borderWidth: 1,
        borderColor: microphoneEnabled ? "#22c55e" : "#ef4444",
        zIndex: 1,
      }}
    >
      <TouchableOpacity
        onPress={onLeave}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
        }}
        activeOpacity={0.7}
      >
        <LogOut
          size={20}
          color="#374151"
          style={{ transform: [{ rotate: "180deg" }] }}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onToggleMicrophone}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
        }}
        activeOpacity={0.7}
      >
        {microphoneEnabled ? (
          <Mic size={20} color="#374151" />
        ) : (
          <MicOff size={20} color="#ef4444" />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          if (onCamera) {
            onCamera();
          } else {
            console.log("Camera pressed");
          }
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
        }}
        activeOpacity={0.7}
      >
        <Camera size={20} color="#374151" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          if (onChat) {
            onChat();
          } else {
            console.log("Chat pressed");
          }
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
        }}
        activeOpacity={0.7}
      >
        <MessageCircle size={20} color="#374151" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          if (onSettings) {
            onSettings();
          } else {
            console.log("Settings pressed");
          }
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "transparent",
        }}
        activeOpacity={0.7}
      >
        <Settings size={20} color="#374151" />
      </TouchableOpacity>
    </View>
  );
}
