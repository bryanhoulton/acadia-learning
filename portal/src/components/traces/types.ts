export interface SpanMetadata {
  flagged?: boolean;
  corrected_transcription?: string;
  flagged_at?: string;
  flagged_by?: number;
  [key: string]: unknown;
}

export interface Span {
  id: string;
  trace: string;
  parent: string | null;
  name: string;
  span_type: "text" | "audio" | "tool" | "function" | "llm";
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  input_text: string | null;
  output_text: string | null;
  audio_url: string | null;
  audio_data: string | null;
  audio_duration_ms: number | null;
  audio_format: string | null;
  metadata: SpanMetadata;
}

export interface SpansPagination {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface TraceDetail {
  id: string;
  name: string;
  entity: number | null;
  session: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  spans: Span[];
  spans_pagination?: SpansPagination;
}

export interface TraceListItem {
  id: string;
  name: string;
  entity: number | null;
  entity_name: string | null;
  account_name: string | null;
  session: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  span_count: number;
}
