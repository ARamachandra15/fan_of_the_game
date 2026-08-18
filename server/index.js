import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3002);
const apiKey = process.env.BALLDONTLIE_API_KEY;

const fallbackTeamRosters = {
  nba: ['Atlanta Hawks','Boston Celtics','Brooklyn Nets','Charlotte Hornets','Chicago Bulls','Cleveland Cavaliers','Dallas Mavericks','Denver Nuggets','Detroit Pistons','Golden State Warriors','Houston Rockets','Indiana Pacers','LA Clippers','Los Angeles Lakers','Memphis Grizzlies','Miami Heat','Milwaukee Bucks','Minnesota Timberwolves','New Orleans Pelicans','New York Knicks','Oklahoma City Thunder','Orlando Magic','Philadelphia 76ers','Phoenix Suns','Portland Trail Blazers','Sacramento Kings','San Antonio Spurs','Toronto Raptors','Utah Jazz','Washington Wizards'],
  nfl: ['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders'],
  nhl: ['Anaheim Ducks','Boston Bruins','Buffalo Sabres','Calgary Flames','Carolina Hurricanes','Chicago Blackhawks','Colorado Avalanche','Columbus Blue Jackets','Dallas Stars','Detroit Red Wings','Edmonton Oilers','Florida Panthers','Los Angeles Kings','Minnesota Wild','Montreal Canadiens','Nashville Predators','New Jersey Devils','New York Islanders','New York Rangers','Ottawa Senators','Philadelphia Flyers','Pittsburgh Penguins','San Jose Sharks','Seattle Kraken','St. Louis Blues','Tampa Bay Lightning','Toronto Maple Leafs','Utah Hockey Club','Vancouver Canucks','Vegas Golden Knights','Washington Capitals','Winnipeg Jets'],
  'premier-league': ['Arsenal','Aston Villa','Bournemouth','Brentford','Brighton and Hove Albion','Chelsea','Crystal Palace','Everton','Fulham','Ipswich Town','Leicester City','Liverpool','Manchester City','Manchester United','Newcastle United','Nottingham Forest','Southampton','Tottenham Hotspur','West Ham United','Wolverhampton Wanderers'],
  'la-liga': ['Athletic Club','Atletico Madrid','Barcelona','Betis','Cadiz','Celta Vigo','Deportivo Alaves','Elche','Espanyol','Getafe','Girona','Granada','Las Palmas','Mallorca','Osasuna','Rayo Vallecano','Real Madrid','Real Sociedad','Sevilla','Valencia','Villarreal'],
  f1: ['Mercedes','Red Bull','Ferrari','McLaren','Aston Martin','Alpine','RB','Sauber','Williams','Haas'],
};

app.use(cors());
app.use(express.json());

const getBallDontLieUrl = (path) => {
  const baseUrl = 'https://api.balldontlie.io/v1';
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('api_key', apiKey || '');
  return url.toString();
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Rally proxy is running' });
});

app.get('/api/sports/:league', async (req, res) => {
  const { league } = req.params;

  if (!apiKey) {
    return res.status(500).json({
      error: 'BALLDONTLIE_API_KEY is not configured on the server.',
    });
  }

  try {
    const targetMap = {
      nba: '/games?dates[]=2024-10-22&dates[]=2024-10-23',
      nfl: '/games?dates[]=2024-09-05&dates[]=2024-09-06',
      nhl: '/games?dates[]=2024-10-10&dates[]=2024-10-11',
      epl: '/games?dates[]=2024-08-16&dates[]=2024-08-17',
      'la-liga': '/games?dates[]=2024-08-17&dates[]=2024-08-18',
      f1: '/games?dates[]=2024-03-01&dates[]=2024-03-02',
    };

    const targetPath = targetMap[league] || '/games';
    const response = await fetch(getBallDontLieUrl(targetPath));
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'BallDontLie request failed',
        details: data,
      });
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Unexpected proxy error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/leagues', async (_req, res) => {
  const supported = [
    {
      id: 'premier-league',
      name: 'English Premier League',
      shortName: 'EPL',
      logoUrl: '/logos/leagues/premier-league.svg',
    },
    {
      id: 'la-liga',
      name: 'Spanish La Liga',
      shortName: 'La Liga',
      logoUrl: '/logos/leagues/la-liga.svg',
    },
    {
      id: 'nba',
      name: 'NBA',
      shortName: 'NBA',
      logoUrl: '/logos/leagues/nba.svg',
    },
    {
      id: 'nfl',
      name: 'NFL',
      shortName: 'NFL',
      logoUrl: '/logos/leagues/nfl.svg',
    },
    {
      id: 'nhl',
      name: 'NHL',
      shortName: 'NHL',
      logoUrl: '/logos/leagues/nhl.svg',
    },
  ];

  return res.json({ leagues: supported });
});

async function fetchTheSportsDbJson(url, label) {
  console.log(`[TheSportsDB] ${label} -> ${url}`);

  const response = await fetch(url);
  const rawText = await response.text();

  if (!response.ok) {
    const details = rawText ? rawText.slice(0, 1000) : 'Empty response body';
    console.error(`[TheSportsDB] ${label} returned HTTP ${response.status}`);
    console.error(`[TheSportsDB] ${label} body snippet: ${details}`);
    throw new Error(`TheSportsDB returned HTTP ${response.status} for ${label}: ${details}`);
  }

  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    console.error(`[TheSportsDB] ${label} returned non-JSON response. Status: ${response.status}`);
    console.error(`[TheSportsDB] ${label} body snippet: ${rawText.slice(0, 1000)}`);
    const details = rawText ? rawText.slice(0, 1000) : 'Empty response body';
    throw new Error(`TheSportsDB returned non-JSON for ${label} (${response.status}): ${details}`);
  }

  return { response, data };
}

function normalizeTeam(team, leagueName) {
  return {
    ...team,
    id: `${leagueName}:${team.idTeam ?? team.strTeam ?? team.name ?? Math.random().toString(16).slice(2)}`,
    name: team.strTeam || team.name || 'Unknown team',
    logoUrl: team.strBadge || team.strLogo || '',
    strBadge: team.strBadge || team.strLogo || '',
    strLogo: team.strLogo || team.strBadge || '',
    primaryColor: team.strPrimaryColor || '#5b7cff',
    secondaryColor: team.strSecondaryColor || '#0f172a',
    source: 'thesportsdb',
  };
}

function pickLogoUrl(team) {
  return (
    team?.strBadge ||
    team?.strLogo ||
    team?.strTeamBadge ||
    team?.strTeamLogo ||
    team?.badge ||
    team?.logo ||
    team?.team_badge ||
    team?.team_logo ||
    ''
  );
}

function normalizeFullRosterTeam(team, leagueName) {
  const name = team.strTeam || team.name || 'Unknown team';
  const logoUrl = pickLogoUrl(team);

  return {
    ...team,
    id: `${leagueName}:${team.idTeam ?? team.id ?? name}`,
    name,
    strTeam: name,
    strTeamShort: team.strTeamShort || name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase() || 'TEAM',
    logoUrl,
    strBadge: team.strBadge || team.strLogo || '',
    strLogo: team.strLogo || team.strBadge || '',
    primaryColor: team.strPrimaryColor || '#5b7cff',
    secondaryColor: team.strSecondaryColor || '#0f172a',
    source: 'thesportsdb',
  };
}

async function lookupTeamByName(league, teamName) {
  const teamUrl = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`;

  try {
    const { data } = await fetchTheSportsDbJson(teamUrl, `single team lookup: ${teamName}`);
    const match = Array.isArray(data?.teams) ? data.teams[0] : null;
    if (!match) return null;

    const normalized = normalizeFullRosterTeam(match, league);
    if (!normalized.logoUrl) {
      return {
        ...normalized,
        logoUrl: pickLogoUrl(match),
        strBadge: match.strBadge || '',
        strLogo: match.strLogo || '',
      };
    }

    return normalized;
  } catch (error) {
    console.warn(`[TheSportsDB] Single-team lookup failed for ${teamName}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

app.get('/api/teams/:league', async (req, res) => {
  const { league } = req.params;

  const directLeagueCodes = {
    nba: 'NBA',
    nfl: 'NFL',
    nhl: 'NHL',
    'premier-league': 'English Premier League',
    'la-liga': 'Spanish La Liga',
  };

  const key = directLeagueCodes[league];

  if (!key) {
    return res.status(404).json({ error: 'Unsupported league for team lookup' });
  }

  try {
    const snapshotPath = path.join(process.cwd(), 'server', 'data', 'teams.json');
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const snapshot = JSON.parse(raw);
    const leagueTeams = Array.isArray(snapshot?.leagues?.[league]) ? snapshot.leagues[league] : [];

    if (leagueTeams.length === 0) {
      return res.status(404).json({
        error: 'No local team snapshot found for this league',
        league,
        leagueName: key,
      });
    }

    const teams = leagueTeams.map((team) => ({
      id: `${league}:${team.idTeam ?? team.strTeam ?? team.name ?? Math.random().toString(16).slice(2)}`,
      idTeam: team.idTeam ?? null,
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

    return res.json({
      teams,
      count: teams.length,
      league,
      leagueName: key,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LocalSnapshot] /api/teams/${league} failed: ${message}`);
    return res.status(500).json({
      error: 'Local team snapshot lookup failed',
      league,
      details: message,
    });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on http://localhost:${port}`);
});
