import { safeFormat } from './utils';
import { cn, Tooltip } from 'slate-ui';

import type {
  EmailEvent,
  SessionEvent,
  SmsEvent,
} from '../../logic/timelineLogic';
import { formatMs } from './utils';

// Blocks use percentage positions so their layout updates automatically when the
// container width changes via direct DOM mutation — no React re-render required.

interface PositionProps {
  startMs: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Session block
// ---------------------------------------------------------------------------

interface SessionBlockProps extends PositionProps {
  event: SessionEvent;
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onExpand: () => void;
}

export function SessionBlock({
  event,
  startMs,
  durationMs,
  isSelected,
  isExpanded,
  onClick,
  onExpand,
}: SessionBlockProps) {
  if (!event.started_at) return null;

  const evStart = new Date(event.started_at).getTime();
  const evEnd = event.ended_at
    ? new Date(event.ended_at).getTime()
    : evStart + (event.audio_duration_seconds ?? 60) * 1000;

  const leftPct = ((evStart - startMs) / durationMs) * 100;
  const widthPct = ((evEnd - evStart) / durationMs) * 100;
  const label = event.name ?? 'Session';
  const tooltipText = `${label} · ${safeFormat(evStart, 'MMM d HH:mm')} · ${event.audio_duration_seconds ? formatMs(event.audio_duration_seconds * 1000) : '—'}`;

  return (
    <Tooltip content={tooltipText}>
      <div
        className={cn(
          'absolute top-2 bottom-2 rounded cursor-pointer transition-colors duration-75 flex items-center overflow-hidden px-1.5',
          isExpanded
            ? 'bg-indigo-600 ring-2 ring-indigo-300'
            : isSelected
              ? 'bg-indigo-500'
              : 'bg-indigo-400/80 hover:bg-indigo-500',
        )}
        style={{ left: `${leftPct}%`, width: `max(${widthPct}%, 2px)` }}
        onClick={onClick}
        onDoubleClick={onExpand}
      >
        <span className="text-xs text-white truncate font-medium">{label}</span>
      </div>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// SMS tick
// ---------------------------------------------------------------------------

interface SmsTickProps extends PositionProps {
  event: SmsEvent;
  isSelected: boolean;
  onClick: () => void;
}

export function SmsTick({
  event,
  startMs,
  durationMs,
  isSelected,
  onClick,
}: SmsTickProps) {
  const t = new Date(event.timestamp).getTime();
  const leftPct = ((t - startMs) / durationMs) * 100;
  const isInbound = event.direction === 'inbound';
  const preview = event.body.length > 60 ? event.body.slice(0, 60) + '...' : event.body;

  return (
    <Tooltip content={`${isInbound ? '← In' : '→ Out'}: ${preview}`}>
      <div
        className={cn(
          'absolute top-1 bottom-1 w-[3px] rounded-full cursor-pointer transition-all duration-75',
          isSelected
            ? 'ring-1 ring-white ring-offset-1 ring-offset-neutral-100 w-[5px]'
            : 'hover:w-[5px]',
          isInbound ? 'bg-sky-400 hover:bg-sky-500' : 'bg-orange-400 hover:bg-orange-500',
        )}
        style={{ left: `calc(${leftPct}% - 1px)` }}
        onClick={onClick}
      />
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Email block
// ---------------------------------------------------------------------------

interface EmailBlockProps extends PositionProps {
  event: EmailEvent;
  isSelected: boolean;
  onClick: () => void;
}

export function EmailBlock({
  event,
  startMs,
  durationMs,
  isSelected,
  onClick,
}: EmailBlockProps) {
  const t = new Date(event.timestamp).getTime();
  const leftPct = ((t - startMs) / durationMs) * 100;
  const isInbound = event.direction === 'inbound';

  return (
    <Tooltip
      content={`${isInbound ? '← In' : '→ Out'}: ${event.subject} — ${event.snippet.slice(0, 80)}`}
    >
      <div
        className={cn(
          'absolute top-1 bottom-1 w-[3px] rounded-full cursor-pointer transition-all duration-75',
          isSelected
            ? 'ring-1 ring-white ring-offset-1 ring-offset-neutral-100 w-[5px]'
            : 'hover:w-[5px]',
          isInbound
            ? 'bg-purple-400 hover:bg-purple-500'
            : 'bg-fuchsia-400 hover:bg-fuchsia-500',
        )}
        style={{ left: `calc(${leftPct}% - 1px)` }}
        onClick={onClick}
      />
    </Tooltip>
  );
}
