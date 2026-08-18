import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'server', 'data', 'teams.json');

const leagues = {
  nba: 'NBA',
  nfl: 'NFL',
  nhl: 'NHL',
  'premier-league': 'English Premier League',
  'la-liga': 'Spanish La Liga',
};

const leagueUrls = {
  nba: 'https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=NBA',
  nfl: 'https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=NFL',
  nhl: 'https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=NHL',
  'premier-league': 'https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=English%20Premier%20League',
  'la-liga': 'https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=Spanish%20La%20Liga',
};

const normalizeTeam = (team, leagueKey) => ({
  idTeam: team?.idTeam ?? null,
  idLeague: team?.idLeague ?? null,
  strTeam: team?.strTeam ?? 'Unknown Team',
  strTeamShort: team?.strTeamShort ?? '',
  strLeague: team?.strLeague ?? leagues[leagueKey],
  strSport: team?.strSport ?? '',
  strWebsite: team?.strWebsite ?? '',
  strBadge: team?.strBadge ?? '',
  strLogo: team?.strLogo ?? '',
  strTeamBadge: team?.strTeamBadge ?? '',
  strTeamLogo: team?.strTeamLogo ?? '',
  strPrimaryColor: team?.strPrimaryColor ?? '#5b7cff',
  strSecondaryColor: team?.strSecondaryColor ?? '#0f172a',
  strDescriptionEN: team?.strDescriptionEN ?? '',
  strLocation: team?.strLocation ?? '',
  strStadium: team?.strStadium ?? '',
  strFacebook: team?.strFacebook ?? '',
  strTwitter: team?.strTwitter ?? '',
  strInstagram: team?.strInstagram ?? '',
  logoUrl: team?.strBadge || team?.strLogo || team?.strTeamBadge || team?.strTeamLogo || '',
});

async function main() {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: 'TheSportsDB search_all_teams.php',
    note: 'Static snapshot of team rosters and logos. Refresh by rerunning this seed script if a team ever changes name, logo, or city.',
    leagues: {},
  };

  for (const [leagueKey, url] of Object.entries(leagueUrls)) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok) {
      throw new Error(`TheSportsDB rate-limited or failed for ${leagueKey}: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const teams = Array.isArray(payload?.teams) ? payload.teams : [];
    snapshot.leagues[leagueKey] = teams.map((team) => normalizeTeam(team, leagueKey));
    console.log(`Seeded ${leagueKey}: ${snapshot.leagues[leagueKey].length} teams`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Saved team snapshot to ${outputPath}`);
}

main().catch((error) => {
  console.error('Failed to seed team data:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
