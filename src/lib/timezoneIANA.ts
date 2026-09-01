/**
 * Comprehensive timezone handling using IANA timezone identifiers.
 * Uses the Intl API for proper DST and historical timezone handling.
 * 
 * This module replaces the old offset-based system which couldn't handle DST
 * and would cause ESPN timestamps to be misinterpreted.
 */

/**
 * Common IANA timezones for US/sports context
 */
export const IANA_TIMEZONES = [
  { id: 'America/Puerto_Rico', label: 'Atlantic (AST)', abbr: 'AST', offset: -4 },
  { id: 'America/New_York', label: 'Eastern (EST/EDT)', abbr: 'ET', offset: -5 },
  { id: 'America/Chicago', label: 'Central (CST/CDT)', abbr: 'CT', offset: -6 },
  { id: 'America/Denver', label: 'Mountain (MST/MDT)', abbr: 'MT', offset: -7 },
  { id: 'America/Los_Angeles', label: 'Pacific (PST/PDT)', abbr: 'PT', offset: -8 },
  { id: 'America/Anchorage', label: 'Alaska (AKST/AKDT)', abbr: 'AKT', offset: -9 },
  { id: 'Pacific/Honolulu', label: 'Hawaii (HST)', abbr: 'HST', offset: -10 },
];

/**
 * Get the default timezone for this app (America/Puerto_Rico = AST)
 */
export function getDefaultTimezone(): string {
  return 'America/Puerto_Rico';
}

/**
 * Detect user's browser timezone and find the closest IANA match
 * Returns an IANA timezone ID string (e.g., "America/New_York")
 */
export function detectBrowserTimezone(): string {
  try {
    // Use Intl.DateTimeFormat to get the browser's timezone
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone && IANA_TIMEZONES.some(tz => tz.id === timeZone)) {
      return timeZone;
    }
    // If browser timezone is not in our list, find the closest match
    return findClosestTimezoneByOffset(getOffsetInTimezone(timeZone));
  } catch {
    return getDefaultTimezone();
  }
}

/**
 * Get the current UTC offset (in hours) for a given IANA timezone at the current moment.
 * This properly handles DST.
 * 
 * @param timezoneId IANA timezone ID (e.g., "America/New_York")
 * @returns Offset in hours (e.g., -5 for EST, -4 for EDT)
 */
export function getOffsetInTimezone(timezoneId: string): number {
  try {
    // Create a formatter for this timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Get the parts
    const parts = formatter.formatToParts(new Date());
    const partsMap: Record<string, string> = {};
    for (const part of parts) {
      partsMap[part.type] = part.value;
    }

    // Create a date in the target timezone
    const localDate = new Date(
      parseInt(partsMap.year, 10),
      parseInt(partsMap.month, 10) - 1,
      parseInt(partsMap.day, 10),
      parseInt(partsMap.hour, 10),
      parseInt(partsMap.minute, 10),
      parseInt(partsMap.second, 10)
    );

    // The browser's Date interprets this as UTC, but it's actually local time in the target timezone
    // So the difference tells us the offset
    const now = new Date();
    const offset = (localDate.getTime() - now.getTime()) / (60 * 60 * 1000);
    return offset;
  } catch {
    return -4; // Default to AST
  }
}

/**
 * Find the closest IANA timezone to a given UTC offset
 */
function findClosestTimezoneByOffset(targetOffset: number): string {
  let closest = IANA_TIMEZONES[0];
  let closestDiff = Math.abs(closest.offset - targetOffset);

  for (const tz of IANA_TIMEZONES) {
    const diff = Math.abs(tz.offset - targetOffset);
    if (diff < closestDiff) {
      closest = tz;
      closestDiff = diff;
    }
  }

  return closest.id;
}

/**
 * Convert a UTC timestamp to a user's local timezone and format it
 * 
 * @param utcTimestamp ISO 8601 UTC timestamp (e.g., "2026-09-05T19:30Z")
 * @param timezoneId IANA timezone ID (e.g., "America/New_York")
 * @returns Formatted time string (e.g., "7:30 PM ET")
 */
export function formatTimeInTimezone(utcTimestamp: string, timezoneId: string): string {
  try {
    // Parse the UTC timestamp
    const date = new Date(utcTimestamp);
    if (Number.isNaN(date.getTime())) {
      return 'Invalid time';
    }

    // Format using Intl API for the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneId,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const timeString = formatter.format(date);

    // Get the abbreviation for this timezone
    const tzInfo = IANA_TIMEZONES.find(tz => tz.id === timezoneId);
    const abbr = tzInfo?.abbr || '';

    return `${timeString} ${abbr}`;
  } catch {
    return 'N/A';
  }
}

/**
 * Get timezone info (label, abbreviation, etc.) for display
 */
export function getTimezoneInfo(timezoneId: string): typeof IANA_TIMEZONES[0] | null {
  return IANA_TIMEZONES.find(tz => tz.id === timezoneId) || null;
}

/**
 * Validate that a timezone ID is in our supported list
 */
export function isValidTimezoneId(timezoneId: string): boolean {
  return IANA_TIMEZONES.some(tz => tz.id === timezoneId);
}

/**
 * Normalize an ESPN/raw timestamp to UTC.
 * ESPN returns timestamps as ISO 8601 strings, typically with Z (UTC) suffix.
 * This function ensures we always return a proper UTC ISO string.
 * 
 * @param espnTimestamp Raw timestamp from ESPN (e.g., "2026-09-05T19:30Z" or "2026-09-05T19:30-04:00")
 * @returns Normalized UTC ISO string (e.g., "2026-09-05T19:30:00Z")
 */
export function normalizeEspnTimestamp(espnTimestamp: string): string {
  try {
    if (!espnTimestamp || typeof espnTimestamp !== 'string') {
      return new Date().toISOString();
    }

    // Parse the timestamp
    const date = new Date(espnTimestamp);
    if (Number.isNaN(date.getTime())) {
      console.warn(`Invalid ESPN timestamp: ${espnTimestamp}`);
      return new Date().toISOString();
    }

    // Always return UTC ISO string
    return date.toISOString();
  } catch (error) {
    console.warn(`Error normalizing ESPN timestamp "${espnTimestamp}":`, error);
    return new Date().toISOString();
  }
}
