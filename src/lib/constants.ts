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

export const FULL_TEAM_ROSTERS: Record<LeagueKey, string[]> = {
  nba: ['Atlanta Hawks','Boston Celtics','Brooklyn Nets','Charlotte Hornets','Chicago Bulls','Cleveland Cavaliers','Dallas Mavericks','Denver Nuggets','Detroit Pistons','Golden State Warriors','Houston Rockets','Indiana Pacers','LA Clippers','Los Angeles Lakers','Memphis Grizzlies','Miami Heat','Milwaukee Bucks','Minnesota Timberwolves','New Orleans Pelicans','New York Knicks','Oklahoma City Thunder','Orlando Magic','Philadelphia 76ers','Phoenix Suns','Portland Trail Blazers','Sacramento Kings','San Antonio Spurs','Toronto Raptors','Utah Jazz','Washington Wizards'],
  nfl: ['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders'],
  nhl: ['Anaheim Ducks','Boston Bruins','Buffalo Sabres','Calgary Flames','Carolina Hurricanes','Chicago Blackhawks','Colorado Avalanche','Columbus Blue Jackets','Dallas Stars','Detroit Red Wings','Edmonton Oilers','Florida Panthers','Los Angeles Kings','Minnesota Wild','Montreal Canadiens','Nashville Predators','New Jersey Devils','New York Islanders','New York Rangers','Ottawa Senators','Philadelphia Flyers','Pittsburgh Penguins','San Jose Sharks','Seattle Kraken','St. Louis Blues','Tampa Bay Lightning','Toronto Maple Leafs','Utah Hockey Club','Vancouver Canucks','Vegas Golden Knights','Washington Capitals','Winnipeg Jets'],
  'premier-league': ['Arsenal','Aston Villa','Bournemouth','Brentford','Brighton and Hove Albion','Chelsea','Crystal Palace','Everton','Fulham','Ipswich Town','Leicester City','Liverpool','Manchester City','Manchester United','Newcastle United','Nottingham Forest','Southampton','Tottenham Hotspur','West Ham United','Wolverhampton Wanderers'],
  'la-liga': ['Athletic Club','Atletico Madrid','Barcelona','Betis','Cadiz','Celta Vigo','Deportivo Alaves','Elche','Espanyol','Getafe','Girona','Granada','Las Palmas','Mallorca','Osasuna','Rayo Vallecano','Real Madrid','Real Sociedad','Sevilla','Valencia','Villarreal'],
  f1: ['Mercedes','Red Bull','Ferrari','McLaren','Aston Martin','Alpine','RB','Sauber','Williams','Haas'],
};

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
