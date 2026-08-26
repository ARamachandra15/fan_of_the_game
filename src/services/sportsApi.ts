const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchLeagues() {
  const response = await fetch(`${API_BASE}/api/leagues`);
  if (!response.ok) {
    throw new Error('Unable to fetch supported leagues');
  }
  const data = await response.json();
  return data.leagues ?? [];
}

export async function fetchTeamsForLeague(leagueId: string) {
  const response = await fetch(`${API_BASE}/api/teams/${leagueId}`);
  if (!response.ok) {
    throw new Error('Unable to fetch teams for league');
  }
  const data = await response.json();
  return Array.isArray(data.teams) ? data.teams : [];
}

export async function fetchLeagueGames(league: string, teamName?: string) {
  const query = teamName ? `?team=${encodeURIComponent(teamName)}` : '';
  const response = await fetch(`${API_BASE}/api/sports/${league}${query}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error || 'Unable to fetch games for league';
    if (message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('rate limited')) {
      throw new Error('ESPN rate limited, try again shortly.');
    }
    throw new Error(message);
  }

  return data.events ?? data.data ?? [];
}

export async function fetchTeamProfile(league: string, teamName: string) {
  const query = `?team=${encodeURIComponent(teamName)}`;
  const response = await fetch(`${API_BASE}/api/team-profile/${league}${query}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error || 'Unable to fetch team profile';
    if (message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('rate limited')) {
      throw new Error('ESPN rate limited, try again shortly.');
    }
    throw new Error(message);
  }

  return data;
}