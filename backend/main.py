from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from dotenv import load_dotenv
import os
import json
import requests
from datetime import date, timedelta, datetime


from database import Base, SessionLocal, engine
from models import Pick, CacheEntry, LineSnapshot

load_dotenv()

app = FastAPI()
Base.metadata.create_all(bind=engine)


def add_missing_clv_columns():
    db = SessionLocal()

    columns = [
        "closing_line",
        "closing_odds",
        "clv_result",
        "clv_value",
    ]

    for column in columns:
        try:
            db.execute(text(f"ALTER TABLE picks ADD COLUMN {column} VARCHAR DEFAULT ''"))
            db.commit()
        except Exception:
            db.rollback()

    db.close()


add_missing_clv_columns()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ODDS_API_KEY = os.getenv("ODDS_API_KEY")
ODDS_BASE_URL = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"
MLB_ODDS_BASE_URL = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds"

HOME_COURT_ADVANTAGE = 1.5

NBA_INJURY_ADJUSTMENTS = {
    "Los Angeles Lakers": -2.0,
    "Boston Celtics": 0.0,
    "Philadelphia 76ers": 0.0,
    "Denver Nuggets": 0.0,
    "Milwaukee Bucks": 0.0,
}

NBA_TEAM_RATINGS = {
    "Boston Celtics": 92,
    "Denver Nuggets": 90,
    "Milwaukee Bucks": 88,
    "Philadelphia 76ers": 84,
    "Los Angeles Lakers": 82,
    "Phoenix Suns": 84,
    "Golden State Warriors": 83,
    "Miami Heat": 81,
    "New York Knicks": 85,
    "Cleveland Cavaliers": 86,
    "Dallas Mavericks": 85,
    "Minnesota Timberwolves": 87,
    "Oklahoma City Thunder": 89,
    "Sacramento Kings": 83,
    "Indiana Pacers": 82,
    "Orlando Magic": 81,
    "New Orleans Pelicans": 82,
    "Los Angeles Clippers": 86,
    "Memphis Grizzlies": 79,
    "Houston Rockets": 80,
    "Atlanta Hawks": 78,
    "Chicago Bulls": 76,
    "Brooklyn Nets": 74,
    "Toronto Raptors": 72,
    "Charlotte Hornets": 70,
    "Washington Wizards": 68,
    "Detroit Pistons": 69,
    "Utah Jazz": 71,
    "Portland Trail Blazers": 70,
    "San Antonio Spurs": 75,
}
MLB_STARTING_PITCHERS = {
    # Example format:
    # "New York Yankees": {
    #     "pitcher": "TBD",
    #     "era": 0.00,
    #     "whip": 0.00,
    #     "rating": 75,
    # }

    "New York Yankees": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Boston Red Sox": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Toronto Blue Jays": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Baltimore Orioles": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Tampa Bay Rays": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},

    "Cleveland Guardians": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Detroit Tigers": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Kansas City Royals": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Minnesota Twins": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Chicago White Sox": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},

    "Houston Astros": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Los Angeles Angels": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Oakland Athletics": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Seattle Mariners": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Texas Rangers": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},

    "Atlanta Braves": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Miami Marlins": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "New York Mets": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Philadelphia Phillies": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Washington Nationals": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},

    "Chicago Cubs": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Cincinnati Reds": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Milwaukee Brewers": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Pittsburgh Pirates": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "St. Louis Cardinals": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},

    "Arizona Diamondbacks": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Colorado Rockies": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "Los Angeles Dodgers": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "San Diego Padres": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
    "San Francisco Giants": {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75},
}

MLB_BULLPEN_FATIGUE = {
    "New York Yankees": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Boston Red Sox": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Toronto Blue Jays": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Baltimore Orioles": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Tampa Bay Rays": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},

    "Cleveland Guardians": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Detroit Tigers": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Kansas City Royals": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Minnesota Twins": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Chicago White Sox": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},

    "Houston Astros": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Los Angeles Angels": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Oakland Athletics": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Athletics": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Seattle Mariners": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Texas Rangers": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},

    "Atlanta Braves": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Miami Marlins": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "New York Mets": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Philadelphia Phillies": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Washington Nationals": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},

    "Chicago Cubs": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Cincinnati Reds": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Milwaukee Brewers": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Pittsburgh Pirates": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "St. Louis Cardinals": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},

    "Arizona Diamondbacks": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Colorado Rockies": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "Los Angeles Dodgers": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "San Diego Padres": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
    "San Francisco Giants": {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"},
}
MLB_BALLPARK_WEATHER = {
    "Arizona Diamondbacks": {
        "park": "Chase Field",
        "run_factor": 1.02,
        "hr_factor": 1.05,
        "weather_risk": "Dome/Roof"
    },
    "Atlanta Braves": {
        "park": "Truist Park",
        "run_factor": 1.03,
        "hr_factor": 1.04,
        "weather_risk": "Warm weather boost"
    },
    "Baltimore Orioles": {
        "park": "Camden Yards",
        "run_factor": 0.98,
        "hr_factor": 0.95,
        "weather_risk": "Moderate"
    },
    "Boston Red Sox": {
        "park": "Fenway Park",
        "run_factor": 1.05,
        "hr_factor": 0.98,
        "weather_risk": "High doubles/run environment"
    },
    "Chicago Cubs": {
        "park": "Wrigley Field",
        "run_factor": 1.00,
        "hr_factor": 1.00,
        "weather_risk": "Wind sensitive"
    },
    "Chicago White Sox": {
        "park": "Rate Field",
        "run_factor": 1.04,
        "hr_factor": 1.08,
        "weather_risk": "Power friendly"
    },
    "Cincinnati Reds": {
        "park": "Great American Ball Park",
        "run_factor": 1.06,
        "hr_factor": 1.14,
        "weather_risk": "HR friendly"
    },
    "Cleveland Guardians": {
        "park": "Progressive Field",
        "run_factor": 0.99,
        "hr_factor": 0.97,
        "weather_risk": "Cool weather risk"
    },
    "Colorado Rockies": {
        "park": "Coors Field",
        "run_factor": 1.18,
        "hr_factor": 1.12,
        "weather_risk": "Altitude boost"
    },
    "Detroit Tigers": {
        "park": "Comerica Park",
        "run_factor": 0.97,
        "hr_factor": 0.92,
        "weather_risk": "Large park"
    },
    "Houston Astros": {
        "park": "Daikin Park",
        "run_factor": 1.01,
        "hr_factor": 1.03,
        "weather_risk": "Dome/Roof"
    },
    "Kansas City Royals": {
        "park": "Kauffman Stadium",
        "run_factor": 1.01,
        "hr_factor": 0.91,
        "weather_risk": "Large gap park"
    },
    "Los Angeles Angels": {
        "park": "Angel Stadium",
        "run_factor": 0.98,
        "hr_factor": 0.96,
        "weather_risk": "Mild weather"
    },
    "Los Angeles Dodgers": {
        "park": "Dodger Stadium",
        "run_factor": 0.99,
        "hr_factor": 1.02,
        "weather_risk": "Mild weather"
    },
    "Miami Marlins": {
        "park": "loanDepot park",
        "run_factor": 0.96,
        "hr_factor": 0.94,
        "weather_risk": "Dome/Roof"
    },
    "Milwaukee Brewers": {
        "park": "American Family Field",
        "run_factor": 1.02,
        "hr_factor": 1.06,
        "weather_risk": "Dome/Roof"
    },
    "Minnesota Twins": {
        "park": "Target Field",
        "run_factor": 0.99,
        "hr_factor": 1.00,
        "weather_risk": "Cool weather risk"
    },
    "New York Mets": {
        "park": "Citi Field",
        "run_factor": 0.97,
        "hr_factor": 0.95,
        "weather_risk": "Pitcher friendly"
    },
    "New York Yankees": {
        "park": "Yankee Stadium",
        "run_factor": 1.02,
        "hr_factor": 1.12,
        "weather_risk": "Short porch HR boost"
    },
    "Athletics": {
        "park": "Sutter Health Park",
        "run_factor": 1.00,
        "hr_factor": 1.00,
        "weather_risk": "Neutral"
    },
    "Oakland Athletics": {
        "park": "Sutter Health Park",
        "run_factor": 1.00,
        "hr_factor": 1.00,
        "weather_risk": "Neutral"
    },
    "Philadelphia Phillies": {
        "park": "Citizens Bank Park",
        "run_factor": 1.04,
        "hr_factor": 1.09,
        "weather_risk": "Power friendly"
    },
    "Pittsburgh Pirates": {
        "park": "PNC Park",
        "run_factor": 0.98,
        "hr_factor": 0.93,
        "weather_risk": "Pitcher friendly"
    },
    "San Diego Padres": {
        "park": "Petco Park",
        "run_factor": 0.96,
        "hr_factor": 0.94,
        "weather_risk": "Marine layer"
    },
    "San Francisco Giants": {
        "park": "Oracle Park",
        "run_factor": 0.95,
        "hr_factor": 0.86,
        "weather_risk": "Marine layer / pitcher friendly"
    },
    "Seattle Mariners": {
        "park": "T-Mobile Park",
        "run_factor": 0.97,
        "hr_factor": 0.94,
        "weather_risk": "Roof / pitcher friendly"
    },
    "St. Louis Cardinals": {
        "park": "Busch Stadium",
        "run_factor": 0.99,
        "hr_factor": 0.96,
        "weather_risk": "Neutral pitcher lean"
    },
    "Tampa Bay Rays": {
        "park": "Tropicana Field",
        "run_factor": 0.97,
        "hr_factor": 0.96,
        "weather_risk": "Dome"
    },
    "Texas Rangers": {
        "park": "Globe Life Field",
        "run_factor": 1.01,
        "hr_factor": 1.04,
        "weather_risk": "Dome/Roof"
    },
    "Toronto Blue Jays": {
        "park": "Rogers Centre",
        "run_factor": 1.02,
        "hr_factor": 1.07,
        "weather_risk": "Dome/Roof"
    },
    "Washington Nationals": {
        "park": "Nationals Park",
        "run_factor": 1.00,
        "hr_factor": 1.02,
        "weather_risk": "Warm weather boost"
    },
}

def get_nba_playoff_adjustment(game, team_name, spread=None, total=None):
    adjustment = 0
    reasons = []

    home_team = game.get("home_team")
    away_team = game.get("away_team")

    is_home = team_name == home_team

    # Playoff home court matters more
    if is_home:
        adjustment += 0.8
        reasons.append("Playoff home-court boost")

    # Underdogs become more valuable in tighter playoff games
    if spread is not None:
        try:
            spread_value = float(spread)

            if spread_value > 0 and spread_value <= 7.5:
                adjustment += 0.7
                reasons.append("Playable playoff underdog range")

            if spread_value < 0 and abs(spread_value) >= 10:
                adjustment -= 0.6
                reasons.append("Large playoff favorite risk")

        except Exception:
            pass

    # Playoff totals tend to tighten
    if total is not None:
        try:
            total_value = float(total)

            if total_value >= 220:
                adjustment -= 0.4
                reasons.append("High playoff total caution")

            if total_value <= 210:
                adjustment += 0.3
                reasons.append("Lower playoff total environment")

        except Exception:
            pass

    return {
        "playoff_adjustment": round(adjustment, 2),
        "playoff_reasons": reasons,
    }

def american_to_implied_probability(odds):
    try:
        odds = float(odds)
    except Exception:
        return 0.0

    if odds > 0:
        return round((100 / (odds + 100)) * 100, 2)

    return round((abs(odds) / (abs(odds) + 100)) * 100, 2)


def calibrate_model_probability(prob):
    try:
        prob = float(prob)
    except Exception:
        return prob

    if prob >= 65:
        return prob - 2.0
    if prob >= 60:
        return prob - 1.5
    if prob >= 55:
        return prob - 1.0

    return prob


def get_dynamic_units(edge, confidence, recommendation):
    try:
        edge = float(edge)
        confidence = float(confidence)
    except Exception:
        return 0.5

    if recommendation == "Pass":
        return 0.5

    if edge >= 8 and confidence >= 90:
        return 3
    if edge >= 6 and confidence >= 85:
        return 2
    if edge >= 4 and confidence >= 75:
        return 1.5
    if edge >= 2 and confidence >= 60:
        return 1

    return 0.5


def get_injury_adjustment(team):
    return NBA_INJURY_ADJUSTMENTS.get(team, 0.0)


def get_team_rating(team):
    return NBA_TEAM_RATINGS.get(team, 75)


def get_opponent_team(game, team):
    away = game.get("away_team")
    home = game.get("home_team")

    if team == home:
        return away
    if team == away:
        return home

    return None


def get_home_court_adjustment(game, team):
    if team == game.get("home_team"):
        return HOME_COURT_ADVANTAGE
    if team == game.get("away_team"):
        return -HOME_COURT_ADVANTAGE
    return 0.0


def get_price_adjustment(odds):
    try:
        odds = float(odds)
    except Exception:
        return 0.0

    if odds >= 120:
        return 0.6
    if odds >= 100:
        return 0.4
    if odds >= -110:
        return 0.2
    if odds >= -130:
        return 0.0
    if odds >= -160:
        return -0.3

    return -0.6

def get_mlb_pitcher_data(team):
    return MLB_STARTING_PITCHERS.get(
        team,
        {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75}
    )


def get_mlb_pitcher_adjustment(game, team):
    opponent = get_opponent_team(game, team)

    team_pitcher = get_mlb_pitcher_data(team)
    opponent_pitcher = get_mlb_pitcher_data(opponent)

    team_rating = float(team_pitcher.get("rating", 75))
    opponent_rating = float(opponent_pitcher.get("rating", 75))

    rating_gap = team_rating - opponent_rating

    return round(rating_gap * 0.08, 2)

def get_mlb_bullpen_data(team):
    return MLB_BULLPEN_FATIGUE.get(
        team,
        {"fatigue": 0, "bullpen_era": 0.00, "status": "Normal"}
    )


def get_mlb_bullpen_adjustment(game, team):
    opponent = get_opponent_team(game, team)

    team_bullpen = get_mlb_bullpen_data(team)
    opponent_bullpen = get_mlb_bullpen_data(opponent)

    team_fatigue = float(team_bullpen.get("fatigue", 0))
    opponent_fatigue = float(opponent_bullpen.get("fatigue", 0))

    team_era = float(team_bullpen.get("bullpen_era", 0))
    opponent_era = float(opponent_bullpen.get("bullpen_era", 0))

    fatigue_edge = opponent_fatigue - team_fatigue
    era_edge = opponent_era - team_era

    return round((fatigue_edge * 0.25) + (era_edge * 0.15), 2)


def get_mlb_total_bullpen_adjustment(game):
    away_team = game.get("away_team")
    home_team = game.get("home_team")

    away_bullpen = get_mlb_bullpen_data(away_team)
    home_bullpen = get_mlb_bullpen_data(home_team)

    away_fatigue = float(away_bullpen.get("fatigue", 0))
    home_fatigue = float(home_bullpen.get("fatigue", 0))

    away_era = float(away_bullpen.get("bullpen_era", 0))
    home_era = float(home_bullpen.get("bullpen_era", 0))

    fatigue_total = away_fatigue + home_fatigue
    era_total = away_era + home_era

    return round((fatigue_total * 0.15) + ((era_total - 8.00) * 0.10), 2)


def calculate_pitcher_rating(era, whip):
    try:
        era = float(era)
        whip = float(whip)
    except Exception:
        return 75

    rating = 75

    # ERA adjustment
    if era <= 2.50:
        rating += 12
    elif era <= 3.25:
        rating += 8
    elif era <= 4.00:
        rating += 4
    elif era <= 4.75:
        rating -= 2
    elif era <= 5.50:
        rating -= 6
    else:
        rating -= 10

    # WHIP adjustment
    if whip <= 1.00:
        rating += 10
    elif whip <= 1.15:
        rating += 6
    elif whip <= 1.30:
        rating += 2
    elif whip <= 1.45:
        rating -= 3
    else:
        rating -= 7

    return max(50, min(95, rating))


def get_pitcher_season_stats(player_id):
    url = f"https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
    params = {
        "stats": "season",
        "group": "pitching",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {
                "era": 0.00,
                "whip": 0.00,
                "rating": 75
            }

        data = response.json()
        splits = data.get("stats", [{}])[0].get("splits", [])

        if not splits:
            return {
                "era": 0.00,
                "whip": 0.00,
                "rating": 75
            }

        stat = splits[0].get("stat", {})

        try:
            era = float(stat.get("era", 0.00))
        except:
            era = 0.00

        try:
            whip = float(stat.get("whip", 0.00))
        except:
            whip = 0.00

        rating = calculate_pitcher_rating(era, whip)

        return {
            "era": era,
            "whip": whip,
            "rating": rating
        }

    except Exception:
        return {
            "era": 0.00,
            "whip": 0.00,
            "rating": 75
        }
    except Exception:
        return {"era": 0.00, "whip": 0.00, "rating": 75}


def get_mlb_probable_pitchers():
    today = date.today().isoformat()

    url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "date": today,
        "hydrate": "probablePitcher",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {}

        data = response.json()
        pitcher_map = {}

        for day in data.get("dates", []):
            for game in day.get("games", []):
                teams = game.get("teams", {})

                away_team = teams.get("away", {}).get("team", {}).get("name")
                home_team = teams.get("home", {}).get("team", {}).get("name")

                away_pitcher_obj = teams.get("away", {}).get("probablePitcher", {})
                home_pitcher_obj = teams.get("home", {}).get("probablePitcher", {})

                away_pitcher_name = away_pitcher_obj.get("fullName", "TBD")
                home_pitcher_name = home_pitcher_obj.get("fullName", "TBD")

                away_pitcher_id = away_pitcher_obj.get("id")
                home_pitcher_id = home_pitcher_obj.get("id")

                away_stats = (
                    get_pitcher_season_stats(away_pitcher_id)
                    if away_pitcher_id
                    else {"era": 0.00, "whip": 0.00, "rating": 75}
                )

                home_stats = (
                    get_pitcher_season_stats(home_pitcher_id)
                    if home_pitcher_id
                    else {"era": 0.00, "whip": 0.00, "rating": 75}
                )

                if away_team:
                    pitcher_map[away_team] = {
                        "pitcher": away_pitcher_name,
                        "era": away_stats.get("era", 0.00),
                        "whip": away_stats.get("whip", 0.00),
                        "rating": away_stats.get("rating", 75),
                    }

                if home_team:
                    pitcher_map[home_team] = {
                        "pitcher": home_pitcher_name,
                        "era": home_stats.get("era", 0.00),
                        "whip": home_stats.get("whip", 0.00),
                        "rating": home_stats.get("rating", 75),
                    }

        return pitcher_map

    except Exception:
        return {}
    
def get_pitcher_rating_differential(game, team_name, probable_pitchers):
    away_team = game.get("away_team")
    home_team = game.get("home_team")

    if team_name == away_team:
        opponent = home_team
    elif team_name == home_team:
        opponent = away_team
    else:
        opponent = None

    team_pitcher = probable_pitchers.get(
        team_name,
        {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75}
    )

    opponent_pitcher = probable_pitchers.get(
        opponent,
        {"pitcher": "TBD", "era": 0.00, "whip": 0.00, "rating": 75}
    )

    team_rating = float(team_pitcher.get("rating", 75))
    opponent_rating = float(opponent_pitcher.get("rating", 75))

    rating_diff = team_rating - opponent_rating

    # Convert rating gap into probability edge
    pitcher_diff_adj = round(rating_diff * 0.08, 2)

    return {
        "opponent": opponent,
        "team_rating": team_rating,
        "opponent_rating": opponent_rating,
        "rating_diff": rating_diff,
        "pitcher_diff_adj": pitcher_diff_adj,
    }

def get_mlb_market_adjustment(market_key, odds, point=None, side=None):
    price_adj = get_price_adjustment(odds)

    if market_key == "h2h":
        implied = american_to_implied_probability(odds)

        if implied >= 70:
            return -0.8 + price_adj
        elif implied >= 58:
            return 0.4 + price_adj
        elif implied >= 48:
            return 0.9 + price_adj
        elif implied >= 40:
            return 0.7 + price_adj
        else:
            return 0.2 + price_adj

    if market_key == "spreads":
        if point is None:
            return 0

        runline = float(point)
        adj = 0.8 + price_adj

        if runline > 0:
            adj += 0.5

        if abs(runline) > 1.5:
            adj -= 0.4

        return adj

    if market_key == "totals":
        if point is None or side is None:
            return 0

        total = float(point)
        baseline = 8.5
        diff = total - baseline

        if side == "Over":
            total_adj = -diff * 0.35
        else:
            total_adj = diff * 0.35

        return total_adj + (price_adj * 0.5)

    return 0

def get_mlb_weather_adjustment(game, market_key, side=None):
    home_team = game.get("home_team")

    park_data = MLB_BALLPARK_WEATHER.get(
        home_team,
        {
            "park": "Unknown",
            "run_factor": 1.00,
            "hr_factor": 1.00,
            "weather_risk": "Neutral",
        }
    )

    run_factor = float(park_data.get("run_factor", 1.00))
    hr_factor = float(park_data.get("hr_factor", 1.00))

    run_adj = (run_factor - 1.00) * 20
    hr_adj = (hr_factor - 1.00) * 10

    total_weather_adj = round(run_adj + hr_adj, 2)

    if market_key == "totals":
        if side == "Over":
            adjustment = total_weather_adj
        else:
            adjustment = -total_weather_adj
    else:
        adjustment = round(total_weather_adj * 0.25, 2)

    return {
        "park": park_data.get("park"),
        "run_factor": run_factor,
        "hr_factor": hr_factor,
        "weather_risk": park_data.get("weather_risk"),
        "weather_adjustment": round(adjustment, 2),
    }

def get_nrfi_yrfi_projection(game, probable_pitchers):
    away_team = game.get("away_team")
    home_team = game.get("home_team")

    default_pitcher = {
        "pitcher": "TBD",
        "era": 0.00,
        "whip": 0.00,
        "rating": 75,
    }

    away_pitcher = probable_pitchers.get(away_team) or default_pitcher
    home_pitcher = probable_pitchers.get(home_team) or default_pitcher

    away_rating = away_pitcher.get("rating", 75)
    home_rating = home_pitcher.get("rating", 75)

    combined_pitcher_rating = (away_rating + home_rating) / 2

    weather_data = get_mlb_weather_adjustment(
        game,
        "totals",
        "Over"
    ) or {}

    weather_adj = weather_data.get("weather_adjustment", 0)

    nrfi_probability = 52

    if combined_pitcher_rating >= 90:
        nrfi_probability += 6
    elif combined_pitcher_rating >= 85:
        nrfi_probability += 4
    elif combined_pitcher_rating >= 80:
        nrfi_probability += 2
    elif combined_pitcher_rating <= 65:
        nrfi_probability -= 6
    elif combined_pitcher_rating <= 70:
        nrfi_probability -= 4

    if weather_adj >= 3:
        nrfi_probability -= 4
    elif weather_adj >= 2:
        nrfi_probability -= 2

    if weather_adj <= -2:
        nrfi_probability += 2

    nrfi_probability = max(40, min(68, nrfi_probability))
    yrfi_probability = 100 - nrfi_probability

    if nrfi_probability >= 56:
        recommendation = "NRFI"
        confidence = round(nrfi_probability, 2)
    elif yrfi_probability >= 52:
        recommendation = "YRFI"
        confidence = round(yrfi_probability, 2)
    else:
        recommendation = "Pass"
        confidence = round(max(nrfi_probability, yrfi_probability), 2)

    reason = (
        f"Projected starters: {away_pitcher.get('pitcher')} vs {home_pitcher.get('pitcher')}. "
        f"Combined pitcher rating: {round(combined_pitcher_rating, 1)}. "
        f"Ballpark: {weather_data.get('park', 'Unknown')} - {weather_data.get('weather_risk', 'Neutral')}. "
        f"Weather/Park adjustment: {weather_adj}. "
        f"NRFI probability: {round(nrfi_probability, 2)}%. "
        f"YRFI probability: {round(yrfi_probability, 2)}%."
    )

    return {
        "game": f"{away_team} vs {home_team}",
        "recommendation": recommendation,
        "confidence": confidence,
        "nrfi_probability": round(nrfi_probability, 2),
        "yrfi_probability": round(yrfi_probability, 2),
        "away_starter": away_pitcher.get("pitcher"),
        "home_starter": home_pitcher.get("pitcher"),
        "away_pitcher_rating": away_rating,
        "home_pitcher_rating": home_rating,
        "combined_pitcher_rating": round(combined_pitcher_rating, 2),
        "ballpark": weather_data.get("park", "Unknown"),
        "weather_risk": weather_data.get("weather_risk", "Neutral"),
        "weather_adjustment": weather_adj,
        "reason": reason,
        "model_version": "mlb_nrfi_yrfi_v1",
    }

def get_auto_bullpen_status(fatigue_score):
    if fatigue_score >= 5:
        return "Very Tired"
    if fatigue_score >= 3:
        return "Tired"
    if fatigue_score <= -1:
        return "Fresh"
    return "Normal"


def get_auto_bullpen_data():
    today = date.today()
    start_date = (today - timedelta(days=7)).isoformat()
    end_date = today.isoformat()

    url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "startDate": start_date,
        "endDate": end_date,
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {}

        data = response.json()
        bullpen_map = {}

        for day in data.get("dates", []):
            for game in day.get("games", []):
                teams = game.get("teams", {})

                away_team = teams.get("away", {}).get("team", {}).get("name")
                home_team = teams.get("home", {}).get("team", {}).get("name")

                away_score = teams.get("away", {}).get("score", 0) or 0
                home_score = teams.get("home", {}).get("score", 0) or 0

                score_diff = abs(away_score - home_score)

                for team_name, runs_allowed in [
                    (away_team, home_score),
                    (home_team, away_score),
                ]:
                    if not team_name:
                        continue

                    if team_name not in bullpen_map:
                        bullpen_map[team_name] = {
                            "fatigue": 0,
                            "bullpen_era": 0.00,
                            "status": "Normal",
                        }

                    # Recent games add baseline usage
                    bullpen_map[team_name]["fatigue"] += 1

                    # High runs allowed often means bullpen stress
                    if runs_allowed >= 6:
                        bullpen_map[team_name]["fatigue"] += 1

                    # Close games often mean leverage relievers used
                    if score_diff <= 2:
                        bullpen_map[team_name]["fatigue"] += 1

        for team_name, data in bullpen_map.items():
            fatigue = data.get("fatigue", 0)
            data["status"] = get_auto_bullpen_status(fatigue)

        return bullpen_map

    except Exception:
        return {}

def get_cache(key):
    db = SessionLocal()
    try:
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == key).first()
        if not entry or not entry.payload:
            return None
        return json.loads(entry.payload)
    except Exception:
        return None
    finally:
        db.close()


def set_cache(key, payload):
    db = SessionLocal()
    try:
        payload_json = json.dumps(payload)
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == key).first()

        if entry:
            entry.payload = payload_json
        else:
            entry = CacheEntry(cache_key=key, payload=payload_json)
            db.add(entry)

        db.commit()
    finally:
        db.close()


@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/get-nba-odds")
def get_nba_odds():

    cached = get_cache("nba_odds")

    if not ODDS_API_KEY:
        if cached:
            return {
                "plays": cached,
                "cached": True,
                "error": "Missing API key"
            }

        return {
            "plays": [],
            "error": "Missing API key"
        }

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals,alternate_spreads,alternate_totals",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code == 200:
        data = response.json()
        set_cache("nba_odds", data)
        return data

    if cached:
        return {
            "plays": cached,
            "cached": True,
            "error": response.text
        }

    return {
        "plays": [],
        "error": response.text
    }



@app.get("/saved-picks")
@app.get("/picks")
def get_saved_picks():
    db = SessionLocal()
    try:
        return db.query(Pick).order_by(Pick.id.desc()).all()
    finally:
        db.close()


@app.post("/save-pick")
def save_pick(data: dict):
    db = SessionLocal()
    try:
        existing = db.query(Pick).filter(
            Pick.game == str(data.get("game", "")),
            Pick.pick == str(data.get("pick", "")),
            Pick.market == str(data.get("market", "")),
            Pick.sportsbook == str(data.get("sportsbook", "")),
            Pick.odds == str(data.get("odds", "")),
        ).first()

        if existing:
            return {"duplicate": True, "pick": existing.id}

        new_pick = Pick(
            game=str(data.get("game", "")),
            pick=str(data.get("pick", "")),
            market=str(data.get("market", "")),
            sportsbook=str(data.get("sportsbook", "")),
            odds=str(data.get("odds", "")),
            confidence=str(data.get("confidence", "")),
            units=str(data.get("units") or data.get("stake") or ""),
            model_probability=str(data.get("model_probability", "")),
            implied_probability=str(data.get("implied_probability", "")),
            edge=str(data.get("edge", "")),
            result=str(data.get("result", "Pending")),
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {"duplicate": False, "pick": new_pick.id}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/update-result/{pick_id}")
def update_result(pick_id: int, data: dict):
    db = SessionLocal()
    try:
        pick = db.query(Pick).filter(Pick.id == pick_id).first()

        if not pick:
            raise HTTPException(status_code=404, detail="Pick not found")

        result = data.get("result")

        if result not in ["Win", "Loss", "Push"]:
            raise HTTPException(status_code=400, detail="Invalid result")

        pick.result = result
        db.commit()

        return {"message": "Updated"}

    finally:
        db.close()


@app.delete("/delete-pick/{pick_id}")
def delete_pick(pick_id: int):
    db = SessionLocal()
    try:
        pick = db.query(Pick).filter(Pick.id == pick_id).first()

        if not pick:
            raise HTTPException(status_code=404, detail="Pick not found")

        db.delete(pick)
        db.commit()

        return {"message": "Deleted"}

    finally:
        db.close()


@app.get("/results")
def get_results():
    db = SessionLocal()
    try:
        picks = db.query(Pick).all()
        graded = [p for p in picks if p.result not in ["Pending", None, ""]]

        return {
            "results": [
                {
                    "game": p.game,
                    "pick": p.pick,
                    "market": p.market,
                    "sportsbook": p.sportsbook,
                    "odds": p.odds,
                    "result": p.result,
                    "units_won": p.units,
                }
                for p in graded
            ]
        }

    finally:
        db.close()


@app.get("/play-of-the-day")
def get_play_of_the_day():
    db = SessionLocal()
    try:
        picks = db.query(Pick).all()
        pending = [p for p in picks if p.result == "Pending"]

        if not pending:
            return {"message": "No play of the day found"}

        def edge_val(p):
            try:
                return float(str(p.edge).replace("%", ""))
            except Exception:
                return 0.0

        best = sorted(pending, key=edge_val, reverse=True)[0]
        return {"play_of_the_day": best}

    finally:
        db.close()


@app.get("/model/performance")
def model_performance():
    db = SessionLocal()
    try:
        picks = db.query(Pick).all()

        graded = [
            p for p in picks
            if p.result in ["Win", "Loss"] and p.model_probability not in [None, ""]
        ]

        if not graded:
            return {}

        buckets = {
            "50-55": [],
            "55-60": [],
            "60-65": [],
            "65-70": [],
            "70+": [],
        }

        for p in graded:
            try:
                prob = float(p.model_probability)
            except Exception:
                continue

            if prob < 55:
                buckets["50-55"].append(p)
            elif prob < 60:
                buckets["55-60"].append(p)
            elif prob < 65:
                buckets["60-65"].append(p)
            elif prob < 70:
                buckets["65-70"].append(p)
            else:
                buckets["70+"].append(p)

        results = {}

        for bucket, bucket_picks in buckets.items():
            if not bucket_picks:
                continue

            wins = len([p for p in bucket_picks if p.result == "Win"])
            total = len(bucket_picks)

            results[bucket] = {
                "plays": total,
                "win_rate": round((wins / total) * 100, 2),
            }

        return results

    finally:
        db.close()


@app.get("/model/nba/today")
def model_nba_today():
    cached = get_cache("nba_model")

    if not ODDS_API_KEY:
        if cached:
            return {"plays": cached, "cached": True, "error": "Missing API key"}
        return {"plays": [], "error": "Missing API key"}

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    try:
        response = requests.get(ODDS_BASE_URL, params=params, timeout=10)

        if response.status_code != 200:
            if cached:
                return {"plays": cached, "cached": True, "error": response.text}
            return {"plays": [], "error": response.text}

        games = response.json()
        plays = []

        for game in games:
            game_name = f"{game.get('away_team')} vs {game.get('home_team')}"

            for bookmaker in game.get("bookmakers", []):
                sportsbook = bookmaker.get("title", "")

                for market in bookmaker.get("markets", []):
                    market_key = market.get("key")

                    for outcome in market.get("outcomes", []):
                        odds = outcome.get("price")

                        if odds is None:
                            continue

                        implied = american_to_implied_probability(odds)
                        model_prob = implied
                        pick_name = outcome.get("name", "")
                        market_name = market_key
                        reason = ""
                        playoff_adj = 0
                        playoff_data = {"playoff_reasons": []}

                        if market_key in ["h2h", "spreads"]:
                            team_name = outcome.get("name")
                            opponent = get_opponent_team(game, team_name)

                            rating_gap = get_team_rating(team_name) - get_team_rating(opponent)
                            rating_adj = rating_gap * (0.10 if market_key == "h2h" else 0.08)

                            home_adj = get_home_court_adjustment(game, team_name)

                            if market_key == "spreads":
                                home_adj = home_adj * 0.6

                            injury_adj = get_injury_adjustment(team_name)
                            price_adj = get_price_adjustment(odds)

                            if market_key == "h2h":
                                if implied >= 80:
                                    base_adj = -0.5
                                    reason = "Heavy favorite looks more efficiently priced. "
                                elif implied >= 70:
                                    base_adj = 0.2
                                    reason = "Strong favorite with limited extra value. "
                                elif implied >= 60:
                                    base_adj = 1.0
                                    reason = "Moderate favorite with small pricing edge. "
                                elif implied >= 52:
                                    base_adj = 1.8
                                    reason = "Favorite in a competitive range with some value. "
                                elif implied >= 48:
                                    base_adj = 2.5
                                    reason = "Near coin-flip moneyline spot with pricing value. "
                                elif implied >= 40:
                                    base_adj = 2.0
                                    reason = "Live underdog range with upset potential. "
                                else:
                                    base_adj = 0.5
                                    reason = "Large underdog with limited pricing value. "

                                market_name = "Moneyline"
                                pick_name = team_name
                                spread_for_playoff = None

                            else:
                                point = outcome.get("point")

                                if point is None:
                                    continue

                                spread = float(point)
                                abs_spread = abs(spread)

                                if abs_spread <= 3:
                                    base_adj = 2.8
                                    reason = "Short spread creates stronger cover value. "
                                elif abs_spread <= 6:
                                    base_adj = 2.0
                                    reason = "Mid-range spread offers moderate cover value. "
                                elif abs_spread <= 9:
                                    base_adj = 1.3
                                    reason = "Larger spread lowers confidence in margin. "
                                else:
                                    base_adj = 0.7
                                    reason = "Big spread is harder to trust for a cover. "

                                if spread > 0:
                                    base_adj += 0.4
                                    reason += "Underdog points add extra protection. "

                                market_name = "Spread"
                                pick_name = f"{team_name} {spread:+}"
                                spread_for_playoff = spread

                            model_prob = (
                                implied
                                + base_adj
                                + rating_adj
                                + home_adj
                                + injury_adj
                                + price_adj
                            )

                            playoff_data = get_nba_playoff_adjustment(
                                game,
                                team_name,
                                spread_for_playoff,
                                None
                            )

                            playoff_adj = playoff_data.get("playoff_adjustment", 0)
                            model_prob += playoff_adj

                            reason += f"Team rating adjustment ({round(rating_adj, 1)}). "
                            reason += f"Home court ({round(home_adj, 1)}). "
                            reason += f"Price adjustment ({round(price_adj, 1)}). "
                            reason += f"Playoff adjustment ({round(playoff_adj, 1)}). "

                            if injury_adj != 0:
                                reason += f"Injury adjustment ({round(injury_adj, 1)}). "

                        elif market_key == "totals":
                            point = outcome.get("point")
                            side = outcome.get("name")

                            if point is None or side is None:
                                continue

                            total = float(point)
                            diff = total - 228

                            if abs(diff) <= 3:
                                total_adj = diff * 0.20
                                reason = "Total is near baseline, so edge stays smaller. "
                            elif abs(diff) <= 7:
                                total_adj = diff * 0.30
                                reason = "Total is off baseline enough to create moderate value. "
                            else:
                                total_adj = diff * 0.40
                                reason = "Extreme total creates stronger pricing opportunity. "

                            if side == "Over":
                                model_prob = 50 - total_adj
                                reason += "Over gets stronger when posted total is lower. "
                            else:
                                model_prob = 50 + total_adj
                                reason += "Under gets stronger when posted total is higher. "

                            home_team = game.get("home_team")
                            home_team_rating = get_team_rating(home_team)
                            home_total_adj = (home_team_rating - 75) * 0.03

                            if side == "Over":
                                model_prob += home_total_adj
                            else:
                                model_prob -= home_total_adj

                            price_adj = get_price_adjustment(odds) * 0.5
                            model_prob += price_adj

                            playoff_data = get_nba_playoff_adjustment(
                                game,
                                side,
                                None,
                                total
                            )

                            playoff_adj = playoff_data.get("playoff_adjustment", 0)
                            model_prob += playoff_adj

                            model_prob = max(43, min(57, model_prob))

                            market_name = "Total"
                            pick_name = f"{side} {point}"

                            reason += f"Home team total adjustment ({round(home_total_adj, 1)}). "
                            reason += f"Price adjustment ({round(price_adj, 1)}). "
                            reason += f"Playoff adjustment ({round(playoff_adj, 1)}). "

                        else:
                            continue

                        original_prob = model_prob
                        model_prob = calibrate_model_probability(model_prob)

                        if round(original_prob, 2) != round(model_prob, 2):
                            reason += "Calibration applied. "

                        edge = round(model_prob - implied, 2)

                        if market_name == "Run Line" and edge < 4:
                            continue

                        if edge >= 4:
                            recommendation = "Play"
                        elif edge >= 2:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        if edge >= 5:
                            confidence = 90
                        elif edge >= 4:
                            confidence = 84
                        elif edge >= 3:
                            confidence = 78
                        elif edge >= 2:
                            confidence = 72
                        else:
                            confidence = 60

                        unit_size = get_dynamic_units(
                            edge,
                            confidence,
                            recommendation
                        )

                        plays.append({
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "market": market_name,
                            "pick": pick_name,
                            "odds": odds,
                            "implied_probability": round(implied, 2),
                            "model_probability": round(model_prob, 2),
                            "edge": edge,
                            "confidence": confidence,
                            "recommendation": recommendation,
                            "units": unit_size,
                            "playoff_mode": True,
                            "playoff_adjustment": playoff_adj,
                            "playoff_reasons": playoff_data.get("playoff_reasons", []),
                            "reason": reason.strip()
                        })

        best_by_game = {}

        for play in plays:
            game = play.get("game")

            if game not in best_by_game:
                best_by_game[game] = play
            else:
                current_best = best_by_game[game]

                if play.get("edge", 0) > current_best.get("edge", 0):
                    best_by_game[game] = play

        final = list(best_by_game.values())

        final = sorted(
            final,
            key=lambda x: x["edge"],
            reverse=True
        )

        set_cache("nba_model", final)

        return {"plays": final}

    except Exception as e:
        if cached:
            return {"plays": cached, "cached": True, "error": str(e)}
        return {"plays": [], "error": str(e)}
    
def get_sharp_market_signal(edge, odds, recommendation):
    try:
        edge_value = float(edge)
        odds_value = int(odds)
    except Exception:
        return {
            "sharp_signal": "No Signal",
            "sharp_score": 0,
            "price_profile": "Unknown",
            "market_strength": "Unknown",
            "sharp_reason": "Unable to evaluate market signal."
        }

    sharp_score = 0
    reasons = []

    if odds_value <= -200:
        price_profile = "Heavy Favorite"
    elif odds_value < 0:
        price_profile = "Favorite"
    elif odds_value == 100:
        price_profile = "Even Money"
    else:
        price_profile = "Plus Money"

    if edge_value >= 5:
        sharp_score += 4
        reasons.append("Strong model edge above 5%.")
    elif edge_value >= 4:
        sharp_score += 3
        reasons.append("Strong model edge.")
    elif edge_value >= 2:
        sharp_score += 2
        reasons.append("Playable model edge.")
    elif edge_value < 0:
        sharp_score -= 2
        reasons.append("Negative model edge.")

    if odds_value > 100:
        sharp_score += 1
        reasons.append("Plus-money price available.")

    if odds_value <= -200 and edge_value < 4:
        sharp_score -= 1
        reasons.append("Heavy favorite requires stronger edge.")

    if recommendation == "Play":
        sharp_score += 2
        reasons.append("Model marks this as a Play.")
    elif recommendation == "Lean":
        sharp_score += 1
        reasons.append("Model marks this as a Lean.")
    elif recommendation == "Pass":
        sharp_score -= 1
        reasons.append("Model marks this as a Pass.")

    if sharp_score >= 6:
        sharp_signal = "Sharp Play"
        market_strength = "Strong"
    elif sharp_score >= 4:
        sharp_signal = "Value Watch"
        market_strength = "Moderate"
    elif sharp_score <= 0:
        sharp_signal = "Market Caution"
        market_strength = "Weak"
    else:
        sharp_signal = "No Signal"
        market_strength = "Neutral"

    return {
        "sharp_signal": sharp_signal,
        "sharp_score": sharp_score,
        "price_profile": price_profile,
        "market_strength": market_strength,
        "sharp_reason": " ".join(reasons)
    }

def get_line_key(game, market, pick, sportsbook):
    return f"{game}|{market}|{pick}|{sportsbook}"


def american_odds_movement(opening_odds, current_odds):
    try:
        opening = int(opening_odds)
        current = int(current_odds)
        return current - opening
    except Exception:
        return 0


def get_line_movement_signal(opening_odds, current_odds):
    movement = american_odds_movement(opening_odds, current_odds)

    if movement <= -20:
        signal = "Steam Toward Pick"
    elif movement >= 20:
        signal = "Price Drift"
    else:
        signal = "Stable Market"

    return {
        "opening_odds": opening_odds,
        "current_odds": current_odds,
        "line_movement": movement,
        "line_signal": signal,
    }

def get_clv_signal(opening_odds, current_odds):
    movement = american_odds_movement(
        opening_odds,
        current_odds
    )

    if movement <= -20:
        return {
            "clv_status": "Positive CLV",
            "clv_score": abs(movement),
            "clv_reason": (
                "Current market price has moved "
                "toward the pick compared to the "
                "opening snapshot."
            )
        }

    if movement >= 20:
        return {
            "clv_status": "Negative CLV",
            "clv_score": -abs(movement),
            "clv_reason": (
                "Current market price has drifted "
                "away from the pick compared to the "
                "opening snapshot."
            )
        }

    return {
        "clv_status": "Neutral CLV",
        "clv_score": 0,
        "clv_reason": (
            "Market price has remained relatively "
            "stable compared to the opening snapshot."
        )
    }

def get_or_create_line_snapshot(
    line_key,
    game,
    market,
    pick,
    sportsbook,
    current_odds
):
    db = SessionLocal()

    try:
        now = datetime.utcnow().isoformat()

        snapshot = db.query(LineSnapshot).filter(
            LineSnapshot.line_key == line_key
        ).first()

        if snapshot:
            snapshot.current_odds = int(current_odds)
            snapshot.updated_at = now
            db.commit()

            return {
                "opening_odds": snapshot.opening_odds,
                "current_odds": snapshot.current_odds,
            }

        snapshot = LineSnapshot(
            line_key=line_key,
            game=game,
            market=market,
            pick=pick,
            sportsbook=sportsbook,
            opening_odds=int(current_odds),
            current_odds=int(current_odds),
            created_at=now,
            updated_at=now,
        )

        db.add(snapshot)
        db.commit()

        return {
            "opening_odds": snapshot.opening_odds,
            "current_odds": snapshot.current_odds,
        }

    finally:
        db.close()


@app.get("/model/mlb/today")
def model_mlb_today():
    cached = get_cache("mlb_model_v2")

    if cached:
        return {"plays": cached}

    odds_api_key = os.getenv("ODDS_API_KEY")

    if not odds_api_key:
        return {"plays": [], "error": "Missing ODDS_API_KEY"}

    url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds"

    params = {
        "apiKey": odds_api_key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american"
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            if cached:
                return {"plays": cached, "cached": True}
            return {"plays": [], "error": response.text}

        games = response.json()
        probable_pitchers = get_mlb_probable_pitchers()
        auto_bullpen_data = get_auto_bullpen_data()
        plays = []

        for game in games:
            game_name = f"{game.get('away_team')} vs {game.get('home_team')}"

            for bookmaker in game.get("bookmakers", []):
                sportsbook = bookmaker.get("title")

                for market in bookmaker.get("markets", []):
                    market_key = market.get("key")

                    for outcome in market.get("outcomes", []):
                        odds = outcome.get("price")

                        if odds is None:
                            continue

                        implied = american_to_implied_probability(odds)
                        team_name = outcome.get("name")

                        away_team = game.get("away_team")
                        home_team = game.get("home_team")

                        away_starter_data = probable_pitchers.get(
                            away_team,
                            {
                                "pitcher": "TBD",
                                "era": 0.00,
                                "whip": 0.00,
                                "rating": 75
                            }
                        )

                        home_starter_data = probable_pitchers.get(
                            home_team,
                            {
                                "pitcher": "TBD",
                                "era": 0.00,
                                "whip": 0.00,
                                "rating": 75
                            }
)

                        starter_data = probable_pitchers.get(
                             team_name,
                            {
                                "pitcher": "TBD",
                                "era": 0.00,
                                "whip": 0.00,
                                "rating": 75
                            }
                        )

                        pitcher_name = starter_data.get("pitcher")
                        pitcher_era = starter_data.get("era")
                        pitcher_whip = starter_data.get("whip")
                        pitcher_rating = starter_data.get("rating")

                        bullpen_data = auto_bullpen_data.get(
                            team_name,
                            get_mlb_bullpen_data(team_name)
                        )

                        bullpen_fatigue = bullpen_data.get("fatigue")
                        bullpen_era = bullpen_data.get("bullpen_era")
                        bullpen_status = bullpen_data.get("status")

                        pitcher_diff = get_pitcher_rating_differential(
                            game,
                            team_name,
                            probable_pitchers
                        )

                        market_adj = get_mlb_market_adjustment(
                            market_key,
                            odds,
                            outcome.get("point"),
                            outcome.get("name")
                        )

                        weather_data = get_mlb_weather_adjustment(
                            game,
                            market_key,
                            outcome.get("name")
                        )

                        weather_adj = weather_data.get("weather_adjustment", 0)

                        edge_boost = (
                            pitcher_diff.get("pitcher_diff_adj", 0)
                            + market_adj
                            + weather_adj
                        )

                        if bullpen_fatigue >= 3:
                            edge_boost -= 0.5

                        market_name = ""
                        pick_name = ""

                        if market_key == "h2h":
                            market_name = "Moneyline"
                            pick_name = team_name

                        elif market_key in ["spreads", "alternate_spreads"]:
                            continue

                            if point is None:
                                continue

                            if abs(float(point)) > 1.5:
                                continue

                            # Require stronger value for run lines so MLB board does not over-prioritize -1.5 plays
                            if market_key in ["spreads", "alternate_spreads"]:
                                market_adj -= 1.25
                            # Extra discipline on favorite -1.5 run lines
                            
                            if float(point) < 0:
                                market_adj -= 1.25

                            market_name = "Run Line"
                            pick_name = f"{team_name} {point:+}"

                        elif market_key in ["totals", "alternate_totals"]:
                            point = outcome.get("point")

                            if point is None:
                                continue

                            total = float(point)

                            if total < 7 or total > 11:
                                continue

                            market_name = "Total"
                            pick_name = f"{team_name} {total}"

                        else:
                            continue

                        model_prob = implied + edge_boost
                        model_prob = max(1, min(99, model_prob))

                        edge = round(model_prob - implied, 2)

                        if edge >= 4:
                            recommendation = "Play"
                        elif edge >= 2:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        if edge >= 5:
                            confidence = 90
                        elif edge >= 4:
                            confidence = 84
                        elif edge >= 3:
                            confidence = 78
                        elif edge >= 2:
                            confidence = 72
                        else:
                            confidence = 60

                        unit_size = get_dynamic_units(
                            edge,
                            confidence,
                            recommendation
                        )

                        sharp_data = get_sharp_market_signal(
                            edge,
                            odds,
                            recommendation
                        )

                        line_key = get_line_key(
                            game_name,
                            market_name,
                            pick_name,
                            sportsbook
                        )

                        line_key = get_line_key(
                            game_name,
                            market_name,
                            pick_name,
                            sportsbook
                        )

                        snapshot_data = get_or_create_line_snapshot(
                            line_key,
                            game_name,
                            market_name,
                            pick_name,
                            sportsbook,
                            odds
                        )

                        opening_odds = snapshot_data.get("opening_odds")
                        current_odds = snapshot_data.get("current_odds")

                        line_data = get_line_movement_signal(
                            opening_odds,
                            current_odds
                        )

                        clv_data = get_clv_signal(
                            opening_odds,
                            current_odds
                        )

                        reason = (
                            f"Starting pitcher: {pitcher_name}. "
                            f"(ERA {pitcher_era}, WHIP {pitcher_whip}, Rating {pitcher_rating}). "
                            f"Bullpen: {bullpen_status}. "
                            f"Bullpen fatigue: {bullpen_fatigue}. "
                            f"Pitcher rating differential: {pitcher_diff.get('rating_diff')}. "
                            f"Pitcher differential adjustment ({pitcher_diff.get('pitcher_diff_adj')}). "
                            f"Market adjustment ({round(market_adj, 2)})."
                            f"Weather/Park adjustment ({weather_adj}). "
                            f"Ballpark: {weather_data.get('park')} - {weather_data.get('weather_risk')}."
                        )

                        plays.append({
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "market": market_name,
                            "pick": pick_name,
                            "odds": odds,
                            "implied_probability": round(implied, 2),
                            "model_probability": round(model_prob, 2),
                            "edge": edge,
                            "confidence": confidence,
                            "recommendation": recommendation,
                            "units": unit_size,
                            "sharp_signal": sharp_data.get("sharp_signal"),
                            "sharp_score": sharp_data.get("sharp_score"),
                            "sharp_reason": sharp_data.get("sharp_reason"),
                            "price_profile": sharp_data.get("price_profile"),
                            "market_strength": sharp_data.get("market_strength"),
                            "opening_odds": line_data.get("opening_odds"),
                            "current_odds": line_data.get("current_odds"),
                            "line_movement": line_data.get("line_movement"),
                            "line_signal": line_data.get("line_signal"),
                            "clv_status": clv_data.get("clv_status"),
                            "clv_score": clv_data.get("clv_score"),
                            "clv_reason": clv_data.get("clv_reason"),
                            "model_version": "mlb_v3_pitcher_edge",
                            "starting_pitcher": pitcher_name,
                            "pitcher_era": pitcher_era,
                            "pitcher_whip": pitcher_whip,
                            "pitcher_rating": pitcher_rating,
                            "away_starter": away_starter_data.get("pitcher"),
                            "away_pitcher_era": away_starter_data.get("era"),
                            "away_pitcher_whip": away_starter_data.get("whip"),
                            "away_pitcher_rating": away_starter_data.get("rating"),
                            "home_starter": home_starter_data.get("pitcher"),
                            "home_pitcher_era": home_starter_data.get("era"),
                            "home_pitcher_whip": home_starter_data.get("whip"),
                            "home_pitcher_rating": home_starter_data.get("rating"),
                            "opponent": pitcher_diff.get("opponent"),
                            "opponent_pitcher_rating": pitcher_diff.get("opponent_rating"),
                            "pitcher_rating_diff": pitcher_diff.get("rating_diff"),
                            "pitcher_diff_adjustment": pitcher_diff.get("pitcher_diff_adj"),
                            "market_adjustment": round(market_adj, 2),
                            "weather_adjustment": weather_adj,
                            "ballpark": weather_data.get("park"),
                            "run_factor": weather_data.get("run_factor"),
                            "hr_factor": weather_data.get("hr_factor"),
                            "weather_risk": weather_data.get("weather_risk"),
                            "bullpen_fatigue": bullpen_fatigue,
                            "bullpen_era": bullpen_era,
                            "bullpen_status": bullpen_status,
                            "reason": reason
                        })

        best_by_game = {}

        for play in plays:
            game = play.get("game")

            if game not in best_by_game:
                best_by_game[game] = play
            else:
                current_best = best_by_game[game]

                if play.get("edge", 0) > current_best.get("edge", 0):
                    best_by_game[game] = play

        final = list(best_by_game.values())

        final = sorted(
            final,
            key=lambda x: x["edge"],
            reverse=True
        )

        set_cache("mlb_model_v2", final)
        return {"plays": final}
    
    except Exception as e:
        if cached:
            return {
                "plays": cached,
                "cached": True,
                "error": str(e)
            }

        return {
            "plays": [],
            "error": str(e)
        }
    
def get_mlb_events(odds_api_key):
    url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/events"

    params = {
        "apiKey": odds_api_key,
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {
                "success": False,
                "error": response.text,
                "data": [],
            }

        return {
            "success": True,
            "error": None,
            "data": response.json(),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "data": [],
        }

def get_mlb_event_odds(event_id, markets, odds_api_key):
    url = f"https://api.the-odds-api.com/v4/sports/baseball_mlb/events/{event_id}/odds"

    params = {
        "apiKey": odds_api_key,
        "regions": "us",
        "markets": markets,
        "oddsFormat": "american",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {
                "success": False,
                "error": response.text,
                "data": None,
            }

        return {
            "success": True,
            "error": None,
            "data": response.json(),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "data": None,
        }

@app.get("/model/mlb/f5/today")
def model_mlb_f5_today():
    cached = get_cache("mlb_f5_model")

    odds_api_key = os.getenv("ODDS_API_KEY")

    if not odds_api_key:
        if cached:
            return {
                "plays": cached,
                "cached": True,
                "error": "Missing API key"
            }

        return {
            "plays": [],
            "error": "Missing API key"
        }

    f5_markets = "h2h_3_way_1st_5_innings"

    try:
        events_response = get_mlb_events(odds_api_key)

        if not events_response.get("success"):
            if cached:
                return {
                    "plays": cached,
                    "cached": True,
                    "error": events_response.get("error")
                }

            return {
                "plays": [],
                "error": events_response.get("error")
            }

        events = events_response.get("data", [])
        games = []

        for event in events:
            event_id = event.get("id")

            if not event_id:
                continue

            event_odds_response = get_mlb_event_odds(
                event_id,
                f5_markets,
                odds_api_key
            )

            if not event_odds_response.get("success"):
                continue

            event_odds = event_odds_response.get("data")

            if event_odds:
                games.append(event_odds)

        probable_pitchers = get_mlb_probable_pitchers()
        plays = []

        for game in games:
            game_name = (
                f"{game.get('away_team')} vs "
                f"{game.get('home_team')}"
            )

            for bookmaker in game.get("bookmakers", []):
                sportsbook = bookmaker.get("title")

                for market in bookmaker.get("markets", []):
                    market_key = market.get("key")

                    for outcome in market.get("outcomes", []):
                        odds = outcome.get("price")

                        if odds is None:
                            continue

                        implied = american_to_implied_probability(odds)

                        team_name = outcome.get("name")

                        if market_key == "h2h_3_way_1st_5_innings":
                            market_name = "F5 Moneyline"
                            pick_name = team_name

                        elif market_key == "spreads_1st_5_innings":
                            point = outcome.get("point")

                            if point is None:
                                continue

                            market_name = "F5 Run Line"
                            pick_name = f"{team_name} {float(point):+}"

                        elif market_key == "totals_1st_5_innings":
                            point = outcome.get("point")

                            if point is None:
                                continue

                            market_name = "F5 Total"
                            pick_name = f"{team_name} {point}"

                        else:
                            continue

                        starter_data = probable_pitchers.get(
                            team_name,
                            {
                                "pitcher": "TBD",
                                "era": 0.00,
                                "whip": 0.00,
                                "rating": 75,
                            }
                        )

                        pitcher_name = starter_data.get("pitcher")
                        pitcher_era = starter_data.get("era")
                        pitcher_whip = starter_data.get("whip")
                        pitcher_rating = starter_data.get("rating")

                        pitcher_diff = get_pitcher_rating_differential(
                            game,
                            team_name,
                            probable_pitchers,
                        )

                        weather_data = get_mlb_weather_adjustment(
                            game,
                            "totals"
                            if market_key == "totals_1st_5_innings"
                            else "h2h",
                            outcome.get("name"),
                        )

                        weather_adj = weather_data.get(
                            "weather_adjustment",
                            0
                        )

                        pitcher_adj = (
                            pitcher_diff.get(
                                "pitcher_diff_adj",
                                0
                            ) * 1.35
                        )

                        price_adj = get_price_adjustment(odds)

                        edge_boost = (
                            pitcher_adj
                            + price_adj
                            + (weather_adj * 0.5)
                        )

                        model_prob = implied + edge_boost
                        model_prob = max(1, min(99, model_prob))

                        edge = round(model_prob - implied, 2)

                        if edge >= 4:
                            recommendation = "Play"
                        elif edge >= 2:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        if edge >= 5:
                            confidence = 90
                        elif edge >= 4:
                            confidence = 84
                        elif edge >= 3:
                            confidence = 78
                        elif edge >= 2:
                            confidence = 72
                        else:
                            confidence = 60

                        unit_size = get_dynamic_units(
                            edge,
                            confidence,
                            recommendation,
                        )

                        reason = (
                            "F5 market isolates starting pitching "
                            "and removes bullpen variance. "
                            f"Starting pitcher: {pitcher_name}. "
                            f"(ERA {pitcher_era}, "
                            f"WHIP {pitcher_whip}, "
                            f"Rating {pitcher_rating}). "
                            f"Pitcher rating differential: "
                            f"{pitcher_diff.get('rating_diff')}. "
                            f"F5 pitcher adjustment "
                            f"({round(pitcher_adj, 2)}). "
                            f"Price adjustment "
                            f"({round(price_adj, 2)}). "
                            f"Weather/Park adjustment "
                            f"({round(weather_adj * 0.5, 2)})."
                        )

                        plays.append({
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "market": market_name,
                            "pick": pick_name,
                            "odds": odds,
                            "implied_probability": round(implied, 2),
                            "model_probability": round(model_prob, 2),
                            "edge": edge,
                            "confidence": confidence,
                            "recommendation": recommendation,
                            "units": unit_size,
                            "model_version": "mlb_f5_v1",
                            "starting_pitcher": pitcher_name,
                            "pitcher_era": pitcher_era,
                            "pitcher_whip": pitcher_whip,
                            "pitcher_rating": pitcher_rating,
                            "opponent": pitcher_diff.get("opponent"),
                            "opponent_pitcher_rating": pitcher_diff.get(
                                "opponent_rating"
                            ),
                            "pitcher_rating_diff": pitcher_diff.get(
                                "rating_diff"
                            ),
                            "pitcher_diff_adjustment": round(
                                pitcher_adj,
                                2
                            ),
                            "weather_adjustment": round(
                                weather_adj * 0.5,
                                2
                            ),
                            "ballpark": weather_data.get("park"),
                            "weather_risk": weather_data.get(
                                "weather_risk"
                            ),
                            "reason": reason,
                        })

        best_by_game = {}

        for play in plays:
            game = play.get("game")

            if game not in best_by_game:
                best_by_game[game] = play
            else:
                current_best = best_by_game[game]

                current_edge = current_best.get("edge", 0)
                new_edge = play.get("edge", 0)

                current_market = current_best.get("market")
                new_market = play.get("market")

                # Prefer Moneyline if edge difference is small
                if (
                    current_market == "Moneyline"
                    and new_market == "Run Line"
                    and new_edge < current_edge + 2
                ):
                    continue

                if (
                    new_market == "Moneyline"
                    and current_market == "Run Line"
                    and new_edge >= current_edge - 2
                ):
                    best_by_game[game] = play
                    continue

                if new_edge > current_edge:
                    best_by_game[game] = play

        final = list(best_by_game.values())

        final = sorted(
            final,
            key=lambda x: x["edge"],
            reverse=True,
        )

        set_cache("mlb_f5_model", final)

        return {"plays": final}

    except Exception as e:

        if cached:
            return {
                "plays": cached,
                "cached": True,
                "error": str(e)
            }

    return {
            "plays": [],
            "error": str(e)
        }

@app.get("/model/mlb/nrfi/today")
def model_mlb_nrfi_today():
    cached = get_cache("mlb_nrfi_model")

    odds_api_key = os.getenv("ODDS_API_KEY")

    if not odds_api_key:
        if cached:
            return {"plays": cached, "cached": True, "error": "Missing API key"}
        return {"plays": [], "error": "Missing API key"}

    url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds"

    params = {
        "apiKey": odds_api_key,
        "regions": "us",
        "markets": "h2h",
        "oddsFormat": "american",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            if cached:
                return {"plays": cached, "cached": True, "error": response.text}
            return {"plays": [], "error": response.text}

        games = response.json()
        probable_pitchers = get_mlb_probable_pitchers()

        plays = []

        for game in games:
            projection = get_nrfi_yrfi_projection(game, probable_pitchers)
            plays.append(projection)

        final = sorted(
            plays,
            key=lambda x: x["confidence"],
            reverse=True
        )

        set_cache("mlb_nrfi_model", final)

        return {"plays": final}

    except Exception as e:
        if cached:
            return {
                "plays": cached,
                "cached": True,
                "error": str(e)
            }

        return {
            "plays": [],
            "error": str(e)
        }
    
