import { useEffect, useMemo, useState } from 'react';
import { F1_CONSTRUCTORS, LEAGUES, FULL_TEAM_ROSTERS } from './lib/constants';
import { clearSelection, readSelection, writeSelection } from './lib/storage';
import { buildMonthGrid, formatMonthLabel, goToNextMonth, goToPrevMonth, isCurrentMonth, isTodayDate } from './lib/date';
import type { GameEvent, LeagueKey, LeagueOption, LeagueSelection, TeamOption } from './types/sports';
import { fetchLeagueGames, fetchTeamsForLeague } from './services/sportsApi';

const STEPS = ['Leagues', 'Teams', 'Calendar'];

type FlowScreen = 'landing' | 'league' | 'team' | 'calendar';

type AccessMode = 'new' | 'existing';

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

  useEffect(() => {
    const saved = readSelection();
    if (saved) {
      setSelectedLeagues(saved.selectedLeagues || []);
      setSelectedTeams(saved.selectedTeams || []);
    }
  }, []);

  useEffect(() => {
    if (screen === 'landing') return;
    writeSelection(selectedLeagues, selectedTeams);
  }, [screen, selectedLeagues, selectedTeams]);

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
      for (const league of selectedLeagues) {
        try {
          const leagueGames = await fetchLeagueGames(league.id);
          for (const game of leagueGames) {
            if (!game) continue;

            const homeTeam = game.home_team || game.homeTeam || {};
            const visitorTeam = game.visitor_team || game.visitorTeam || {};
            const homeName = homeTeam.full_name || homeTeam.name || game.home_team_name || 'Home';
            const visitorName = visitorTeam.full_name || visitorTeam.name || game.visitor_team_name || 'Visitor';
            const status = game.status || game.state || 'Scheduled';
            const startDate = game.date || game.start_time || game.datetime || new Date().toISOString();
            const dateObj = new Date(startDate);

            const colorSource = selectedTeams.find(
              (team) => team.name === homeName || team.id.includes(homeName.toLowerCase().replace(/\s+/g, '-')),
            );

            nextEvents.push({
              id: `${league.id}-${game.id || Math.random().toString(16).slice(2)}`,
              league: league.id,
              teamId: `${league.id}:${homeName.toLowerCase().replace(/\s+/g, '-')}`,
              teamName: homeName,
              teamShortName: homeName.slice(0, 3).toUpperCase(),
              opponent: visitorName,
              date: dateObj.toISOString(),
              time: dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              venue: game.venue || game.arena || 'TBD',
              phase: status,
              primaryColor: colorSource?.primaryColor || '#5b7cff',
              type: league.id === 'f1' ? 'race' : 'game',
              status,
            });
          }
        } catch {
          // silent fallback for unsupported schedule data
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
    if (mode === 'new') {
      clearSelection();
      setSelectedLeagues([]);
      setSelectedTeams([]);
      setTeamCatalog({});
      setTeamLeagueIndex(0);
      setSelectedDay(null);
    } else {
      const saved = readSelection();
      setSelectedLeagues(saved?.selectedLeagues || []);
      setSelectedTeams(saved?.selectedTeams || []);
      setTeamLeagueIndex(0);
    }

    setScreen('league');
  };

  const handleLeagueContinue = () => {
    if (selectedLeagues.length === 0) {
      setScreen('calendar');
      return;
    }

    setTeamLeagueIndex(0);
    setScreen('team');
  };

  const handleTeamContinue = () => {
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

  const renderLandingStep = () => (
    <div className="space-y-8 py-6 text-center">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[2.5rem] font-black uppercase tracking-[0.14em] text-white md:text-[2.75rem]">Rally</h1>
        <p className="mt-2 text-base font-medium tracking-[0.06em] text-indigo-200 md:text-lg">Every Team, Every Game, One Place.</p>
      </div>

      <div className="mx-auto grid max-w-2xl gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => handleLandingChoice('new')}
          className="rounded-2xl border border-indigo-500 bg-indigo-500/10 p-6 text-center transition hover:bg-indigo-500/20"
        >
          <span className="text-2xl font-semibold text-white">New User</span>
        </button>

        <button
          type="button"
          onClick={() => handleLandingChoice('existing')}
          className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 text-center transition hover:border-slate-500 hover:bg-slate-800"
        >
          <span className="text-2xl font-semibold text-white">Existing User</span>
        </button>
      </div>
    </div>
  );

  const renderLeagueStep = () => (
    <div className="space-y-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-indigo-300">League Selection</div>
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
                  ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-700 bg-slate-900/70 hover:border-slate-500 hover:bg-slate-800/80'
              }`}
            >
              <div
                className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 ease-out ${
                  selected ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-[-4px] scale-75 opacity-0'
                }`}
                aria-label={selected ? `${league.name} selected` : `${league.name} not selected`}
              >
                ✓
              </div>

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
          <div className="text-xs uppercase tracking-[0.25em] text-indigo-300">Team Selection</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{progressLabel}</h2>
          <div className="mt-3 flex gap-2">
            {selectedLeagues.map((league, index) => (
              <div
                key={league.id}
                className={`h-2 flex-1 rounded-full ${
                  index < teamLeagueIndex ? 'bg-indigo-500' : index === teamLeagueIndex ? 'bg-indigo-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {currentVisibleTeams.map((team) => {
            const selected = selectedTeams.some((item) => item.id === team.id);
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => toggleTeam(team)}
                className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                  selected
                    ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
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

  const renderCalendarStep = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="mb-3 text-xs uppercase tracking-[0.25em] text-indigo-300">My Teams</div>
        <div className="flex flex-wrap gap-2">
          {selectedTeams.length === 0 ? (
            <div className="text-sm text-slate-400">No teams selected yet.</div>
          ) : (
            selectedTeams.map((team) => (
              <div key={team.id} className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1.5">
                {team.logoUrl ? (
                  <img src={team.logoUrl} alt={team.name} className="h-6 w-6 rounded-full object-contain" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[9px] font-semibold text-white">
                    {team.shortName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-200">{team.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <button
          type="button"
          onClick={() => setCurrentMonth(goToPrevMonth(currentMonth))}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Prev
        </button>
        <div className="text-xl font-semibold text-white">{formatMonthLabel(currentMonth)}</div>
        <button
          type="button"
          onClick={() => setCurrentMonth(goToNextMonth(currentMonth))}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="px-2 py-3 text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
            {day}
          </div>
        ))}

        {monthDays.map((day) => {
          const dayKey = day.toISOString().slice(0, 10);
          const dayEvents = eventsByDay.get(dayKey) ?? [];
          const visibleEvents = dayEvents.slice(0, 2);
          const hiddenCount = Math.max(dayEvents.length - visibleEvents.length, 0);

          return (
            <div
              key={dayKey}
              onClick={() => setSelectedDay(day)}
              className={`min-h-32 rounded-xl border p-2 transition ${
                isCurrentMonth(day, currentMonth) ? 'border-slate-800 bg-slate-900/70' : 'border-slate-900 bg-slate-950/60 text-slate-500'
              } ${isTodayDate(day) ? 'ring-1 ring-indigo-400' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">{day.getDate()}</span>
              </div>

              <div className="space-y-1.5">
                {visibleEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-left text-[10px] text-slate-100"
                    style={{ borderLeft: `3px solid ${event.primaryColor ?? '#5b7cff'}` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: event.primaryColor ?? '#5b7cff' }} />
                    <span className="truncate">{event.teamShortName} vs {event.opponent}</span>
                  </button>
                ))}

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-2 py-1 text-left text-[10px] font-medium text-slate-300"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedDay(day);
                    }}
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{formatMonthLabel(selectedDay)}</h3>
              <button type="button" onClick={() => setSelectedDay(null)} className="text-slate-300 hover:text-white">Close</button>
            </div>
            <div className="space-y-3">
              {(eventsByDay.get(selectedDay.toISOString().slice(0, 10)) ?? []).map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: event.primaryColor ?? '#5b7cff' }} />
                      <span className="font-medium text-white">{event.teamName}</span>
                    </div>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{event.type}</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">vs {event.opponent}</div>
                  <div className="mt-2 text-xs text-slate-400">{event.time} • {event.venue}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const stepIndex = screen === 'league' ? 0 : screen === 'team' ? 1 : 2;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col items-center gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full text-center md:text-left">
            <h1 className="text-[2.5rem] font-black uppercase tracking-[0.14em] text-white md:text-[2.75rem]">Rally</h1>
            <p className="mt-2 text-base font-medium tracking-[0.06em] text-indigo-200 md:text-lg">Every Team, Every Game, One Place.</p>
          </div>
          {screen !== 'landing' && (
            <div className="inline-flex items-center justify-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 p-1 shadow-sm shadow-slate-950/40">
              {STEPS.map((label, index) => (
                <div
                  key={label}
                  className={`rounded-full px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors ${
                    index === stepIndex
                      ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/60'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
        </header>

        <div className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-sm">
          {screen === 'landing' && renderLandingStep()}
          {screen === 'league' && renderLeagueStep()}
          {screen === 'team' && renderTeamStep()}
          {screen === 'calendar' && renderCalendarStep()}

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
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  {selectedLeagues.length === 0 ? 'Go to Calendar' : 'Continue'}
                </button>
              )}

              {screen === 'team' && (
                <button
                  type="button"
                  onClick={handleTeamContinue}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  {teamLeagueIndex < selectedLeagues.length - 1 ? 'Continue to next league' : 'View calendar'}
                </button>
              )}

              {screen === 'calendar' && (
                <button type="button" onClick={() => setScreen('league')} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400">
                  Update preferences
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
