/**
 * Date formatting utilities for IST timezone
 */

const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Parse a date string, treating timestamps without timezone as UTC
 */
function parseAsUTC(dateInput: string | Date): Date {
  if (dateInput instanceof Date) return dateInput;
  
  // If the string doesn't have timezone info (no Z, +, or - after time), treat as UTC
  const hasTimezone = /Z|[+-]\d{2}:\d{2}$/.test(dateInput);
  if (!hasTimezone && dateInput.includes("T")) {
    return new Date(dateInput + "Z");
  }
  return new Date(dateInput);
}

/**
 * Format a date string or Date object to IST datetime (no seconds)
 * Example: "22 Jan 2026, 3:45 PM"
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "-";
  const date = parseAsUTC(dateInput);
  if (isNaN(date.getTime())) return "-";
  
  return date.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a date string or Date object to IST date only (no time)
 * Example: "22 Jan 2026"
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "-";
  const date = parseAsUTC(dateInput);
  if (isNaN(date.getTime())) return "-";
  
  return date.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
