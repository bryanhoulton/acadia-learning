import {
  useCallback,
  useRef,
} from 'react';

import {
  useActions,
  useValues,
} from 'kea';
import {
  Mail,
  MessageSquare,
  Phone,
} from 'lucide-react';

import type { TimelineEvent } from '../../logic/timelineLogic';
import { timelineLogic } from '../../logic/timelineLogic';
import {
  EmailBlock,
  SessionBlock,
  SmsTick,
} from './EventBlocks';
import { TimelineRuler } from './TimelineRuler';

function TrackLabel({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="w-28 shrink-0 px-3 py-2 flex items-center gap-1.5 bg-neutral-50/80 border-r border-neutral-100 sticky left-0 z-10">
      <span className="text-neutral-400">{icon}</span>
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <span className="text-[10px] text-neutral-300 ml-auto">{count}</span>
    </div>
  );
}

interface TimelineCanvasProps {
  onEventClick: (event: TimelineEvent) => void;
}

export function TimelineCanvas({ onEventClick }: TimelineCanvasProps) {
  const {
    zoom,
    containerWidth,
    totalWidth,
    timeRange,
    sessionEvents,
    smsEvents,
    emailEvents,
    selectedEvent,
    expandedSessionId,
  } = useValues(timelineLogic);

  const { setZoom, setContainerWidth, setExpandedSessionId } = useActions(timelineLogic);

  // Live refs — always current without going through React state
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerWidthRef = useRef(containerWidth);
  containerWidthRef.current = containerWidth;
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;

  // Direct DOM refs — mutated in the wheel handler, bypassing React entirely
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      const obs = new ResizeObserver((entries) => {
        for (const entry of entries) setContainerWidth(entry.contentRect.width);
      });
      obs.observe(node);

      node.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          e.preventDefault();

          // Horizontal swipe — pan the timeline
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            node.scrollLeft += e.deltaX;
            return;
          }

          // Vertical scroll → zoom anchored to the cursor position
          const factor = e.deltaY > 0 ? 0.92 : 1.08;
          const currentZoom = zoomRef.current;
          const newZoom = Math.max(1, Math.min(currentZoom * factor, 50));
          if (newZoom === currentZoom) return;

          const cw = containerWidthRef.current;
          const currentTotalWidth = cw * currentZoom;
          const newTotalWidth = cw * newZoom;

          // Anchor point: fraction of timeline under the cursor
          const rect = node.getBoundingClientRect();
          const cursorX = e.clientX - rect.left;
          const fraction = (node.scrollLeft + cursorX) / currentTotalWidth;

          // Mutate the DOM directly — blocks use % positions so they reflow
          // correctly without any React re-render.
          zoomRef.current = newZoom;
          if (contentRef.current) {
            contentRef.current.style.width = `${newTotalWidth}px`;
            contentRef.current.style.minWidth = `${newTotalWidth}px`;
          }
          node.scrollLeft = Math.max(0, fraction * newTotalWidth - cursorX);

          // Debounce the kea update — only needed to refresh ruler tick labels
          if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
          zoomDebounceRef.current = setTimeout(() => {
            setZoomRef.current(zoomRef.current);
            zoomDebounceRef.current = null;
          }, 150);
        },
        { passive: false },
      );
    },
    [setContainerWidth],
  );

  const { startMs, durationMs } = timeRange;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-x-auto overflow-y-auto overscroll-x-none"
    >
      {/* This div's width is React-controlled at init and after debounce fires,
          but mutated directly during wheel gestures. */}
      <div ref={contentRef} style={{ width: totalWidth, minWidth: '100%' }}>
        <TimelineRuler startMs={startMs} durationMs={durationMs} zoom={zoom} />

        {sessionEvents.length > 0 && (
          <div className="flex border-b border-neutral-100">
            <TrackLabel icon={<Phone size={12} />} label="Sessions" count={sessionEvents.length} />
            <div className="flex-1 relative h-28">
              {sessionEvents.map((ev) => (
                <SessionBlock
                  key={ev.id}
                  event={ev}
                  startMs={startMs}
                  durationMs={durationMs}
                  isSelected={selectedEvent?.type === 'session' && selectedEvent.id === ev.id}
                  isExpanded={expandedSessionId === ev.id}
                  onClick={() => onEventClick(ev)}
                  onExpand={() =>
                    setExpandedSessionId(expandedSessionId === ev.id ? null : ev.id)
                  }
                />
              ))}
            </div>
          </div>
        )}

        {smsEvents.length > 0 && (
          <div className="flex border-b border-neutral-100">
            <TrackLabel
              icon={<MessageSquare size={12} />}
              label="SMS"
              count={smsEvents.length}
            />
            <div className="flex-1 relative h-28">
              {smsEvents.map((ev) => (
                <SmsTick
                  key={ev.id}
                  event={ev}
                  startMs={startMs}
                  durationMs={durationMs}
                  isSelected={selectedEvent?.type === 'sms' && selectedEvent.id === ev.id}
                  onClick={() => onEventClick(ev)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex border-b border-neutral-100">
          <TrackLabel icon={<Mail size={12} />} label="Email" count={emailEvents.length} />
          <div className="flex-1 relative h-28">
            {emailEvents.map((ev) => (
              <EmailBlock
                key={ev.id}
                event={ev}
                startMs={startMs}
                durationMs={durationMs}
                isSelected={selectedEvent?.type === 'email' && selectedEvent.id === ev.id}
                onClick={() => onEventClick(ev)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
