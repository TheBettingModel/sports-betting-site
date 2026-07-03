const ESPN_TEAM_IDS = {
  // MLB
  "Arizona Diamondbacks": ["mlb", "29"], "Atlanta Braves": ["mlb", "15"], "Baltimore Orioles": ["mlb", "1"],
  "Boston Red Sox": ["mlb", "2"], "Chicago Cubs": ["mlb", "16"], "Chicago White Sox": ["mlb", "4"],
  "Cincinnati Reds": ["mlb", "17"], "Cleveland Guardians": ["mlb", "5"], "Colorado Rockies": ["mlb", "27"],
  "Detroit Tigers": ["mlb", "6"], "Houston Astros": ["mlb", "18"], "Kansas City Royals": ["mlb", "7"],
  "Los Angeles Angels": ["mlb", "3"], "Los Angeles Dodgers": ["mlb", "19"], "Miami Marlins": ["mlb", "28"],
  "Milwaukee Brewers": ["mlb", "8"], "Minnesota Twins": ["mlb", "9"], "New York Mets": ["mlb", "21"],
  "New York Yankees": ["mlb", "10"], "Oakland Athletics": ["mlb", "11"], "Philadelphia Phillies": ["mlb", "22"],
  "Pittsburgh Pirates": ["mlb", "23"], "San Diego Padres": ["mlb", "25"], "San Francisco Giants": ["mlb", "26"],
  "Seattle Mariners": ["mlb", "12"], "St. Louis Cardinals": ["mlb", "24"], "Tampa Bay Rays": ["mlb", "30"],
  "Texas Rangers": ["mlb", "13"], "Toronto Blue Jays": ["mlb", "14"], "Washington Nationals": ["mlb", "20"],

  // NBA
  "Atlanta Hawks": ["nba", "1"], "Boston Celtics": ["nba", "2"], "Brooklyn Nets": ["nba", "17"],
  "Charlotte Hornets": ["nba", "30"], "Chicago Bulls": ["nba", "4"], "Cleveland Cavaliers": ["nba", "5"],
  "Dallas Mavericks": ["nba", "6"], "Denver Nuggets": ["nba", "7"], "Detroit Pistons": ["nba", "8"],
  "Golden State Warriors": ["nba", "9"], "Houston Rockets": ["nba", "10"], "Indiana Pacers": ["nba", "11"],
  "LA Clippers": ["nba", "12"], "Los Angeles Clippers": ["nba", "12"], "Los Angeles Lakers": ["nba", "13"],
  "Memphis Grizzlies": ["nba", "29"], "Miami Heat": ["nba", "14"], "Milwaukee Bucks": ["nba", "15"],
  "Minnesota Timberwolves": ["nba", "16"], "New Orleans Pelicans": ["nba", "3"], "New York Knicks": ["nba", "18"],
  "Oklahoma City Thunder": ["nba", "25"], "Orlando Magic": ["nba", "19"], "Philadelphia 76ers": ["nba", "20"],
  "Phoenix Suns": ["nba", "21"], "Portland Trail Blazers": ["nba", "22"], "Sacramento Kings": ["nba", "23"],
  "San Antonio Spurs": ["nba", "24"], "Toronto Raptors": ["nba", "28"], "Utah Jazz": ["nba", "26"],
  "Washington Wizards": ["nba", "27"],

  // WNBA
  "Atlanta Dream": ["wnba", "20"], "Chicago Sky": ["wnba", "19"], "Connecticut Sun": ["wnba", "18"],
  "Dallas Wings": ["wnba", "3"], "Golden State Valkyries": ["wnba", "200"], "Indiana Fever": ["wnba", "5"],
  "Las Vegas Aces": ["wnba", "17"], "Los Angeles Sparks": ["wnba", "6"], "Minnesota Lynx": ["wnba", "8"],
  "New York Liberty": ["wnba", "9"], "Phoenix Mercury": ["wnba", "11"], "Seattle Storm": ["wnba", "14"],
  "Washington Mystics": ["wnba", "16"],

  // NFL
  "Arizona Cardinals": ["nfl", "22"], "Atlanta Falcons": ["nfl", "1"], "Baltimore Ravens": ["nfl", "33"],
  "Buffalo Bills": ["nfl", "2"], "Carolina Panthers": ["nfl", "29"], "Chicago Bears": ["nfl", "3"],
  "Cincinnati Bengals": ["nfl", "4"], "Cleveland Browns": ["nfl", "5"], "Dallas Cowboys": ["nfl", "6"],
  "Denver Broncos": ["nfl", "7"], "Detroit Lions": ["nfl", "8"], "Green Bay Packers": ["nfl", "9"],
  "Houston Texans": ["nfl", "34"], "Indianapolis Colts": ["nfl", "11"], "Jacksonville Jaguars": ["nfl", "30"],
  "Kansas City Chiefs": ["nfl", "12"], "Las Vegas Raiders": ["nfl", "13"], "Los Angeles Chargers": ["nfl", "24"],
  "Los Angeles Rams": ["nfl", "14"], "Miami Dolphins": ["nfl", "15"], "Minnesota Vikings": ["nfl", "16"],
  "New England Patriots": ["nfl", "17"], "New Orleans Saints": ["nfl", "18"], "New York Giants": ["nfl", "19"],
  "New York Jets": ["nfl", "20"], "Philadelphia Eagles": ["nfl", "21"], "Pittsburgh Steelers": ["nfl", "23"],
  "San Francisco 49ers": ["nfl", "25"], "Seattle Seahawks": ["nfl", "26"], "Tampa Bay Buccaneers": ["nfl", "27"],
  "Tennessee Titans": ["nfl", "10"], "Washington Commanders": ["nfl", "28"],
};

const COUNTRY_FLAGS = {
  Argentina: "ar", "Cape Verde": "cv", Spain: "es", England: "gb-eng", Portugal: "pt", France: "fr",
  Brazil: "br", Germany: "de", Mexico: "mx", Canada: "ca", Morocco: "ma", Belgium: "be",
  Netherlands: "nl", Switzerland: "ch", Colombia: "co", Ghana: "gh", Australia: "au", Egypt: "eg",
  Austria: "at", Croatia: "hr", Norway: "no", Paraguay: "py", Senegal: "sn", "United States": "us",
  USA: "us", Japan: "jp", Algeria: "dz", "DR Congo": "cd",
};

export function splitGameTeams(game = "") {
  if (!game) return ["", ""];
  if (game.includes(" vs ")) return game.split(" vs ").map((x) => x.trim());
  if (game.includes(" at ")) return game.split(" at ").map((x) => x.trim());
  return [game.trim(), ""];
}

export function getTeamLogo(teamName = "", sport = "") {
  const clean = String(teamName || "").trim();
  const espn = ESPN_TEAM_IDS[clean];

  if (espn) {
    const [league, id] = espn;
    return `https://a.espncdn.com/i/teamlogos/${league}/500/${id}.png`;
  }

  const flag = COUNTRY_FLAGS[clean];
  if (flag) return `https://flagcdn.com/w160/${flag}.png`;

  return "";
}

export function getSportIcon(sport = "") {
  return {
    MLB: "⚾",
    NBA: "🏀",
    NFL: "🏈",
    NHL: "🏒",
    WNBA: "🏀",
    NCAAF: "🏈",
    NCAAMB: "🏀",
    Soccer: "⚽",
    UFC: "🥊",
  }[sport] || "📊";
}
