/**
 * AgentClient - Owns LiveKit Room and all agent communication
 *
 * This is a pure TypeScript class with no React or Kea dependencies.
 * It handles:
 * - Room creation and connection
 * - Text stream handling (via StreamHandler)
 * - Typed API for agent interactions
 * - Event callbacks for state changes
 */

import {
  ConnectionState,
  Room,
  RoomEvent,
  RoomOptions,
} from 'livekit-client';

import {
  getGuidesPayload,
  type LooseActionPayload,
  type Playground,
  type PlaygroundEvent,
} from '../components/playground';
import { StreamHandler } from '../utils/streams';

export type AgentState =
  | "listening"
  | "thinking"
  | "speaking"
  | "waiting"
  | "away"
  | "connecting";

export interface AgentClientCallbacks {
  onConnectionStateChange?: (state: ConnectionState) => void;
  onAgentStateChange?: (state: AgentState) => void;
  onPlaygroundChange?: (playground: Playground | null) => void;
  onPlaygroundAction?: (action: LooseActionPayload) => void;
  onTranscriptChange?: (
    transcript: string | null,
    isCommitted: boolean
  ) => void;
  onGuidesAcknowledged?: () => void;
  onAgentLeftCall?: () => void;
  onError?: (error: Error) => void;
}

export interface AgentClientOptions {
  serverUrl: string;
  roomOptions?: RoomOptions;
}

const DEFAULT_VOICE_ID = "cartesia/228fca29-3a0a-435c-8728-5cb483251068";

export class AgentClient {
  private room: Room;
  private streamHandler: StreamHandler | null = null;
  private callbacks: AgentClientCallbacks = {};
  private serverUrl: string;

  // Current state
  private _connectionState: ConnectionState = ConnectionState.Disconnected;
  private _agentState: AgentState = "away";
  private _playground: Playground | null = null;
  private _voiceId: string = DEFAULT_VOICE_ID;
  private _transcript: string | null = null;
  private _transcriptCommitted: boolean = false;
  private _playgroundsEnabled: boolean = false;
  private _speedLabEnabled: boolean = false;

  // Tracking state
  private _hasSentInitialVoice: boolean = false;
  private _hasSentGuides: boolean = false;
  private _guidesAcknowledged: boolean = false;
  private _lastAgentStateTimestamp: number = 0;

  // Debounce for playground updates
  private _playgroundDebounceTimeout: ReturnType<typeof setTimeout> | null =
    null;
  private readonly PLAYGROUND_DEBOUNCE_MS = 300;

  constructor(options: AgentClientOptions) {
    this.serverUrl = options.serverUrl;

    // Create the room with sensible defaults
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      ...options.roomOptions,
    });

    // Wire up room events
    this.room.on(
      RoomEvent.ConnectionStateChanged,
      this.handleConnectionStateChange
    );
    this.room.on(RoomEvent.Disconnected, this.handleDisconnect);
  }

  // Getters for current state
  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get agentState(): AgentState {
    return this._agentState;
  }

  get playground(): Playground | null {
    return this._playground;
  }

  get voiceId(): string {
    return this._voiceId;
  }

  get transcript(): string | null {
    return this._transcript;
  }

  get transcriptCommitted(): boolean {
    return this._transcriptCommitted;
  }

  get lkRoom(): Room {
    return this.room;
  }

  get lkStreamHandler(): StreamHandler | null {
    return this.streamHandler;
  }

  get isConnected(): boolean {
    return this._connectionState === ConnectionState.Connected;
  }

  get hasReceivedAgentState(): boolean {
    return this._lastAgentStateTimestamp > 0;
  }

  // Set callbacks
  setCallbacks(callbacks: AgentClientCallbacks): void {
    this.callbacks = callbacks;
  }

  // Set initial state (from user profile and account)
  setInitialState(options: {
    playground?: Playground | null;
    voiceId?: string;
    playgroundsEnabled?: boolean;
    speedLabEnabled?: boolean;
  }): void {
    if (options.playground !== undefined) {
      this._playground = options.playground;
    }
    if (options.voiceId) {
      this._voiceId = options.voiceId;
    }
    if (options.playgroundsEnabled !== undefined) {
      this._playgroundsEnabled = options.playgroundsEnabled;
    }
    if (options.speedLabEnabled !== undefined) {
      this._speedLabEnabled = options.speedLabEnabled;
    }
  }

  // Connect to room
  async connect(token: string): Promise<void> {
    console.log("[AgentClient] Connecting to room...");

    try {
      await this.room.connect(this.serverUrl, token);
      console.log("[AgentClient] Connected to room:", this.room.name);

      // Create StreamHandler now that we're connected
      this.streamHandler = new StreamHandler(this.room);
      this.registerStreamHandlers();

      // Send ping to get initial agent state
      this.ping();
    } catch (error) {
      console.error("[AgentClient] Connection failed:", error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  // Disconnect from room
  async disconnect(): Promise<void> {
    console.log("[AgentClient] Disconnecting...");
    this.streamHandler = null;
    this._hasSentInitialVoice = false;
    this._hasSentGuides = false;
    this._guidesAcknowledged = false;
    this._lastAgentStateTimestamp = 0;
    await this.room.disconnect();
  }

  // Send ping to agent (triggers agent state response)
  ping(): void {
    if (!this.isConnected) {
      console.warn("[AgentClient] Cannot ping - not connected");
      return;
    }

    console.log("[AgentClient] Sending ping");
    this.room.localParticipant.sendText("ping", { topic: "ping" });
  }

  // Set playground state and send to agent (debounced)
  setPlayground(
    playground: Playground | null,
    sendToAgent: boolean = true
  ): void {
    this._playground = playground;
    this.callbacks.onPlaygroundChange?.(playground);

    // Only send to agent if playground exists and sendToAgent is true
    if (sendToAgent && this.isConnected && playground) {
      // Debounce to prevent rapid-fire updates during drag operations
      if (this._playgroundDebounceTimeout) {
        clearTimeout(this._playgroundDebounceTimeout);
      }
      this._playgroundDebounceTimeout = setTimeout(() => {
        this.room.localParticipant.sendText(JSON.stringify(playground), {
          topic: "playground",
        });
      }, this.PLAYGROUND_DEBOUNCE_MS);
    }
  }

  // Set voice ID and send to agent
  setVoice(voiceId: string): void {
    this._voiceId = voiceId;

    if (this.isConnected) {
      this.room.localParticipant.sendText(voiceId, { topic: "voice" });
    }
  }

  // Send playground event to agent (triggers interrupt)
  sendPlaygroundEvent(event: PlaygroundEvent): void {
    if (!this.isConnected) {
      console.warn(
        "[AgentClient] Cannot send playground event - not connected"
      );
      return;
    }

    console.log("[AgentClient] Sending playground event:", event.type);
    this.room.localParticipant.sendText(JSON.stringify(event), {
      topic: "playground-events",
    });
  }

  // Clear transcript
  clearTranscript(): void {
    this._transcript = null;
    this._transcriptCommitted = false;
    this.callbacks.onTranscriptChange?.(null, false);
  }

  // Reset agent state (when agent disconnects)
  resetAgentState(): void {
    this._agentState = "away";
    this._lastAgentStateTimestamp = 0;
    this.callbacks.onAgentStateChange?.("away");
  }

  // Clean up
  destroy(): void {
    console.log("[AgentClient] Destroying...");
    if (this._playgroundDebounceTimeout) {
      clearTimeout(this._playgroundDebounceTimeout);
    }
    this.room.off(
      RoomEvent.ConnectionStateChanged,
      this.handleConnectionStateChange
    );
    this.room.off(RoomEvent.Disconnected, this.handleDisconnect);
    this.room.disconnect();
  }

  // Private: Register stream handlers
  private registerStreamHandlers(): void {
    if (!this.streamHandler) return;

    // Agent state updates
    this.streamHandler.register(
      "AgentClient",
      "agent-state",
      (data: string) => {
        console.log("[AgentClient] Received agent-state:", data);

        // On first agent-state, send initial voice and guides
        if (!this._hasSentInitialVoice) {
          this.sendInitialVoice();
        }
        if (!this._hasSentGuides) {
          this.sendGuidesWithRetry();
        }

        try {
          const json = JSON.parse(data);
          // Only accept newer timestamps
          if (json.timestamp > this._lastAgentStateTimestamp) {
            this._lastAgentStateTimestamp = json.timestamp;
            if (json.state) {
              this._agentState = json.state as AgentState;
              this.callbacks.onAgentStateChange?.(this._agentState);
            }
          }
        } catch (e) {
          console.error("[AgentClient] Failed to parse agent-state:", e);
        }
      }
    );

    console.log("[AgentClient] agent-state registered");

    // Playground updates from agent
    console.log("[AgentClient] About to register playground");
    this.streamHandler.register("AgentClient", "playground", (data: string) => {
      console.log("[AgentClient] Received playground");
      try {
        const playground = JSON.parse(data) as Playground;
        this._playground = playground;
        this.callbacks.onPlaygroundChange?.(playground);
      } catch (e) {
        console.error("[AgentClient] Failed to parse playground:", e);
      }
    });

    console.log("[AgentClient] playground registered");

    // Playground actions from agent
    console.log("[AgentClient] About to register playground-action");
    this.streamHandler.register(
      "AgentClient",
      "playground-action",
      (data: string) => {
        console.log("[AgentClient] Received playground-action");
        try {
          const action = JSON.parse(data) as LooseActionPayload;
          this.callbacks.onPlaygroundAction?.(action);
        } catch (e) {
          console.error("[AgentClient] Failed to parse playground-action:", e);
        }
      }
    );

    console.log("[AgentClient] playground-action registered");

    // Guides acknowledgment
    console.log("[AgentClient] About to register playground-guides-ack");
    this.streamHandler.register(
      "AgentClient",
      "playground-guides-ack",
      (data: string) => {
        console.log("[AgentClient] Received guides acknowledgment");
        try {
          const ack = JSON.parse(data);
          if (ack.status === "received") {
            this._guidesAcknowledged = true;
            this.callbacks.onGuidesAcknowledged?.();
          }
        } catch (e) {
          console.error("[AgentClient] Failed to parse guides-ack:", e);
        }
      }
    );

    console.log("[AgentClient] playground-guides-ack registered");

    // Transcript updates
    console.log("[AgentClient] About to register transcript");
    this.streamHandler.register("AgentClient", "transcript", (data: string) => {
      console.log("[AgentClient] Received transcript");
      try {
        const parsed = JSON.parse(data);
        this._transcript = parsed.transcript;
        this._transcriptCommitted = parsed.is_final ?? false;
        this.callbacks.onTranscriptChange?.(
          this._transcript,
          this._transcriptCommitted
        );
      } catch {
        // Fallback for legacy string-only format
        this._transcript = data;
        this._transcriptCommitted = false;
        this.callbacks.onTranscriptChange?.(data, false);
      }
    });

    console.log("[AgentClient] transcript registered");

    // Tool calls - detect when agent uses leave_call
    console.log("[AgentClient] About to register tool-calls");
    this.streamHandler.register("AgentClient", "tool-calls", (data: string) => {
      console.log("[AgentClient] Received tool-call:", data);
      try {
        const json = JSON.parse(data);
        console.log("[AgentClient] Parsed tool-call, name:", json.name);
        if (json.name === "leave_call") {
          console.log(
            "[AgentClient] leave_call detected! Calling onAgentLeftCall callback"
          );
          this.callbacks.onAgentLeftCall?.();
        }
      } catch (e) {
        console.error("[AgentClient] Failed to parse tool-call:", e);
      }
    });
    console.log("[AgentClient] tool-calls registered");

    console.log("[AgentClient] Registering stream handlers END");
  }

  // Private: Send initial voice to agent
  private sendInitialVoice(): void {
    if (this._hasSentInitialVoice || !this.isConnected) return;

    console.log("[AgentClient] Sending initial voice:", this._voiceId);
    this.room.localParticipant.sendText(this._voiceId, { topic: "voice" });
    this._hasSentInitialVoice = true;
  }

  // Private: Send guides with retry until acknowledged
  private async sendGuidesWithRetry(): Promise<void> {
    if (this._hasSentGuides) return;
    this._hasSentGuides = true;

    const guidesJson = JSON.stringify(
      getGuidesPayload({
        playgroundsEnabled: this._playgroundsEnabled,
        speedLabEnabled: this._speedLabEnabled,
      })
    );
    const maxRetries = 10;
    const retryIntervalMs = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this._guidesAcknowledged) {
        console.log("[AgentClient] Guides already acknowledged");
        return;
      }

      console.log(
        `[AgentClient] Sending guides (attempt ${attempt}/${maxRetries})`
      );
      this.room.localParticipant.sendText(guidesJson, {
        topic: "playground-guides",
      });

      // Wait for acknowledgment or timeout
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (this._guidesAcknowledged) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, retryIntervalMs);
      });

      if (this._guidesAcknowledged) {
        console.log(
          `[AgentClient] Guides acknowledged after ${attempt} attempt(s)`
        );
        return;
      }
    }

    console.warn(
      `[AgentClient] Failed to get guides acknowledgment after ${maxRetries} attempts`
    );
  }

  // Private: Handle connection state changes
  private handleConnectionStateChange = (state: ConnectionState): void => {
    console.log("[AgentClient] Connection state changed:", state);
    this._connectionState = state;
    this.callbacks.onConnectionStateChange?.(state);
  };

  // Private: Handle disconnect
  private handleDisconnect = (): void => {
    console.log("[AgentClient] Disconnected");
    this._agentState = "away";
    this._lastAgentStateTimestamp = 0;
    this.callbacks.onAgentStateChange?.("away");
  };
}
