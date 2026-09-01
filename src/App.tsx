import { useEffect, useMemo, useState } from 'react';
import { F1_CONSTRUCTORS, LEAGUES } from './lib/constants';
import { clearSelection, normalizeStoredSelection, readSelection, writeSelection } from './lib/storage';
import { buildMonthGrid, formatMonthLabel, goToNextMonth, goToPrevMonth, isCurrentMonth, isTodayDate } from './lib/date';
import type { GameEvent, LeagueKey, LeagueOption, LeagueSelection, TeamOption, UserSelectionState } from './types/sports';
import { fetchLeagueGames, fetchTeamProfile, fetchTeamsForLeague } from './services/sportsApi';
import { hasSupabase, supabase } from './lib/supabase';
import { readTimezoneOffset, writeTimezoneOffset } from './lib/storage';
import { IANA_TIMEZONES, getDefaultTimezone, formatTimeInTimezone, normalizeEspnTimestamp, getTimezoneInfo } from './lib/timezoneIANA';

const NAV_TABS = [
  { label: 'Leagues', screen: 'league' as const },
  { label: 'Teams', screen: 'team' as const },
  { label: 'Calendar', screen: 'calendar' as const },
  { label: 'My Teams', screen: 'my-teams' as const },
];

type FlowScreen = 'landing' | 'league' | 'team' | 'calendar' | 'my-teams';

type AccessMode = 'new' | 'existing';

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const hexToRgba = (value: string, alpha: number) => {
  const safe = (value || '#5b7cff').trim();
  if (!safe.startsWith('#')) {
    return `rgba(91, 124, 255, ${alpha})`;
  }

  const hex = safe.slice(1);
  const expanded = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const numeric = Number.parseInt(expanded, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildSelectionPayload = (selectedLeagues: LeagueSelection[], selectedTeams: TeamOption[]): UserSelectionState => ({
  version: 1,
  selectedLeagues,
  selectedTeams,
  updatedAt: new Date().toISOString(),
});

/** Small circular team logo with a white backing for contrast on dark backgrounds.
 *  Falls back to a solid colored dot using primaryColor if the image fails or is absent. */
function TeamLogo({ logoUrl, primaryColor, alt, size = 20 }: {
  logoUrl?: string;
  primaryColor?: string;
  alt: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const color = primaryColor || '#5b7cff';

  const ring: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#ffffff',
    boxShadow: '0 0 0 1.5px rgba(255,255,255,0.18), 0 1px 4px rgba(0,0,0,0.55)',
  };

  if (!logoUrl || failed) {
    return (
      <span
        aria-label={alt}
        style={{ ...ring, background: color, boxShadow: `0 0 0 1.5px ${hexToRgba(color, 0.4)}, 0 1px 4px rgba(0,0,0,0.55)` }}
      />
    );
  }

  return (
    <span style={ring} aria-label={alt}>
      <img
        src={logoUrl}
        alt={alt}
        style={{ width: size - 4, height: size - 4, objectFit: 'contain', display: 'block' }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function App() {
  const [screen, setScreen] = useState<FlowScreen>('landing');
  const [selectedLeagues, setSelectedLeagues] = useState<LeagueSelection[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<TeamOption[]>([]);
  const [teamCatalog, setTeamCatalog] = useState<Record<string, TeamOption[]>>({});
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [failedLeagueLogos, setFailedLeagueLogos] = useState<Record<string, boolean>>({});
  const [teamLeagueIndex, setTeamLeagueIndex] = useState(0);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [authMode, setAuthMode] = useState<AccessMode | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [focusedTeamId, setFocusedTeamId] = useState<string | null>(null);
  const [profileTeamId, setProfileTeamId] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);
  const [userTimezoneId, setUserTimezoneId] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [teamProfiles, setTeamProfiles] = useState<Record<string, {
    loading: boolean;
    recordSummary: string | null;
    standingSummary: string | null;
    source: string;
  }>>({});

  const applySelectionSnapshot = (snapshot: UserSelectionState | null) => {
    const normalized = normalizeStoredSelection(snapshot);
    if (!normalized) return;

    setSelectedLeagues(normalized.selectedLeagues || []);
    setSelectedTeams(normalized.selectedTeams || []);
  };

  const persistSelectionCheckpoint = async () => {
    const snapshot = buildSelectionPayload(selectedLeagues, selectedTeams);
    writeSelection(selectedLeagues, selectedTeams);

    if (!hasSupabase() || !supabase || !authUser) return;

    const { error } = await supabase.from('user_selections').upsert({
      user_id: authUser.id,
      selected_leagues: selectedLeagues,
      selected_teams: selectedTeams,
      updated_at: snapshot.updatedAt,
    }, { onConflict: 'user_id' });

    if (error) {
      throw new Error(error.message);
    }
  };

  const loadSavedSelection = async (userId?: string) => {
    if (hasSupabase() && supabase && userId) {
      const { data, error } = await supabase
        .from('user_selections')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        applySelectionSnapshot({
          version: 1,
          selectedLeagues: Array.isArray(data.selected_leagues) ? data.selected_leagues : [],
          selectedTeams: Array.isArray(data.selected_teams) ? data.selected_teams : [],
          updatedAt: data.updated_at ?? new Date().toISOString(),
        });
        return;
      }
    }

    const saved = readSelection();
    if (saved) {
      applySelectionSnapshot(saved);
    }
  };

  const loadUserTimezone = async (userId?: string) => {
    // Try to load from localStorage first (instant, no race condition)
    const savedTimezoneId = readTimezoneOffset();
    if (savedTimezoneId) {
      setUserTimezoneId(savedTimezoneId);
      // Also sync to Supabase in background if logged in
      if (userId && hasSupabase() && supabase) {
        try {
          await supabase.from('user_metadata').upsert({
            user_id: userId,
            timezone_id: savedTimezoneId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        } catch (err) {
          console.warn('Failed to sync timezone to Supabase:', err);
        }
      }
      return;
    }

    // Try to load from Supabase if logged in
    if (hasSupabase() && supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('user_metadata')
          .select('timezone_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && data && data.timezone_id) {
          setUserTimezoneId(data.timezone_id);
          writeTimezoneOffset(data.timezone_id); // Cache to localStorage
          return;
        }
      } catch (err) {
        console.warn('Failed to load timezone from Supabase:', err);
      }
    }

    // Fallback to default
    const defaultTimezone = getDefaultTimezone();
    setUserTimezoneId(defaultTimezone);
    writeTimezoneOffset(defaultTimezone);
  };

  useEffect(() => {
    if (!hasSupabase() || !supabase) {
      const saved = readSelection();
      if (saved) {
        setSelectedLeagues(saved.selectedLeagues || []);
        setSelectedTeams(saved.selectedTeams || []);
      }
      return;
    }

    const hydrateSession = async () => {
      if (!supabase) {
        const saved = readSelection();
        if (saved) {
          setSelectedLeagues(saved.selectedLeagues || []);
          setSelectedTeams(saved.selectedTeams || []);
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setAuthUser(currentUser ? { id: currentUser.id, email: currentUser.email } : null);

      if (currentUser) {
        await loadSavedSelection(currentUser.id);
        await loadUserTimezone(currentUser.id);
      } else {
        const saved = readSelection();
        if (saved) {
          setSelectedLeagues(saved.selectedLeagues || []);
          setSelectedTeams(saved.selectedTeams || []);
        }
      }
    };

    void hydrateSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setAuthUser(nextUser ? { id: nextUser.id, email: nextUser.email } : null);

      if (nextUser) {
        await loadSavedSelection(nextUser.id);
        await loadUserTimezone(nextUser.id);
      } else {
        const saved = readSelection();
        if (saved) {
          setSelectedLeagues(saved.selectedLeagues || []);
          setSelectedTeams(saved.selectedTeams || []);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (screen === 'landing') return;
    writeSelection(selectedLeagues, selectedTeams);
  }, [screen, selectedLeagues, selectedTeams]);

  // Initialize timezone on app load - read from localStorage first (no race condition)
  useEffect(() => {
    if (userTimezoneId !== null) return; // Already initialized

    // Try localStorage first (instant, no race condition)
    const savedTimezoneId = readTimezoneOffset();
    if (savedTimezoneId) {
      setUserTimezoneId(savedTimezoneId);
      return;
    }

    // Fall back to default
    const defaultTimezone = getDefaultTimezone();
    setUserTimezoneId(defaultTimezone);
    writeTimezoneOffset(defaultTimezone);
  }, [userTimezoneId]);

  // Clear team search when navigating away from team selection screen
  useEffect(() => {
    if (screen !== 'team') {
      setTeamSearchQuery('');
    }
  }, [screen]);

  useEffect(() => {
    const loadTeams = async () => {
      const catalog: Record<string, TeamOption[]> = {};
      for (const league of selectedLeagues) {
        const leagueKey = league.id;
        if (leagueKey === 'f1') {
          catalog[leagueKey] = F1_CONSTRUCTORS.map((team) => ({
            ...team,
            league: leagueKey,
            id: team.id,
            name: team.name,
            shortName: team.shortName,
            logoUrl: `/logos/f1/${team.name.toLowerCase().replace(/\s+/g, '-')}.png`,
          }));
          continue;
        }

        try {
          const teams = await fetchTeamsForLeague(leagueKey);
          catalog[leagueKey] = teams.map((team: any) => ({
            id: `${leagueKey}:${team.idTeam ?? team.id ?? team.strTeam ?? team.name ?? Math.random().toString(16).slice(2)}`,
            league: leagueKey,
            name: team.strTeam || team.name || 'Unknown team',
            shortName: team.strTeamShort || team.strTeam || 'TEAM',
            logoUrl: team.logoUrl || team.strBadge || team.strLogo || team.strTeamBadge || team.strTeamLogo || team.badge || team.logo || '',
            primaryColor: team.strPrimaryColor || '#5b7cff',
            secondaryColor: team.strSecondaryColor || '#0f172a',
            source: 'thesportsdb',
          }));
        } catch {
          catalog[leagueKey] = [];
        }
      }
      setTeamCatalog(catalog);
    };

    if (selectedLeagues.length > 0) {
      loadTeams();
    } else {
      setTeamCatalog({});
    }
  }, [selectedLeagues]);

  useEffect(() => {
    const loadGames = async () => {
      const nextEvents: GameEvent[] = [];
      setScheduleNotice(null);

      for (const league of selectedLeagues) {
        const selectedLeagueTeams = selectedTeams.filter((team) => team.id.startsWith(`${league.id}:`));
        if (selectedLeagueTeams.length === 0) {
          continue;
        }

        for (const team of selectedLeagueTeams) {
          try {
            const leagueGames = await fetchLeagueGames(league.id, team.name);
            for (const game of leagueGames) {
              if (!game) continue;

              const homeTeam = game.home_team || game.homeTeam || game.home_team_details || {};
              const visitorTeam = game.visitor_team || game.visitorTeam || game.visitor_team_details || {};
              const homeName = game.home_team_name || homeTeam.name || homeTeam.full_name || game.strHomeTeam || 'Home';
              const visitorName = game.visitor_team_name || visitorTeam.name || visitorTeam.full_name || game.strAwayTeam || 'Visitor';
              const status = game.status || game.strStatus || game.state || 'Scheduled';
              // The server now returns normalized UTC timestamps in game.datetime
              // Treat this as the canonical UTC time and don't reprocess it
              const utcDatetime = game.datetime || game.date || game.dateEvent || game.start_time || game.scheduled || game.strTimestamp || new Date().toISOString();
              const dateObj = new Date(utcDatetime);
              const homeNormalized = normalizeName(homeName);
              const visitorNormalized = normalizeName(visitorName);

              const isSelectedMatch = normalizeName(team.name) === homeNormalized || normalizeName(team.name) === visitorNormalized;
              if (!isSelectedMatch) continue;

              const selectedIsHome = normalizeName(team.name) === homeNormalized;
              const opponentName = selectedIsHome ? visitorName : homeName;
              const teamDisplayName = team.name;
              const competition = game?.raw?.competitions?.[0] ?? {};
              const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
              const homeComp = competitors.find((entry: any) => entry?.homeAway === 'home') ?? competitors[0] ?? {};
              const awayComp = competitors.find((entry: any) => entry?.homeAway === 'away') ?? competitors[1] ?? {};
              const homeScoreValue = Number.parseInt(String(homeComp?.score ?? ''), 10);
              const awayScoreValue = Number.parseInt(String(awayComp?.score ?? ''), 10);
              const teamScore = Number.isFinite(homeScoreValue) && Number.isFinite(awayScoreValue)
                ? (selectedIsHome ? homeScoreValue : awayScoreValue)
                : null;
              const opponentScore = Number.isFinite(homeScoreValue) && Number.isFinite(awayScoreValue)
                ? (selectedIsHome ? awayScoreValue : homeScoreValue)
                : null;
              const completed = Boolean(game?.raw?.status?.type?.completed)
                || String(status).toLowerCase() === 'final'
                || String(status).toLowerCase() === 'post';
              const seasonYear = Number(game?.raw?.season?.year ?? NaN);
              const seasonType = Number(game?.raw?.seasonType?.type ?? NaN);

              nextEvents.push({
                id: `${league.id}-${game.id || game.idEvent || `${team.name}-${Math.random().toString(16).slice(2)}`}`,
                league: league.id,
                teamId: team.id,
                teamName: teamDisplayName,
                teamShortName: team.shortName?.slice(0, 3).toUpperCase() || teamDisplayName.slice(0, 3).toUpperCase(),
                opponent: opponentName,
                date: dateObj.toISOString(),
                datetime: utcDatetime,  // Use the normalized UTC datetime from server
                time: dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                venue: game.venue || game.strVenue || game.arena || 'TBD',
                phase: status,
                logoUrl: team.logoUrl || '',
                primaryColor: team.primaryColor || '#5b7cff',
                type: league.id === 'f1' ? 'race' : 'game',
                status,
                completed,
                teamScore,
                opponentScore,
                seasonYear: Number.isFinite(seasonYear) ? seasonYear : undefined,
                seasonType: Number.isFinite(seasonType) ? seasonType : undefined,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to fetch games for league';
            if (message.toLowerCase().includes('rate limited')) {
              setScheduleNotice('ESPN rate limited, try again shortly.');
            }
          }
        }
      }
      setEvents(nextEvents);
    };

    if (selectedLeagues.length > 0) {
      loadGames();
    } else {
      setEvents([]);
    }
  }, [selectedLeagues, selectedTeams]);

  const leagueOptions = LEAGUES;
  const selectedLeagueSet = useMemo(() => new Set(selectedLeagues.map((league) => league.id)), [selectedLeagues]);

  const currentTeamLeague = selectedLeagues[teamLeagueIndex] ?? null;
  const currentVisibleTeams = currentTeamLeague ? teamCatalog[currentTeamLeague.id] ?? [] : [];
  const filteredCurrentVisibleTeams = useMemo(() => {
    const query = teamSearchQuery.trim().toLowerCase();
    if (!query) return currentVisibleTeams;
    return currentVisibleTeams.filter((team) => team.name.toLowerCase().includes(query));
  }, [currentVisibleTeams, teamSearchQuery]);

  const toggleLeague = (league: LeagueOption) => {
    setSelectedLeagues((current) => {
      const exists = current.some((item) => item.id === league.id);
      return exists ? current.filter((item) => item.id !== league.id) : [...current, { ...league, logoPath: league.logoPath || '' }];
    });
  };

  const toggleTeam = (team: TeamOption) => {
    setSelectedTeams((current) =>
      current.some((item) => item.id === team.id)
        ? current.filter((item) => item.id !== team.id)
        : [...current, team],
    );
  };

  const handleLandingChoice = (mode: AccessMode) => {
    setAuthMode(mode);
    setAuthError(null);
    setAuthPassword('');
    setAuthConfirmPassword('');
  };

  const continueAsGuest = () => {
    setAuthMode(null);
    setAuthError(null);
    clearSelection();
    setSelectedLeagues([]);
    setSelectedTeams([]);
    setTeamCatalog({});
    setTeamLeagueIndex(0);
    setSelectedDay(null);
    setScreen('league');
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!hasSupabase() || !supabase) {
      setAuthError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    if (!authEmail.trim() || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }

    if (authMode === 'new' && authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      const result = authMode === 'new'
        ? await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });

      if (result.error) {
        throw result.error;
      }

      const sessionUser = result.data?.user ?? null;
      if (sessionUser) {
        setAuthUser({ id: sessionUser.id, email: sessionUser.email });
        await loadSavedSelection(sessionUser.id);
      }

      setAuthEmail('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAuthMode(null);
      // Existing users go straight to calendar; new users start at league selection
      setScreen(authMode === 'existing' ? 'calendar' : 'league');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLeagueContinue = async () => {
    if (selectedLeagues.length === 0) {
      setScreen('calendar');
      return;
    }

    try {
      await persistSelectionCheckpoint();
    } catch (error) {
      console.error('Failed to persist league selection checkpoint', error);
    }

    setTeamSearchQuery(''); // Clear search when entering team selection
    setTeamLeagueIndex(0);
    setScreen('team');
  };

  const handleTeamContinue = async () => {
    try {
      await persistSelectionCheckpoint();
    } catch (error) {
      console.error('Failed to persist team selection checkpoint', error);
    }

    setTeamSearchQuery(''); // Clear search when navigating away from team selection

    if (teamLeagueIndex < selectedLeagues.length - 1) {
      setTeamLeagueIndex((current) => current + 1);
      return;
    }

    setScreen('calendar');
  };

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const eventDate = new Date(event.date);
        return eventDate.getMonth() === currentMonth.getMonth() && eventDate.getFullYear() === currentMonth.getFullYear();
      }),
    [events, currentMonth],
  );

  const monthDays = buildMonthGrid(currentMonth);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, GameEvent[]>();

    for (const event of filteredEvents) {
      const dayKey = new Date(event.date).toISOString().slice(0, 10);
      const group = map.get(dayKey) ?? [];
      group.push(event);
      map.set(dayKey, group);
    }

    return map;
  }, [filteredEvents]);

  const renderLandingStep = () => {
    if (authMode) {
      return (
        <div className="relative mx-auto max-w-md py-8">
          <div className="rounded-[28px] border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/40">
            <div className="mb-6 text-center">
              <div className="text-xs uppercase tracking-[0.28em] text-amber-300">{authMode === 'new' ? 'Create account' : 'Welcome back'}</div>
              <h2 className="mt-3 text-2xl font-semibold text-white">{authMode === 'new' ? 'Sign up for Rally' : 'Log in to Rally'}</h2>
            </div>

            <form onSubmit={submitAuth} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  autoComplete={authMode === 'new' ? 'new-password' : 'current-password'}
                  required
                />
              </div>

              {authMode === 'new' && (
                <div>
                  <label htmlFor="auth-confirm-password" className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">Confirm password</label>
                  <input
                    id="auth-confirm-password"
                    type="password"
                    value={authConfirmPassword}
                    onChange={(event) => setAuthConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              {authError && (
                <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">{authError}</div>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {authLoading ? 'Please wait…' : authMode === 'new' ? 'Create account' : 'Log in'}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode(null)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  Back
                </button>
              </div>
            </form>

            <div className="mt-5 border-t border-slate-800 pt-4 text-center">
              <button
                type="button"
                onClick={continueAsGuest}
                className="text-sm font-medium text-amber-200 hover:text-amber-100"
              >
                Continue as guest
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative space-y-8 py-8 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[32px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.12),transparent_25%)]" />
          <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="absolute -right-12 bottom-8 h-52 w-52 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />
        </div>

        <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => handleLandingChoice('new')}
            className="group relative overflow-hidden rounded-[26px] border border-amber-400/60 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.9))] p-7 text-center shadow-[0_18px_40px_rgba(245,158,11,0.18)] transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:border-amber-300 hover:shadow-[0_20px_52px_rgba(245,158,11,0.3)] active:translate-y-0"
          >
            <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            <span className="relative block text-2xl font-bold tracking-[0.12em] text-white uppercase">New User</span>
          </button>

          <button
            type="button"
            onClick={() => handleLandingChoice('existing')}
            className="group relative overflow-hidden rounded-[26px] border border-slate-700/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(15,23,42,0.72))] p-7 text-center shadow-[0_18px_40px_rgba(15,23,42,0.4)] transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:border-slate-500 hover:bg-slate-800/80 hover:shadow-[0_18px_40px_rgba(59,130,246,0.12)] active:translate-y-0"
          >
            <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
            <span className="relative block text-2xl font-bold tracking-[0.12em] text-white uppercase">Existing User</span>
          </button>
        </div>
      </div>
    );
  };

  const renderLeagueStep = () => (
    <div className="space-y-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-amber-300">League Selection</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Pick your leagues</h2>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-300">
          {selectedLeagues.length} selected
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {leagueOptions.map((league) => {
          const selected = selectedLeagueSet.has(league.id);
          const logoFailed = Boolean(failedLeagueLogos[league.id]);
          const initials = league.shortName || league.name.slice(0, 3).toUpperCase();

          return (
            <button
              key={league.id}
              type="button"
              onClick={() => toggleLeague(league)}
              className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                selected
                  ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                  : 'border-slate-700 bg-slate-900/70 hover:border-slate-500 hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-slate-800">
                  {league.logoPath && !logoFailed ? (
                    <img
                      src={league.logoPath}
                      alt={league.name}
                      className="h-8 w-8 object-contain"
                      onError={() => setFailedLeagueLogos((current) => ({ ...current, [league.id]: true }))}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white" style={{ background: league.accent }}>
                      {initials}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-white">{league.name}</div>
                  <div className="text-sm text-slate-400">{league.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderTeamStep = () => {
    if (!currentTeamLeague) {
      return null;
    }

    const totalLeagueSteps = selectedLeagues.length;
    const progressLabel = `Step ${teamLeagueIndex + 1} of ${totalLeagueSteps}: ${currentTeamLeague.name} Teams`;

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs uppercase tracking-[0.25em] text-amber-300">Team Selection</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{progressLabel}</h2>
          <div className="mt-3 flex gap-2">
            {selectedLeagues.map((league, index) => (
              <div
                key={league.id}
                className={`h-2 flex-1 rounded-full ${
                  index < teamLeagueIndex ? 'bg-amber-500' : index === teamLeagueIndex ? 'bg-amber-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="team-search" className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-400">Search teams</label>
          <input
            id="team-search"
            type="text"
            value={teamSearchQuery}
            onChange={(event) => setTeamSearchQuery(event.target.value)}
            placeholder="Type a team name..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCurrentVisibleTeams.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-5 text-sm text-slate-400">
              No teams match “{teamSearchQuery}”. Clear the search to see the full list.
            </div>
          ) : filteredCurrentVisibleTeams.map((team) => {
            const selected = selectedTeams.some((item) => item.id === team.id);
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => toggleTeam(team)}
                className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                  selected
                    ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                    : 'border-slate-700 bg-slate-900/70 hover:border-slate-500 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-slate-800">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} className="h-10 w-10 object-contain" />
                    ) : (
                      <span className="text-xs font-bold text-white">{team.shortName}</span>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{team.name}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{team.league}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const focusedTeam = useMemo(
    () => selectedTeams.find((t) => t.id === focusedTeamId) ?? null,
    [focusedTeamId, selectedTeams],
  );

  const profileTeam = useMemo(
    () => selectedTeams.find((t) => t.id === profileTeamId) ?? null,
    [profileTeamId, selectedTeams],
  );

  const getTeamEvents = (teamName: string) => {
    const name = normalizeName(teamName);
    return events.filter((e) => normalizeName(e.teamName) === name || normalizeName(e.opponent) === name);
  };

  const focusedTeamUpcoming = useMemo(() => {
    if (!focusedTeam) return [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const all = getTeamEvents(focusedTeam.name).filter((e) => e.date.slice(0, 10) >= todayStr);

    const sorted = all
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 10);

    return sorted;
  }, [focusedTeam, events]);

  const profileTeamEvents = useMemo(() => {
    if (!profileTeam) return [];
    const all = getTeamEvents(profileTeam.name)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return all;
  }, [profileTeam, events]);

  const profileCurrentSeasonYear = useMemo(() => {
    if (profileTeamEvents.length === 0) return null;
    const years = profileTeamEvents
      .map((e) => e.seasonYear)
      .filter((year): year is number => Number.isFinite(year));
    if (years.length === 0) return null;
    return Math.max(...years);
  }, [profileTeamEvents]);

  const profileCompletedCurrentSeason = useMemo(() => {
    if (!profileTeam) return [];
    return profileTeamEvents.filter((event) =>
      event.completed === true
      && (profileCurrentSeasonYear === null || event.seasonYear === profileCurrentSeasonYear));
  }, [profileTeam, profileTeamEvents, profileCurrentSeasonYear]);

  const profileUpcomingNext10 = useMemo(() => {
    if (!profileTeam) return [];
    const todayStr = new Date().toISOString().slice(0, 10);
    return profileTeamEvents
      .filter((event) =>
        event.date.slice(0, 10) >= todayStr
        && (profileCurrentSeasonYear === null || event.seasonYear === profileCurrentSeasonYear))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 10);
  }, [profileTeam, profileTeamEvents, profileCurrentSeasonYear]);

  const profileComputedRecord = useMemo(() => {
    if (!profileTeam) return null;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const event of profileCompletedCurrentSeason) {
      if (typeof event.teamScore !== 'number' || typeof event.opponentScore !== 'number') continue;
      if (event.teamScore > event.opponentScore) wins += 1;
      else if (event.teamScore < event.opponentScore) losses += 1;
      else draws += 1;
    }
    if (draws > 0 || profileTeam.league === 'premier-league' || profileTeam.league === 'la-liga') {
      return `${wins}-${draws}-${losses}`;
    }
    return `${wins}-${losses}`;
  }, [profileTeam, profileCompletedCurrentSeason]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!profileTeam) return;
      if (teamProfiles[profileTeam.id]?.loading || teamProfiles[profileTeam.id]) return;
      setTeamProfiles((current) => ({
        ...current,
        [profileTeam.id]: {
          loading: true,
          recordSummary: null,
          standingSummary: null,
          source: 'loading',
        },
      }));

      try {
        const profile = await fetchTeamProfile(profileTeam.league, profileTeam.name);
        setTeamProfiles((current) => ({
          ...current,
          [profileTeam.id]: {
            loading: false,
            recordSummary: profile.recordSummary ?? null,
            standingSummary: profile.standingSummary ?? null,
            source: profile.source ?? 'espn-team-endpoint',
          },
        }));
      } catch {
        setTeamProfiles((current) => ({
          ...current,
          [profileTeam.id]: {
            loading: false,
            recordSummary: null,
            standingSummary: null,
            source: 'error',
          },
        }));
      }
    };

    loadProfile();
  }, [profileTeam, teamProfiles]);

  const renderCalendarStep = () => {
    return (
      <div className="space-y-4">
        {/* My Teams card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.25em] text-amber-300">My Teams</div>
            <button
              type="button"
              title="Edit preferences"
              onClick={() => setScreen('league')}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-400 transition hover:border-slate-500 hover:bg-slate-700 hover:text-white"
              aria-label="Edit preferences"
            >
              {/* Pencil icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L6.226 12.25a2.751 2.751 0 0 1-.892.596l-2.047.848a.75.75 0 0 1-.98-.98l.848-2.047a2.75 2.75 0 0 1 .596-.892l7.262-7.262Z" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTeams.length === 0 ? (
              <div className="text-sm text-slate-400">No teams selected yet.</div>
            ) : (
              selectedTeams.map((team) => {
                const isFocused = focusedTeamId === team.id;
                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setFocusedTeamId(isFocused ? null : team.id)}
                    title={isFocused ? 'Clear highlight' : `Highlight ${team.name}`}
                    className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                      isFocused
                        ? 'border-amber-400 bg-amber-500/20 text-white shadow shadow-amber-500/30'
                        : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500 hover:bg-slate-800/60'
                    }`}
                  >
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} className="h-5 w-5 rounded-full object-contain" />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[8px] font-semibold text-white">
                        {team.shortName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    {team.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {scheduleNotice && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {scheduleNotice}
          </div>
        )}

        {/* Calendar + side panel side-by-side */}
        <div className="flex gap-4">
          {/* Calendar column */}
          <div className="min-w-0 flex-1">
            {/* Month nav */}
            <div className="mb-3 flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <button
                type="button"
                onClick={() => setCurrentMonth(goToPrevMonth(currentMonth))}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                ‹ Prev
              </button>
              <div className="text-xl font-semibold text-white">{formatMonthLabel(currentMonth)}</div>
              <button
                type="button"
                onClick={() => setCurrentMonth(goToNextMonth(currentMonth))}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Next ›
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="px-1 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  {day}
                </div>
              ))}

              {monthDays.map((day) => {
                const dayKey = day.toISOString().slice(0, 10);
                const dayEvents = eventsByDay.get(dayKey) ?? [];
                // Sort events by time, earliest first
                const sortedEvents = dayEvents.sort((a, b) => {
                  const aTime = a.time || '00:00';
                  const bTime = b.time || '00:00';
                  return aTime.localeCompare(bTime);
                });
                const visibleEvents = sortedEvents.slice(0, 2);
                const hiddenEvents = sortedEvents.slice(2);
                const hiddenCount = hiddenEvents.length;
                const isTooltipOpen = expandedDayKey === dayKey;

                return (
                  <div
                    key={dayKey}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-28 cursor-pointer rounded-xl border p-1.5 transition-colors ${
                      isCurrentMonth(day, currentMonth)
                        ? 'border-slate-800 bg-slate-900/70'
                        : 'border-slate-900 bg-slate-950/60 text-slate-500'
                    } ${isTodayDate(day) ? 'ring-1 ring-amber-400' : ''}`}
                  >
                    <div className="mb-1.5 text-right text-xs font-medium text-slate-300">{day.getDate()}</div>

                    <div className="space-y-1">
                      {visibleEvents.map((event) => {
                        const teamColor = event.primaryColor ?? '#5b7cff';
                        const isFocusedEvent = focusedTeamId === event.teamId;
                        const displayTime = userTimezoneId !== null 
                          ? formatTimeInTimezone(event.datetime, userTimezoneId)
                          : event.time;
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedDay(day); }}
                            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[9px] font-medium text-slate-100 transition-transform"
                            title={`${event.teamName} vs ${event.opponent} at ${displayTime}`}
                            style={{
                              borderLeft: `3px solid ${teamColor}`,
                              background: hexToRgba(teamColor, isFocusedEvent ? 0.32 : 0.16),
                              boxShadow: isFocusedEvent
                                ? `0 0 0 1.5px ${teamColor}, 0 2px 8px ${hexToRgba(teamColor, 0.5)}`
                                : `inset 0 0 0 1px ${hexToRgba(teamColor, 0.22)}`,
                              transform: isFocusedEvent ? 'scale(1.04)' : 'scale(1)',
                            }}
                          >
                            <TeamLogo logoUrl={event.logoUrl} primaryColor={teamColor} alt={event.teamName} size={16} />
                            <span className="truncate">{event.teamShortName} vs {event.opponent}</span>
                          </button>
                        );
                      })}

                      {hiddenCount > 0 && (
                        <div className="relative">
                          <button
                            type="button"
                            className="w-full rounded-md border border-dashed border-slate-600 bg-slate-800/50 px-1.5 py-0.5 text-left text-[9px] font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setExpandedDayKey(isTooltipOpen ? null : dayKey); }}
                          >
                            +{hiddenCount} more
                          </button>
                          {isTooltipOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-slate-600 bg-slate-900/95 shadow-lg p-2 min-w-max">
                              {hiddenEvents.map((event) => {
                                const displayTime = userTimezoneId !== null
                                  ? formatTimeInTimezone(event.datetime, userTimezoneId)
                                  : event.time;
                                return (
                                  <div key={event.id} className="text-[8px] text-slate-300 py-1 border-b border-slate-700 last:border-b-0">
                                    <div className="font-medium text-amber-200">{event.teamShortName} vs {event.opponent}</div>
                                    <div className="text-slate-400">{displayTime}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Detail Panel */}
          {focusedTeam && (
            <div className="w-64 shrink-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                {focusedTeam.logoUrl ? (
                  <img src={focusedTeam.logoUrl} alt={focusedTeam.name} className="h-8 w-8 rounded-full object-contain bg-white p-0.5" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: focusedTeam.primaryColor || '#5b7cff' }}>
                    {focusedTeam.shortName.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{focusedTeam.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Next 10 games</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFocusedTeamId(null)}
                  className="ml-auto shrink-0 text-slate-500 hover:text-white"
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </div>

              {focusedTeamUpcoming.length === 0 ? (
                <div className="text-xs text-slate-400">No upcoming games found.</div>
              ) : (
                <div className="space-y-2">
                  {focusedTeamUpcoming.map((event) => {
                    const teamColor = event.primaryColor ?? '#5b7cff';
                    const dateLabel = new Date(event.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
                    return (
                      <div
                        key={event.id}
                        className="rounded-lg p-2 text-xs"
                        style={{ background: hexToRgba(teamColor, 0.12), borderLeft: `3px solid ${teamColor}` }}
                      >
                        <div className="font-semibold text-white">vs {event.opponent}</div>
                        <div className="mt-0.5 text-slate-400">
                          {dateLabel} · {userTimezoneId !== null ? formatTimeInTimezone(event.datetime, userTimezoneId) : event.time}
                        </div>
                        {event.venue && event.venue !== 'TBD' && (
                          <div className="mt-0.5 truncate text-slate-500">{event.venue}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Day detail modal */}
        {selectedDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{formatMonthLabel(selectedDay)}</h3>
                <button type="button" onClick={() => setSelectedDay(null)} className="text-slate-300 hover:text-white">Close</button>
              </div>
              <div className="space-y-3">
                {(eventsByDay.get(selectedDay.toISOString().slice(0, 10)) ?? []).map((event) => {
                  const teamColor = event.primaryColor ?? '#5b7cff';
                  const displayTime = userTimezoneId !== null
                    ? formatTimeInTimezone(event.datetime, userTimezoneId)
                    : event.time;
                  return (
                    <div
                      key={event.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                      style={{ borderLeft: `4px solid ${teamColor}`, background: hexToRgba(teamColor, 0.08) }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <TeamLogo logoUrl={event.logoUrl} primaryColor={teamColor} alt={event.teamName} size={28} />
                          <span className="font-medium text-white">{event.teamName}</span>
                        </div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{event.type}</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">vs {event.opponent}</div>
                      <div className="mt-2 text-xs text-slate-400">{displayTime} • {event.venue}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMyTeamsStep = () => {
    const profileMeta = profileTeam ? teamProfiles[profileTeam.id] : null;
    const recordDisplay = profileMeta?.recordSummary || profileComputedRecord || 'N/A';

    return (
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.25em] text-amber-300">My Teams</div>
          {selectedTeams.length === 0 ? (
            <div className="text-sm text-slate-400">No teams selected yet.</div>
          ) : (
            <div className="space-y-2">
              {selectedTeams.map((team) => {
                const selected = profileTeamId === team.id;
                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setProfileTeamId((current) => current === team.id ? null : team.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      selected
                        ? 'border-amber-400 bg-amber-500/15 shadow shadow-amber-500/20'
                        : 'border-slate-700 bg-slate-900/70 hover:border-slate-500 hover:bg-slate-800/80'
                    }`}
                  >
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} className="h-8 w-8 rounded-full bg-white/90 p-0.5 object-contain" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-white">
                        {team.shortName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-white">{team.name}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{team.league}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          {!profileTeam ? (
            <div className="text-sm text-slate-400">Select a team to view profile details.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-3">
                  <TeamLogo logoUrl={profileTeam.logoUrl} primaryColor={profileTeam.primaryColor} alt={profileTeam.name} size={36} />
                  <div>
                    <div className="text-lg font-semibold text-white">{profileTeam.name}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-300">
                      {profileMeta?.standingSummary || 'Current Season'}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-2xl font-black text-amber-200">
                  {profileMeta?.loading ? 'Loading record…' : recordDisplay}
                </div>
                <div className="text-xs text-slate-400">
                  {profileMeta?.recordSummary
                    ? `Source: ESPN team endpoint (${profileMeta.source})`
                    : 'Record computed from completed games in current season'}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-300">Recent Results</div>
                  {profileCompletedCurrentSeason.length === 0 ? (
                    <div className="text-xs text-slate-400">No completed games yet for this season.</div>
                  ) : (
                    <div className="space-y-2">
                      {profileCompletedCurrentSeason.map((event) => {
                        const displayTime = userTimezoneId !== null
                          ? formatTimeInTimezone(event.datetime, userTimezoneId)
                          : event.time;
                        return (
                          <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-xs">
                            <div className="font-semibold text-white">vs {event.opponent}</div>
                            <div className="mt-0.5 text-slate-300">
                              {event.teamScore ?? '-'} - {event.opponentScore ?? '-'} · {new Date(event.date).toLocaleDateString()} · {displayTime}
                            </div>
                            <div className="mt-0.5 truncate text-slate-500">{event.venue || 'TBD'}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-300">Upcoming Schedule (Next 10)</div>
                  {profileUpcomingNext10.length === 0 ? (
                    <div className="text-xs text-slate-400">No upcoming games found.</div>
                  ) : (
                    <div className="space-y-2">
                      {profileUpcomingNext10.map((event) => {
                        const displayTime = userTimezoneId !== null
                          ? formatTimeInTimezone(event.datetime, userTimezoneId)
                          : event.time;
                        return (
                          <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-xs">
                            <div className="font-semibold text-white">vs {event.opponent}</div>
                            <div className="mt-0.5 text-slate-300">{new Date(event.date).toLocaleDateString()} · {displayTime}</div>
                            <div className="mt-0.5 truncate text-slate-500">{event.venue || 'TBD'}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const stepIndex = screen === 'league'
    ? 0
    : screen === 'team'
      ? 1
      : screen === 'calendar'
        ? 2
        : 3;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.1),transparent_20%)]" />
        <div className="absolute left-[-10%] top-0 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-[-8%] h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute inset-x-0 top-24 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col items-center gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full text-center md:text-left">
            <h1 className="text-[2.6rem] font-black uppercase tracking-[0.16em] text-transparent bg-gradient-to-r from-white via-amber-100 to-amber-300 bg-clip-text drop-shadow-[0_0_24px_rgba(245,158,11,0.35)] md:text-[3rem]">
              Rally
            </h1>
            <p className="mt-2 text-base font-medium tracking-[0.06em] text-amber-200 md:text-lg">Every Team, Every Game, One Place.</p>
          </div>
          {screen !== 'landing' && (
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 p-1 shadow-sm shadow-slate-950/40">
                {NAV_TABS.map((tab, index) => (
                  <button
                    key={tab.label}
                    type="button"
                    onClick={() => {
                      if (tab.screen === 'team' && selectedLeagues.length === 0) {
                        setScreen('league');
                        return;
                      }
                      if ((tab.screen === 'calendar' || tab.screen === 'my-teams') && selectedTeams.length === 0 && selectedLeagues.length === 0) {
                        setScreen('league');
                        return;
                      }
                      setScreen(tab.screen);
                    }}
                    className={`whitespace-nowrap rounded-full px-2.5 py-2 text-[10px] font-medium uppercase tracking-[0.16em] transition-colors sm:text-[11px] ${
                      index === stepIndex
                        ? 'bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/60'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {authUser && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors"
                    title={authUser.email || 'Profile'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.715 9.715 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {showProfileMenu && (
                    <div className="absolute right-0 top-full mt-2 rounded-lg border border-slate-700 bg-slate-900/95 shadow-lg z-50">
                      <div className="px-4 py-3 border-b border-slate-700">
                        <div className="text-xs text-slate-400">Logged in as</div>
                        <div className="text-sm font-medium text-white truncate">{authUser.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTimezoneSelector(!showTimezoneSelector);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80 transition-colors flex items-center justify-between"
                      >
                        <span>Time Zone</span>
                        <span className="text-xs text-slate-400">
                          {userTimezoneId ? (getTimezoneInfo(userTimezoneId)?.label || userTimezoneId) : 'Loading...'}
                        </span>
                      </button>
                      {showTimezoneSelector && (
                        <div className="border-t border-slate-700 px-4 py-2 max-h-60 overflow-y-auto">
                          <div className="mb-2 text-xs font-medium text-amber-300 uppercase tracking-wide">Select timezone</div>
                          {IANA_TIMEZONES.map((tz) => (
                            <button
                              key={tz.id}
                              type="button"
                              onClick={async () => {
                                // Update immediately
                                setUserTimezoneId(tz.id);
                                writeTimezoneOffset(tz.id);
                                // Persist to Supabase in background if logged in
                                if (authUser && hasSupabase() && supabase) {
                                  try {
                                    await supabase.from('user_metadata').upsert({
                                      user_id: authUser.id,
                                      timezone_id: tz.id,
                                      updated_at: new Date().toISOString(),
                                    }, { onConflict: 'user_id' });
                                  } catch (err) {
                                    console.error('Failed to save timezone to Supabase:', err);
                                  }
                                }
                              }}
                              className={`w-full px-3 py-1.5 text-left text-xs rounded transition-colors ${
                                userTimezoneId === tz.id
                                  ? 'bg-amber-500/20 text-amber-200 font-medium'
                                  : 'text-slate-300 hover:bg-slate-800/40'
                              }`}
                            >
                              {tz.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (hasSupabase() && supabase) {
                            await supabase.auth.signOut();
                            setAuthUser(null);
                            setShowProfileMenu(false);
                          }
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 border-t border-slate-700 transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        <div className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-sm">
          {screen === 'landing' && renderLandingStep()}
          {screen === 'league' && renderLeagueStep()}
          {screen === 'team' && renderTeamStep()}
          {screen === 'calendar' && renderCalendarStep()}
          {screen === 'my-teams' && renderMyTeamsStep()}

          {screen !== 'landing' && (
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (screen === 'league') {
                    setScreen('landing');
                    return;
                  }

                  if (screen === 'team') {
                    setScreen('league');
                    return;
                  }

                  if (screen === 'calendar') {
                    setScreen(selectedLeagues.length > 0 ? 'team' : 'league');
                    return;
                  }

                  if (screen === 'my-teams') {
                    setScreen('calendar');
                  }
                }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                Back
              </button>

              {screen === 'league' && (
                <button
                  type="button"
                  onClick={handleLeagueContinue}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
                >
                  {selectedLeagues.length === 0 ? 'Go to Calendar' : 'Continue'}
                </button>
              )}

              {screen === 'team' && (
                <button
                  type="button"
                  onClick={handleTeamContinue}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
                >
                  {teamLeagueIndex < selectedLeagues.length - 1 ? 'Continue to next league' : 'View calendar'}
                </button>
              )}

              {screen === 'calendar' && null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
