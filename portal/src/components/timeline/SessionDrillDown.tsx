import { useMemo } from 'react';

import {
  useActions,
  useValues,
} from 'kea';
import { ArrowLeft } from 'lucide-react';
import { Button, cn, Tooltip } from 'slate-ui';

import { timelineLogic } from '../../logic/timelineLogic';
import { LoadingSpinner } from './shared';
import {
  classifySpan,
  SPAN_TRACKS,
  type SpanTrackId,
} from './spanTracks';
import { formatMs } from './utils';

export function SessionDrillDown() {
  const {
    expandedSessionId,
    expandedSpans,
    sessionSpansLoading,
    selectedSpanId,
    sessionDetail,
  } = useValues(timelineLogic);
  const { setExpandedSessionId, selectSpan } = useActions(timelineLogic);

  const grouped = useMemo(() => {
    const map = new Map<SpanTrackId, typeof expandedSpans>();
    for (const t of SPAN_TRACKS) map.set(t.id, []);
    for (const span of expandedSpans) map.get(classifySpan(span))!.push(span);
    return map;
  }, [expandedSpans]);

  const activeTracks = SPAN_TRACKS.filter((t) => (grouped.get(t.id)?.length ?? 0) > 0);

  if (!expandedSessionId) return null;

  let sessionStartMs = 0;
  let sessionDurationMs = 1;
  if (expandedSpans.length > 0) {
    const times = expandedSpans.map((s) => new Date(s.started_at).getTime());
    const endTimes = expandedSpans
      .filter((s) => s.ended_at)
      .map((s) => new Date(s.ended_at!).getTime());
    sessionStartMs = Math.min(...times);
    const endMs = Math.max(...times, ...endTimes);
    sessionDurationMs = Math.max(endMs - sessionStartMs, 1000);
  }

  return (
    <div className="shrink-0 border-t border-neutral-200 bg-neutral-50/50 max-h-64 overflow-y-auto">
      <div className="flex items-center px-4 py-2 border-b border-neutral-100 gap-2">
        <Button
          size="sm"
          variant="subtle"
          iconLeft={ArrowLeft}
          onClick={() => setExpandedSessionId(null)}
        />
        <span className="text-sm font-semibold text-neutral-700">
          Session Spans{sessionDetail?.name ? ` — ${sessionDetail.name}` : ''}
        </span>
        {sessionSpansLoading && <LoadingSpinner />}
        <span className="text-xs text-neutral-400 ml-auto">{expandedSpans.length} spans</span>
      </div>

      {sessionSpansLoading && expandedSpans.length === 0 ? (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      ) : activeTracks.length === 0 && !sessionSpansLoading ? (
        <div className="text-center text-neutral-400 text-xs py-6">No span data</div>
      ) : (
        activeTracks.map((track) => {
          const spans = grouped.get(track.id) ?? [];
          return (
            <div key={track.id} className="flex border-b border-neutral-100 last:border-b-0">
              <div className="w-28 shrink-0 px-3 py-2 flex items-center gap-1.5 bg-neutral-50/80 border-r border-neutral-100">
                <span className="text-neutral-400">{track.icon}</span>
                <span className="text-sm font-medium text-neutral-600 truncate">
                  {track.label}
                </span>
                <span className="text-xs text-neutral-300 ml-auto">{spans.length}</span>
              </div>
              <div className="flex-1 relative h-9">
                {spans.map((span) => {
                  const sStart = new Date(span.started_at).getTime() - sessionStartMs;
                  const sEnd = span.ended_at
                    ? new Date(span.ended_at).getTime() - sessionStartMs
                    : sStart + 500;
                  const leftPct = (sStart / sessionDurationMs) * 100;
                  const widthPct = Math.max(((sEnd - sStart) / sessionDurationMs) * 100, 0.3);
                  const isSelected = selectedSpanId === span.id;
                  const tipText = `${span.name} · ${span.duration_ms != null ? formatMs(span.duration_ms) : '—'}`;

                  return (
                    <Tooltip key={span.id} content={tipText}>
                      <div
                        className={cn(
                          'absolute top-1 bottom-1 rounded-sm cursor-pointer transition-colors duration-75',
                          isSelected ? track.selectedColor : track.color,
                          !isSelected && track.hoverColor,
                          isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-neutral-50',
                        )}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        onClick={() => selectSpan(isSelected ? null : span.id)}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
