import type { LeagueSelection, TeamOption, UserSelectionState } from '../types/sports';
import { STORAGE_KEY } from './constants';

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
