import type { LeagueSelection, TeamOption, UserSelectionState } from '../types/sports';
import { STORAGE_KEY } from './constants';

const TIMEZONE_KEY = 'user_timezone_id';

export function readSelection(): UserSelectionState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as UserSelectionState;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSelection() {
  localStorage.removeItem(STORAGE_KEY);
}

export function writeSelection(selectedLeagues: LeagueSelection[], selectedTeams: TeamOption[]) {
  const payload: UserSelectionState = {
    version: 1,
    selectedLeagues,
    selectedTeams,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function normalizeStoredSelection(input: Partial<UserSelectionState> | null | undefined): UserSelectionState | null {
  if (!input) return null;

  return {
    version: 1,
    selectedLeagues: Array.isArray(input.selectedLeagues) ? input.selectedLeagues as LeagueSelection[] : [],
    selectedTeams: Array.isArray(input.selectedTeams) ? input.selectedTeams as TeamOption[] : [],
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Read saved timezone ID from localStorage
 * Returns IANA timezone ID (e.g., "America/New_York") or null if not saved
 */
export function readTimezoneOffset(): string | null {
  try {
    const raw = localStorage.getItem(TIMEZONE_KEY);
    if (!raw) return null;
    // Validate it's a proper timezone ID format
    if (typeof raw === 'string' && raw.includes('/')) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save timezone ID to localStorage
 * @param offset IANA timezone ID (e.g., "America/New_York")
 */
export function writeTimezoneOffset(offset: string): void {
  try {
    localStorage.setItem(TIMEZONE_KEY, offset);
  } catch (err) {
    console.warn('Failed to save timezone to localStorage:', err);
  }
}

/**
 * Clear saved timezone from localStorage
 */
export function clearTimezoneOffset(): void {
  try {
    localStorage.removeItem(TIMEZONE_KEY);
  } catch (err) {
    console.warn('Failed to clear timezone from localStorage:', err);
  }
}
