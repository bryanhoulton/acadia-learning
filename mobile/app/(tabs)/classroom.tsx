import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ConnectionState,
  Track,
} from 'livekit-client';
import {
  Alert,
  Pressable,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AudioVisualizer } from '@/components/AudioVisualizer';
import { CameraView } from '@/components/CameraView';
import { CanvasRenderer } from '@/components/canvas/CanvasRenderer';
import { ChatPanel, type ChatMessage } from '@/components/ChatPanel';
import { ClassroomMenu } from '@/components/ClassroomMenu';
import {
  type AgentState,
  Faces,
} from '@/components/Faces';
import { Loader } from '@/components/Loader';
import { VoiceSettingsModal } from '@/components/VoiceSettingsModal';
import { useAuthStore } from '@/stores/auth.store';
import { Block } from '@/types/blocks';
import client from '@/utils/api';
import { StreamHandler } from '@/utils/streams';
import { DEFAULT_VOICE_ID } from '@/utils/voices';
import {
  AudioSession,
  LiveKitRoom,
  useRoomContext,
  useTracks,
  useTrackVolume,
} from '@livekit/react-native';

function PulsingCircle({ volume }: { volume: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (volume > 0.05) {
      // Scale from 1.0 (220px) to 1.6 (352px) based on volume
      // This gives us a range of ~220px to ~350px
      const targetScale = 1 + volume * 0.6;
      scale.value = withTiming(targetScale, { duration: 150 });

      // Opacity scales from 0.4 (low volume) to 0.1 (high volume)
      const targetOpacity = 0.4 - volume * 0.3;
      opacity.value = withTiming(Math.max(0.1, Math.min(0.4, targetOpacity)), {
        duration: 150,
      });
    } else {
      scale.value = withTiming(1, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [volume, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: "#22c55e",
        },
        animatedStyle,
      ]}
    />
  );
}

function ClassroomContent({ onLeave }: { onLeave: () => void }) {
  // Keep the screen awake for the entire time the classroom is mounted.
  // Without this, iOS locks the screen, suspends the JS thread, and the
  // student's mic stops being transcribed even though the agent's audio keeps
  // playing — the session becomes one-directional until the user manually
  // leaves and rejoins.
  useKeepAwake();

  const room = useRoomContext();
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const account = useAuthStore((state) => state.account);
  const selectedProfileId = useAuthStore((state) => state.selectedProfileId);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [canvasBlocks, setCanvasBlocks] = useState<Block[]>([]);

  // Triple-tap detection for debug panel toggle (admin only)
  const tapCount = useRef(0);
  const tapTimer = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [voiceSettingsVisible, setVoiceSettingsVisible] = useState(false);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hasSentInitialVoice, setHasSentInitialVoice] = useState(false);
  const streamHandlerRef = useRef<StreamHandler | null>(null);
  const lastAgentStateTimestampRef = useRef(0);

  // Track user microphone
  const tracks = useTracks([Track.Source.Microphone]);
  const localTrack = tracks.find(
    (track) =>
      track.participant.isLocal && track.source === Track.Source.Microphone
  );

  // Track agent audio (remote participant)
  const agentTrack = tracks.find(
    (track) =>
      !track.participant.isLocal && track.source === Track.Source.Microphone
  );
  const agentVolume = useTrackVolume(agentTrack?.publication?.audioTrack);

  // Load voice preference and canvas blocks from user profile
  useEffect(() => {
    const selectedProfile = account?.profiles.find(
      (p) => p.id === selectedProfileId
    );
    if (selectedProfile?.voice_id) {
      setVoiceId(selectedProfile.voice_id);
    }
    if (selectedProfile?.classroom_canvas_blocks) {
      setCanvasBlocks(selectedProfile.classroom_canvas_blocks as Block[]);
    }
  }, [account, selectedProfileId]);

  // Send voice to agent when connected
  useEffect(() => {
    if (!room || !voiceId || hasSentInitialVoice) return;

    const sendVoiceToAgent = async () => {
      try {
        if (room.state === ConnectionState.Connected) {
          console.log("Sending initial voice to agent:", voiceId);

          await room.localParticipant.sendText(voiceId, {
            topic: "voice",
          });

          setHasSentInitialVoice(true);
        }
      } catch (error) {
        console.error("Error sending voice to agent:", error);
      }
    };

    sendVoiceToAgent();
  }, [room, voiceId, hasSentInitialVoice]);

  // Toggle microphone
  const toggleMicrophone = useCallback(async () => {
    if (!room) return;

    const enabled = !microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicrophoneEnabled(enabled);
  }, [room, microphoneEnabled]);

  // Handle voice change
  const handleVoiceChange = useCallback(
    async (newVoiceId: string) => {
      setVoiceId(newVoiceId);

      // Send to agent via text stream (not data packets)
      if (room) {
        try {
          await room.localParticipant.sendText(newVoiceId, {
            topic: "voice",
          });

          console.log("Voice changed and sent to agent:", newVoiceId);
        } catch (error) {
          console.error("Error sending voice to agent:", error);
        }
      }

      // Save to backend
      if (selectedProfileId) {
        try {
          await client.PATCH("/api/lms/accounts/profiles/{id}/", {
            params: { path: { id: selectedProfileId } },
            body: { voice_id: newVoiceId },
          });
          console.log("Voice saved to backend");
        } catch (error) {
          console.error("Error saving voice to backend:", error);
        }
      }
    },
    [room, selectedProfileId]
  );

  // Handle camera toggle
  const handleCameraToggle = useCallback(() => {
    setCameraActive((prev) => !prev);
  }, []);

  // Debug logging helper
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs((prev) => [...prev.slice(-9), `[${timestamp}] ${message}`]);
    console.log(message);
  }, []);

  // Handle triple-tap to toggle debug panel (admin only)
  const handleTap = useCallback(() => {
    if (!account?.is_admin) return;

    tapCount.current += 1;

    if (tapCount.current === 3) {
      setShowDebugPanel((prev) => !prev);
      tapCount.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
    } else {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
      }, 500);
    }
  }, [account?.is_admin]);

  // Handle photo taken
  const handlePhotoTaken = useCallback(
    async (base64: string) => {
      addDebugLog(`📸 Photo taken, base64 length: ${base64.length}`);

      if (!room) {
        addDebugLog("❌ Room not available");
        console.error("Room not available");
        return;
      }

      addDebugLog(`📡 Room state: ${room.state}`);
      addDebugLog(`👤 Local participant: ${room.localParticipant.identity}`);

      // Log remote participants
      const remoteParticipants = Array.from(room.remoteParticipants.values());
      addDebugLog(`🌐 Remote participants: ${remoteParticipants.length}`);
      remoteParticipants.forEach((p, i) => {
        addDebugLog(`  ${i + 1}. ${p.identity} (${p.sid})`);
      });

      try {
        // Create a data payload with the photo
        const payload = JSON.stringify({
          type: "photo",
          data: base64,
          timestamp: Date.now(),
        });

        addDebugLog(`📦 Payload size: ${payload.length} chars`);
        addDebugLog(`📤 Sending photo via text stream with topic: "photo"`);

        // Send photo via text stream (not data packets!)
        await room.localParticipant.sendText(payload, {
          topic: "photo",
        });

        addDebugLog("✅ Photo sent through text stream");
      } catch (error) {
        addDebugLog(`❌ Error: ${error}`);
        console.error("Error sending photo:", error);
        Alert.alert("Error", "Failed to send photo");
      }
    },
    [room, addDebugLog]
  );

  // Handle canvas changes
  const handleCanvasChange = useCallback(
    (updatedBlocks: Block[]) => {
      if (!room) return;

      try {
        // Send canvas update to agent via text stream
        const payload = JSON.stringify(updatedBlocks);

        room.localParticipant.sendText(payload, {
          topic: "canvas",
        });

        console.log("Canvas update sent to agent");
      } catch (error) {
        console.error("Error sending canvas update:", error);
      }
    },
    [room]
  );

  useEffect(() => {
    if (!room) return;

    let streamHandler: StreamHandler | null = null;
    let initialized = false;

    console.log("Room state:", room.state);
    console.log("Room participants:", room.numParticipants);

    // Enable microphone when room is connected
    const enableMicrophone = async () => {
      try {
        // Wait for room to be fully connected
        if (room.state !== ConnectionState.Connected) {
          console.log("Waiting for room to connect...");
          await new Promise<void>((resolve) => {
            const handler = (state: ConnectionState) => {
              console.log("Room connection state changed:", state);
              if (state === ConnectionState.Connected) {
                room.off("connectionStateChanged", handler);
                resolve();
              }
            };
            room.on("connectionStateChanged", handler);
          });
        }

        if (!initialized) {
          console.log("Room connected, enabling microphone...");

          // Enable the microphone in LiveKit
          await room.localParticipant.setMicrophoneEnabled(true);
          console.log("Microphone enabled");
          initialized = true;

          // Log track publications after a short delay
          setTimeout(() => {
            const tracks = Array.from(
              room.localParticipant.trackPublications.values()
            );
            console.log(
              "Published tracks:",
              tracks.map((t) => ({
                kind: t.kind,
                source: t.source,
                isMuted: t.isMuted,
                trackSid: t.trackSid,
              }))
            );
          }, 1000);
        }
      } catch (error) {
        console.error("Error enabling microphone:", error);
        Alert.alert(
          "Microphone Error",
          `Failed to enable microphone: ${error}`
        );
      }
    };
    enableMicrophone();

    // Initialize stream handler
    streamHandler = new StreamHandler(room);
    streamHandlerRef.current = streamHandler;

    // Register handler for agent state
    streamHandler.register("classroom", "agent-state", (data: string) => {
      try {
        const json = JSON.parse(data);

        // Only update if this is a newer state
        if (json.timestamp > lastAgentStateTimestampRef.current) {
          console.log("Agent state changed:", json);
          lastAgentStateTimestampRef.current = json.timestamp;
          setAgentState(json.state as AgentState);
        }
      } catch (error) {
        console.error("Error parsing agent state:", error);
      }
    });

    // Register handler for canvas updates
    streamHandler.register("classroom", "canvas", (data: string) => {
      try {
        const blocks = JSON.parse(data);
        setCanvasBlocks(blocks);
      } catch (error) {
        console.error("Error parsing canvas blocks:", error);
      }
    });

    // Register handler for chat messages
    streamHandler.register("classroom", "chat", (data: string, sender: string) => {
      const newMessage: ChatMessage = {
        message: data,
        sender: sender,
        timestamp: Math.floor(Date.now() / 1000),
      };
      setChatMessages((prev) => [...prev, newMessage]);
    });

    return () => {
      if (streamHandler) {
        streamHandler.unregister("classroom", "agent-state");
        streamHandler.unregister("classroom", "canvas");
        streamHandler.unregister("classroom", "chat");
      }
    };
  }, [room]);

  const hasCanvas = canvasBlocks.length > 0;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
        padding: hasCanvas ? 16 : 0,
      }}
    >
      {/* Agent audio visualizer - positioned at top, full width, reaching down */}
      {agentTrack?.publication?.audioTrack && (
        <AudioVisualizer
          track={agentTrack.publication.audioTrack}
          enabled={true}
          color="#22c55e"
          inverted={true}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            width: "100%",
            zIndex: 0,
          }}
        />
      )}

      {/* Show camera if active, otherwise show canvas or face */}
      {cameraActive ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2,
          }}
        >
          <CameraView
            onClose={() => setCameraActive(false)}
            onPhotoTaken={handlePhotoTaken}
          />
        </View>
      ) : hasCanvas ? (
        <View
          style={{
            flex: 1,
            width: "100%",
            minHeight: 0,
            paddingBottom: 100,
            paddingTop: 48,
          }}
        >
          <CanvasRenderer
            blocks={canvasBlocks}
            onBlocksChange={handleCanvasChange}
          />
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {agentState ? (
            <>
              <Pressable onPress={handleTap}>
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {/* Pulsing green circle behind face when speaking */}
                  {agentState === "speaking" && (
                    <PulsingCircle volume={agentVolume} />
                  )}
                  <Faces state={agentState} size={200} />
                </View>
                <Text
                  style={{
                    marginTop: 24,
                    fontSize: 18,
                    fontWeight: "600",
                    color: "#374151",
                    textAlign: "center",
                  }}
                >
                  {agentState.charAt(0).toUpperCase() + agentState.slice(1)}
                </Text>
              </Pressable>
            </>
          ) : (
            <Loader
              size={40}
              text="Connecting..."
              inline={false}
              containerStyle={{ flex: 0 }}
              textStyle={{
                marginTop: 24,
                fontSize: 18,
                fontWeight: "600",
                color: "#374151",
              }}
            />
          )}
        </View>
      )}

      {/* User audio visualizer - positioned at bottom, full width, behind menu */}
      {localTrack?.publication?.audioTrack && (
        <AudioVisualizer
          track={localTrack.publication.audioTrack}
          enabled={microphoneEnabled}
          color="#3b82f6"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            width: "100%",
            zIndex: 0,
          }}
        />
      )}

      {/* Floating bottom menu - hide when camera is active */}
      {!cameraActive && (
        <ClassroomMenu
          microphoneEnabled={microphoneEnabled}
          onToggleMicrophone={toggleMicrophone}
          onLeave={onLeave}
          onCamera={handleCameraToggle}
          onSettings={() => setVoiceSettingsVisible(true)}
          onChat={() => setChatVisible(true)}
        />
      )}

      {/* Voice Settings Modal */}
      <VoiceSettingsModal
        visible={voiceSettingsVisible}
        onClose={() => setVoiceSettingsVisible(false)}
        currentVoiceId={voiceId}
        onVoiceChange={handleVoiceChange}
      />

      {/* Chat Panel */}
      <ChatPanel
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        messages={chatMessages}
      />

      {/* Debug Panel - Only show if enabled and there are logs */}
      {showDebugPanel && debugLogs.length > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: 100,
            left: 10,
            right: 10,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            padding: 12,
            borderRadius: 8,
            maxHeight: 300,
            zIndex: 1000,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "#22c55e",
                  fontSize: 12,
                  fontWeight: "700",
                  fontFamily: "monospace",
                }}
              >
                DEBUG LOGS
              </Text>
              <Text
                style={{
                  color: "#94a3b8",
                  fontSize: 9,
                  fontFamily: "monospace",
                  marginTop: 2,
                }}
              >
                Triple-tap face to hide
              </Text>
            </View>
            <Text
              onPress={() => setDebugLogs([])}
              style={{
                color: "#ef4444",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              CLEAR
            </Text>
          </View>
          {debugLogs.map((log, index) => (
            <Text
              key={index}
              style={{
                color: "#ffffff",
                fontSize: 10,
                fontFamily: "monospace",
                marginBottom: 4,
              }}
            >
              {log}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ClassroomScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [shouldAutoLoad, setShouldAutoLoad] = useState(true);
  const account = useAuthStore((state) => state.account);

  // Explicitly manage the LiveKit AudioSession for the duration of the
  // classroom screen so iOS keeps the playAndRecord category active and the
  // microphone keeps capturing even if the screen briefly locks.
  useEffect(() => {
    AudioSession.startAudioSession().catch((error) => {
      console.error("Failed to start audio session:", error);
    });
    return () => {
      AudioSession.stopAudioSession().catch((error) => {
        console.error("Failed to stop audio session:", error);
      });
    };
  }, []);

  const loadToken = useCallback(async () => {
    if (!shouldAutoLoad) return;

    // Check if user has sent an SMS first
    if (!account?.has_texted_tutor) {
      Alert.alert(
        "Text Required",
        "Please send a text message to your AI tutor to get started before joining a session.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/"),
          },
        ]
      );
      return;
    }

    // Check if account is locked and not paid
    if (account?.is_locked && !account?.stripe_customer_id) {
      Alert.alert(
        "Account Locked",
        "Your account is locked. Please upgrade to a paid plan to start new classroom sessions.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/"),
          },
        ]
      );
      return;
    }

    const { data, error } = await client.GET("/api/lms/calendars/token/");
    if (error) {
      console.error("Failed to fetch token:", error.error);
      Alert.alert(
        "Error",
        error.error || "Failed to start session. Please try again.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/"),
          },
        ]
      );
      return;
    }
    setToken(data.token);
  }, [shouldAutoLoad, account]);

  const handleLeave = useCallback(() => {
    setShouldAutoLoad(false);
    setToken(null);
    // Navigate back to home/calendar tab
    router.replace("/");
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  if (!token) {
    return <Loader text="Loading..." />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <LiveKitRoom
        audio={true}
        video={false}
        token={token}
        serverUrl={process.env.EXPO_PUBLIC_LIVEKIT_URL}
        connect={true}
        options={{
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        }}
      >
        <ClassroomContent onLeave={handleLeave} />
      </LiveKitRoom>
    </>
  );
}
