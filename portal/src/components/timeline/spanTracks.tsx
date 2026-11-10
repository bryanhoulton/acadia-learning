import {
  Clock,
  MessageSquare,
  Mic,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';

import type { TimelineSpan } from '../../logic/timelineLogic';

export type SpanTrackId =
  | 'user_speech'
  | 'agent_speech'
  | 'llm'
  | 'tool'
  | 'playground'
  | 'coaching'
  | 'other';

export interface SpanTrackDef {
  id: SpanTrackId;
  label: string;
  color: string;
  hoverColor: string;
  selectedColor: string;
  icon: React.ReactNode;
}

export const SPAN_TRACKS: SpanTrackDef[] = [
  {
    id: 'user_speech',
    label: 'User Speech',
    color: 'bg-blue-400/80',
    hoverColor: 'hover:bg-blue-500',
    selectedColor: 'bg-blue-600',
    icon: <Mic size={12} />,
  },
  {
    id: 'agent_speech',
    label: 'Agent Speech',
    color: 'bg-emerald-400/80',
    hoverColor: 'hover:bg-emerald-500',
    selectedColor: 'bg-emerald-600',
    icon: <MessageSquare size={12} />,
  },
  {
    id: 'llm',
    label: 'LLM Calls',
    color: 'bg-rose-400/80',
    hoverColor: 'hover:bg-rose-500',
    selectedColor: 'bg-rose-600',
    icon: <Sparkles size={12} />,
  },
  {
    id: 'tool',
    label: 'Tool Calls',
    color: 'bg-amber-400/80',
    hoverColor: 'hover:bg-amber-500',
    selectedColor: 'bg-amber-600',
    icon: <Terminal size={12} />,
  },
  {
    id: 'playground',
    label: 'Playground',
    color: 'bg-teal-400/80',
    hoverColor: 'hover:bg-teal-500',
    selectedColor: 'bg-teal-600',
    icon: <Zap size={12} />,
  },
  {
    id: 'coaching',
    label: 'Coaching',
    color: 'bg-violet-400/80',
    hoverColor: 'hover:bg-violet-500',
    selectedColor: 'bg-violet-600',
    icon: <Sparkles size={12} />,
  },
  {
    id: 'other',
    label: 'Other',
    color: 'bg-neutral-400/80',
    hoverColor: 'hover:bg-neutral-500',
    selectedColor: 'bg-neutral-600',
    icon: <Clock size={12} />,
  },
];

export function classifySpan(span: TimelineSpan): SpanTrackId {
  if (span.name === 'user_speech') return 'user_speech';
  if (span.name === 'agent_speech') return 'agent_speech';
  if (span.span_type === 'llm') return 'llm';
  if (span.span_type === 'tool') return 'tool';
  if (span.name.startsWith('playground_')) return 'playground';
  if (span.name === 'pedagogy_coach_review' || span.name === 'engagement_review')
    return 'coaching';
  return 'other';
}
