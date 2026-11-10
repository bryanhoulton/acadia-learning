import { format } from 'date-fns';

export function safeFormat(
  value: string | number | Date | null | undefined,
  fmt: string,
  fallback = '—',
): string {
  if (value == null) return fallback;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatTimeLabel(ms: number, durationMs: number): string {
  if (durationMs < 86400000) return format(new Date(ms), 'HH:mm');
  if (durationMs < 604800000) return format(new Date(ms), 'EEE HH:mm');
  return format(new Date(ms), 'MMM d');
}
