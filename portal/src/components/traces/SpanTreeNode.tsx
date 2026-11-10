import { useEffect, useRef } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Flag } from "lucide-react";
import { cn } from "slate-ui";

import { Span } from "./types";
import { formatDurationCompact, SPAN_TYPE_CONFIG } from "./utils";

type PlaybackState = "past" | "active" | "future" | null;

interface SpanTreeNodeProps {
  span: Span;
  childrenByParent: Map<string, Span[]>;
  depth: number;
  selectedSpanId: string | null;
  onSelectSpan: (span: Span) => void;
  collapsedSpans: Set<string>;
  onToggleCollapse: (id: string) => void;
  isLast?: boolean;
  /** Current playback time in ms relative to trace start */
  currentTimeMs?: number | null;
  /** Trace start time or Session absolute start time */
  traceStartTime?: Date | string | null;
}

export function SpanTreeNode({
  span,
  childrenByParent,
  depth,
  selectedSpanId,
  onSelectSpan,
  collapsedSpans,
  onToggleCollapse,
  isLast,
  currentTimeMs,
  traceStartTime,
}: SpanTreeNodeProps) {
  const typeConfig = SPAN_TYPE_CONFIG[span.span_type] || SPAN_TYPE_CONFIG.text;
  const children = childrenByParent.get(span.id) || [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedSpans.has(span.id);
  const isSelected = selectedSpanId === span.id;
  const nodeRef = useRef<HTMLDivElement>(null);

  // Calculate playback state
  let playbackState: PlaybackState = null;
  if (currentTimeMs !== null && currentTimeMs !== undefined && traceStartTime) {
    const traceStart = typeof traceStartTime === "string"
      ? new Date(traceStartTime).getTime()
      : traceStartTime instanceof Date
        ? traceStartTime.getTime()
        : 0;
    const spanStart = new Date(span.started_at).getTime();
    const spanEnd = span.ended_at ? new Date(span.ended_at).getTime() : spanStart + (span.duration_ms || 0);

    const spanStartRelative = spanStart - traceStart;
    const spanEndRelative = spanEnd - traceStart;

    if (currentTimeMs >= spanEndRelative) {
      playbackState = "past";
    } else if (currentTimeMs >= spanStartRelative && currentTimeMs < spanEndRelative) {
      playbackState = "active";
    } else {
      playbackState = "future";
    }
  }

  // Auto-scroll to active span
  useEffect(() => {
    if (playbackState === "active" && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [playbackState]);

  return (
    <div className="relative" ref={nodeRef}>
      {/* Vertical connector line */}
      {depth > 0 && (
        <div
          className={cn(
            "absolute left-0 top-0 w-px transition-colors duration-200",
            playbackState === "future" ? "bg-neutral-100" : "bg-neutral-200"
          )}
          style={{
            left: (depth - 1) * 20 + 10,
            height: isLast ? 16 : "100%",
          }}
        />
      )}

      {/* Horizontal connector line */}
      {depth > 0 && (
        <div
          className={cn(
            "absolute top-4 h-px transition-colors duration-200",
            playbackState === "future" ? "bg-neutral-100" : "bg-neutral-200"
          )}
          style={{
            left: (depth - 1) * 20 + 10,
            width: 10,
          }}
        />
      )}

      <div
        className={cn(
          "flex items-center group cursor-pointer rounded-md transition-all relative",
          isSelected && "bg-blue-50 ring-1 ring-blue-200",
          !isSelected && playbackState === "past" && "hover:bg-neutral-50",
          !isSelected && playbackState === "future" && "opacity-40 hover:opacity-70",
          !isSelected && (playbackState === null || playbackState === "active") && "hover:bg-neutral-50"
        )}
        style={{ marginLeft: depth * 20 }}
      >
        {/* Collapse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleCollapse(span.id);
          }}
          className={cn(
            "w-5 h-8 flex items-center justify-center shrink-0",
            hasChildren ? "cursor-pointer" : "cursor-default"
          )}
        >
          {hasChildren && (
            <motion.div
              animate={{ rotate: isCollapsed ? 0 : 90 }}
              transition={{ duration: 0.1 }}
            >
              <ChevronRight size={12} className="text-neutral-400" />
            </motion.div>
          )}
        </button>

        {/* Main content */}
        <button
          onClick={() => onSelectSpan(span)}
          className="flex-1 flex items-center gap-2 py-1.5 pr-3 min-w-0"
        >
          {/* Type badge - compact pill style */}
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 shrink-0 uppercase transition-opacity",
              typeConfig.bg,
              typeConfig.text,
              playbackState === "future" && "opacity-50"
            )}
          >
            {typeConfig.icon}
            {typeConfig.label}
          </span>

          {/* Name */}
          <span
            className={cn(
              "text-sm font-mono truncate flex-1 min-w-0 text-left transition-colors",
              playbackState === "future" ? "text-neutral-400" : "text-neutral-700"
            )}
          >
            {span.name}
          </span>

          {/* Flagged indicator */}
          {span.metadata.flagged && (
            <span
              className={cn(
                "shrink-0 text-amber-500 transition-opacity",
                playbackState === "future" && "opacity-50"
              )}
              title="Transcription flagged as incorrect"
            >
              <Flag size={12} fill="currentColor" />
            </span>
          )}

          {/* Duration - always visible, styled nicely */}
          <span
            className={cn(
              "text-[11px] font-mono shrink-0 px-1.5 py-0.5 rounded transition-opacity",
              span.duration_ms === null
                ? "text-neutral-300"
                : span.duration_ms > 5000
                  ? "bg-amber-50 text-amber-600"
                  : "bg-neutral-100 text-neutral-500",
              playbackState === "future" && "opacity-50"
            )}
          >
            {formatDurationCompact(span.duration_ms)}
          </span>

          {/* Child count badge */}
          {hasChildren && (
            <span className="text-[10px] bg-neutral-200 text-neutral-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-medium">
              {children.length}
            </span>
          )}
        </button>
      </div>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && !isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {children
              .sort(
                (a, b) =>
                  new Date(a.started_at).getTime() -
                  new Date(b.started_at).getTime()
              )
              .map((child, idx) => (
                <SpanTreeNode
                  key={child.id}
                  span={child}
                  childrenByParent={childrenByParent}
                  depth={depth + 1}
                  selectedSpanId={selectedSpanId}
                  onSelectSpan={onSelectSpan}
                  collapsedSpans={collapsedSpans}
                  onToggleCollapse={onToggleCollapse}
                  isLast={idx === children.length - 1}
                  currentTimeMs={currentTimeMs}
                  traceStartTime={traceStartTime}
                />
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

