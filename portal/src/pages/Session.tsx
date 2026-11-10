import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useActions,
  useValues,
} from 'kea';
import {
  ConnectionState,
  Track,
} from 'livekit-client';
import { motion } from 'motion/react';
import {
  Modal,
  Select,
} from 'slate-ui';

import {
  useConnectionState,
  useEnsureRoom,
  useMultibandTrackVolume,
  useRemoteParticipants,
  useTrackToggle,
  useTrackVolume,
  useVoiceAssistant,
} from '@livekit/components-react';

import { AgentAvatar } from '../components/AgentAvatar';
import { AudioTester } from '../components/AudioTester';
import { Banner } from '../components/Banner';
import { FloatingChat } from '../components/chat/FloatingChat';
import { ConnectionStatusType } from '../components/Connection';
import { AgentStates } from '../components/Faces';
import { MicrophoneWarning } from '../components/MicrophoneWarning';
import {
  type Playground,
  PlaygroundRenderer,
} from '../components/playground';
import { SessionMenu } from '../components/SessionMenu';
import { agentLogic } from '../logic/agent/agentLogic';
import { Voices } from '../utils/voices';

/**
 * Check if a playground will actually render content.
 * Matches the logic in PlaygroundRenderer.
 */
function hasPlaygroundContent(playground: Playground | null): boolean {
  if (!playground) return false;
  if (playground.type === "canvas") {
    return !!(playground.state.blocks && playground.state.blocks.length > 0);
  }
  // Other playground types always render
  return true;
}

/**
 * Session - Main session component
 *
 * Uses agentLogic for all agent-related state and communication.
 * LiveKit hooks are used for audio/video functionality.
 */
export function Session({
  onLeave,
  onReconnect,
}: {
  onLeave: () => void;
  onReconnect?: () => void;
}) {
  // Get the room from LiveKit context (provided by RoomContext.Provider in Room.tsx)
  const room = useEnsureRoom();

  // Agent state from Kea
  const {
    agentState,
    hasReceivedAgentState,
    playgroundWithAction: playground,
    voiceId,
    transcript,
    transcriptCommitted,
    agentLeftCall,
  } = useValues(agentLogic);
  const {
    setPlayground,
    clearPlaygroundAction,
    setVoiceId,
    clearTranscript,
    resetAgentState,
    sendPlaygroundEvent,
  } = useActions(agentLogic);

  // LiveKit hooks for audio/video
  const roomConnectionState = useConnectionState(room);
  const remoteParticipants = useRemoteParticipants();
  const remoteParticipantExists = remoteParticipants.length > 0;

  const { toggle, enabled, track } = useTrackToggle({
    source: Track.Source.Microphone,
  });
  const { audioTrack, agent } = useVoiceAssistant();

  // Track previous remote participant state to detect when they leave
  const prevRemoteParticipantExistsRef = useRef(remoteParticipantExists);
  useEffect(() => {
    // If remote participant just left, reset agent state
    if (prevRemoteParticipantExistsRef.current && !remoteParticipantExists) {
      resetAgentState();
    }
    prevRemoteParticipantExistsRef.current = remoteParticipantExists;
  }, [remoteParticipantExists, resetAgentState]);

  // Derive connection status from room state and agent presence
  const connectionStatus = useMemo<ConnectionStatusType>(() => {
    // If agent intentionally left, treat as disconnected
    if (agentLeftCall) {
      return "disconnected";
    }
    // If room itself is disconnected
    if (roomConnectionState === ConnectionState.Disconnected) {
      return "disconnected";
    }
    // If room is in the process of connecting
    if (
      roomConnectionState === ConnectionState.Connecting ||
      roomConnectionState === ConnectionState.Reconnecting
    ) {
      return "connecting";
    }
    // Room is connected - now check agent status
    if (!remoteParticipantExists) {
      // No agent in room yet = still connecting (waiting for agent to join)
      return "connecting";
    }
    // Agent is in room but we haven't received any signal yet
    if (!hasReceivedAgentState) {
      return "connecting";
    }
    // Agent is connected and responsive
    return "connected";
  }, [
    roomConnectionState,
    remoteParticipantExists,
    hasReceivedAgentState,
    agentLeftCall,
  ]);

  const userVolume = useTrackVolume(track?.audioTrack, {
    smoothingTimeConstant: 0.5,
  });
  const userVolumeBands = useMultibandTrackVolume(track?.audioTrack, {
    bands: 5,
    loPass: 100,
    hiPass: 600,
  });
  const agentVolume = useTrackVolume(audioTrack, {
    smoothingTimeConstant: 0.5,
  });
  const agentVolumeBands = useMultibandTrackVolume(audioTrack, {
    bands: 7,
    loPass: 100,
    hiPass: 600,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const playgroundContainerRef = useRef<HTMLDivElement>(null);

  // Clear transcript after it's committed (after the green flash animation)
  useEffect(() => {
    if (transcriptCommitted) {
      const timer = setTimeout(() => {
        clearTranscript();
      }, 1500); // Wait for green->gray animation (1s) + brief display
      return () => clearTimeout(timer);
    }
  }, [transcriptCommitted, clearTranscript]);

  const handleLeave = () => {
    clearTranscript();
    resetAgentState();
    onLeave();
  };

  const derivedAgentState: AgentStates =
    connectionStatus === "connecting"
      ? "connecting"
      : agent
        ? agentState
        : "away";

  return (
    <>
      <MicrophoneWarning onOpenSettings={() => setShowSettings(true)} />

      <div className="w-full h-full flex flex-col relative">
        {/* Logo banner - absolutely positioned top left */}
        <div className="absolute top-0 left-0 z-20 p-2">
          <Banner />
        </div>

        {/* Main content: Centered layout - stacked on small screens, side by side on large */}
        <div className="flex-grow flex items-center justify-center overflow-hidden min-h-0">
          <div className="flex flex-col lg:flex-row items-stretch justify-center gap-4 lg:gap-8 w-full h-full px-4">
            {/* Agent face */}
            <motion.div
              className="flex items-center justify-center shrink-0"
              initial={false}
              animate={{
                width: hasPlaygroundContent(playground) ? "auto" : "100%",
              }}
              transition={{
                duration: 0.4,
                ease: [0.4, 0, 0.2, 1],
              }}
            >
              <AgentAvatar
                state={derivedAgentState}
                volume={agentVolume}
                volumeBands={agentVolumeBands}
                hasLeftCall={agentLeftCall}
              />
            </motion.div>

            {/* Playground */}
            {hasPlaygroundContent(playground) && (
              <motion.div
                className="flex h-full items-center justify-center w-full lg:w-[60vw] flex-1 lg:flex-initial min-h-0"
                ref={playgroundContainerRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <div className="w-full h-full max-w-4xl min-h-0 px-0 py-2 lg:p-4">
                  <PlaygroundRenderer
                    playground={playground}
                    onChange={(p) => setPlayground(p, true)}
                    onActionComplete={clearPlaygroundAction}
                    onEvent={sendPlaygroundEvent}
                  />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Session menu - bottom of stack */}
        <SessionMenu
          connectionStatus={connectionStatus}
          microphoneEnabled={enabled}
          userVolume={userVolume}
          userVolumeBands={userVolumeBands}
          chatOpen={chatOpen}
          hasUnreadChat={hasUnreadChat}
          onLeave={handleLeave}
          onReconnect={onReconnect}
          onToggleMicrophone={toggle}
          onOpenSettings={() => setShowSettings(true)}
          onToggleChat={() => setChatOpen((v) => !v)}
          transcript={transcript}
          transcriptCommitted={transcriptCommitted}
        />

        <Modal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          className="p-4 flex flex-col gap-4"
        >
          <h1 className="text-2xl font-bold">Settings</h1>

          {connectionStatus === "connected" && <AudioTester />}

          <Select
            items={Object.entries(Voices).map(([id, name]) => ({
              id,
              name,
            }))}
            label="Voice"
            value={voiceId}
            onChange={(v) => v && setVoiceId(v)}
          />
        </Modal>
      </div>

      {room && (
        <FloatingChat
          room={room}
          agentConnected={!!agent}
          open={chatOpen}
          onOpenChange={setChatOpen}
          onUnreadChange={setHasUnreadChat}
        />
      )}
    </>
  );
}
