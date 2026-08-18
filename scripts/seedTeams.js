import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'server', 'data', 'teams.json');

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const FETCH_DELAY_MS = 500;
const INTER_LEAGUE_DELAY_MS = 90_000; // 90s cooldown between leagues to reset rate limit window
const RETRY_BASE_DELAY_MS = 15_000;   // first retry after 15s, doubling each attempt
const MAX_RETRIES = 5;
const LOGO_COVERAGE_THRESHOLD = 0.9;

// TheSportsDB idLeague values (used for disambiguation when multiple search results exist)
const LEAGUE_IDS = { nba: '4387', nfl: '4391', nhl: '4380', 'premier-league': '4328', 'la-liga': '4335' };

const LEAGUE_CONFIGS = {
  nba: { name: 'NBA', sport: 'Basketball', expectedCount: 30 },
  nfl: { name: 'NFL', sport: 'American Football', expectedCount: 32 },
  nhl: { name: 'NHL', sport: 'Ice Hockey', expectedCount: 32 },
  'premier-league': { name: 'English Premier League', sport: 'Soccer', expectedCount: 20 },
  'la-liga': { name: 'Spanish La Liga', sport: 'Soccer', expectedCount: 20 },
};

// Fallback search names for teams that have renamed or don't match exactly
const SEARCH_ALIASES = {
  'Utah Hockey Club': 'Arizona Coyotes', // relocated; TheSportsDB still lists as Arizona Coyotes
  'Athletic Club': 'Athletic Bilbao',    // TheSportsDB uses "Athletic Bilbao" for the La Liga club
};

const CANONICAL_ROSTERS = {
  nba: [
    'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets', 'Chicago Bulls', 'Cleveland Cavaliers',
    'Dallas Mavericks', 'Denver Nuggets', 'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'Los Angeles Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat', 'Milwaukee Bucks',
    'Minnesota Timberwolves', 'New Orleans Pelicans', 'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic',
    'Philadelphia 76ers', 'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs',
    'Toronto Raptors', 'Utah Jazz', 'Washington Wizards',
  ],
  nfl: [
    'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills', 'Carolina Panthers', 'Chicago Bears',
    'Cincinnati Bengals', 'Cleveland Browns', 'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
    'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs', 'Las Vegas Raiders',
    'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins', 'Minnesota Vikings', 'New England Patriots',
    'New Orleans Saints', 'New York Giants', 'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers',
    'San Francisco 49ers', 'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders',
  ],
  nhl: [
    'Anaheim Ducks', 'Boston Bruins', 'Buffalo Sabres', 'Calgary Flames', 'Carolina Hurricanes', 'Chicago Blackhawks',
    'Colorado Avalanche', 'Columbus Blue Jackets', 'Dallas Stars', 'Detroit Red Wings', 'Edmonton Oilers',
    'Florida Panthers', 'Los Angeles Kings', 'Minnesota Wild', 'Montreal Canadiens', 'Nashville Predators',
    'New Jersey Devils', 'New York Islanders', 'New York Rangers', 'Ottawa Senators', 'Philadelphia Flyers',
    'Pittsburgh Penguins', 'San Jose Sharks', 'Seattle Kraken', 'St. Louis Blues', 'Tampa Bay Lightning',
    'Toronto Maple Leafs', 'Utah Hockey Club', 'Vancouver Canucks', 'Vegas Golden Knights', 'Washington Capitals', 'Winnipeg Jets',
  ],
  'premier-league': [
    'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton and Hove Albion', 'Chelsea', 'Crystal Palace',
    'Everton', 'Fulham', 'Ipswich Town', 'Leicester City', 'Liverpool', 'Manchester City', 'Manchester United',
    'Newcastle United', 'Nottingham Forest', 'Southampton', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers',
  ],
  'la-liga': [
    'Athletic Club', 'Atletico Madrid', 'Barcelona', 'Real Betis', 'Celta Vigo', 'Deportivo Alaves', 'Elche', 'Espanyol',
    'Getafe', 'Girona', 'Granada', 'Las Palmas', 'Mallorca', 'Osasuna', 'Rayo Vallecano', 'Real Madrid', 'Real Sociedad',
    'Sevilla', 'Valencia', 'Villarreal',
  ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function searchTeamByName(teamName, retries = MAX_RETRIES) {
  const searchName = SEARCH_ALIASES[teamName] ?? teamName;
  const url = `${TSDB_BASE}/searchteams.php?t=${encodeURIComponent(searchName)}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`  Network error for "${teamName}" (attempt ${attempt}): ${err.message}. Retrying in ${Math.round(wait / 1000)}s...`);
      await sleep(wait);
      continue;
    }

    if (response.status === 429) {
      const wait = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1); // 15s, 30s, 60s, 120s, 240s
      console.warn(`  Rate-limited for "${teamName}" (attempt ${attempt}). Waiting ${Math.round(wait / 1000)}s...`);
      await sleep(wait);
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status} for "${teamName}"`);

    const data = await response.json();
    if (!data || Object.keys(data).length === 0) {
      // Empty response often signals a soft rate limit / throttle
      const wait = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`  Empty response for "${teamName}" (attempt ${attempt}) — likely throttled. Waiting ${Math.round(wait / 1000)}s...`);
      await sleep(wait);
      continue;
    }
    return data.teams || [];
  }

  throw new Error(`All ${retries} attempts failed for "${teamName}"`);
}

function pickBestMatch(results, canonicalName, leagueKey) {
  if (!results || results.length === 0) return null;
  const config = LEAGUE_CONFIGS[leagueKey];
  const leagueId = LEAGUE_IDS[leagueKey];

  // 1. Exact league ID match
  const byLeagueId = results.filter((t) => String(t.idLeague) === leagueId);
  if (byLeagueId.length === 1) return byLeagueId[0];
  if (byLeagueId.length > 1) {
    // Within the league, prefer closest name match
    return byLeagueId.sort((a, b) => nameSimilarity(b.strTeam, canonicalName) - nameSimilarity(a.strTeam, canonicalName))[0];
  }

  // 2. Match by sport
  const bySport = results.filter((t) => t.strSport === config.sport);
  if (bySport.length === 1) return bySport[0];
  if (bySport.length > 1) {
    // Prefer closest name match within correct sport
    return bySport.sort((a, b) => nameSimilarity(b.strTeam, canonicalName) - nameSimilarity(a.strTeam, canonicalName))[0];
  }

  // 3. Fallback: best name similarity overall
  return results.sort((a, b) => nameSimilarity(b.strTeam, canonicalName) - nameSimilarity(a.strTeam, canonicalName))[0];
}

// Simple character-overlap similarity score
function nameSimilarity(a, b) {
  const na = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = (b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (na === nb) return 1;
  let matches = 0;
  for (const ch of na) if (nb.includes(ch)) matches++;
  return matches / Math.max(na.length, nb.length, 1);
}

function buildTeamRecord(leagueKey, canonicalName, tsdbTeam) {
  const config = LEAGUE_CONFIGS[leagueKey];
  const badge = tsdbTeam.strBadge || tsdbTeam.strTeamBadge || '';
  const logo = tsdbTeam.strLogo || tsdbTeam.strTeamLogo || '';
  return {
    idTeam: tsdbTeam.idTeam,
    idLeague: leagueKey,
    strTeam: canonicalName,
    strTeamShort: canonicalName.split(/\s+/).map((p) => p[0]).join('').slice(0, 3).toUpperCase() || 'TEAM',
    strLeague: config.name,
    strSport: config.sport,
    strBadge: badge,
    strLogo: logo,
    strTeamBadge: badge,
    strTeamLogo: logo,
    strPrimaryColor: tsdbTeam.strColour1 || '#5b7cff',
    strSecondaryColor: tsdbTeam.strColour2 || '#0f172a',
    logoUrl: badge || logo,
    tsdbStrTeam: tsdbTeam.strTeam,
    tsdbIdLeague: tsdbTeam.idLeague,
  };
}

async function fetchLeague(leagueKey) {
  const config = LEAGUE_CONFIGS[leagueKey];
  const canonicalNames = CANONICAL_ROSTERS[leagueKey];
  console.log(`\nFetching ${leagueKey} (${canonicalNames.length} teams expected)...`);

  const results = [];
  const failures = [];

  for (let i = 0; i < canonicalNames.length; i++) {
    const name = canonicalNames[i];
    process.stdout.write(`  [${i + 1}/${canonicalNames.length}] ${name}... `);

    try {
      const tsdbResults = await searchTeamByName(name);
      const match = pickBestMatch(tsdbResults, name, leagueKey);

      if (!match) {
        console.log('NOT FOUND');
        failures.push({ name, reason: 'No results from TheSportsDB' });
        results.push(null);
      } else {
        const hasLogo = Boolean(match.strBadge || match.strLogo || match.strTeamBadge || match.strTeamLogo);
        console.log(`OK (id=${match.idTeam}, logo=${hasLogo ? 'YES' : 'NO'})`);
        results.push(buildTeamRecord(leagueKey, name, match));
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failures.push({ name, reason: err.message });
      results.push(null);
    }

    if (i < canonicalNames.length - 1) await sleep(FETCH_DELAY_MS);
  }

  return { results, failures };
}

function validateLeague(leagueKey, teams) {
  const config = LEAGUE_CONFIGS[leagueKey];
  const errors = [];

  const validTeams = teams.filter(Boolean);
  if (validTeams.length !== config.expectedCount) {
    errors.push(`Expected ${config.expectedCount} teams, got ${validTeams.length} (${teams.length - validTeams.length} lookup failures)`);
  }

  const placeholderPattern = new RegExp(`^${leagueKey}-\\d+$`);
  const fakeIds = validTeams.filter((t) => !t.idTeam || placeholderPattern.test(String(t.idTeam)) || !/^\d+$/.test(String(t.idTeam)));
  if (fakeIds.length > 0) {
    errors.push(`${fakeIds.length} teams have non-numeric/placeholder idTeam: ${fakeIds.map((t) => `${t.strTeam}(${t.idTeam})`).join(', ')}`);
  }

  const withLogo = validTeams.filter((t) => t.logoUrl || t.strBadge || t.strLogo);
  const logoCoverage = validTeams.length > 0 ? withLogo.length / validTeams.length : 0;
  if (logoCoverage < LOGO_COVERAGE_THRESHOLD) {
    errors.push(`Logo coverage ${(logoCoverage * 100).toFixed(1)}% is below required ${LOGO_COVERAGE_THRESHOLD * 100}%`);
  }

  return { ok: errors.length === 0, errors, logoCoverage, validCount: validTeams.length };
}

async function main() {
  console.log('=== Rally Team Seed — TheSportsDB fetch ===\n');

  const allLeagueData = {};
  const allValidations = {};

  for (const [leagueIdx, leagueKey] of Object.keys(LEAGUE_CONFIGS).entries()) {
    if (leagueIdx > 0) {
      console.log(`\nCooling down ${INTER_LEAGUE_DELAY_MS / 1000}s before next league to avoid rate limits...`);
      await sleep(INTER_LEAGUE_DELAY_MS);
    }
    const { results, failures } = await fetchLeague(leagueKey);
    const validation = validateLeague(leagueKey, results);
    allLeagueData[leagueKey] = results.filter(Boolean);
    allValidations[leagueKey] = validation;

    console.log(`\n  Validation for ${leagueKey}:`);
    console.log(`    Teams fetched: ${allLeagueData[leagueKey].length} / ${LEAGUE_CONFIGS[leagueKey].expectedCount}`);
    console.log(`    Logo coverage: ${(validation.logoCoverage * 100).toFixed(1)}%`);
    if (failures.length > 0) {
      console.log(`    Failures: ${failures.map((f) => f.name).join(', ')}`);
    }
    if (!validation.ok) {
      console.log(`    VALIDATION ERRORS:`);
      for (const err of validation.errors) console.log(`      - ${err}`);
    } else {
      console.log(`    ✓ PASSED`);
    }
  }

  // Only write if ALL leagues pass
  const allPassed = Object.values(allValidations).every((v) => v.ok);
  if (!allPassed) {
    const failed = Object.entries(allValidations)
      .filter(([, v]) => !v.ok)
      .map(([k]) => k);
    console.error(`\n✗ ABORTED: The following leagues failed validation: ${failed.join(', ')}`);
    console.error('  teams.json was NOT modified.');
    process.exit(1);
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: 'TheSportsDB (api/v1/json/3/searchteams.php)',
    note: 'Permanent roster registry for Rally. This file is the only source of truth for league rosters.',
    leagues: allLeagueData,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log('\n✓ ALL LEAGUES PASSED — teams.json written.');
  for (const [key, teams] of Object.entries(allLeagueData)) {
    console.log(`  ${key}: ${teams.length} teams`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
