import { useMemo } from "react";

import { Feather } from "lucide-react";
import { EmptyState } from "slate-ui";

import { TraceDetail } from "../traces/types";
import { PlaygroundRenderer } from "./PlaygroundRenderer";
import type { Playground } from "./registry";

interface PlaygroundReplayerProps {
  trace: TraceDetail | null;
  currentTimeSeconds: number;
  sessionStartedAt?: string | null;
}

interface PlaygroundUpdateEvent {
  timeOffset: number;
  playground: Playground;
}

export function PlaygroundReplayer({
  trace,
  currentTimeSeconds,
  sessionStartedAt,
}: PlaygroundReplayerProps) {
  // Parse and sort playground updates from the trace
  const playgroundEvents = useMemo(() => {
    if (!trace) return [];

    const events: PlaygroundUpdateEvent[] = [];

    // Use the sessionStartedAt prop if available (most accurate for audio sync)
    // Fall back to trace.started_at
    const startTime = sessionStartedAt || trace.started_at;
    let sessionStart = startTime ? new Date(startTime).getTime() : 0;

    // Fallback: If both headers are missing, we can check spans.
    if (!sessionStart && trace.spans && trace.spans.length > 0) {
      const startTimes = trace.spans.map((s) =>
        new Date(s.started_at).getTime()
      );
      sessionStart = Math.min(...startTimes);
    }

    trace.spans.forEach((span) => {
      if (span.name === "playground_update" && span.input_text) {
        try {
          const payload = JSON.parse(span.input_text);
          if (payload && payload.type) {
            const spanStart = new Date(span.started_at).getTime();
            const timeOffset = (spanStart - sessionStart) / 1000;
            events.push({
              timeOffset,
              playground: payload as Playground,
            });
          }
        } catch (e) {
          console.error("Failed to parse playground update span", e);
        }
      }
    });

    return events.sort((a, b) => a.timeOffset - b.timeOffset);
  }, [trace, sessionStartedAt]);

  // Find the active playground at current time
  const currentPlayground = useMemo(() => {
    let active: Playground | null = null;

    for (const event of playgroundEvents) {
      if (event.timeOffset <= currentTimeSeconds) {
        active = event.playground;
      } else {
        break;
      }
    }

    return active;
  }, [playgroundEvents, currentTimeSeconds]);

  if (!trace) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={Feather}
          title="Playground replay is not available for this session"
        />
      </div>
    );
  }

  if (!currentPlayground) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={Feather}
          title="No playground content has been added yet"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-white h-full">
      <div className="max-w-4xl mx-auto h-full">
        <PlaygroundRenderer
          playground={currentPlayground}
          questionsDisabled={true}
        />
      </div>
    </div>
  );
}
