import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  Mail,
  Paperclip,
  Reply,
  Send,
} from 'lucide-react';
import {
  ActionIcon,
  Badge,
  Button,
  cn,
  EmptyState,
  Modal,
  TextArea,
  TextInput,
} from 'slate-ui';
import { toast } from 'sonner';

import client from '../../utils/api';

// These types aren't strongly typed in the API schema (they're Dict), so we keep local definitions
interface EmailThread {
  thread_id: string;
  subject: string;
  snippet: string;
  participants: string[];
  message_count: number;
  timestamp: string;
  is_unread: boolean;
}

interface EmailMessage {
  message_id: string;
  from: string;
  to: string[];
  date: string;
  text: string;
  attachments?: Array<{
    attachment_id: string;
    filename: string;
  }>;
}

interface ThreadDetail {
  thread_id: string;
  subject: string;
  messages: EmailMessage[];
}

// Thread list view
function ThreadList({
  threads,
  selectedId,
  onSelect,
  loading,
}: {
  threads: EmailThread[];
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

  if (threads.length === 0) {
    return <EmptyState icon={Mail} title="No emails" />;
  }

  return (
    <div className="divide-y">
      {threads.map((thread) => (
        <div
          key={thread.thread_id}
          className={cn(
            "p-4 cursor-pointer hover:bg-gray-50 transition-colors",
            selectedId === thread.thread_id && "bg-primary-50",
            thread.is_unread && "bg-blue-50",
          )}
          onClick={() => onSelect(thread.thread_id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {thread.is_unread && (
                  <div className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                )}
                <span
                  className={cn(
                    "font-medium truncate",
                    thread.is_unread && "text-primary-700",
                  )}
                >
                  {thread.subject || "(No subject)"}
                </span>
              </div>
              <div className="text-sm text-muted truncate mt-1">
                {thread.participants.slice(0, 2).join(", ")}
                {thread.participants.length > 2 &&
                  ` +${thread.participants.length - 2}`}
              </div>
              <div className="text-sm text-gray-500 truncate mt-1">
                {thread.snippet}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-xs text-muted">
                {thread.timestamp &&
                  formatDistanceToNow(new Date(thread.timestamp), {
                    addSuffix: false,
                  })}
              </span>
              {thread.message_count > 1 && (
                <Badge variant="secondary" size="sm">
                  {thread.message_count}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Thread detail view
function ThreadDetailView({
  thread,
  onBack,
  onReply,
}: {
  thread: ThreadDetail | null;
  onBack: () => void;
  onReply: (messageId: string, to: string, text: string) => Promise<void>;
}) {
  const [replyingTo, setReplyingTo] = useState<EmailMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  if (!thread) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const handleReply = async () => {
    if (!replyingTo || !replyText.trim()) return;

    setSending(true);
    try {
      await onReply(replyingTo.message_id, replyingTo.from, replyText);
      setReplyText("");
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-white flex items-center gap-3">
        <ActionIcon
          icon={ArrowLeft}
          variant="subtle"
          onClick={onBack}
          tooltip="Back to inbox"
        />
        <div className="flex-1">
          <h2 className="font-semibold">{thread.subject || "(No subject)"}</h2>
          <div className="text-sm text-muted">
            {thread.messages.length} message
            {thread.messages.length !== 1 && "s"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {thread.messages.map((msg) => (
          <div key={msg.message_id} className="bg-white rounded-lg border p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium">{msg.from}</div>
                <div className="text-sm text-muted">
                  To: {msg.to.join(", ")}
                </div>
                {msg.date && (
                  <div className="text-xs text-muted mt-1">
                    {formatDistanceToNow(new Date(msg.date), {
                      addSuffix: true,
                    })}
                  </div>
                )}
              </div>
              <Button
                variant="subtle"
                size="sm"
                iconLeft={Reply}
                onClick={() => setReplyingTo(msg)}
              >
                Reply
              </Button>
            </div>

            <div className="prose prose-sm max-w-none whitespace-pre-wrap">
              {msg.text}
            </div>

            {msg.attachments && msg.attachments.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Paperclip className="w-4 h-4" />
                  {msg.attachments.length} attachment
                  {msg.attachments.length !== 1 && "s"}
                </div>
                <div className="space-y-1">
                  {msg.attachments.map((att) => (
                    <div
                      key={att.attachment_id}
                      className="text-sm text-primary-600"
                    >
                      {att.filename}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reply modal */}
      <Modal open={!!replyingTo} onClose={() => setReplyingTo(null)}>
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            Reply to {replyingTo?.from}
          </h2>
          <TextArea
            value={replyText}
            onChange={setReplyText}
            placeholder="Write your reply..."
            rows={6}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="subtle" onClick={() => setReplyingTo(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleReply}
              disabled={!replyText.trim() || sending}
              iconLeft={sending ? Loader2 : Send}
              className={cn(sending && "[&_svg]:animate-spin")}
            >
              Send Reply
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Compose new email modal
function ComposeModal({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (to: string, subject: string, text: string) => Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!to || !subject || !text) return;

    setSending(true);
    try {
      await onSend(to, subject, text);
      setTo("");
      setSubject("");
      setText("");
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">New Email</h2>
        <div className="space-y-4">
          <TextInput
            label="To"
            value={to}
            onChange={setTo}
            placeholder="email@example.com"
          />
          <TextInput
            label="Subject"
            value={subject}
            onChange={setSubject}
            placeholder="Email subject"
          />
          <TextArea
            label="Message"
            value={text}
            onChange={setText}
            placeholder="Write your message..."
            rows={6}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!to || !subject || !text || sending}
            iconLeft={sending ? Loader2 : Send}
            className={cn(sending && "[&_svg]:animate-spin")}
          >
            Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Main Email Tab component
export function EmailTab({ entityId }: { entityId: number }) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  // Fetch threads
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await client.GET(
        "/api/entities/control/{entity_id}/email/threads/",
        {
          params: { path: { entity_id: entityId } },
        },
      );
      if (error) throw new Error("Failed to fetch threads");
      setThreads((data?.threads as unknown as EmailThread[]) || []);
    } catch (e) {
      console.error("Error fetching threads:", e);
      toast.error("Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  // Fetch thread detail
  const fetchThreadDetail = useCallback(
    async (threadId: string) => {
      setDetailLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/entities/control/{entity_id}/email/threads/{thread_id}/",
          {
            params: { path: { entity_id: entityId, thread_id: threadId } },
          },
        );
        if (error) throw new Error("Failed to fetch thread");
        setThreadDetail(data as unknown as ThreadDetail);
      } catch (e) {
        console.error("Error fetching thread:", e);
        toast.error("Failed to load thread");
      } finally {
        setDetailLoading(false);
      }
    },
    [entityId],
  );

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedThreadId) {
      fetchThreadDetail(selectedThreadId);
    } else {
      setThreadDetail(null);
    }
  }, [selectedThreadId, fetchThreadDetail]);

  // Reply to message
  const handleReply = async (messageId: string, to: string, text: string) => {
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/email/reply/",
        {
          params: { path: { entity_id: entityId } },
          body: { message_id: messageId, to, text },
        },
      );
      if (error) throw new Error("Failed to send reply");
      toast.success("Reply sent");
      // Refresh thread
      if (selectedThreadId) {
        await fetchThreadDetail(selectedThreadId);
      }
    } catch (e) {
      console.error("Error sending reply:", e);
      toast.error((e as Error).message || "Failed to send reply");
      throw e;
    }
  };

  // Send new email
  const handleSend = async (to: string, subject: string, text: string) => {
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/email/send/",
        {
          params: { path: { entity_id: entityId } },
          body: { to, subject, text },
        },
      );
      if (error) throw new Error("Failed to send email");
      toast.success("Email sent");
      await fetchThreads();
    } catch (e) {
      console.error("Error sending email:", e);
      toast.error((e as Error).message || "Failed to send email");
      throw e;
    }
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm h-[600px] flex flex-col">
      {/* Header */}
      <div className="border-b p-3 flex items-center justify-between bg-gray-50">
        <h3 className="font-medium">Email Inbox</h3>
        <Button size="sm" iconLeft={Mail} onClick={() => setComposeOpen(true)}>
          Compose
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {selectedThreadId ? (
          <ThreadDetailView
            thread={detailLoading ? null : threadDetail}
            onBack={() => setSelectedThreadId(null)}
            onReply={handleReply}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <ThreadList
              threads={threads}
              selectedId={selectedThreadId}
              onSelect={setSelectedThreadId}
              loading={loading}
            />
          </div>
        )}
      </div>

      {/* Compose modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleSend}
      />
    </div>
  );
}
