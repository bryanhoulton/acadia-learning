import { encodingForModel } from "js-tiktoken";
import {
  MessageSquare,
  Mic,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";

export const SPAN_TYPE_CONFIG: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode; label: string }
> = {
  text: {
    bg: "bg-sky-500",
    text: "text-white",
    icon: React.createElement(MessageSquare, { size: 10 }),
    label: "text",
  },
  audio: {
    bg: "bg-violet-500",
    text: "text-white",
    icon: React.createElement(Mic, { size: 10 }),
    label: "audio",
  },
  tool: {
    bg: "bg-amber-500",
    text: "text-white",
    icon: React.createElement(Terminal, { size: 10 }),
    label: "tool",
  },
  function: {
    bg: "bg-emerald-500",
    text: "text-white",
    icon: React.createElement(Zap, { size: 10 }),
    label: "fn",
  },
  llm: {
    bg: "bg-rose-500",
    text: "text-white",
    icon: React.createElement(Sparkles, { size: 10 }),
    label: "llm",
  },
};

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatDurationCompact(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
}

/**
 * Count tokens in text using tiktoken (cl100k_base encoding for GPT models)
 */
export function countTokens(text: string | null): number {
  if (!text) return 0;
  try {
    const enc = encodingForModel("gpt-4");
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    console.error("Failed to count tokens:", error);
    return 0;
  }
}

