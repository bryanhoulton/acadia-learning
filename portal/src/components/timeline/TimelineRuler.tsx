import { useMemo } from 'react';

import { formatTimeLabel } from './utils';

interface TimelineRulerProps {
  startMs: number;
  durationMs: number;
  zoom: number;
}

export function TimelineRuler({ startMs, durationMs, zoom }: TimelineRulerProps) {
  // Base tick density on the visible portion of the timeline, not the full range.
  const tickInterval = useMemo(() => {
    const visibleMs = durationMs / zoom;
    const approxTickMs = visibleMs / 12;
    if (approxTickMs < 60_000) return 60_000;
    if (approxTickMs < 600_000) return 600_000;
    if (approxTickMs < 3_600_000) return 3_600_000;
    if (approxTickMs < 86_400_000) return 86_400_000;
    return 604_800_000;
  }, [durationMs, zoom]);

  // Ticks are positioned as % of durationMs so they move correctly with the
  // container width without needing a React re-render.
  const ticks = useMemo(() => {
    const result: { pct: number; label: string }[] = [];
    const endMs = startMs + durationMs;
    const first = Math.floor(startMs / tickInterval) * tickInterval;
    for (let t = first; t <= endMs + tickInterval; t += tickInterval) {
      const pct = ((t - startMs) / durationMs) * 100;
      if (pct < -1 || pct > 101) continue;
      result.push({ pct, label: formatTimeLabel(t, durationMs) });
    }
    return result;
  }, [startMs, durationMs, tickInterval]);

  return (
    <div className="relative h-8 bg-neutral-50 border-b border-neutral-200 select-none">
      {ticks.map((tick, i) => (
        <div
          key={i}
          className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${tick.pct}%` }}
        >
          <div className="w-px h-3 bg-neutral-300 mt-auto" />
          <span className="text-[10px] text-neutral-400 mt-0.5 whitespace-nowrap">
            {tick.label}
          </span>
        </div>
      ))}
    </div>
  );
}
