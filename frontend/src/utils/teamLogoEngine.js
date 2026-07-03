const MLB = {
  "Arizona Diamondbacks": "ari",
  "Atlanta Braves": "atl",
  "Baltimore Orioles": "bal",
  "Boston Red Sox": "bos",
  "Chicago Cubs": "chc",
  "Chicago White Sox": "chw",
  "Cincinnati Reds": "cin",
  "Cleveland Guardians": "cle",
  "Colorado Rockies": "col",
  "Detroit Tigers": "det",
  "Houston Astros": "hou",
  "Kansas City Royals": "kc",
  "Los Angeles Angels": "laa",
  "Los Angeles Dodgers": "lad",
  "Miami Marlins": "mia",
  "Milwaukee Brewers": "mil",
  "Minnesota Twins": "min",
  "New York Mets": "nym",
  "New York Yankees": "nyy",
  "Athletics": "ath",
  "Oakland Athletics": "oak",
  "Philadelphia Phillies": "phi",
  "Pittsburgh Pirates": "pit",
  "San Diego Padres": "sd",
  "San Francisco Giants": "sf",
  "Seattle Mariners": "sea",
  "St. Louis Cardinals": "stl",
  "Tampa Bay Rays": "tb",
  "Texas Rangers": "tex",
  "Toronto Blue Jays": "tor",
  "Washington Nationals": "wsh",
};

const NBA = {
  "Atlanta Hawks": "atl",
  "Boston Celtics": "bos",
  "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha",
  "Chicago Bulls": "chi",
  "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Detroit Pistons": "det",
  "Golden State Warriors": "gs",
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "LA Clippers": "lac",
  "Los Angeles Clippers": "lac",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "no",
  "New York Knicks": "ny",
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sa",
  "Toronto Raptors": "tor",
  "Utah Jazz": "utah",
  "Washington Wizards": "wsh",
};

const NFL = {
  "Arizona Cardinals": "ari",
  "Atlanta Falcons": "atl",
  "Baltimore Ravens": "bal",
  "Buffalo Bills": "buf",
  "Carolina Panthers": "car",
  "Chicago Bears": "chi",
  "Cincinnati Bengals": "cin",
  "Cleveland Browns": "cle",
  "Dallas Cowboys": "dal",
  "Denver Broncos": "den",
  "Detroit Lions": "det",
  "Green Bay Packers": "gb",
  "Houston Texans": "hou",
  "Indianapolis Colts": "ind",
  "Jacksonville Jaguars": "jax",
  "Kansas City Chiefs": "kc",
  "Las Vegas Raiders": "lv",
  "Los Angeles Chargers": "lac",
  "Los Angeles Rams": "lar",
  "Miami Dolphins": "mia",
  "Minnesota Vikings": "min",
  "New England Patriots": "ne",
  "New Orleans Saints": "no",
  "New York Giants": "nyg",
  "New York Jets": "nyj",
  "Philadelphia Eagles": "phi",
  "Pittsburgh Steelers": "pit",
  "San Francisco 49ers": "sf",
  "Seattle Seahawks": "sea",
  "Tampa Bay Buccaneers": "tb",
  "Tennessee Titans": "ten",
  "Washington Commanders": "wsh",
};

const NHL = {
  "Anaheim Ducks": "ana",
  "Boston Bruins": "bos",
  "Buffalo Sabres": "buf",
  "Calgary Flames": "cgy",
  "Carolina Hurricanes": "car",
  "Chicago Blackhawks": "chi",
  "Colorado Avalanche": "col",
  "Columbus Blue Jackets": "cbj",
  "Dallas Stars": "dal",
  "Detroit Red Wings": "det",
  "Edmonton Oilers": "edm",
  "Florida Panthers": "fla",
  "Los Angeles Kings": "la",
  "Minnesota Wild": "min",
  "Montreal Canadiens": "mtl",
  "Nashville Predators": "nsh",
  "New Jersey Devils": "nj",
  "New York Islanders": "nyi",
  "New York Rangers": "nyr",
  "Ottawa Senators": "ott",
  "Philadelphia Flyers": "phi",
  "Pittsburgh Penguins": "pit",
  "San Jose Sharks": "sj",
  "Seattle Kraken": "sea",
  "St. Louis Blues": "stl",
  "Tampa Bay Lightning": "tb",
  "Toronto Maple Leafs": "tor",
  "Utah Mammoth": "utah",
  "Vancouver Canucks": "van",
  "Vegas Golden Knights": "vgk",
  "Washington Capitals": "wsh",
  "Winnipeg Jets": "wpg",
};

const MAPS = { MLB, NBA, NFL, NHL };

export function getTeamLogoUrl(team, sport) {
  const cleanTeam = String(team || "").trim();
  const cleanSport = String(sport || "").toUpperCase();

  const map = MAPS[cleanSport] || {};
  const id = map[cleanTeam];

  if (!id) return null;

  if (cleanSport === "MLB") {
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${id}.png`;
  }

  if (cleanSport === "NBA") {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${id}.png`;
  }

  if (cleanSport === "NFL") {
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${id}.png`;
  }

  if (cleanSport === "NHL") {
    return `https://a.espncdn.com/i/teamlogos/nhl/500/${id}.png`;
  }

  return null;
}
