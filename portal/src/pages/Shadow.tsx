import "@livekit/components-styles";

import { useCallback, useEffect, useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { useValues } from "kea";
import {
  Eye,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
  Volume2,
} from "lucide-react";
import { ActionIcon, Badge, Button, cn, EmptyState, TextInput } from "slate-ui";
import { toast } from "sonner";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react";

import { type Block, BlockRenderer } from "../components/playground";
import { authLogic } from "../logic/authLogic";
import client from "../utils/api";

// Types for active sessions
interface ActiveSession {
  room_name: string;
  profile_id: string | null;
  num_participants: number;
  created_at: number;
}

// Access denied component
function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="max-w-md bg-white rounded-lg border shadow-sm">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 mx-auto bg-error-100 rounded-full flex items-center justify-center">
            <Eye className="w-8 h-8 text-error-500" />
          </div>
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted">
            You need admin privileges to access the human coach feature.
          </p>
        </div>
      </div>
    </div>
  );
}

// Session list component
function SessionList({
  sessions,
  loading,
  onRefresh,
  onSelect,
}: {
  sessions: ActiveSession[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (session: ActiveSession) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Active Sessions</h2>
        <ActionIcon
          icon={RefreshCw}
          variant="subtle"
          onClick={onRefresh}
          className={cn(loading && "animate-spin")}
          tooltip="Refresh"
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon={Users} title="No active sessions" />
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <div
              key={session.room_name}
              className="bg-white rounded-lg border shadow-sm cursor-pointer hover:border-primary-500 transition-colors"
              onClick={() => onSelect(session)}
            >
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {session.profile_id
                        ? `Profile: ${session.profile_id.slice(0, 8)}...`
                        : "Unknown Profile"}
                    </div>
                    <div className="text-sm text-muted">
                      Room: {session.room_name.slice(0, 30)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" iconLeft={Users}>
                      {session.num_participants}
                    </Badge>
                    <div className="text-xs text-muted">
                      Started{" "}
                      {formatDistanceToNow(
                        new Date(session.created_at * 1000),
                        {
                          addSuffix: true,
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Canvas viewer that subscribes to canvas updates
function CanvasViewer() {
  const room = useRoomContext();
  const [canvasBlocks, setCanvasBlocks] = useState<Block[]>([]);

  useEffect(() => {
    if (!room) return;

    // Register text stream handler for canvas updates
    room.registerTextStreamHandler("canvas", async (stream) => {
      try {
        const data = await stream.readAll();
        const blocks = JSON.parse(data);
        setCanvasBlocks(blocks);
      } catch (e) {
        console.error("Error parsing canvas data:", e);
      }
    });

    return () => {
      // Cleanup - unregister the handler
      room.unregisterTextStreamHandler("canvas");
    };
  }, [room]);

  return (
    <div className="h-full overflow-auto p-4">
      <BlockRenderer
        content={{ blocks: canvasBlocks }}
        questionsDisabled={true}
        emptyState={{
          icon: Eye,
          title: "Waiting for canvas...",
        }}
      />
    </div>
  );
}

// Coaching input component
function CoachingInput() {
  const room = useRoomContext();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const sendCoachingMessage = useCallback(async () => {
    if (!room || !message.trim()) return;

    setSending(true);
    try {
      // Send coaching message via text stream
      await room.localParticipant.sendText(message, { topic: "coaching" });
      toast.success("Coaching message sent");
      setMessage("");
    } catch (e) {
      console.error("Error sending coaching message:", e);
      toast.error("Failed to send coaching message");
    } finally {
      setSending(false);
    }
  }, [room, message]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCoachingMessage();
    }
  };

  return (
    <div className="p-4 border-t bg-gray-50">
      <div className="flex gap-2 items-center">
        <TextInput
          value={message}
          onChange={setMessage}
          onKeyDown={handleKeyDown}
          placeholder="Type coaching message and press Enter..."
          className="flex-1"
        />
        <ActionIcon
          icon={sending ? Loader2 : Send}
          onClick={sendCoachingMessage}
          disabled={!message.trim() || sending}
          className={cn(sending && "animate-spin")}
          tooltip="Send coaching message"
        />
      </div>
      <p className="text-xs text-muted mt-2">
        <MessageSquare className="w-3 h-3 inline mr-1" />
        Messages are sent as internal coaching to the tutor. The student will
        not see them.
      </p>
    </div>
  );
}

// Shadow room component
function ShadowRoom({
  token,
  roomName,
  onLeave,
}: {
  token: string;
  roomName: string;
  onLeave: () => void;
}) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={import.meta.env.VITE_LIVEKIT_URL}
      audio={false} // Don't publish audio
      video={false} // Don't publish video
      connect={true}
      className="h-full"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-success-500 rounded-full animate-pulse" />
            <span className="font-medium">Human Coach</span>
            <Badge variant="subtle">{roomName.slice(0, 20)}...</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" iconLeft={Volume2}>
              Audio Active
            </Badge>
            <Button variant="subtle" onClick={onLeave} iconLeft={LogOut}>
              Leave
            </Button>
          </div>
        </div>

        {/* Audio renderer - this plays the room audio */}
        <RoomAudioRenderer />

        {/* Main content */}
        <div className="flex-1 flex">
          {/* Canvas view */}
          <div className="flex-1 border-r">
            <CanvasViewer />
          </div>
        </div>

        {/* Coaching input */}
        <CoachingInput />
      </div>
    </LiveKitRoom>
  );
}

// Main Shadow component
export function Shadow() {
  const { account } = useValues(authLogic);
  const isAdmin = account?.is_admin ?? false;

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(
    null
  );
  const [shadowToken, setShadowToken] = useState<string | null>(null);
  const [joiningRoom, setJoiningRoom] = useState(false);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await client.GET("/api/lms/sessions/active/");

      if (error || !data) {
        throw new Error("Failed to fetch sessions");
      }

      setSessions((data as { sessions: ActiveSession[] }).sessions || []);
    } catch (e) {
      console.error("Error fetching sessions:", e);
      toast.error("Failed to fetch active sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch shadow token for a room
  const joinAsObserver = useCallback(async (session: ActiveSession) => {
    setJoiningRoom(true);
    try {
      const { data, error } = await client.GET(
        "/api/lms/sessions/shadow-token/",
        {
          params: { query: { room: session.room_name } },
        }
      );

      if (error || !data) {
        throw new Error("Failed to get shadow token");
      }

      setShadowToken(data.token as string);
      setSelectedSession(session);
      toast.success("Joined session as shadow observer");
    } catch (e) {
      console.error("Error joining as observer:", e);
      toast.error("Failed to join session");
    } finally {
      setJoiningRoom(false);
    }
  }, []);

  // Leave shadow session
  const leaveShadow = useCallback(() => {
    setShadowToken(null);
    setSelectedSession(null);
  }, []);

  // Initial fetch
  useEffect(() => {
    if (isAdmin) {
      fetchSessions();
    }
  }, [isAdmin, fetchSessions]);

  // Admin check
  if (!isAdmin) {
    return <AccessDenied />;
  }

  // Show shadow room if connected
  if (shadowToken && selectedSession) {
    return (
      <div className="h-screen">
        <ShadowRoom
          token={shadowToken}
          roomName={selectedSession.room_name}
          onLeave={leaveShadow}
        />
      </div>
    );
  }

  // Show session list
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Eye className="w-8 h-8" />
            Human Coach
          </h1>
          <p className="text-muted">
            Observe active tutoring sessions and provide real-time coaching to
            the tutor. Auto-coaching is disabled when you join.
          </p>
        </div>

        {/* Session list */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-6">
            {joiningRoom ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                <span className="ml-3">Joining session...</span>
              </div>
            ) : (
              <SessionList
                sessions={sessions}
                loading={loading}
                onRefresh={fetchSessions}
                onSelect={joinAsObserver}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
