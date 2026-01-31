// =============================================================================
// Timezone Convention
// =============================================================================
// All timestamps are stored and processed in UTC internally.
// Display functions convert to Europe/Madrid for user-facing output.
// See packages/processing/README.md for full documentation.

// =============================================================================
// Distance Formatting
// =============================================================================

import { convertLength } from "@turf/helpers";

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

// =============================================================================
// Duration Formatting
// =============================================================================

// Removed formatDurationMinutes (trip logic removed)

// =============================================================================
// Date/Time Formatting
// =============================================================================

// Format date for display (NYC timezone)
export function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });
}

// Format date for display - short version for mobile (NYC timezone)
export function formatDateTimeShort(date: Date): string {
  return date.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });
}

// Format date with year always included (NYC timezone)
// If endDate is provided, shows a time range (e.g., "Jun 1, 2015, 3:30 – 3:52 PM")
export function formatDateTimeFull(data: { startDate: Date; endDate?: Date }): string {
  const { startDate, endDate } = data;

  if (!endDate) {
    return startDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Madrid",
    });
  }

  // Format as "Jun 1, 2015, 3:30 – 3:52 PM"
  const datePart = startDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });

  const startTime = startDate.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });

  const endTime = endDate.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });

  return `${datePart}, ${startTime} – ${endTime}`;
}

// Format milliseconds timestamp (NYC timezone)
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });
}

// Format just the time portion (NYC timezone)
export function formatTimeOnly(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });
}

// Format a time range (NYC timezone)
export function formatTimeRange(startedAt: Date, endedAt: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  };
  const start = startedAt.toLocaleTimeString("en-US", options);
  const end = endedAt.toLocaleTimeString("en-US", options);
  return `${start} – ${end}`;
}

// Format just the date portion (NYC timezone)
export function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

// =============================================================================
// Speed Formatting
// =============================================================================

export function formatSpeedKmh(data: any): string {
  // Deprecated/Removed
  return "";
}

// =============================================================================
// Number Formatting
// =============================================================================

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}
