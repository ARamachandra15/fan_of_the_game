import { FULL_TEAM_ROSTERS } from '../lib/constants';

export async function fetchLeagues() {
  const response = await fetch('/api/leagues');
  if (!response.ok) {
    throw new Error('Unable to fetch supported leagues');
  }
  const data = await response.json();
  return data.leagues ?? [];
}

export async function fetchTeamsForLeague(leagueId: string) {
  const response = await fetch(`/api/teams/${leagueId}`);
  if (!response.ok) {
    throw new Error('Unable to fetch teams for league');
  }
  const data = await response.json();
  return Array.isArray(data.teams) ? data.teams : [];
}

export async function fetchLeagueGames(league: string) {
  const response = await fetch(`/api/sports/${league}`);
  if (!response.ok) {
    throw new Error('Unable to fetch games for league');
  }
  const data = await response.json();
  return data.data ?? [];
}
