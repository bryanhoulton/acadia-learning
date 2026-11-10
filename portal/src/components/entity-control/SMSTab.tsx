import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { formatDistanceToNow } from 'date-fns';
import {
  Heart,
  Loader2,
  MessageSquare,
  Send,
  ThumbsUp,
  User,
} from 'lucide-react';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  TextArea,
} from 'slate-ui';
import { toast } from 'sonner';

import { components } from '../../types/api';
import client from '../../utils/api';

type UserProfile = components["schemas"]["EntityUserProfile"];

interface SMSMessage {
  id: string;
  linq_message_id?: number;
  from: string;
  to: string;
  body: string;
  direction: "inbound" | "outbound";
  seconds_ago: number;
  attachments?: Array<{
    url: string;
    content_type: string;
    transcription?: string;
  }>;
}

interface ConversationGroup {
  profile: UserProfile;
  messages: SMSMessage[];
  lastMessage: SMSMessage;
  unread: boolean;
}

// Contact list sidebar
function ContactList({
  conversations,
  selectedId,
  onSelect,
  loading,
}: {
  conversations: ConversationGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-muted text-sm">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="divide-y">
      {conversations.map((conv) => (
        <div
          key={conv.profile.id}
          className={cn(
            "p-3 cursor-pointer hover:bg-gray-50 transition-colors",
            selectedId === conv.profile.id && "bg-primary-50",
          )}
          onClick={() => onSelect(conv.profile.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <div className="font-medium text-sm">
                  {conv.profile.name || conv.profile.phone}
                </div>
                <div className="text-xs text-muted truncate max-w-32">
                  {conv.lastMessage.body.slice(0, 30)}
                  {conv.lastMessage.body.length > 30 && "..."}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-xs text-muted">
                {formatDistanceToNow(
                  new Date(Date.now() - conv.lastMessage.seconds_ago * 1000),
                  { addSuffix: false },
                )}
              </div>
              {conv.unread && (
                <div className="w-2 h-2 rounded-full bg-primary-500" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Message bubble
function MessageBubble({
  message,
  onReact,
}: {
  message: SMSMessage;
  onReact: (msgId: number, type: string) => void;
}) {
  const isOutbound = message.direction === "outbound";

  return (
    <div
      className={cn("flex mb-3", isOutbound ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-xs lg:max-w-md px-4 py-2 rounded-2xl",
          isOutbound
            ? "bg-primary-500 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-900 rounded-bl-sm",
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map((att, i) => (
              <div key={i} className="text-xs opacity-80">
                {att.content_type.startsWith("audio/") ? (
                  <span>🎤 {att.transcription || "Voice message"}</span>
                ) : att.content_type.startsWith("image/") ? (
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    📷 Image attachment
                  </a>
                ) : (
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    📎 Attachment
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-1">
          <span
            className={cn(
              "text-xs",
              isOutbound ? "text-primary-100" : "text-gray-400",
            )}
          >
            {formatDistanceToNow(
              new Date(Date.now() - message.seconds_ago * 1000),
              { addSuffix: true },
            )}
          </span>

          {/* React buttons for inbound messages */}
          {!isOutbound && message.linq_message_id && (
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => onReact(message.linq_message_id!, "love")}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
                title="Love"
              >
                <Heart className="w-3 h-3 text-gray-400 hover:text-red-500" />
              </button>
              <button
                onClick={() => onReact(message.linq_message_id!, "like")}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
                title="Like"
              >
                <ThumbsUp className="w-3 h-3 text-gray-400 hover:text-blue-500" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Conversation view
function ConversationView({
  profile,
  messages,
  onSend,
  onReact,
  sending,
}: {
  entityId: number;
  profileId: string;
  profile: UserProfile | null;
  messages: SMSMessage[];
  onSend: (message: string) => void;
  onReact: (msgId: number, type: string) => void;
  sending: boolean;
}) {
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (newMessage.trim()) {
      onSend(newMessage.trim());
      setNewMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!profile) {
    return <EmptyState icon={MessageSquare} title="Select a conversation" />;
  }

  // Sort messages oldest first for display
  const sortedMessages = [...messages].sort(
    (a, b) => b.seconds_ago - a.seconds_ago,
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <div className="font-medium">{profile.name || "Unknown"}</div>
            <div className="text-sm text-muted">{profile.phone}</div>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {profile.role}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {sortedMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onReact={onReact} />
        ))}
      </div>

      {/* Compose */}
      <div className="border-t p-4 bg-white">
        <div className="flex gap-2">
          <TextArea
            value={newMessage}
            onChange={setNewMessage}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1"
            rows={2}
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            iconLeft={sending ? Loader2 : Send}
            className={cn(sending && "[&_svg]:animate-spin")}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// Main SMS Tab component
export function SMSTab({ entityId }: { entityId: number }) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [allMessages, setAllMessages] = useState<SMSMessage[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [conversationMessages, setConversationMessages] = useState<
    SMSMessage[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch profiles and all messages
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, messagesRes] = await Promise.all([
        client.GET("/api/entities/control/{entity_id}/profiles/", {
          params: { path: { entity_id: entityId } },
        }),
        client.GET("/api/entities/control/{entity_id}/sms/", {
          params: { path: { entity_id: entityId } },
        }),
      ]);
      if (profilesRes.error) throw new Error("Failed to fetch profiles");
      if (messagesRes.error) throw new Error("Failed to fetch messages");
      setProfiles(profilesRes.data?.profiles || []);
      setAllMessages(
        (messagesRes.data?.messages as unknown as SMSMessage[]) || [],
      );
    } catch (e) {
      console.error("Error fetching SMS data:", e);
      toast.error("Failed to load SMS data");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // Fetch specific conversation
  const fetchConversation = useCallback(
    async (profileId: string) => {
      setConversationLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/entities/control/{entity_id}/sms/",
          {
            params: {
              path: { entity_id: entityId },
              query: { user_profile_id: profileId },
            },
          },
        );
        if (error) throw new Error("Failed to fetch conversation");
        setConversationMessages(
          (data?.messages as unknown as SMSMessage[]) || [],
        );
      } catch (e) {
        console.error("Error fetching conversation:", e);
        toast.error("Failed to load conversation");
      } finally {
        setConversationLoading(false);
      }
    },
    [entityId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedProfileId) {
      fetchConversation(selectedProfileId);
    }
  }, [selectedProfileId, fetchConversation]);

  // Group messages by profile for the sidebar
  const conversations: ConversationGroup[] = profiles
    .map((profile) => {
      const profileMessages = allMessages.filter(
        (m) => m.from === profile.phone || m.to === profile.phone,
      );
      if (profileMessages.length === 0) return null;

      const lastMessage = profileMessages[0]; // Already sorted by recent
      return {
        profile,
        messages: profileMessages,
        lastMessage,
        unread:
          lastMessage.direction === "inbound" && lastMessage.seconds_ago < 3600,
      };
    })
    .filter(Boolean) as ConversationGroup[];

  // Sort by most recent message
  conversations.sort(
    (a, b) => a.lastMessage.seconds_ago - b.lastMessage.seconds_ago,
  );

  const selectedProfile =
    profiles.find((p) => p.id === selectedProfileId) || null;

  // Send message
  const handleSend = async (message: string) => {
    if (!selectedProfileId) return;

    setSending(true);
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/sms/send/",
        {
          params: { path: { entity_id: entityId } },
          body: {
            user_profile_id: selectedProfileId,
            message,
          },
        },
      );
      if (error) throw new Error("Failed to send message");
      toast.success("Message sent");
      // Refresh conversation
      await fetchConversation(selectedProfileId);
      await fetchData();
    } catch (e) {
      console.error("Error sending message:", e);
      toast.error(
        (e as { message?: string }).message || "Failed to send message",
      );
    } finally {
      setSending(false);
    }
  };

  // React to message
  const handleReact = async (messageId: number, reactionType: string) => {
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/sms/react/",
        {
          params: { path: { entity_id: entityId } },
          body: {
            message_id: String(messageId),
            reaction_type: reactionType,
          },
        },
      );
      if (error) throw new Error("Failed to add reaction");
      toast.success(`Added ${reactionType} reaction`);
    } catch (e) {
      console.error("Error reacting:", e);
      toast.error(
        (e as { message?: string }).message || "Failed to add reaction",
      );
    }
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm h-[600px] flex">
      {/* Contact list sidebar */}
      <div className="w-72 border-r overflow-y-auto">
        <div className="p-3 border-b bg-gray-50">
          <h3 className="font-medium text-sm">Conversations</h3>
        </div>
        <ContactList
          conversations={conversations}
          selectedId={selectedProfileId}
          onSelect={setSelectedProfileId}
          loading={loading}
        />
      </div>

      {/* Conversation view */}
      <div className="flex-1">
        {conversationLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <ConversationView
            entityId={entityId}
            profileId={selectedProfileId || ""}
            profile={selectedProfile}
            messages={conversationMessages}
            onSend={handleSend}
            onReact={handleReact}
            sending={sending}
          />
        )}
      </div>
    </div>
  );
}
