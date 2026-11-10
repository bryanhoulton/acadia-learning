import { kea } from 'kea';
import { Room } from 'livekit-client';
import { LucideIcon } from 'lucide-react';

import { agentLogic } from './agent/agentLogic';
import type { chatLogicType } from './chatLogicType';

const makeMessageId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export interface BaseMessage {
  id: string;
  timestamp: number;
  type: "message" | "tool-call";
}

export interface ChatMessage extends BaseMessage {
  type: "message";
  sender: string;
  text: string;
}

export interface ChatToolCall extends BaseMessage {
  type: "tool-call";
  content: string;
  icon: LucideIcon;
}

export type Chat = ChatMessage | ChatToolCall;

export type ChatLogicProps = {
  room: Room;
};

export const chatLogic = kea<chatLogicType>({
  path: ["src", "logic", "chatLogic"],
  props: {} as ChatLogicProps,
  connect: {
    values: [agentLogic, ["streamHandler"]],
    actions: [agentLogic, ["setStreamHandler"]],
  },

  actions: {
    setMessages: (messages: Chat[]) => ({ messages }),
    setLastReadTimestamp: true,
    sendMessage: true,
    setMessageInput: (messageInput: string) => ({ messageInput }),
    registerStreamHandlers: true,
    unregisterStreamHandlers: true,
  },

  reducers: () => ({
    messages: [
      [] as Chat[],
      {
        setMessages: (_, { messages }) => messages,
      },
    ],
    messageInput: [
      "",
      {
        setMessageInput: (_, { messageInput }) => messageInput,
      },
    ],
    lastReadTimestamp: [0, { setLastReadTimestamp: () => Date.now() }],
    handlersRegistered: [
      false,
      {
        registerStreamHandlers: () => true,
        unregisterStreamHandlers: () => false,
      },
    ],
  }),

  listeners: ({ actions, props, values }) => ({
    sendMessage: () => {
      const message = values.messageInput.trim();
      if (message.length === 0) {
        return;
      }
      props.room.localParticipant.sendText(message, {
        topic: "chat",
      });
      const id = makeMessageId();
      actions.setMessages([
        ...values.messages,
        {
          id,
          timestamp: Date.now(),
          type: "message",
          sender: "You",
          text: message,
        },
      ]);
      actions.setMessageInput("");
    },

    // When streamHandler becomes available, register our handlers
    setStreamHandler: () => {
      const { streamHandler, handlersRegistered } = values;
      if (streamHandler && !handlersRegistered && props.room) {
        actions.registerStreamHandlers();
      }
    },

    registerStreamHandlers: () => {
      const { streamHandler } = values;
      if (!streamHandler || !props.room) return;

      const localIdentity = props.room.localParticipant.identity;
      streamHandler.register("chat-logic", "tool-calls", (data) => {
        const json = JSON.parse(data);
        if (json.name === "check_everything" || json.name === "check_chat") {
          actions.setLastReadTimestamp();
        }
      });

      streamHandler.register("chat-logic", "chat", (data, sender) => {
        if (sender === localIdentity) {
          return;
        }
        const id = makeMessageId();
        actions.setMessages([
          ...values.messages,
          {
            id,
            timestamp: Date.now(),
            type: "message",
            sender: sender || "Agent",
            text: data,
          },
        ]);
      });
    },

    unregisterStreamHandlers: () => {
      const { streamHandler } = values;
      if (!streamHandler) return;
      streamHandler.unregister("chat-logic", "tool-calls");
      streamHandler.unregister("chat-logic", "chat");
    },
  }),

  events: ({ values, actions }) => ({
    afterMount: () => {
      // If streamHandler is already available (e.g., on reconnect), register immediately
      if (values.streamHandler && !values.handlersRegistered) {
        actions.registerStreamHandlers();
      }
    },
    beforeUnmount: () => {
      if (values.handlersRegistered) {
        actions.unregisterStreamHandlers();
      }
    },
  }),
});
