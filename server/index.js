import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fetchEspnTeamRecord, fetchEspnTeamSchedule, normalizeLeagueKey } from './scheduleService.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3002);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Rally proxy is running' });
});

app.get('/api/sports/:league', async (req, res) => {
  const { league } = req.params;
  const normalizedLeague = normalizeLeagueKey(league);
  const teamName = typeof req.query.team === 'string' ? decodeURIComponent(req.query.team) : null;
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

  if (!teamName) {
    return res.status(400).json({
      error: 'A selected team name is required for ESPN schedule fetches.',
      example: '/api/sports/nfl?team=Houston%20Texans',
    });
  }

  try {
    const schedule = await fetchEspnTeamSchedule(normalizedLeague, teamName, { forceRefresh });
    return res.json({
      data: schedule.data,
      events: schedule.data,
      cached: Boolean(schedule.cached),
      meta: schedule.meta,
      league: normalizedLeague,
      team: teamName,
      source: 'espn',
      teamId: schedule.teamId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = Number(error?.status ?? 500);
    if (message.toLowerCase().includes('rate limited') || status === 429) {
      return res.status(429).json({
        error: 'ESPN rate limited, try again shortly.',
        details: message,
      });
    }

    return res.status(status || 500).json({
      error: message,
      details: error?.details ?? null,
      league: normalizedLeague,
      team: teamName,
    });
  }
});

app.get('/api/team-profile/:league', async (req, res) => {
  const { league } = req.params;
  const normalizedLeague = normalizeLeagueKey(league);
  const teamName = typeof req.query.team === 'string' ? decodeURIComponent(req.query.team) : null;

  if (!teamName) {
    return res.status(400).json({
      error: 'A selected team name is required for ESPN team profile lookup.',
      example: '/api/team-profile/nba?team=Houston%20Rockets',
    });
  }

  try {
    const profile = await fetchEspnTeamRecord(normalizedLeague, teamName);
    return res.json({
      ...profile,
      source: 'espn-team-endpoint',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = Number(error?.status ?? 500);
    if (message.toLowerCase().includes('rate limited') || status === 429) {
      return res.status(429).json({
        error: 'ESPN rate limited, try again shortly.',
        details: message,
      });
    }

    return res.status(status || 500).json({
      error: message,
      details: error?.details ?? null,
      league: normalizedLeague,
      team: teamName,
    });
  }
});

app.get('/api/leagues', async (_req, res) => {
  const supported = [
    { id: 'premier-league', name: 'English Premier League', shortName: 'EPL', logoUrl: '/logos/leagues/premier-league.svg' },
    { id: 'la-liga', name: 'Spanish La Liga', shortName: 'La Liga', logoUrl: '/logos/leagues/la-liga.svg' },
    { id: 'nba', name: 'NBA', shortName: 'NBA', logoUrl: '/logos/leagues/nba.svg' },
    { id: 'nfl', name: 'NFL', shortName: 'NFL', logoUrl: '/logos/leagues/nfl.svg' },
    { id: 'ncaaf', name: 'NCAAF', shortName: 'NCAAF', logoUrl: '' },
    { id: 'nhl', name: 'NHL', shortName: 'NHL', logoUrl: '/logos/leagues/nhl.svg' },
  ];

  return res.json({ leagues: supported });
});

const NCAAF_ROSTER = [
  'Alabama Crimson Tide', 'Arizona State Sun Devils', 'Arizona Wildcats', 'Arkansas Razorbacks', 'Auburn Tigers',
  'Baylor Bears', 'BYU Cougars', 'California Golden Bears', 'Clemson Tigers', 'Colorado Buffaloes', 'Duke Blue Devils',
  'Florida Gators', 'Florida State Seminoles', 'Georgia Bulldogs', 'Georgia Tech Yellow Jackets', 'Houston Cougars',
  'Illinois Fighting Illini', 'Indiana Hoosiers', 'Iowa Hawkeyes', 'Iowa State Cyclones', 'Kansas Jayhawks', 'Kansas State Wildcats',
  'Kentucky Wildcats', 'Louisville Cardinals', 'LSU Tigers', 'Miami Hurricanes', 'Michigan Wolverines', 'Michigan State Spartans',
  'Minnesota Golden Gophers', 'Mississippi State Bulldogs', 'Missouri Tigers', 'NC State Wolfpack', 'Nebraska Cornhuskers',
  'Notre Dame Fighting Irish', 'Ohio State Buckeyes', 'Oklahoma Sooners', 'Oklahoma State Cowboys', 'Ole Miss Rebels',
  'Oregon Ducks', 'Oregon State Beavers', 'Penn State Nittany Lions', 'Pittsburgh Panthers', 'Purdue Boilermakers', 'Rutgers Scarlet Knights',
  'SMU Mustangs', 'South Carolina Gamecocks', 'Stanford Cardinal', 'Syracuse Orange', 'TCU Horned Frogs', 'Tennessee Volunteers',
  'Texas Longhorns', 'Texas A&M Aggies', 'Texas Tech Red Raiders', 'UCLA Bruins', 'USC Trojans', 'Utah Utes', 'Virginia Tech Hokies',
  'Wake Forest Demon Deacons', 'Washington Huskies', 'Washington State Cougars', 'West Virginia Mountaineers', 'Wisconsin Badgers'
];

app.get('/api/teams/:league', async (req, res) => {
  const { league } = req.params;
  const normalizedLeague = normalizeLeagueKey(league);
  const directLeagueCodes = {
    nba: 'NBA',
    nfl: 'NFL',
    ncaaf: 'NCAAF',
    nhl: 'NHL',
    'premier-league': 'English Premier League',
    'la-liga': 'Spanish La Liga',
  };
  const key = directLeagueCodes[normalizedLeague];

  if (!key) {
    return res.status(404).json({ error: 'Unsupported league for team lookup' });
  }

  try {
    if (normalizedLeague === 'ncaaf') {
      const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000');
      if (!response.ok) {
        throw new Error(`ESPN NCAAF teams lookup failed: ${response.status}`);
      }

      const payload = await response.json();
      const teams = (payload?.sports?.[0]?.leagues?.[0]?.teams ?? [])
        .map((entry) => {
          const team = entry?.team ?? {};
          const name = team.displayName || team.name || 'Unknown team';
          const logo = team.logos?.find((item) => item?.rel?.includes('default'))?.href || team.logos?.[0]?.href || '';
          return {
            id: `ncaaf:${team.id ?? name}`,
            idTeam: team.id ?? null,
            espnTeamId: team.id ?? null,
            name,
            shortName: team.shortDisplayName || team.abbreviation || name.slice(0, 3).toUpperCase(),
            logoUrl: logo,
            primaryColor: team.color ? `#${team.color}` : '#c69300',
            secondaryColor: team.alternateColor ? `#${team.alternateColor}` : '#0f172a',
            source: 'espn',
          };
        })
        .filter((team) => NCAAF_ROSTER.includes(team.name));

      return res.json({
        teams,
        count: teams.length,
        league: normalizedLeague,
        leagueName: key,
        source: 'espn-ncaaf',
        note: 'Power-4/FBS-heavy NCAAF roster subset to keep the UI usable while using real ESPN logos and schedules.',
      });
    }

    const snapshotPath = path.join(process.cwd(), 'server', 'data', 'teams.json');
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const snapshot = JSON.parse(raw);
    const leagueTeams = Array.isArray(snapshot?.leagues?.[normalizedLeague]) ? snapshot.leagues[normalizedLeague] : [];

    const placeholderIdPattern = new RegExp(`^${league}-\\d+$`);
    const invalidTeam = leagueTeams.find((team) => {
      const id = String(team?.idTeam ?? '');
      const name = String(team?.strTeam ?? team?.name ?? '');
      const logo = String(team?.logoUrl ?? team?.strBadge ?? team?.strLogo ?? team?.strTeamBadge ?? team?.strTeamLogo ?? '');
      return !name || !id || placeholderIdPattern.test(id) || (!logo && !team?.strBadge && !team?.strLogo);
    });

    if (leagueTeams.length === 0 || invalidTeam) {
      return res.status(500).json({
        error: 'Local team snapshot is incomplete, stale, or placeholder data',
        league,
        leagueName: key,
        actualCount: leagueTeams.length,
        invalidTeam: invalidTeam ? {
          idTeam: invalidTeam.idTeam ?? null,
          strTeam: invalidTeam.strTeam ?? invalidTeam.name ?? null,
          logoUrl: invalidTeam.logoUrl ?? invalidTeam.strBadge ?? invalidTeam.strLogo ?? null,
        } : null,
      });
    }

    const teams = leagueTeams.map((team) => ({
      id: `${league}:${team.idTeam ?? team.strTeam ?? team.name ?? Math.random().toString(16).slice(2)}`,
      idTeam: team.idTeam ?? null,
      espnTeamId: team.espnTeamId ?? null,
      name: team.strTeam || team.name || 'Unknown team',
      strTeam: team.strTeam || team.name || 'Unknown team',
      strTeamShort: team.strTeamShort || (team.strTeam || 'TEAM').split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase() || 'TEAM',
      strLeague: team.strLeague || key,
      logoUrl: team.logoUrl || team.strBadge || team.strLogo || team.strTeamBadge || team.strTeamLogo || '',
      strBadge: team.strBadge || team.strLogo || '',
      strLogo: team.strLogo || team.strBadge || '',
      primaryColor: team.strPrimaryColor || '#5b7cff',
      secondaryColor: team.strSecondaryColor || '#0f172a',
      source: 'local-snapshot',
      ...team,
    }));

    return res.json({ teams, count: teams.length, league, leagueName: key, source: 'local-snapshot' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LocalSnapshot] /api/teams/${league} failed: ${message}`);
    return res.status(500).json({ error: 'Local team snapshot lookup failed', league, details: message });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on http://localhost:${port}`);
});
