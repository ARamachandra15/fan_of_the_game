import fs from 'node:fs';
import path from 'node:path';

const TEAM_FILE = path.join(process.cwd(), 'server', 'data', 'teams.json');
const LEAGUE_CONFIGS = {
  nba: { sport: 'basketball', league: 'nba' },
  nfl: { sport: 'football', league: 'nfl' },
  ncaaf: { sport: 'football', league: 'college-football' },
  nhl: { sport: 'hockey', league: 'nhl' },
  'premier-league': { sport: 'soccer', league: 'eng.1' },
  'la-liga': { sport: 'soccer', league: 'esp.1' },
};

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
  'pitt panthers': 'pittsburgh panthers',
  'pittsburgh panthers': 'pittsburgh panthers',
  'pitt': 'pittsburgh panthers',
  'pittsburgh': 'pittsburgh panthers',
  'smu mustangs': 'smu mustangs',
  'southern methodist mustangs': 'smu mustangs',
  'smu': 'smu mustangs',
  'southern methodist': 'smu mustangs',
  'south carolina gamecocks': 'south carolina gamecocks',
  'south carolina': 'south carolina gamecocks',
  'gamecocks': 'south carolina gamecocks',
  'texas tech red raiders': 'texas tech red raiders',
  'texas tech': 'texas tech red raiders',
  'ttu': 'texas tech red raiders',
  'tennessee volunteers': 'tennessee volunteers',
  'tennessee': 'tennessee volunteers',
  'volunteers': 'tennessee volunteers',
  'ohio state buckeyes': 'ohio state buckeyes',
  'ohio state': 'ohio state buckeyes',
  'ohio st': 'ohio state buckeyes',
  'usc trojans': 'southern california trojans',
  'southern california trojans': 'southern california trojans',
  'usc': 'southern california trojans',
  'southern california': 'southern california trojans',
  'wake forest demon deacons': 'wake forest demon deacons',
  'wake forest': 'wake forest demon deacons',
  'byu cougars': 'byu cougars',
  'byu': 'byu cougars',
  'ucla bruins': 'ucla bruins',
  'ucla': 'ucla bruins',
  'uc la bruins': 'ucla bruins',
  'purdue boilermakers': 'purdue boilermakers',
  'purdue': 'purdue boilermakers',
  'washington state cougars': 'washington state cougars',
  'washington state': 'washington state cougars',
  'notre dame fighting irish': 'notre dame fighting irish',
  'notre dame': 'notre dame fighting irish',
  'nc state wolfpack': 'nc state wolfpack',
  'nc state': 'nc state wolfpack',
  'ole miss rebels': 'ole miss rebels',
  'ole miss': 'ole miss rebels',
  'florida state seminoles': 'florida state seminoles',
  'florida state': 'florida state seminoles',
  'fsu': 'florida state seminoles',
  'lsu': 'lsu tigers',
  'lsu tigers': 'lsu tigers',
  'miami': 'miami hurricanes',
  'miami hurricanes': 'miami hurricanes',
  'texas am': 'texas a m aggies',
  'texas a and m': 'texas a m aggies',
  'texas a m': 'texas a m aggies',
  'tcu': 'tcu horned frogs',
  'tcu horned frogs': 'tcu horned frogs',
  'horned frogs': 'tcu horned frogs',
  'arizona state': 'arizona state sun devils',
  'arizona state sun devils': 'arizona state sun devils',
  'west virginia': 'west virginia mountaineers',
  'west virginia mountaineers': 'west virginia mountaineers',
  'west va': 'west virginia mountaineers',
  'michigan state': 'michigan state spartans',
  'michigan state spartans': 'michigan state spartans',
  'oregon state': 'oregon state beavers',
  'oregon state beavers': 'oregon state beavers',
  'purdue boilermakers': 'purdue boilermakers',
  'purdue boilermakers': 'purdue boilermakers',
};

const main = async () => {
  const raw = fs.readFileSync(TEAM_FILE, 'utf8');
  const snapshot = JSON.parse(raw);

  for (const [leagueKey, config] of Object.entries(LEAGUE_CONFIGS)) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/teams?limit=1000`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ESPN teams for ${leagueKey}: ${response.status}`);
    }

    const payload = await response.json();
    const mapped = new Map();
    for (const entry of payload?.sports?.[0]?.leagues?.[0]?.teams ?? []) {
      const team = entry?.team ?? {};
      const candidates = [team.displayName, team.name, team.shortDisplayName, team.nickname, team.location, team.abbreviation].filter(Boolean);
      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        mapped.set(normalizedCandidate, String(team.id));
        const alias = NAME_ALIASES[normalizedCandidate];
        if (alias) mapped.set(alias, String(team.id));
      }

      const teamName = team.displayName || team.name || team.shortDisplayName || team.nickname || team.location || '';
      const teamNameNormalized = normalize(teamName);
      if (teamNameNormalized) {
        mapped.set(teamNameNormalized, String(team.id));
      }
    }

    let teams = Array.isArray(snapshot.leagues[leagueKey]) ? snapshot.leagues[leagueKey] : [];

    if (leagueKey === 'ncaaf') {
      teams = teams.length > 0 ? teams : NCAAF_ROSTER.map((name, index) => ({
        idTeam: `ncaaf-${index + 1}`,
        strTeam: name,
        name,
        tsdbStrTeam: name,
      }));
      snapshot.leagues[leagueKey] = teams;
    }

    for (const team of teams) {
      const names = [team.strTeam, team.name, team.tsdbStrTeam, team.displayName].filter(Boolean);
      let resolved = null;

      for (const name of names) {
        const normalizedName = normalize(name);
        const aliasName = NAME_ALIASES[normalizedName];
        const candidates = [normalizedName, aliasName].filter(Boolean);

        for (const candidate of candidates) {
          resolved = mapped.get(candidate);
          if (resolved) {
            team.espnTeamId = String(resolved);
            break;
          }
        }

        if (resolved) break;
      }

      if (!team.espnTeamId) {
        console.warn(`No ESPN ID for ${leagueKey}: ${team.strTeam || team.name || team.tsdbStrTeam || 'unknown'}`);
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
