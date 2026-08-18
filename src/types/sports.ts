export type LeagueKey =
  | 'nba'
  | 'nfl'
  | 'nhl'
  | 'premier-league'
  | 'la-liga'
  | 'f1';

export interface LeagueSelection {
  id: LeagueKey;
  name: string;
  shortName: string;
  accent: string;
  logoPath?: string;
  queryName?: string;
}

export interface LeagueOption extends LeagueSelection {
  description: string;
}

export interface TeamOption {
  id: string;
  league: LeagueKey;
  name: string;
  shortName: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  source: 'thesportsdb' | 'local-f1';
}

export interface UserSelectionState {
  version: number;
  selectedLeagues: LeagueSelection[];
  selectedTeams: TeamOption[];
  updatedAt: string;
}

export interface GameEvent {
  id: string;
  league: LeagueKey;
  teamId: string;
  teamName: string;
  teamShortName: string;
  opponent: string;
  date: string;
  time: string;
  venue?: string;
  phase?: string;
  logoUrl?: string;
  primaryColor?: string;
  type: 'game' | 'race';
  status?: string;
}
