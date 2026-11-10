import { safeFormat } from './utils';
import { motion } from 'framer-motion';
import {
  useActions,
  useValues,
} from 'kea';
import { X } from 'lucide-react';
import { cn } from 'slate-ui';

import type {
  EmailEvent,
  EmailMessage,
  EmailThreadDetail,
  SessionDetail,
  SessionEvent,
  SmsEvent,
  SpanDetail,
} from '../../logic/timelineLogic';
import { timelineLogic } from '../../logic/timelineLogic';
import { CodeBlock, FieldLabel, LoadingSpinner } from './shared';
import { formatMs } from './utils';

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function SpanDetailView({ detail, loading }: { detail: SpanDetail | null; loading: boolean }) {
  if (loading)
    return (
      <div className="col-span-2 flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  if (!detail)
    return (
      <div className="col-span-2 text-neutral-400 text-sm text-center py-8">
        Failed to load
      </div>
    );

  return (
    <>
      <div>
        <FieldLabel>Name</FieldLabel>
        <div className="text-base font-mono text-neutral-800">{detail.name}</div>
      </div>
      <div>
        <FieldLabel>Type</FieldLabel>
        <div className="text-base text-neutral-700">{detail.span_type}</div>
      </div>
      <div>
        <FieldLabel>Duration</FieldLabel>
        <div className="text-base text-neutral-700">
          {detail.duration_ms != null ? formatMs(detail.duration_ms) : '—'}
        </div>
      </div>
      <div>
        <FieldLabel>Started</FieldLabel>
        <div className="text-sm text-neutral-600 font-mono">
          {new Date(detail.started_at).toLocaleTimeString()}
        </div>
      </div>
      {detail.input_text && (
        <div className="col-span-2">
          <FieldLabel>Input</FieldLabel>
          <CodeBlock>{detail.input_text}</CodeBlock>
        </div>
      )}
      {detail.output_text && (
        <div className="col-span-2">
          <FieldLabel>Output</FieldLabel>
          <CodeBlock>{detail.output_text}</CodeBlock>
        </div>
      )}
      {detail.metadata && Object.keys(detail.metadata).length > 0 && (
        <div className="col-span-2">
          <FieldLabel>Metadata</FieldLabel>
          <CodeBlock>{JSON.stringify(detail.metadata, null, 2)}</CodeBlock>
        </div>
      )}
    </>
  );
}

function SessionDetailView({
  event,
  detail,
  loading,
}: {
  event: SessionEvent;
  detail: SessionDetail | null;
  loading: boolean;
}) {
  return (
    <>
      <div>
        <FieldLabel>Name</FieldLabel>
        <div className="text-base text-neutral-800">{event.name ?? 'Untitled'}</div>
      </div>
      {event.profile_name && (
        <div>
          <FieldLabel>Student</FieldLabel>
          <div className="text-base text-neutral-700">{event.profile_name}</div>
        </div>
      )}
      {event.started_at && (
        <div>
          <FieldLabel>Time</FieldLabel>
          <div className="text-sm text-neutral-600 font-mono">
            {safeFormat(event.started_at, 'PPpp')}
          </div>
        </div>
      )}
      {event.audio_duration_seconds != null && (
        <div>
          <FieldLabel>Audio Duration</FieldLabel>
          <div className="text-base text-neutral-700">
            {formatMs(event.audio_duration_seconds * 1000)}
          </div>
        </div>
      )}
      {event.description && (
        <div className="col-span-2">
          <FieldLabel>Description</FieldLabel>
          <div className="text-base text-neutral-600">{event.description}</div>
        </div>
      )}
      {loading ? (
        <div className="col-span-2 flex justify-center py-4">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {detail?.timestamped_summary && (
            <div className="col-span-2">
              <FieldLabel>Timestamped Summary</FieldLabel>
              <CodeBlock>{detail.timestamped_summary}</CodeBlock>
            </div>
          )}
          {detail?.transcript && (
            <div className="col-span-2">
              <FieldLabel>Transcript</FieldLabel>
              <CodeBlock>{detail.transcript}</CodeBlock>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SmsDetailView({ event }: { event: SmsEvent }) {
  return (
    <>
      <div>
        <FieldLabel>Direction</FieldLabel>
        <div
          className={cn(
            'text-base font-medium',
            event.direction === 'inbound' ? 'text-sky-600' : 'text-orange-600',
          )}
        >
          {event.direction === 'inbound' ? '← Inbound' : '→ Outbound'}
        </div>
      </div>
      <div>
        <FieldLabel>Time</FieldLabel>
        <div className="text-sm text-neutral-600 font-mono">
          {safeFormat(event.timestamp, 'PPpp')}
        </div>
      </div>
      <div>
        <FieldLabel>From</FieldLabel>
        <div className="text-sm text-neutral-600 font-mono">{event.from_number}</div>
      </div>
      <div>
        <FieldLabel>To</FieldLabel>
        <div className="text-sm text-neutral-600 font-mono">{event.to_number}</div>
      </div>
      <div className="col-span-2">
        <FieldLabel>Body</FieldLabel>
        <div className="text-base text-neutral-800 whitespace-pre-wrap bg-neutral-50 rounded-md p-3 border border-neutral-100 leading-relaxed">
          {event.body}
        </div>
      </div>
    </>
  );
}

function EmailMessageBubble({ message }: { message: EmailMessage }) {
  return (
    <div className="border border-neutral-100 rounded-md bg-neutral-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 bg-white">
        <span className="text-sm font-medium text-neutral-700 truncate">{message.from}</span>
        <span className="text-xs text-neutral-400 shrink-0 ml-2 font-mono">
          {safeFormat(message.date, 'MMM d, HH:mm')}
        </span>
      </div>
      <div className="px-3 py-2.5 text-base text-neutral-800 whitespace-pre-wrap leading-relaxed">
        {message.text || <span className="text-neutral-400 italic">No content</span>}
      </div>
      {message.attachments && message.attachments.length > 0 && (
        <div className="px-3 py-1.5 border-t border-neutral-100 flex flex-wrap gap-1.5">
          {message.attachments.map((a) => (
            <span
              key={a.attachment_id}
              className="text-[10px] bg-neutral-100 border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-600"
            >
              {a.filename}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailDetailView({
  event,
  thread,
  loading,
}: {
  event: EmailEvent;
  thread: EmailThreadDetail | null;
  loading: boolean;
}) {
  return (
    <>
      {/* Metadata row */}
      <div>
        <FieldLabel>Subject</FieldLabel>
        <div className="text-base font-medium text-neutral-800">{event.subject}</div>
      </div>
      <div>
        <FieldLabel>Time</FieldLabel>
        <div className="text-sm text-neutral-600 font-mono">
          {safeFormat(event.timestamp, 'PPpp')}
        </div>
      </div>
      <div>
        <FieldLabel>From</FieldLabel>
        <div className="text-sm text-neutral-600 font-mono truncate">{event.from_address}</div>
      </div>
      {event.to_addresses.length > 0 && (
        <div>
          <FieldLabel>To</FieldLabel>
          <div className="text-sm text-neutral-600 font-mono truncate">
            {event.to_addresses.join(', ')}
          </div>
        </div>
      )}

      {/* Thread messages */}
      <div className="col-span-2">
        <FieldLabel>
          Thread{thread ? ` (${thread.messages.length} messages)` : ''}
        </FieldLabel>
        {loading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner />
          </div>
        ) : thread && thread.messages.length > 0 ? (
          <div className="flex flex-col gap-2">
            {thread.messages.map((msg) => (
              <EmailMessageBubble key={msg.message_id} message={msg} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-400 italic py-2">
            {thread ? 'No messages in thread' : 'Failed to load thread'}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

export function DetailPanel() {
  const {
    selectedEvent,
    selectedSpanId,
    spanDetail,
    spanDetailLoading,
    sessionDetail,
    sessionDetailLoading,
    emailThreadDetail,
    emailThreadDetailLoading,
  } = useValues(timelineLogic);
  const { clearSelection } = useActions(timelineLogic);

  if (!selectedEvent && !selectedSpanId) return null;

  const title = selectedSpanId
    ? 'Span Detail'
    : selectedEvent?.type === 'session'
      ? 'Session'
      : selectedEvent?.type === 'email'
        ? 'Email Thread'
        : 'SMS Message';

  return (
    <motion.div
      className="shrink-0 border-t border-neutral-200 bg-white flex flex-col overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
        <h3 className="text-base font-semibold text-neutral-900 truncate">{title}</h3>
        <button
          onClick={clearSelection}
          className="text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="overflow-y-auto p-5 max-h-96">
        <div className="grid grid-cols-2 gap-x-10 gap-y-4">
          {selectedSpanId ? (
            <SpanDetailView detail={spanDetail} loading={spanDetailLoading} />
          ) : selectedEvent?.type === 'session' ? (
            <SessionDetailView
              event={selectedEvent}
              detail={sessionDetail}
              loading={sessionDetailLoading}
            />
          ) : selectedEvent?.type === 'sms' ? (
            <SmsDetailView event={selectedEvent} />
          ) : selectedEvent?.type === 'email' ? (
            <EmailDetailView
              event={selectedEvent}
              thread={emailThreadDetail}
              loading={emailThreadDetailLoading}
            />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
