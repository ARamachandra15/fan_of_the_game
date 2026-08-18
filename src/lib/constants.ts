import type { LeagueKey, LeagueOption } from '../types/sports';

export const LEAGUES: LeagueOption[] = [
  {
    id: 'premier-league',
    name: 'Premier League',
    shortName: 'EPL',
    accent: '#3D1952',
    logoPath: '/logos/leagues/premier-league.svg',
    queryName: 'English Premier League',
    description: 'English top flight',
  },
  {
    id: 'la-liga',
    name: 'La Liga',
    shortName: 'La Liga',
    accent: '#E5A532',
    logoPath: '/logos/leagues/la-liga.svg',
    queryName: 'Spanish La Liga',
    description: 'Spanish first division',
  },
  {
    id: 'nba',
    name: 'NBA',
    shortName: 'NBA',
    accent: '#C8102E',
    logoPath: '/logos/leagues/nba.svg',
    queryName: 'NBA',
    description: 'Basketball',
  },
  {
    id: 'nfl',
    name: 'NFL',
    shortName: 'NFL',
    accent: '#013369',
    logoPath: '/logos/leagues/nfl.svg',
    queryName: 'NFL',
    description: 'American football',
  },
  {
    id: 'nhl',
    name: 'NHL',
    shortName: 'NHL',
    accent: '#D71920',
    logoPath: '/logos/leagues/nhl.svg',
    queryName: 'NHL',
    description: 'Ice hockey',
  },
  {
    id: 'f1',
    name: 'Formula 1',
    shortName: 'F1',
    accent: '#E10600',
    logoPath: '/logos/leagues/f1.svg',
    queryName: 'F1',
    description: 'Grand Prix racing',
  },
];

export const STORAGE_KEY = 'rally_selection';

export const F1_CONSTRUCTORS = [
  { id: 'f1:mercedes', name: 'Mercedes', shortName: 'MER', primaryColor: '#00D2BE', secondaryColor: '#0A0A0A', source: 'local-f1' as const },
  { id: 'f1:red-bull', name: 'Red Bull', shortName: 'RBR', primaryColor: '#1E41FF', secondaryColor: '#FCD535', source: 'local-f1' as const },
  { id: 'f1:ferrari', name: 'Ferrari', shortName: 'FER', primaryColor: '#DC0000', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
  { id: 'f1:mclaren', name: 'McLaren', shortName: 'MCL', primaryColor: '#FF8000', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
  { id: 'f1:aston-martin', name: 'Aston Martin', shortName: 'AST', primaryColor: '#006F62', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
  { id: 'f1:alpine', name: 'Alpine', shortName: 'ALP', primaryColor: '#0090FF', secondaryColor: '#FFB800', source: 'local-f1' as const },
  { id: 'f1:rb', name: 'RB', shortName: 'RB', primaryColor: '#6692FF', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
  { id: 'f1:sauber', name: 'Sauber', shortName: 'SAU', primaryColor: '#52E252', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
  { id: 'f1:williams', name: 'Williams', shortName: 'WIL', primaryColor: '#005AFF', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
  { id: 'f1:haas', name: 'Haas', shortName: 'HAS', primaryColor: '#B6BABD', secondaryColor: '#FFFFFF', source: 'local-f1' as const },
];

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
