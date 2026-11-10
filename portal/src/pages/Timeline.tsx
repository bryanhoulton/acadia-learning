import {
  useCallback,
  useEffect,
} from 'react';

import {
  useActions,
  useValues,
} from 'kea';
import {
  Maximize2,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import {
  Button,
  cn,
  TextInput,
  Tooltip,
} from 'slate-ui';

import { authLogic } from '../logic/authLogic';
import type { TimelineEvent } from '../logic/timelineLogic';
import { timelineLogic } from '../logic/timelineLogic';
import { DetailPanel } from '../components/timeline/DetailPanel';
import { SessionDrillDown } from '../components/timeline/SessionDrillDown';
import { TimelineCanvas } from '../components/timeline/TimelineCanvas';
import {
  AccessDenied,
  LoadingScreen,
  LoadingSpinner,
} from '../components/timeline/shared';

// ---------------------------------------------------------------------------
// Entity search dropdown
// ---------------------------------------------------------------------------

function EntityPicker() {
  const { entities, entitiesLoading, entitySearch, selectedEntity, selectedEntityId } =
    useValues(timelineLogic);
  const { setEntitySearch, selectEntity, clearEntity } = useActions(timelineLogic);

  return (
    <div className="relative w-72">
      <TextInput
        placeholder="Search by name, ID, or account..."
        value={entitySearch}
        onChange={setEntitySearch}
        iconLeft={Search}
      />
      {selectedEntity && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          <span className="text-xs bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded flex items-center gap-1.5">
            {selectedEntity.display}
            <button
              onClick={() => clearEntity()}
              className="text-neutral-400 hover:text-neutral-600"
            >
              <X size={10} />
            </button>
          </span>
        </div>
      )}
      {entitySearch.length > 0 && !selectedEntity && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {entitiesLoading ? (
            <div className="p-3 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : entities.length === 0 ? (
            <div className="p-3 text-center text-neutral-400 text-xs">No matches</div>
          ) : (
            entities.slice(0, 15).map((entity) => (
              <button
                key={entity.id}
                onClick={() => selectEntity(entity.id)}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-neutral-50 transition-colors border-t border-neutral-100 first:border-t-0',
                  selectedEntityId === entity.id && 'bg-neutral-50 font-medium',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{entity.display}</span>
                  <span className="text-[10px] text-neutral-400 ml-2 shrink-0">
                    #{entity.id}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zoom toolbar + legend
// ---------------------------------------------------------------------------

function TimelineToolbar() {
  const { zoom } = useValues(timelineLogic);
  const { setZoom, fitToView } = useActions(timelineLogic);

  return (
    <div className="shrink-0 border-b border-neutral-200 px-4 py-2 flex items-center gap-2">
      <Tooltip content="Zoom out">
        <Button
          size="sm"
          variant="subtle"
          iconLeft={Minus}
          onClick={() => setZoom(zoom - 0.5)}
          disabled={zoom <= 1}
        />
      </Tooltip>
      <div className="w-16 text-center text-xs text-neutral-500 font-mono">
        {zoom.toFixed(1)}x
      </div>
      <Tooltip content="Zoom in">
        <Button
          size="sm"
          variant="subtle"
          iconLeft={Plus}
          onClick={() => setZoom(zoom + 0.5)}
          disabled={zoom >= 50}
        />
      </Tooltip>
      <Tooltip content="Fit to view">
        <Button size="sm" variant="subtle" iconLeft={Maximize2} onClick={fitToView} />
      </Tooltip>
      <div className="flex-1" />
      <div className="flex items-center gap-3 text-[10px] text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2.5 rounded-sm bg-indigo-400 inline-block" /> Sessions
        </span>
        <span className="flex items-center gap-1">
          <span className="w-[3px] h-3 rounded-full bg-sky-400 inline-block" /> SMS In
        </span>
        <span className="flex items-center gap-1">
          <span className="w-[3px] h-3 rounded-full bg-orange-400 inline-block" /> SMS Out
        </span>
        <span className="flex items-center gap-1">
          <span className="w-[3px] h-3 rounded-full bg-purple-400 inline-block" /> Email In
        </span>
        <span className="flex items-center gap-1">
          <span className="w-[3px] h-3 rounded-full bg-fuchsia-400 inline-block" /> Email Out
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Timeline() {
  const { account, isAccountLoading, hasAttemptedFetch } = useValues(authLogic);
  const {
    selectedEntityId,
    timelineEventsLoading,
    timelineEvents,
    sessionEvents,
    smsEvents,
    emailEvents,
    selectedEvent,
    selectedSpanId,
  } = useValues(timelineLogic);
  const { selectEvent, clearSelection } = useActions(timelineLogic);

  const isAdmin = account?.is_admin ?? false;

  // Prevent browser back/forward navigation from horizontal trackpad swipes anywhere
  // on the page. Vertical scrolls (detail panels etc.) are left untouched.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  const handleEventClick = useCallback(
    (event: TimelineEvent) => {
      const isSame =
        selectedEvent &&
        selectedEvent.type === event.type &&
        selectedEvent.id === event.id;
      if (isSame) clearSelection();
      else selectEvent(event);
    },
    [selectedEvent, selectEvent, clearSelection],
  );

  if (isAccountLoading || !hasAttemptedFetch)
    return <LoadingScreen message="Checking access..." />;
  if (!isAdmin) return <AccessDenied />;

  const hasEvents = timelineEvents.length > 0;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden overscroll-none">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-neutral-900 shrink-0">Agent Timeline</h1>
          <EntityPicker />
          {hasEvents && (
            <div className="text-xs text-neutral-400 ml-auto">
              {sessionEvents.length} sessions &middot; {smsEvents.length} SMS &middot;{' '}
              {emailEvents.length} emails
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedEntityId ? (
          <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
            Search for an entity above to view its timeline
          </div>
        ) : timelineEventsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : !hasEvents ? (
          <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
            No events in the last 90 days
          </div>
        ) : (
          <>
            <TimelineToolbar />
            <TimelineCanvas onEventClick={handleEventClick} />
            <SessionDrillDown />
            <AnimatePresence>
              {(selectedEvent || selectedSpanId) && <DetailPanel />}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
