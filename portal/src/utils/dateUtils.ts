// Date formatting utilities used across the application

export function formatDate(
  dateString: string,
  format: "short" | "long" | "compact" = "short"
): string {
  const date = new Date(dateString);

  const formats = {
    short: {
      weekday: "short" as const,
      month: "short" as const,
      day: "numeric" as const,
      year: "numeric" as const,
    },
    long: {
      weekday: "long" as const,
      month: "long" as const,
      day: "numeric" as const,
    },
    compact: {
      month: "short" as const,
      day: "numeric" as const,
      year: "numeric" as const,
    },
  };

  return date.toLocaleDateString("en-US", formats[format]);
}

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTime(dateString: string): string {
  return `${formatDate(dateString, "short")} at ${formatTime(dateString)}`;
}

export function formatTimeLimit(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function isOverdue(dateString: string): boolean {
  return new Date(dateString) < new Date();
}

export function getDaysUntilDue(dateString: string): number {
  return Math.ceil(
    (new Date(dateString).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

export function parseDateISOString(s: string) {
  const ds = s.split(/\D/).map((s) => parseInt(s, 10));
  ds[1] = ds[1] - 1; // adjust month

  // @ts-expect-error - Date constructor accepts a variable number of arguments
  return new Date(...ds);
}
