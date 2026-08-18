import fs from 'node:fs';
import path from 'node:path';

const TEAM_FILE = path.join(process.cwd(), 'server', 'data', 'teams.json');
const LEAGUE_CONFIGS = {
  nba: { sport: 'basketball', league: 'nba' },
  nfl: { sport: 'football', league: 'nfl' },
  nhl: { sport: 'hockey', league: 'nhl' },
  'premier-league': { sport: 'soccer', league: 'eng.1' },
  'la-liga': { sport: 'soccer', league: 'esp.1' },
};

const normalize = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const NAME_ALIASES = {
  'la clippers': 'los angeles clippers',
  'utah hockey club': 'utah mammoth',
  'leicester city': 'leicester city',
  'southampton': 'southampton',
  'west ham united': 'west ham united',
  'wolverhampton wanderers': 'wolverhampton wanderers',
  'deportivo alaves': 'alaves',
  'girona': 'girona',
  'granada': 'granada',
  'las palmas': 'las palmas',
  'mallorca': 'mallorca',
  'malaga': 'malaga',
  'atletico madrid': 'atletico madrid',
  'athletic club': 'athletic club',
  'manchester united': 'manchester united',
};

const main = async () => {
  const raw = fs.readFileSync(TEAM_FILE, 'utf8');
  const snapshot = JSON.parse(raw);

  for (const [leagueKey, config] of Object.entries(LEAGUE_CONFIGS)) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/teams`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ESPN teams for ${leagueKey}: ${response.status}`);
    }

    const payload = await response.json();
    const mapped = new Map();
    for (const entry of payload?.sports?.[0]?.leagues?.[0]?.teams ?? []) {
      const team = entry?.team ?? {};
      const candidates = [team.displayName, team.name, team.shortDisplayName, team.nickname, team.location].filter(Boolean);
      for (const candidate of candidates) {
        mapped.set(normalize(candidate), String(team.id));
        const alias = NAME_ALIASES[normalize(candidate)];
        if (alias) mapped.set(alias, String(team.id));
      }
    }

    const teams = Array.isArray(snapshot.leagues[leagueKey]) ? snapshot.leagues[leagueKey] : [];
    for (const team of teams) {
      const names = [team.strTeam, team.name, team.tsdbStrTeam].filter(Boolean);
      for (const name of names) {
        const normalizedName = normalize(name);
        const resolved = mapped.get(normalizedName) ?? mapped.get(NAME_ALIASES[normalizedName] ?? '');
        if (resolved) {
          team.espnTeamId = resolved;
          break;
        }
      }
      if (!team.espnTeamId) {
        console.warn(`No ESPN ID for ${leagueKey}: ${team.strTeam || team.name || 'unknown'}`);
      }
    }
  }

  fs.writeFileSync(TEAM_FILE, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log('Updated ESPN team IDs in server/data/teams.json');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
