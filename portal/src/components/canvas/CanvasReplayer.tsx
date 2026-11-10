import { useMemo } from "react";

import { Feather } from "lucide-react";
import { EmptyState } from "slate-ui";

import BlockRenderer from "../playground/canvas/BlockRenderer";
import { Block } from "../playground/canvas/schema";
import { TraceDetail } from "../traces/types";

interface CanvasReplayerProps {
  trace: TraceDetail | null;
  currentTimeSeconds: number;
  sessionStartedAt?: string | null;
}

interface CanvasUpdateEvent {
  timeOffset: number;
  blocks: Block[];
}

export function CanvasReplayer({
  trace,
  currentTimeSeconds,
  sessionStartedAt,
}: CanvasReplayerProps) {
  // Parse and sort canvas updates from the trace
  const canvasEvents = useMemo(() => {
    if (!trace) return [];

    const events: CanvasUpdateEvent[] = [];

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
      if (span.name === "canvas_update" && span.input_text) {
        try {
          const payload = JSON.parse(span.input_text);
          if (payload && Array.isArray(payload.blocks)) {
            const spanStart = new Date(span.started_at).getTime();
            const timeOffset = (spanStart - sessionStart) / 1000;
            events.push({
              timeOffset,
              blocks: payload.blocks,
            });
          }
        } catch (e) {
          console.error("Failed to parse canvas update span", e);
        }
      }
    });

    return events.sort((a, b) => a.timeOffset - b.timeOffset);
  }, [trace, sessionStartedAt]);

  // Find the active blocks at current time
  const currentBlocks = useMemo(() => {
    // Find the last event that happened before or at currentTime
    let activeBlocks: Block[] = [];

    // We can iterate because expected number of updates is relatively small per session
    // For very large sessions, binary search could be an optimization
    for (const event of canvasEvents) {
      if (event.timeOffset <= currentTimeSeconds) {
        activeBlocks = event.blocks;
      } else {
        break;
      }
    }

    return activeBlocks;
  }, [canvasEvents, currentTimeSeconds]);

  if (!trace) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <EmptyState
          icon={Feather}
          title="Canvas replay is not available for this session"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-white h-full">
      <div className="max-w-4xl mx-auto h-full">
        <BlockRenderer
          content={{ blocks: currentBlocks }}
          questionsDisabled={true}
          emptyState={{
            icon: Feather,
            title: "No content has been added to the canvas yet",
          }}
        />
      </div>
    </div>
  );
}
