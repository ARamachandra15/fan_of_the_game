/**
 * Timezone utilities for converting UTC times to user's selected timezone
 */

export const COMMON_TIMEZONES = [
  { offset: -12, name: 'International Date Line West', label: 'UTC-12' },
  { offset: -11, name: 'Samoa Standard Time', label: 'UTC-11' },
  { offset: -10, name: 'Hawaii-Aleutian Standard Time', label: 'UTC-10' },
  { offset: -9, name: 'Alaska Standard Time', label: 'UTC-9' },
  { offset: -8, name: 'Pacific Standard Time', label: 'UTC-8 (PST)' },
  { offset: -7, name: 'Mountain Standard Time', label: 'UTC-7 (MST)' },
  { offset: -6, name: 'Central Standard Time', label: 'UTC-6 (CST)' },
  { offset: -5, name: 'Eastern Standard Time', label: 'UTC-5 (EST)' },
  { offset: -4, name: 'Atlantic Standard Time', label: 'UTC-4 (AST)' },
  { offset: -3.5, name: 'Newfoundland Standard Time', label: 'UTC-3:30' },
  { offset: -3, name: 'Argentina Standard Time', label: 'UTC-3 (ART)' },
  { offset: -2, name: 'Mid-Atlantic Standard Time', label: 'UTC-2' },
  { offset: -1, name: 'Azores Standard Time', label: 'UTC-1' },
  { offset: 0, name: 'Greenwich Mean Time', label: 'UTC±0 (GMT)' },
  { offset: 1, name: 'Central European Standard Time', label: 'UTC+1 (CET)' },
  { offset: 2, name: 'Eastern European Standard Time', label: 'UTC+2 (EET)' },
  { offset: 3, name: 'East Africa Time', label: 'UTC+3 (EAT)' },
  { offset: 4, name: 'Caucasus Standard Time', label: 'UTC+4' },
  { offset: 5, name: 'Pakistan Standard Time', label: 'UTC+5 (PKT)' },
  { offset: 5.5, name: 'Indian Standard Time', label: 'UTC+5:30 (IST)' },
  { offset: 6, name: 'Bangladesh Standard Time', label: 'UTC+6 (BDT)' },
  { offset: 7, name: 'Indochina Time', label: 'UTC+7 (ICT)' },
  { offset: 8, name: 'China Standard Time', label: 'UTC+8 (CST)' },
  { offset: 9, name: 'Japan Standard Time', label: 'UTC+9 (JST)' },
  { offset: 9.5, name: 'Central Standard Time (Australia)', label: 'UTC+9:30' },
  { offset: 10, name: 'Australian Eastern Standard Time', label: 'UTC+10 (AEST)' },
  { offset: 11, name: 'Solomon Islands Time', label: 'UTC+11' },
  { offset: 12, name: 'New Zealand Standard Time', label: 'UTC+12 (NZST)' },
];

/**
 * Get the user's browser-detected timezone offset in hours
 * Returns the negative of UTC offset (e.g., -7 for PDT which is UTC-7)
 */
export function detectBrowserTimezone(): number {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  return -offsetMinutes / 60; // Convert minutes to hours and negate
}

/**
 * Find closest matching timezone from our list
 */
export function findClosestTimezone(userOffset: number): number {
  return COMMON_TIMEZONES.reduce((closest, tz) => {
    const diff = Math.abs(tz.offset - userOffset);
    const closestDiff = Math.abs(closest - userOffset);
    return diff < closestDiff ? tz.offset : closest;
  }, 0);
}

/**
 * Convert a UTC datetime string to user's timezone and return formatted time with both local and UTC times
 * @param utcDatetime ISO string in UTC (e.g., "2026-09-05T19:30Z")
 * @param userTimezoneOffset User's timezone offset in hours (e.g., -7 for PDT)
 * @returns Formatted time string (e.g., "2:30 PM PST (7:30 PM UTC)")
 */
export function convertUTCToUserTimezone(utcDatetime: string, userTimezoneOffset: number): string {
  try {
    const date = new Date(utcDatetime);
    const utcTime = date.getTime();
    const offsetMs = userTimezoneOffset * 60 * 60 * 1000;
    const userTime = new Date(utcTime + offsetMs);

    // User's local time
    const userHours = userTime.getUTCHours();
    const userMinutes = userTime.getUTCMinutes();
    const userAmpm = userHours >= 12 ? 'PM' : 'AM';
    const userDisplayHours = userHours % 12 || 12;

    // UTC time
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const utcAmpm = utcHours >= 12 ? 'PM' : 'AM';
    const utcDisplayHours = utcHours % 12 || 12;

    // Get timezone abbreviation
    const tzInfo = findClosestTimezone(userTimezoneOffset);
    const tzLabel = getTimezoneLabel(tzInfo);
    // Extract just the abbreviation (e.g., "PST" from "UTC-7 (PST)")
    const tzAbbr = tzLabel.match(/\((\w+)\)/)?.[1] || '';

    return `${userDisplayHours}:${String(userMinutes).padStart(2, '0')} ${userAmpm} ${tzAbbr} (${utcDisplayHours}:${String(utcMinutes).padStart(2, '0')} ${utcAmpm} UTC)`;
  } catch {
    return 'N/A';
  }
}

/**
 * Get timezone label for display
 */
export function getTimezoneLabel(offset: number): string {
  const tz = COMMON_TIMEZONES.find((t) => t.offset === offset);
  return tz ? tz.label : `UTC${offset >= 0 ? '+' : ''}${offset}`;
}
