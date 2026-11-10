import { kea } from "kea";
import { toast } from "sonner";

import client from "../utils/api";
import type { timelineLogicType } from "./timelineLogicType";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityListItem {
  id: number;
  name: string;
  display: string;
  account_name: string | null;
  profile_names: string[];
}

export interface SessionEvent {
  type: "session";
  id: string;
  started_at: string | null;
  ended_at: string | null;
  name: string | null;
  description: string | null;
  profile_name: string | null;
  audio_duration_seconds: number | null;
  annotation_count: number;
}

export interface SmsEvent {
  type: "sms";
  id: number;
  timestamp: string;
  direction: "inbound" | "outbound";
  body: string;
  from_number: string;
  to_number: string;
  has_attachments: boolean;
}

export interface EmailEvent {
  type: "email";
  id: string;
  timestamp: string;
  subject: string;
  snippet: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_addresses: string[];
  thread_id: string;
}

export type TimelineEvent = SessionEvent | SmsEvent | EmailEvent;

export interface TimelineSpan {
  id: string;
  trace: string;
  parent: string | null;
  name: string;
  span_type: "text" | "audio" | "tool" | "function" | "llm";
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
}

interface TraceTimeline {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  spans: TimelineSpan[];
}

export interface SpanDetail {
  id: string;
  name: string;
  span_type: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  input_text: string | null;
  output_text: string | null;
  metadata: Record<string, unknown>;
}

export interface EmailMessage {
  message_id: string;
  from: string;
  to: string[];
  date: string;
  text: string;
  attachments?: { attachment_id: string; filename: string }[];
}

export interface EmailThreadDetail {
  thread_id: string;
  subject: string;
  messages: EmailMessage[];
}

export interface SessionDetail {
  id: string;
  name: string | null;
  description: string | null;
  transcript: string | null;
  timestamped_summary: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  audio_duration_seconds: number | null;
  annotations: {
    id: string;
    start_time: number;
    end_time: number;
    sentiment: string;
    category: string;
    severity: string;
    notes: string;
  }[];
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

export const timelineLogic = kea<timelineLogicType>({
  path: ["src", "logic", "timelineLogic"],

  actions: {
    setEntitySearch: (query: string) => ({ query }),
    selectEntity: (entityId: number) => ({ entityId }),
    clearEntity: true,
    selectEvent: (event: TimelineEvent | null) => ({ event }),
    clearSelection: true,

    loadSessionSpans: (sessionId: string) => ({ sessionId }),
    setSessionSpans: (sessionId: string, spans: TimelineSpan[]) => ({
      sessionId,
      spans,
    }),
    setSessionSpansLoading: (loading: boolean) => ({ loading }),

    loadSessionDetail: (sessionId: string) => ({ sessionId }),
    setSessionDetail: (detail: SessionDetail | null) => ({ detail }),
    setSessionDetailLoading: (loading: boolean) => ({ loading }),

    loadSpanDetail: (spanId: string) => ({ spanId }),
    setSpanDetail: (detail: SpanDetail | null) => ({ detail }),
    setSpanDetailLoading: (loading: boolean) => ({ loading }),

    selectSpan: (spanId: string | null) => ({ spanId }),

    loadEmailThread: (entityId: number, threadId: string) => ({ entityId, threadId }),
    setEmailThreadDetail: (detail: EmailThreadDetail | null) => ({ detail }),
    setEmailThreadDetailLoading: (loading: boolean) => ({ loading }),

    setZoom: (zoom: number) => ({ zoom }),
    setScrollLeft: (scrollLeft: number) => ({ scrollLeft }),
    fitToView: true,
    setContainerWidth: (width: number) => ({ width }),

    setExpandedSessionId: (sessionId: string | null) => ({ sessionId }),
  },

  loaders: {
    entities: [
      [] as EntityListItem[],
      {
        loadEntities: async (search: string) => {
          if (!search) return [];
          const { data, error } = await client.GET(
            "/api/tracing/entities/list/",
            { params: { query: { search } } }
          );
          if (error || !data) {
            toast.error("Failed to load entities");
            return [];
          }
          return data as unknown as EntityListItem[];
        },
      },
    ],
    timelineEvents: [
      [] as TimelineEvent[],
      {
        loadTimeline: async (entityId: number) => {
          const { data, error } = await client.GET(
            "/api/entities/control/{entity_id}/timeline/",
            { params: { path: { entity_id: entityId }, query: { days: 365 } } }
          );
          if (error || !data) {
            toast.error("Failed to load timeline");
            return [];
          }
          return (data as unknown as { events: TimelineEvent[] }).events;
        },
      },
    ],
  },

  reducers: {
    entitySearch: [
      "" as string,
      {
        setEntitySearch: (_, { query }) => query,
        selectEntity: () => "",
        clearEntity: () => "",
      },
    ],
    selectedEntityId: [
      null as number | null,
      {
        selectEntity: (_, { entityId }) => entityId,
        clearEntity: () => null,
      },
    ],
    selectedEvent: [
      null as TimelineEvent | null,
      {
        selectEvent: (_, { event }) => event,
        clearSelection: () => null,
        selectEntity: () => null,
        clearEntity: () => null,
      },
    ],
    selectedSpanId: [
      null as string | null,
      {
        selectSpan: (_, { spanId }) => spanId,
        clearSelection: () => null,
        selectEntity: () => null,
        clearEntity: () => null,
        setExpandedSessionId: () => null,
      },
    ],
    expandedSessionId: [
      null as string | null,
      {
        setExpandedSessionId: (_, { sessionId }) => sessionId,
        selectEntity: () => null,
        clearEntity: () => null,
      },
    ],
    sessionSpansMap: [
      {} as Record<string, TimelineSpan[]>,
      {
        setSessionSpans: (state, { sessionId, spans }) => ({
          ...state,
          [sessionId]: spans,
        }),
        selectEntity: () => ({}),
        clearEntity: () => ({}),
      },
    ],
    sessionSpansLoading: [
      false,
      {
        setSessionSpansLoading: (_, { loading }) => loading,
      },
    ],
    sessionDetail: [
      null as SessionDetail | null,
      {
        setSessionDetail: (_, { detail }) => detail,
        selectEntity: () => null,
        clearEntity: () => null,
        setExpandedSessionId: () => null,
      },
    ],
    sessionDetailLoading: [
      false,
      {
        setSessionDetailLoading: (_, { loading }) => loading,
      },
    ],
    spanDetail: [
      null as SpanDetail | null,
      {
        setSpanDetail: (_, { detail }) => detail,
        selectSpan: () => null,
        selectEntity: () => null,
        clearEntity: () => null,
      },
    ],
    spanDetailLoading: [
      false,
      {
        setSpanDetailLoading: (_, { loading }) => loading,
      },
    ],
    emailThreadDetail: [
      null as EmailThreadDetail | null,
      {
        setEmailThreadDetail: (_, { detail }) => detail,
        selectEvent: () => null,
        selectEntity: () => null,
        clearEntity: () => null,
      },
    ],
    emailThreadDetailLoading: [
      false,
      {
        setEmailThreadDetailLoading: (_, { loading }) => loading,
      },
    ],
    zoom: [
      1 as number,
      {
        setZoom: (_, { zoom }) => Math.max(1, Math.min(zoom, 50)),
        fitToView: () => 1,
        selectEntity: () => 1,
        clearEntity: () => 1,
      },
    ],
    scrollLeft: [
      0 as number,
      {
        setScrollLeft: (_, { scrollLeft }) => scrollLeft,
        fitToView: () => 0,
        selectEntity: () => 0,
        clearEntity: () => 0,
      },
    ],
    containerWidth: [
      1000 as number,
      {
        setContainerWidth: (_, { width }) => width,
      },
    ],
  },

  selectors: {
    selectedEntity: [
      (s) => [s.selectedEntityId, s.entities],
      (id, entities): EntityListItem | null =>
        entities.find((e) => e.id === id) ?? null,
    ],


    sessionEvents: [
      (s) => [s.timelineEvents],
      (events): SessionEvent[] =>
        events.filter((e): e is SessionEvent => e.type === "session"),
    ],

    smsEvents: [
      (s) => [s.timelineEvents],
      (events): SmsEvent[] =>
        events.filter((e): e is SmsEvent => e.type === "sms"),
    ],

    emailEvents: [
      (s) => [s.timelineEvents],
      (events): EmailEvent[] =>
        events.filter((e): e is EmailEvent => e.type === "email"),
    ],

    timeRange: [
      (s) => [s.timelineEvents],
      (
        events
      ): { startMs: number; endMs: number; durationMs: number } => {
        if (events.length === 0)
          return { startMs: 0, endMs: 0, durationMs: 0 };

        const times = events.map((e) => {
          if (e.type === "session" && e.started_at)
            return new Date(e.started_at).getTime();
          if (e.type === "sms") return new Date(e.timestamp).getTime();
          if (e.type === "email") return new Date(e.timestamp).getTime();
          return 0;
        });
        const endTimes = events.map((e) => {
          if (e.type === "session" && e.ended_at)
            return new Date(e.ended_at).getTime();
          if (e.type === "session" && e.started_at) {
            const dur = (e.audio_duration_seconds ?? 60) * 1000;
            return new Date(e.started_at).getTime() + dur;
          }
          if (e.type === "sms") return new Date(e.timestamp).getTime();
          if (e.type === "email") return new Date(e.timestamp).getTime();
          return 0;
        });

        const startMs = Math.min(...times.filter(Boolean));
        const endMs = Math.max(...endTimes.filter(Boolean));
        const rawDuration = Math.max(endMs - startMs, 60000);
        const padding = rawDuration * 0.02;
        return {
          startMs: startMs - padding,
          endMs: endMs + padding,
          durationMs: rawDuration + padding * 2,
        };
      },
    ],

    totalWidth: [
      (s) => [s.containerWidth, s.zoom],
      (containerWidth, zoom): number => containerWidth * zoom,
    ],

    expandedSpans: [
      (s) => [s.expandedSessionId, s.sessionSpansMap],
      (id, map): TimelineSpan[] => (id ? map[id] ?? [] : []),
    ],
  },

  listeners: ({ actions, values }) => ({
    setEntitySearch: async ({ query }, breakpoint) => {
      await breakpoint(300);
      if (query.length > 0) {
        actions.loadEntities(query);
      }
    },

    selectEntity: async ({ entityId }) => {
      actions.loadTimeline(entityId);
    },

    selectEvent: ({ event }) => {
      if (event?.type === "session") {
        actions.loadSessionDetail(event.id);
      }
      if (event?.type === "email" && values.selectedEntityId) {
        actions.loadEmailThread(values.selectedEntityId, event.thread_id);
      }
    },

    loadSessionSpans: async ({ sessionId }, breakpoint) => {
      actions.setSessionSpansLoading(true);
      try {
        const { data: tracesData } = await client.GET(
          "/api/tracing/sessions/{session_id}/traces/",
          { params: { path: { session_id: sessionId } } }
        );
        await breakpoint();

        const traceResults = (
          tracesData as unknown as { results: { id: string }[] }
        )?.results;

        if (traceResults && traceResults.length > 0) {
          const batches = await Promise.all(
            traceResults.map(async (trace) => {
              const { data } = await client.GET(
                "/api/tracing/traces/{trace_id}/timeline/",
                { params: { path: { trace_id: trace.id } } }
              );
              return (data as unknown as TraceTimeline)?.spans ?? [];
            })
          );
          await breakpoint();
          actions.setSessionSpans(sessionId, batches.flat());
        } else {
          actions.setSessionSpans(sessionId, []);
        }
      } catch {
        toast.error("Failed to load session spans");
      } finally {
        actions.setSessionSpansLoading(false);
      }
    },

    setExpandedSessionId: async ({ sessionId }) => {
      if (!sessionId) return;
      actions.loadSessionSpans(sessionId);
      actions.loadSessionDetail(sessionId);
    },

    loadSessionDetail: async ({ sessionId }, breakpoint) => {
      actions.setSessionDetailLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/entities/sessions/{id}/",
          { params: { path: { id: sessionId } } }
        );
        await breakpoint();
        if (error || !data) {
          toast.error("Failed to load session detail");
          return;
        }
        actions.setSessionDetail(data as unknown as SessionDetail);
      } finally {
        actions.setSessionDetailLoading(false);
      }
    },

    loadSpanDetail: async ({ spanId }, breakpoint) => {
      actions.setSpanDetailLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/tracing/spans/{span_id}/",
          { params: { path: { span_id: spanId } } }
        );
        await breakpoint();
        if (error || !data) {
          toast.error("Failed to load span detail");
          return;
        }
        actions.setSpanDetail(data as unknown as SpanDetail);
      } finally {
        actions.setSpanDetailLoading(false);
      }
    },

    selectSpan: ({ spanId }) => {
      if (spanId) {
        actions.loadSpanDetail(spanId);
      }
    },

    loadEmailThread: async ({ entityId, threadId }, breakpoint) => {
      actions.setEmailThreadDetailLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/entities/control/{entity_id}/email/threads/{thread_id}/",
          { params: { path: { entity_id: entityId, thread_id: threadId } } }
        );
        await breakpoint();
        if (error || !data) {
          toast.error("Failed to load email thread");
          return;
        }
        actions.setEmailThreadDetail(data as unknown as EmailThreadDetail);
      } finally {
        actions.setEmailThreadDetailLoading(false);
      }
    },
  }),

  events: () => ({
    afterMount: () => {},
  }),
});
