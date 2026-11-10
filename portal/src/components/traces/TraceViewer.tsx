import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { format } from 'date-fns';
import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import {
  Activity,
  Check,
  Clock,
  Loader2,
  Minus,
  Zap,
} from 'lucide-react';

import { SpanDetailPanel } from './SpanDetailPanel';
import { SpanTreeNode } from './SpanTreeNode';
import {
  Span,
  TraceDetail,
} from './types';
import { formatDuration } from './utils';

interface TraceViewerProps {
  trace: TraceDetail | null;
  loading?: boolean;
  rightPanelWidth?: number;
  onRightPanelResize?: (delta: number) => void;
  showHeader?: boolean;
  /** Current playback time in seconds (from audio player) */
  currentTimeSeconds?: number | null;
  /** Callback when a span is updated (e.g., flagged) */
  onSpanUpdate?: (updatedSpan: Span) => void;
  /** Callback to load more spans (for pagination) */
  onLoadMoreSpans?: () => void;
  /** Whether more spans are currently being loaded */
  loadingMoreSpans?: boolean;
  /** Start time of the session (for absolute sync) */
  sessionStartedAt?: string | null;
}

export function TraceViewer({
  trace,
  loading = false,
  rightPanelWidth = 384,
  onRightPanelResize,
  showHeader = true,
  currentTimeSeconds,
  onSpanUpdate,
  onLoadMoreSpans,
  loadingMoreSpans = false,
  sessionStartedAt,
}: TraceViewerProps) {
  // Convert seconds to ms for span comparison
  const currentTimeMs =
    currentTimeSeconds !== null && currentTimeSeconds !== undefined
      ? currentTimeSeconds * 1000
      : null;
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const toggleCollapse = useCallback((spanId: string) => {
    setCollapsedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  }, []);

  // Infinite scroll - load more spans when scrolling near bottom
  useEffect(() => {
    if (!onLoadMoreSpans || !trace?.spans_pagination?.has_more) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMoreSpans) {
          onLoadMoreSpans();
        }
      },
      { rootMargin: "200px" }
    );

    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [onLoadMoreSpans, loadingMoreSpans, trace?.spans_pagination?.has_more]);

  const handleSpanUpdate = useCallback(
    (updatedSpan: Span) => {
      // Update the selected span if it's the one being updated
      setSelectedSpan(updatedSpan);
      // Propagate to parent
      onSpanUpdate?.(updatedSpan);
    },
    [onSpanUpdate]
  );

  // Build span tree
  const { rootSpans, childrenByParent } = useMemo(() => {
    if (!trace)
      return { rootSpans: [], childrenByParent: new Map<string, Span[]>() };

    const children = new Map<string, Span[]>();
    const roots: Span[] = [];

    trace.spans.forEach((span) => {
      if (span.parent) {
        const existing = children.get(span.parent) || [];
        existing.push(span);
        children.set(span.parent, existing);
      } else {
        roots.push(span);
      }
    });

    roots.sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );

    return { rootSpans: roots, childrenByParent: children };
  }, [trace]);

  if (loading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <div className="text-center">
          <motion.div
            className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-neutral-900 mx-auto"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-neutral-400 text-sm mt-4">Loading trace...</p>
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Activity size={20} className="text-neutral-300" />
          </div>
          <p className="text-neutral-400 text-sm">No trace data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Trace Header */}
        {showHeader && (
          <div className="p-4 border-b border-neutral-100 shrink-0 bg-neutral-50">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 font-mono">
                  {trace.name}
                </h2>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-400">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {format(new Date(trace.started_at), "MMM d, h:mm:ss a")}
                  </span>
                  {trace.ended_at ? (
                    <span className="flex items-center gap-1 bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">
                      <Check size={10} />
                      {formatDuration(
                        new Date(trace.ended_at).getTime() -
                        new Date(trace.started_at).getTime()
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded text-amber-600">
                      <Activity size={10} />
                      Running
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Zap size={11} />
                    {trace.spans_pagination
                      ? `${trace.spans.length} / ${trace.spans_pagination.total_count} spans`
                      : `${trace.spans.length} spans`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Span Tree */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          <div className="space-y-0.5 p-1">
            {rootSpans.length > 0 ? (
              rootSpans.map((span, idx) => (
                <SpanTreeNode
                  key={span.id}
                  span={span}
                  childrenByParent={childrenByParent}
                  depth={0}
                  selectedSpanId={selectedSpan?.id || null}
                  onSelectSpan={setSelectedSpan}
                  collapsedSpans={collapsedSpans}
                  onToggleCollapse={toggleCollapse}
                  isLast={idx === rootSpans.length - 1}
                  currentTimeMs={currentTimeMs}
                  traceStartTime={sessionStartedAt || trace?.started_at}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                  <Minus size={16} className="text-neutral-300" />
                </div>
                <p className="text-xs text-neutral-400">No spans recorded</p>
              </div>
            )}

            {/* Load more trigger for infinite scroll */}
            {trace?.spans_pagination?.has_more && (
              <div
                ref={loadMoreTriggerRef}
                className="py-4 flex justify-center"
              >
                {loadingMoreSpans ? (
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <Loader2 size={14} className="animate-spin" />
                    Loading more spans...
                  </div>
                ) : (
                  <div className="text-xs text-neutral-300">
                    Scroll for more spans
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Span Detail Panel */}
      <AnimatePresence>
        {selectedSpan && (
          <SpanDetailPanel
            span={selectedSpan}
            onClose={() => setSelectedSpan(null)}
            width={rightPanelWidth}
            onResize={onRightPanelResize}
            onSpanUpdate={handleSpanUpdate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
