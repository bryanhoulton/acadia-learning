import { kea } from 'kea';
import { toast } from 'sonner';

import type {
  LooseActionPayload,
  Playground,
  PlaygroundEvent,
} from '../../components/playground';
import {
  AgentClient,
  AgentState,
} from '../../lib/AgentClient';
import {
  ConnectionState,
  Room,
} from '../../types/livekit';
import client from '../../utils/api';
import { StreamHandler } from '../../utils/streams';
import { authLogic } from '../authLogic';
import type { agentLogicType } from './agentLogicType';

const DEFAULT_VOICE_ID = "cartesia/228fca29-3a0a-435c-8728-5cb483251068";

export const agentLogic = kea<agentLogicType>({
  path: ["agent"],
  connect: [authLogic],

  actions: {
    // Token management
    loadToken: true,
    setToken: (token: string | null) => ({ token }),
    setTokenLoading: (loading: boolean) => ({ loading }),

    // Connection
    connect: true,
    disconnect: true,

    // State updates (called by AgentClient callbacks)
    setConnectionState: (state: ConnectionState) => ({ state }),
    setAgentState: (state: AgentState) => ({ state }),
    setHasReceivedAgentState: (received: boolean) => ({ received }),

    // Playground
    setPlayground: (
      playground: Playground | null,
      sendToAgent: boolean = false
    ) => ({
      playground,
      sendToAgent,
    }),
    triggerPlaygroundAction: (action: LooseActionPayload) => ({ action }),
    clearPlaygroundAction: true,
    sendPlaygroundEvent: (event: PlaygroundEvent) => ({ event }),

    // Voice
    setVoiceId: (voiceId: string) => ({ voiceId }),

    // Transcript
    setTranscript: (transcript: string | null, isCommitted: boolean) => ({
      transcript,
      isCommitted,
    }),
    clearTranscript: true,

    // Error handling
    setError: (error: string | null) => ({ error }),

    // Reset agent state (when remote participant leaves)
    resetAgentState: true,

    // Agent left call intentionally
    setAgentLeftCall: (left: boolean) => ({ left }),

    // StreamHandler (set when AgentClient connects)
    setStreamHandler: (streamHandler: StreamHandler | null) => ({
      streamHandler,
    }),
  },

  reducers: () => ({
    token: [
      null as string | null,
      {
        setToken: (_, { token }) => token,
        disconnect: () => null,
      },
    ],
    tokenLoading: [
      false,
      {
        loadToken: () => true,
        setToken: () => false,
        setTokenLoading: (_, { loading }) => loading,
      },
    ],
    connectionState: [
      ConnectionState.Disconnected as ConnectionState,
      {
        setConnectionState: (_, { state }) => state,
        disconnect: () => ConnectionState.Disconnected,
      },
    ],
    agentState: [
      "away" as AgentState,
      {
        setAgentState: (_, { state }) => state,
        resetAgentState: () => "away",
        disconnect: () => "away",
      },
    ],
    hasReceivedAgentState: [
      false,
      {
        setHasReceivedAgentState: (_, { received }) => received,
        setAgentState: () => true,
        resetAgentState: () => false,
        disconnect: () => false,
      },
    ],
    playground: [
      null as Playground | null,
      {
        setPlayground: (_, { playground }) => playground,
      },
    ],
    pendingPlaygroundAction: [
      null as LooseActionPayload | null,
      {
        triggerPlaygroundAction: (_, { action }) => action,
        clearPlaygroundAction: () => null,
      },
    ],
    voiceId: [
      DEFAULT_VOICE_ID as string,
      {
        setVoiceId: (_, { voiceId }) => voiceId,
      },
    ],
    transcript: [
      null as string | null,
      {
        setTranscript: (_, { transcript }) => transcript,
        clearTranscript: () => null,
      },
    ],
    transcriptCommitted: [
      false,
      {
        setTranscript: (_, { isCommitted }) => isCommitted,
        clearTranscript: () => false,
      },
    ],
    error: [
      null as string | null,
      {
        setError: (_, { error }) => error,
        connect: () => null,
      },
    ],
    agentLeftCall: [
      false,
      {
        setAgentLeftCall: (_, { left }) => left,
        connect: () => false, // Reset when reconnecting
      },
    ],
    streamHandler: [
      null as StreamHandler | null,
      {
        setStreamHandler: (_, { streamHandler }) => streamHandler,
        disconnect: () => null,
      },
    ],
  }),

  selectors: {
    isConnected: [
      (s) => [s.connectionState],
      (state) => state === ConnectionState.Connected,
    ],
    isConnecting: [
      (s) => [s.connectionState],
      (state) =>
        state === ConnectionState.Connecting ||
        state === ConnectionState.Reconnecting,
    ],
    /**
     * Combines playground with pendingPlaygroundAction for the renderer.
     * The Playground type now includes pendingAction in its discriminated union.
     */
    playgroundWithAction: [
      (s) => [s.playground, s.pendingPlaygroundAction],
      (playground, pendingAction): Playground | null =>
        playground ? ({ ...playground, pendingAction } as Playground) : null,
    ],
  },

  listeners: ({ actions, values, cache }) => ({
    loadToken: async () => {
      const account = authLogic.values.account;

      // Check if account is locked
      if (account?.is_locked && !account?.stripe_customer_id) {
        toast.error(
          "Account is locked. Please upgrade to a paid plan to start new classroom sessions."
        );
        actions.setTokenLoading(false);
        return;
      }

      const { data, error } = await client.GET("/api/lms/calendars/token/");
      if (error) {
        console.error("[agentLogic] Failed to fetch token:", error.error);
        toast.error(error.error || "Failed to start session");
        actions.setTokenLoading(false);
        return;
      }

      if (authLogic.values.user?.voice_id) {
        actions.setVoiceId(authLogic.values.user.voice_id);
      }

      actions.setToken(data.token);
    },

    connect: async () => {
      const { token, playground, voiceId } = values;
      if (!token) {
        console.error("[agentLogic] Cannot connect without token");
        actions.setError("No token available");
        return;
      }

      // Create AgentClient if not exists
      if (!cache.agentClient) {
        console.log("[agentLogic] Creating AgentClient");
        cache.agentClient = new AgentClient({
          serverUrl: import.meta.env.VITE_LIVEKIT_URL,
        });

        // Set initial state (including account's playground feature flags)
        const account = authLogic.values.account;
        cache.agentClient.setInitialState({
          playground,
          voiceId,
          playgroundsEnabled: account?.playgrounds_enabled ?? false,
          speedLabEnabled: account?.speed_lab_enabled ?? false,
        });

        // Wire up callbacks
        cache.agentClient.setCallbacks({
          onConnectionStateChange: (state: ConnectionState) => {
            actions.setConnectionState(state);
          },
          onAgentStateChange: (state: AgentState) => {
            actions.setAgentState(state);
          },
          onPlaygroundChange: (playground: Playground) => {
            actions.setPlayground(playground, false);
          },
          onPlaygroundAction: (action: LooseActionPayload) => {
            actions.triggerPlaygroundAction(action);
          },
          onTranscriptChange: (
            transcript: string | null,
            isCommitted: boolean
          ) => {
            actions.setTranscript(transcript, isCommitted);
          },
          onError: (error: Error) => {
            actions.setError(error.message);
          },
          onAgentLeftCall: () => {
            console.log(
              "[agentLogic] onAgentLeftCall callback fired! Setting agentLeftCall to true"
            );
            actions.setAgentLeftCall(true);
          },
        });
      }

      try {
        await cache.agentClient.connect(token);
        // Expose the streamHandler for other logics to use
        const streamHandler = cache.agentClient.lkStreamHandler;
        console.log(
          "[agentLogic] After connect, streamHandler:",
          streamHandler ? "exists" : "null"
        );
        if (streamHandler) {
          console.log("[agentLogic] Setting streamHandler in state");
          actions.setStreamHandler(streamHandler);
        }
      } catch (e) {
        console.error("[agentLogic] Connection failed:", e);
        actions.setError((e as Error).message);
      }
    },

    disconnect: async () => {
      if (cache.agentClient) {
        await cache.agentClient.disconnect();
      }
    },

    // When playground changes from UI, send to agent
    setPlayground: ({ playground, sendToAgent }) => {
      if (sendToAgent && cache.agentClient) {
        cache.agentClient.setPlayground(playground, true);
      }
    },

    // When playground emits an event, send to agent (triggers interrupt)
    sendPlaygroundEvent: ({ event }) => {
      if (cache.agentClient) {
        cache.agentClient.sendPlaygroundEvent(event);
      }
    },

    // When voice changes, send to agent and persist
    setVoiceId: async ({ voiceId }) => {
      if (cache.agentClient) {
        cache.agentClient.setVoice(voiceId);
      }

      // Persist to backend
      const userId = authLogic.values.user?.id;
      if (userId) {
        try {
          await client.PATCH("/api/lms/accounts/profiles/{id}/", {
            params: { path: { id: userId } },
            body: { voice_id: voiceId },
          });
        } catch (e) {
          console.error("[agentLogic] Failed to persist voice ID:", e);
        }
      }
    },

    clearTranscript: () => {
      if (cache.agentClient) {
        cache.agentClient.clearTranscript();
      }
    },

    resetAgentState: () => {
      if (cache.agentClient) {
        cache.agentClient.resetAgentState();
      }
    },
  }),

  events: ({ cache }) => ({
    beforeUnmount: () => {
      if (cache.agentClient) {
        cache.agentClient.destroy();
        cache.agentClient = null;
      }
    },
  }),
});

// Helper to get the room from agentLogic (for RoomContext.Provider)
export function getAgentRoom(): Room | null {
  const logic = agentLogic.findMounted();
  if (!logic) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (logic.cache as any).agentClient?.lkRoom ?? null;
}
