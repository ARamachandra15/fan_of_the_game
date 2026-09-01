import fs from 'node:fs';
import path from 'node:path';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const TEAM_DATA_PATH = path.join(process.cwd(), 'server', 'data', 'teams.json');
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const ESPN_LEAGUES = {
  nba: { sport: 'basketball', league: 'nba', soccer: false },
  nfl: { sport: 'football', league: 'nfl', soccer: false },
  ncaaf: { sport: 'football', league: 'college-football', soccer: false },
  nhl: { sport: 'hockey', league: 'nhl', soccer: false },
  'premier-league': { sport: 'soccer', league: 'eng.1', soccer: true },
  'la-liga': { sport: 'soccer', league: 'esp.1', soccer: true },
};

export function normalizeLeagueKey(rawLeague = '') {
  const input = String(rawLeague || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  const aliases = {
    epl: 'premier-league',
    'english-premier-league': 'premier-league',
    premierleague: 'premier-league',
    'la-liga': 'la-liga',
    'spanish-la-liga': 'la-liga',
    'la liga': 'la-liga',
    'premier league': 'premier-league',
  };

  return aliases[input] ?? input;
}

export function normalizeTeamName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readTeamSnapshot() {
  try {
    const raw = fs.readFileSync(TEAM_DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { leagues: {} };
  }
}

function getLeagueTeamList(leagueKey) {
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  const snapshot = readTeamSnapshot();
  return Array.isArray(snapshot?.leagues?.[normalizedLeague]) ? snapshot.leagues[normalizedLeague] : [];
}

function getLeagueConfig(leagueKey) {
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  return ESPN_LEAGUES[normalizedLeague];
}

export function getCachePathForTeam(leagueKey, teamNameOrId) {
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  const safeName = String(teamNameOrId ?? 'team')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';

  return path.join(process.cwd(), 'server', 'data', 'schedules', normalizedLeague, `${safeName}.json`);
}

export function readScheduleCache(leagueKey, teamNameOrId) {
  const cachePath = getCachePathForTeam(leagueKey, teamNameOrId);
  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    const fetchedAt = parsed?.fetchedAt ? new Date(parsed.fetchedAt).getTime() : 0;
    const expired = Number.isFinite(fetchedAt) && Date.now() - fetchedAt > CACHE_TTL_MS;

    if (expired) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeScheduleCache(leagueKey, teamNameOrId, payload) {
  const cachePath = getCachePathForTeam(leagueKey, teamNameOrId);
  const dir = path.dirname(cachePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return cachePath;
}

const COLLEGE_TEAM_ALIASES = {
  'ohio state': 'Ohio State Buckeyes',
  'ohio st': 'Ohio State Buckeyes',
  'pitt': 'Pittsburgh Panthers',
  'pittsburgh': 'Pittsburgh Panthers',
  'pittsburgh panthers': 'Pittsburgh Panthers',
  'pitt panthers': 'Pittsburgh Panthers',
  'smu': 'SMU Mustangs',
  'southern methodist': 'SMU Mustangs',
  'southern methodist mustangs': 'SMU Mustangs',
  'smu mustangs': 'SMU Mustangs',
  'usc': 'USC Trojans',
  'southern california': 'USC Trojans',
  'southern california trojans': 'USC Trojans',
  'ucla': 'UCLA Bruins',
  'purdue': 'Purdue Boilermakers',
  'purdue boilermakers': 'Purdue Boilermakers',
  'notre dame': 'Notre Dame Fighting Irish',
  'fsu': 'Florida State Seminoles',
  'ole miss': 'Ole Miss Rebels',
  'nc state': 'NC State Wolfpack',
  'south carolina': 'South Carolina Gamecocks',
  'south carolina gamecocks': 'South Carolina Gamecocks',
  'gamecocks': 'South Carolina Gamecocks',
  'texas am': 'Texas A&M Aggies',
  'texas a and m': 'Texas A&M Aggies',
  'texas a m': 'Texas A&M Aggies',
  'tcu': 'TCU Horned Frogs',
  'horned frogs': 'TCU Horned Frogs',
  'tcu horned frogs': 'TCU Horned Frogs',
  'miami': 'Miami Hurricanes',
  'washington state': 'Washington State Cougars',
  'wake forest': 'Wake Forest Demon Deacons',
  'byu': 'BYU Cougars',
  'west virginia': 'West Virginia Mountaineers',
  'arizona state': 'Arizona State Sun Devils',
  'michigan state': 'Michigan State Spartans',
  'oregon state': 'Oregon State Beavers',
  'tennessee': 'Tennessee Volunteers',
  'volunteers': 'Tennessee Volunteers',
  'tennessee volunteers': 'Tennessee Volunteers',
  'texas tech': 'Texas Tech Red Raiders',
  'texas tech red raiders': 'Texas Tech Red Raiders',
  'ttu': 'Texas Tech Red Raiders',
};

async function resolveEspnTeamId(leagueKey, teamName) {
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  const requestedNames = new Set([
    String(teamName || ''),
    COLLEGE_TEAM_ALIASES[normalizeTeamName(teamName)] || '',
  ].filter(Boolean));

  const teamRecord = getLeagueTeamList(normalizedLeague).find((entry) => {
    const candidateNames = [entry?.strTeam, entry?.name, entry?.tsdbStrTeam].filter(Boolean);
    return candidateNames.some((name) => {
      const normalizedName = normalizeTeamName(name);
      return requestedNames.has(name) || requestedNames.has(normalizedName) || Array.from(requestedNames).some((requested) => normalizeTeamName(requested) === normalizedName);
    });
  });

  if (teamRecord?.espnTeamId) {
    return String(teamRecord.espnTeamId);
  }

  const config = getLeagueConfig(normalizedLeague);
  if (!config) {
    throw new Error(`Unsupported ESPN league: ${normalizedLeague}`);
  }

  const url = `${ESPN_BASE}/${config.sport}/${config.league}/teams?limit=1000`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ESPN teams lookup failed for ${normalizedLeague}: HTTP ${response.status} ${text}`);
  }

  const payload = await response.json();
  const teams = payload?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const match = teams.find((item) => {
    const team = item?.team ?? {};
    const candidateNames = [team.displayName, team.name, team.shortDisplayName, team.nickname, team.location].filter(Boolean);
    return candidateNames.some((name) => {
      const normalizedName = normalizeTeamName(name);
      return Array.from(requestedNames).some((requested) => normalizeTeamName(requested) === normalizedName || normalizeTeamName(requested).includes(normalizedName) || normalizedName.includes(normalizeTeamName(requested)));
    });
  });

  const resolvedId = match?.team?.id ?? teamRecord?.idTeam ?? null;
  if (!resolvedId) {
    throw new Error(`Unable to resolve ESPN team ID for ${teamName} in ${normalizedLeague}`);
  }

  return String(resolvedId);
}

async function fetchEspnScheduleWindow(leagueKey, teamId, seasonType, yearOverride) {
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  const config = getLeagueConfig(normalizedLeague);
  if (!config) {
    throw new Error(`Unsupported league for ESPN schedule lookup: ${leagueKey}`);
  }

  const url = new URL(`${ESPN_BASE}/${config.sport}/${config.league}/teams/${teamId}/schedule`);
  if (seasonType !== undefined) {
    url.searchParams.set('seasontype', String(seasonType));
  }
  if (yearOverride) {
    url.searchParams.set('season', String(yearOverride));
  }

  const response = await fetch(url.toString());
  const rawText = await response.text();
  if (response.status === 429) {
    const error = new Error('ESPN rate limited, try again shortly.');
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`ESPN schedule lookup failed for team ${teamId}: HTTP ${response.status}`);
    error.status = response.status;
    error.details = rawText;
    throw error;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    const error = new Error('ESPN returned a non-JSON schedule payload.');
    error.status = 500;
    throw error;
  }
}

/**
 * Soccer seasons run Aug–May straddling two calendar years.
 * ESPN's per-team /schedule endpoint returns nothing for the current season,
 * but the league scoreboard with a date range does. We fetch the full season
 * window (Aug → May) and filter events down to the requested team by ESPN ID.
 */
async function fetchSoccerTeamScheduleViaScoreboard(leagueKey, teamId, config) {
  const now = new Date();
  // Soccer season start: if we're in Aug or later, season started this calendar year;
  // otherwise it started last calendar year (Jan–Jul = second half of prior season).
  const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const seasonEndYear = seasonStartYear + 1;

  const pad = (n) => String(n).padStart(2, '0');
  const startDate = `${seasonStartYear}0801`;
  const endDate = `${seasonEndYear}0601`;

  const url = `${ESPN_BASE}/${config.sport}/${config.league}/scoreboard?dates=${startDate}-${endDate}&limit=500`;
  const response = await fetch(url);
  const rawText = await response.text();

  if (response.status === 429) {
    const error = new Error('ESPN rate limited, try again shortly.');
    error.status = 429;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`ESPN soccer scoreboard failed for ${leagueKey}: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    const error = new Error('ESPN returned a non-JSON soccer scoreboard payload.');
    error.status = 500;
    throw error;
  }

  const allEvents = Array.isArray(payload?.events) ? payload.events : [];

  // Filter to only events where this team is a competitor
  const teamEvents = allEvents.filter((event) =>
    (event?.competitions ?? []).some((comp) =>
      (comp?.competitors ?? []).some((cptr) => String(cptr?.team?.id) === String(teamId))
    )
  );

  return { events: teamEvents, season: payload?.leagues?.[0]?.season ?? null };
}

function mapSoccerEventToGame(event, teamId, normalizedLeague) {
  const competitions = Array.isArray(event?.competitions) ? event.competitions : [];
  const competition = competitions[0] ?? {};
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const homeComp = competitors.find((c) => c.homeAway === 'home') ?? competitors[0] ?? {};
  const awayComp = competitors.find((c) => c.homeAway === 'away') ?? competitors[1] ?? {};
  const homeName = homeComp?.team?.displayName || 'Home';
  const awayName = awayComp?.team?.displayName || 'Away';
  const status = event?.status?.type?.state || event?.status?.type?.description || 'Scheduled';
  const rawDate = event?.date || competition?.date || new Date().toISOString();
  
  // Normalize ESPN timestamp to UTC
  let normalizedDateTime;
  try {
    const dateObj = new Date(rawDate);
    if (!Number.isNaN(dateObj.getTime())) {
      normalizedDateTime = dateObj.toISOString();
    } else {
      normalizedDateTime = new Date().toISOString();
    }
  } catch {
    normalizedDateTime = new Date().toISOString();
  }
  
  const timeValue = normalizedDateTime.includes('T') ? normalizedDateTime.slice(11, 16) : '00:00';

  return {
    id: String(event?.id ?? event?.uid ?? `${normalizedLeague}-${teamId}-${rawDate}`),
    league: normalizedLeague,
    title: event?.shortName || `${homeName} vs ${awayName}`,
    date: normalizedDateTime.includes('T') ? normalizedDateTime.slice(0, 10) : normalizedDateTime,
    time: timeValue,
    datetime: normalizedDateTime,
    status,
    venue: competition?.venue?.fullName || 'TBD',
    home_team_name: homeName,
    visitor_team_name: awayName,
    home_team: { id: homeComp?.team?.id ? String(homeComp.team.id) : String(teamId), name: homeName },
    visitor_team: { id: awayComp?.team?.id ? String(awayComp.team.id) : null, name: awayName },
    homeTeam: { id: homeComp?.team?.id ? String(homeComp.team.id) : String(teamId), name: homeName },
    visitorTeam: { id: awayComp?.team?.id ? String(awayComp.team.id) : null, name: awayName },
    raw: event,
  };
}

export async function fetchEspnTeamRecord(leagueKey, teamName) {
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  const config = getLeagueConfig(normalizedLeague);
  if (!config) {
    throw new Error(`Unsupported league for ESPN team record lookup: ${leagueKey}`);
  }

  const teamId = await resolveEspnTeamId(normalizedLeague, teamName);
  const url = `${ESPN_BASE}/${config.sport}/${config.league}/teams/${teamId}`;
  const response = await fetch(url);
  const rawText = await response.text();

  if (response.status === 429) {
    const error = new Error('ESPN rate limited, try again shortly.');
    error.status = 429;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`ESPN team record lookup failed for ${teamName}: HTTP ${response.status}`);
    error.status = response.status;
    error.details = rawText;
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    const error = new Error('ESPN returned a non-JSON team payload.');
    error.status = 500;
    throw error;
  }

  const team = payload?.team ?? {};
  const recordItems = Array.isArray(team?.record?.items) ? team.record.items : [];
  const totalRecord = recordItems.find((item) => item?.type === 'total') ?? recordItems[0] ?? null;

  return {
    teamId: String(teamId),
    league: normalizedLeague,
    teamName,
    standingSummary: team?.standingSummary ?? null,
    recordSummary: totalRecord?.summary ?? null,
    recordType: totalRecord?.type ?? null,
    recordRaw: team?.record ?? {},
  };
}

export async function fetchEspnTeamSchedule(leagueKey, teamName, options = {}) {
  const { forceRefresh = false } = options;
  const normalizedLeague = normalizeLeagueKey(leagueKey);
  const config = getLeagueConfig(normalizedLeague);
  if (!config) {
    throw new Error(`Unsupported league for ESPN schedule lookup: ${leagueKey}`);
  }

  const teamId = await resolveEspnTeamId(normalizedLeague, teamName);
  const cacheKey = `${teamId}-${normalizeTeamName(teamName)}`;
  const cached = !forceRefresh ? readScheduleCache(normalizedLeague, cacheKey) : null;
  if (cached && Array.isArray(cached.events)) {
    return {
      data: cached.events,
      cached: true,
      meta: {
        source: 'cache',
        fetchedAt: cached.fetchedAt,
        count: cached.events.length,
        season: cached.season ?? null,
      },
      teamId,
      teamName,
    };
  }

  // Soccer leagues use scoreboard + team filter (per-team /schedule is empty for current season)
  if (config.soccer) {
    const { events: rawEvents, season } = await fetchSoccerTeamScheduleViaScoreboard(normalizedLeague, teamId, config);
    const mapped = rawEvents
      .map((ev) => mapSoccerEventToGame(ev, teamId, normalizedLeague))
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    const payloadToCache = {
      fetchedAt: new Date().toISOString(),
      source: 'ESPN-scoreboard',
      league: normalizedLeague,
      teamId,
      teamName,
      season,
      events: mapped,
    };
    writeScheduleCache(normalizedLeague, cacheKey, payloadToCache);

    return {
      data: mapped,
      cached: false,
      meta: { source: 'ESPN-scoreboard', fetchedAt: payloadToCache.fetchedAt, count: mapped.length, season },
      teamId,
      teamName,
    };
  }

  const activePayload = await fetchEspnScheduleWindow(normalizedLeague, teamId, undefined, undefined);
  const activeSeasonYear = Number(activePayload?.season?.year || activePayload?.requestedSeason?.year || new Date().getFullYear());

  // Fetch each season type for both activeSeasonYear and activeSeasonYear+1.
  // This handles all cases robustly:
  //   - NBA/NFL: activeSeasonYear is already the upcoming season → +1 is a safe no-op (empty)
  //   - NHL: ESPN reports activeSeasonYear as the just-finished season (Off Season),
  //     so +1 is needed to capture the entire upcoming 2026-27 schedule
  // Deduplication by event ID prevents any overlap between years.
  const yearsToFetch = Array.from(new Set([activeSeasonYear, activeSeasonYear + 1]));
  const deduped = new Map();
  const combined = [];

  for (const seasonType of [1, 2, 3]) {
    for (const year of yearsToFetch) {
      const payload = await fetchEspnScheduleWindow(normalizedLeague, teamId, seasonType, year);
      const events = Array.isArray(payload?.events) ? payload.events : [];
      for (const event of events) {
        const eventId = String(event?.id ?? event?.uid ?? `${normalizedLeague}-${teamId}-${seasonType}-${year}-${event?.date || 'unknown'}`);
        if (!deduped.has(eventId)) {
          deduped.set(eventId, event);
          combined.push(event);
        }
      }
    }
  }

  combined.sort((a, b) => {
    const aDate = new Date(a?.date || a?.competitions?.[0]?.date || 0).getTime();
    const bDate = new Date(b?.date || b?.competitions?.[0]?.date || 0).getTime();
    return aDate - bDate;
  });

  const mapped = combined.map((event, index) => {
    const competitions = Array.isArray(event?.competitions) ? event.competitions : [];
    const competition = competitions[0] ?? {};
    const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
    const selected = competitors.find((entry) => String(entry?.team?.id) === String(teamId)) ?? competitors[0] ?? {};
    const opponent = competitors.find((entry) => entry !== selected) ?? {};
    const homeComp = competitors.find((entry) => entry.homeAway === 'home') ?? selected;
    const awayComp = competitors.find((entry) => entry.homeAway === 'away') ?? opponent;
    const homeName = homeComp?.team?.displayName || selected?.team?.displayName || teamName;
    const awayName = awayComp?.team?.displayName || opponent?.team?.displayName || 'Opponent';
    const status = event?.status?.type?.state || event?.status?.type?.description || 'Scheduled';
    const rawDate = event?.date || competition?.date || new Date().toISOString();
    
    // Normalize ESPN timestamp to UTC. ESPN returns ISO 8601 strings which might include timezone info.
    // We always convert to UTC for consistency.
    let normalizedDateTime;
    try {
      const dateObj = new Date(rawDate);
      if (!Number.isNaN(dateObj.getTime())) {
        normalizedDateTime = dateObj.toISOString(); // Always returns UTC
      } else {
        normalizedDateTime = new Date().toISOString();
      }
    } catch {
      normalizedDateTime = new Date().toISOString();
    }
    
    const timeValue = normalizedDateTime.includes('T') ? normalizedDateTime.slice(11, 16) : '00:00';

    return {
      id: String(event?.id ?? event?.uid ?? `${normalizedLeague}-${teamId}-${index}`),
      league: normalizedLeague,
      title: event?.shortName || `${homeName} vs ${awayName}`,
      date: normalizedDateTime.includes('T') ? normalizedDateTime.slice(0, 10) : normalizedDateTime,
      time: timeValue,
      datetime: normalizedDateTime,
      status,
      venue: competition?.venue?.fullName || 'TBD',
      home_team_name: homeName,
      visitor_team_name: awayName,
      home_team: {
        id: homeComp?.team?.id ? String(homeComp.team.id) : String(teamId),
        name: homeName,
      },
      visitor_team: {
        id: awayComp?.team?.id ? String(awayComp.team.id) : null,
        name: awayName,
      },
      homeTeam: {
        id: homeComp?.team?.id ? String(homeComp.team.id) : String(teamId),
        name: homeName,
      },
      visitorTeam: {
        id: awayComp?.team?.id ? String(awayComp.team.id) : null,
        name: awayName,
      },
      raw: event,
    };
  });

  const payloadToCache = {
    fetchedAt: new Date().toISOString(),
    source: 'ESPN',
    league: normalizedLeague,
    teamId,
    teamName,
    season: activePayload?.season ?? null,
    events: mapped,
  };

  writeScheduleCache(normalizedLeague, cacheKey, payloadToCache);

  return {
    data: mapped,
    cached: false,
    meta: {
      source: 'ESPN',
      fetchedAt: payloadToCache.fetchedAt,
      count: mapped.length,
      season: activePayload?.season ?? null,
    },
    teamId,
    teamName,
  };
}

export async function refreshAllTeamSchedules() {
  const updates = [];
  for (const [leagueKey, leagueTeams] of Object.entries(readTeamSnapshot().leagues ?? {})) {
    const league = normalizeLeagueKey(leagueKey);
    if (!ESPN_LEAGUES[league]) {
      continue;
    }

    for (const team of leagueTeams) {
      const teamName = team?.strTeam || team?.name || team?.tsdbStrTeam;
      if (!teamName) {
        continue;
      }
      const result = await fetchEspnTeamSchedule(league, teamName, { forceRefresh: true });
      updates.push({ league, teamName, count: result.data.length, source: 'ESPN' });
    }
  }
  return updates;
}
