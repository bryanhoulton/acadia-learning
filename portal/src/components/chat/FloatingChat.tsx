import { FormEvent, useCallback, useEffect, useMemo, useRef } from "react";

import { useActions, useValues } from "kea";
import { Room } from "livekit-client";
import { ArrowRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ActionIcon, cn } from "slate-ui";

import { Chat, chatLogic, ChatMessage } from "../../logic/chatLogic";

const isChatMessage = (message: Chat): message is ChatMessage =>
  message.type === "message";

type FloatingChatProps = {
  room: Room;
  agentConnected: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnreadChange?: (hasUnread: boolean) => void;
};

type MessageBubbleProps = {
  message: Chat;
  isMine: boolean;
  senderLabel: string;
  showSenderLabel: boolean;
  isGroupStart: boolean;
};

function MessageBubble({
  message,
  isMine,
  senderLabel,
  showSenderLabel,
  isGroupStart,
}: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isMine ? "items-end" : "items-start",
        isGroupStart ? "mt-4" : "mt-1",
      )}
    >
      {showSenderLabel && (
        <span className="text-xs text-neutral-400">{senderLabel}</span>
      )}
      <div
        className={cn(
          "rounded-2xl px-3 py-2 text-sm leading-relaxed max-w-[22rem] break-words text-left",
          message.type === "tool-call" &&
            "bg-neutral-100 text-neutral-600 border border-neutral-200",
          message.type === "message" &&
            (isMine
              ? "bg-primary-500 text-white"
              : "bg-white border border-neutral-200 text-neutral-800"),
        )}
      >
        {message.type === "message" ? message.text : message.content}
      </div>
    </div>
  );
}

export function FloatingChat({
  room,
  agentConnected,
  open,
  onOpenChange,
  onUnreadChange,
}: FloatingChatProps) {
  const logic = useMemo(() => chatLogic({ room }), [room]);
  const { messages, messageInput, lastReadTimestamp } = useValues(logic);
  const { sendMessage, setMessageInput, setLastReadTimestamp } =
    useActions(logic);

  const scrollAnchor = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [messageInput, adjustTextareaHeight]);

  const hasUnread = messages.some(
    (message) =>
      message.type === "message" &&
      message.timestamp > lastReadTimestamp &&
      message.sender !== "You",
  );

  // Notify parent of unread state changes
  useEffect(() => {
    onUnreadChange?.(hasUnread);
  }, [hasUnread, onUnreadChange]);

  useEffect(() => {
    if (open) {
      setLastReadTimestamp();
    }
  }, [open, setLastReadTimestamp]);

  useEffect(() => {
    if (open && messages.length > 0) {
      setLastReadTimestamp();
    }
  }, [messages, open, setLastReadTimestamp]);

  useEffect(() => {
    if (!open) return;
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage();
  };

  if (!room) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
      <AnimatePresence>
        {open && (
          <motion.div
            key="floating-chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-[22rem] max-w-[90vw] bg-white border border-neutral-200 shadow-xl rounded-3xl overflow-hidden flex flex-col"
          >
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-neutral-800">
                  Classroom Chat
                </p>
                <p className="text-xs text-neutral-500">
                  {agentConnected
                    ? "Chat with your agent"
                    : "Waiting for agent to connect"}
                </p>
              </div>
              <ActionIcon
                icon={X}
                variant="subtle"
                onClick={() => onOpenChange(false)}
                tooltip="Close chat"
                className="hover:bg-error-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto max-h-[300px] px-4 py-2 space-y-3 bg-neutral-50">
              {messages.length === 0 ? (
                <div className="text-xs text-neutral-500 text-center py-12">
                  Say hello to your agent to get started.
                </div>
              ) : (
                messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const isMessageChat = isChatMessage(message);

                  const isMine = isMessageChat && message.sender === "You";
                  const senderLabel = isMine
                    ? "You"
                    : isMessageChat
                      ? message.sender
                      : "Agent";

                  let isSameSenderAsPrevious = false;
                  if (previous) {
                    if (isMessageChat && isChatMessage(previous)) {
                      isSameSenderAsPrevious =
                        previous.sender === message.sender;
                    } else if (
                      !isMessageChat &&
                      !isChatMessage(previous) &&
                      previous.type === message.type
                    ) {
                      isSameSenderAsPrevious = true;
                    }
                  }

                  const showSenderLabel = !isSameSenderAsPrevious;

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isMine={isMine}
                      senderLabel={senderLabel}
                      showSenderLabel={showSenderLabel}
                      isGroupStart={!isSameSenderAsPrevious}
                    />
                  );
                })
              )}
              <div ref={scrollAnchor} />
            </div>

            <form
              onSubmit={handleSubmit}
              className="px-4 py-3 flex items-end gap-2 bg-neutral-50"
            >
              <textarea
                ref={textareaRef}
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                rows={1}
                autoFocus
                placeholder="Type a message"
                className="min-h-[32px] w-full bg-white resize-none rounded-2xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:bg-neutral-100/80"
              />
              <ActionIcon
                type="submit"
                icon={ArrowRight}
                variant="primary"
                disabled={messageInput.trim().length === 0}
                className="rounded-full"
              />
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FloatingChat;
