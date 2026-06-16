from typing_extensions import final

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from dotenv import load_dotenv
import os
import json
import requests
from datetime import date, timedelta, datetime, timezone


from database import Base, SessionLocal, engine
from models import Pick, CacheEntry, LineSnapshot, ModelPlayHistory

load_dotenv()

app = FastAPI()
Base.metadata.create_all(bind=engine)

def ensure_model_history_columns():
    # SQLite-only migration helper.
    # Postgres/Neon uses Base.metadata.create_all and already has the current schema.
    try:
        database_url = str(engine.url)

        if not database_url.startswith("sqlite"):
            return

        columns = {
            "clv_score": "VARCHAR",
            "live_clv_grade": "VARCHAR",
            "model_validated_by_market": "VARCHAR",
            "pitcher_rating_diff": "VARCHAR",
            "pitcher_diff_adjustment": "VARCHAR",
            "statcast_pitching_rating": "VARCHAR",
            "statcast_pitching_adjustment": "VARCHAR",
            "statcast_power_rating": "VARCHAR",
            "statcast_power_adjustment": "VARCHAR",
            "hitting_rating": "VARCHAR",
            "hitting_adjustment": "VARCHAR",
            "bullpen_availability_score": "VARCHAR",
            "bullpen_availability_adjustment": "VARCHAR",
            "high_leverage_risk": "VARCHAR",
            "lineup_strength": "VARCHAR",
            "lineup_adjustment": "VARCHAR",
            "weather_adjustment": "VARCHAR",
            "umpire_adjustment": "VARCHAR",
            "consensus_price": "VARCHAR",
            "market_spread": "VARCHAR",
            "market_disagreement": "VARCHAR",
            "stale_line_opportunity": "VARCHAR",
        }

        with engine.connect() as conn:
            existing = conn.exec_driver_sql(
                "PRAGMA table_info(model_play_history)"
            ).fetchall()

            existing_columns = [column[1] for column in existing]

            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    conn.exec_driver_sql(
                        f"ALTER TABLE model_play_history "
                        f"ADD COLUMN {column_name} {column_type}"
                    )

            conn.commit()

    except Exception as e:
        print("Model history migration error:", e)


    # SQLite-only migration helper.
    # Postgres/Neon uses Base.metadata.create_all and already has the current schema.
    try:
        database_url = str(engine.url)

        if not database_url.startswith("sqlite"):
            return

        columns = {
            "clv_score": "VARCHAR",
            "live_clv_grade": "VARCHAR",
            "model_validated_by_market": "VARCHAR",
            "pitcher_rating_diff": "VARCHAR",
            "pitcher_diff_adjustment": "VARCHAR",
            "statcast_pitching_rating": "VARCHAR",
            "statcast_pitching_adjustment": "VARCHAR",
            "statcast_power_rating": "VARCHAR",
            "statcast_power_adjustment": "VARCHAR",
            "hitting_rating": "VARCHAR",
            "hitting_adjustment": "VARCHAR",
            "bullpen_availability_score": "VARCHAR",
            "bullpen_availability_adjustment": "VARCHAR",
            "high_leverage_risk": "VARCHAR",
            "lineup_strength": "VARCHAR",
            "lineup_adjustment": "VARCHAR",
            "weather_adjustment": "VARCHAR",
            "umpire_adjustment": "VARCHAR",
            "consensus_price": "VARCHAR",
            "market_spread": "VARCHAR",
            "market_disagreement": "VARCHAR",
            "stale_line_opportunity": "VARCHAR",
        }

        with engine.connect() as conn:
            existing = conn.exec_driver_sql(
                "PRAGMA table_info(model_play_history)"
            ).fetchall()

            existing_columns = [column[1] for column in existing]

            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    conn.exec_driver_sql(
                        f"ALTER TABLE model_play_history "
                        f"ADD COLUMN {column_name} {column_type}"
                    )

            conn.commit()

    except Exception as e:
        print("Model history migration error:", e)


    columns = {
        "clv_score": "VARCHAR",
        "live_clv_grade": "VARCHAR",
        "model_validated_by_market": "VARCHAR",
        "pitcher_rating_diff": "VARCHAR",
        "pitcher_diff_adjustment": "VARCHAR",
        "statcast_pitching_rating": "VARCHAR",
        "statcast_pitching_adjustment": "VARCHAR",
        "statcast_power_rating": "VARCHAR",
        "statcast_power_adjustment": "VARCHAR",
        "hitting_rating": "VARCHAR",
        "hitting_adjustment": "VARCHAR",
        "bullpen_availability_score": "VARCHAR",
        "bullpen_availability_adjustment": "VARCHAR",
        "high_leverage_risk": "VARCHAR",
        "lineup_strength": "VARCHAR",
        "lineup_adjustment": "VARCHAR",
        "weather_adjustment": "VARCHAR",
        "umpire_adjustment": "VARCHAR",
        "consensus_price": "VARCHAR",
        "market_spread": "VARCHAR",
        "market_disagreement": "VARCHAR",
        "stale_line_opportunity": "VARCHAR",
    }

    try:
        with engine.connect() as conn:
            existing = conn.exec_driver_sql(
                "PRAGMA table_info(model_play_history)"
            ).fetchall()

            existing_columns = [column[1] for column in existing]

            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    conn.exec_driver_sql(
                        f"ALTER TABLE model_play_history "
                        f"ADD COLUMN {column_name} {column_type}"
                    )

            conn.commit()

    except Exception as e:
        print("Model history migration error:", e)


ensure_model_history_columns()

def add_missing_clv_columns():
    db = SessionLocal()

    columns = [
        "closing_line",
        "closing_odds",
        "clv_result",
        "clv_value",
        "sport",
        "sharp_signal",
        "steam_strength",
        "line_disagreement",
        "top_play_score",
        "line_shop_value",
        "recommendation",
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


NBA_INJURY_REPORT = {
    # Placeholder v1.
    # Next season this can be replaced with live injury feed data.
    "Boston Celtics": {
        "status": "Healthy",
        "missing_players": [],
        "questionable_players": [],
        "minutes_restrictions": [],
        "star_player_risk": "Low",
    },
    "New York Knicks": {
        "status": "Healthy",
        "missing_players": [],
        "questionable_players": [],
        "minutes_restrictions": [],
        "star_player_risk": "Low",
    },
    "San Antonio Spurs": {
        "status": "Healthy",
        "missing_players": [],
        "questionable_players": [],
        "minutes_restrictions": [],
        "star_player_risk": "Low",
    },
}


NBA_PLAYER_IMPACT = {
    # Superstar tier
    "Jayson Tatum": 5.0,
    "Jaylen Brown": 3.5,
    "Nikola Jokic": 6.0,
    "Giannis Antetokounmpo": 5.5,
    "Luka Doncic": 5.5,
    "Shai Gilgeous-Alexander": 5.0,
    "Victor Wembanyama": 5.0,
    "Jalen Brunson": 4.5,

    # Star / starter tier
    "Kristaps Porzingis": 3.0,
    "Derrick White": 2.0,
    "Jrue Holiday": 2.0,
    "Karl-Anthony Towns": 3.0,
    "Mikal Bridges": 2.0,
    "OG Anunoby": 2.0,
}


def get_injury_adjustment(team):
    return NBA_INJURY_ADJUSTMENTS.get(team, 0.0)


def get_nba_injury_reaction(team):
    report = NBA_INJURY_REPORT.get(
        team,
        {
            "status": "Unknown",
            "missing_players": [],
            "questionable_players": [],
            "minutes_restrictions": [],
            "star_player_risk": "Unknown",
        }
    )

    missing_players = report.get("missing_players", [])
    questionable_players = report.get("questionable_players", [])
    minutes_restrictions = report.get("minutes_restrictions", [])

    adjustment = 0
    notes = []

    for player in missing_players:
        impact = NBA_PLAYER_IMPACT.get(player, 1.0)
        adjustment -= impact
        notes.append(f"{player} OUT (-{impact}).")

    for player in questionable_players:
        impact = NBA_PLAYER_IMPACT.get(player, 1.0) * 0.45
        adjustment -= impact
        notes.append(f"{player} QUESTIONABLE (-{round(impact, 2)}).")

    for player in minutes_restrictions:
        impact = NBA_PLAYER_IMPACT.get(player, 1.0) * 0.30
        adjustment -= impact
        notes.append(f"{player} minutes restriction (-{round(impact, 2)}).")

    if adjustment <= -5:
        grade = "High Injury Risk"
    elif adjustment <= -2.5:
        grade = "Moderate Injury Risk"
    elif adjustment < 0:
        grade = "Minor Injury Risk"
    else:
        grade = "Clean"

    return {
        "injury_status": report.get("status", "Unknown"),
        "injury_adjustment": round(adjustment, 2),
        "injury_score": round(100 + adjustment * 10, 2),
        "missing_players": missing_players,
        "questionable_players": questionable_players,
        "minutes_restrictions": minutes_restrictions,
        "star_player_risk": report.get("star_player_risk", "Unknown"),
        "availability_grade": grade,
        "injury_notes": notes,
    }

NBA_PROJECTED_ROTATIONS = {
    # Placeholder v1.
    # Next season this can be replaced with live starters / rotation feeds.
    "Boston Celtics": {
        "projected_starters": [
            "Jrue Holiday",
            "Derrick White",
            "Jaylen Brown",
            "Jayson Tatum",
            "Kristaps Porzingis",
        ],
        "confirmed_starters": [],
        "bench_depth_score": 86,
        "rotation_status": "Projected",
    },
    "New York Knicks": {
        "projected_starters": [
            "Jalen Brunson",
            "Mikal Bridges",
            "OG Anunoby",
            "Karl-Anthony Towns",
            "Mitchell Robinson",
        ],
        "confirmed_starters": [],
        "bench_depth_score": 78,
        "rotation_status": "Projected",
    },
    "San Antonio Spurs": {
        "projected_starters": [
            "De'Aaron Fox",
            "Devin Vassell",
            "Harrison Barnes",
            "Jeremy Sochan",
            "Victor Wembanyama",
        ],
        "confirmed_starters": [],
        "bench_depth_score": 74,
        "rotation_status": "Projected",
    },
}


def get_nba_rotation_protection(team):
    rotation = NBA_PROJECTED_ROTATIONS.get(
        team,
        {
            "projected_starters": [],
            "confirmed_starters": [],
            "bench_depth_score": 75,
            "rotation_status": "Unknown",
        }
    )

    projected = rotation.get("projected_starters", [])
    confirmed = rotation.get("confirmed_starters", [])
    bench_depth_score = rotation.get("bench_depth_score", 75)
    rotation_status = rotation.get("rotation_status", "Unknown")

    starter_changes = []

    if confirmed:
        for player in projected:
            if player not in confirmed:
                starter_changes.append(player)

    adjustment = 0
    notes = []

    if confirmed and starter_changes:
        for player in starter_changes:
            impact = NBA_PLAYER_IMPACT.get(player, 1.0)
            adjustment -= impact * 0.35
            notes.append(
                f"{player} missing from confirmed starters "
                f"(-{round(impact * 0.35, 2)})."
            )

    if not confirmed:
        notes.append("Starters projected, not confirmed.")

    if bench_depth_score >= 85:
        depth_grade = "Strong Bench"
        adjustment += 0.4
    elif bench_depth_score >= 75:
        depth_grade = "Average Bench"
    elif bench_depth_score >= 65:
        depth_grade = "Thin Bench"
        adjustment -= 0.5
    else:
        depth_grade = "Weak Bench"
        adjustment -= 1.0

    if starter_changes:
        rotation_risk = "High"
    elif rotation_status == "Confirmed":
        rotation_risk = "Low"
    elif rotation_status == "Projected":
        rotation_risk = "Medium"
    else:
        rotation_risk = "Unknown"

    return {
        "starter_status": rotation_status,
        "projected_starters": projected,
        "confirmed_starters": confirmed,
        "starter_changes": starter_changes,
        "rotation_risk": rotation_risk,
        "rotation_adjustment": round(adjustment, 2),
        "depth_score": bench_depth_score,
        "bench_depth_grade": depth_grade,
        "rotation_notes": notes,
    }

NBA_REST_PROFILE = {
    # Placeholder v1.
    # Next season this can be replaced with live schedule/rest data.
    "Boston Celtics": {
        "back_to_back": False,
        "three_in_four": False,
        "travel_spot": "Normal",
        "rest_days": 2,
        "opponent_rest_days": 2,
    },
    "New York Knicks": {
        "back_to_back": False,
        "three_in_four": False,
        "travel_spot": "Normal",
        "rest_days": 2,
        "opponent_rest_days": 2,
    },
    "San Antonio Spurs": {
        "back_to_back": False,
        "three_in_four": False,
        "travel_spot": "Normal",
        "rest_days": 2,
        "opponent_rest_days": 2,
    },
}


def get_nba_rest_fatigue(team):
    profile = NBA_REST_PROFILE.get(
        team,
        {
            "back_to_back": False,
            "three_in_four": False,
            "travel_spot": "Unknown",
            "rest_days": 1,
            "opponent_rest_days": 1,
        }
    )

    adjustment = 0
    notes = []

    back_to_back = profile.get("back_to_back", False)
    three_in_four = profile.get("three_in_four", False)
    travel_spot = profile.get("travel_spot", "Unknown")
    rest_days = int(profile.get("rest_days", 1) or 1)
    opponent_rest_days = int(profile.get("opponent_rest_days", 1) or 1)

    if back_to_back:
        adjustment -= 1.0
        notes.append("Team is on a back-to-back (-1.0).")

    if three_in_four:
        adjustment -= 0.8
        notes.append("Team is playing 3 games in 4 nights (-0.8).")

    if travel_spot == "Long Travel":
        adjustment -= 0.7
        notes.append("Long travel spot creates fatigue risk (-0.7).")
    elif travel_spot == "Home Stand":
        adjustment += 0.3
        notes.append("Home stand creates stability boost (+0.3).")

    rest_advantage = rest_days - opponent_rest_days

    if rest_advantage >= 2:
        adjustment += 0.8
        notes.append("Strong rest advantage (+0.8).")
    elif rest_advantage == 1:
        adjustment += 0.4
        notes.append("Small rest advantage (+0.4).")
    elif rest_advantage <= -2:
        adjustment -= 0.8
        notes.append("Major rest disadvantage (-0.8).")
    elif rest_advantage == -1:
        adjustment -= 0.4
        notes.append("Small rest disadvantage (-0.4).")

    if adjustment >= 0.8:
        rest_grade = "Rest Advantage"
    elif adjustment <= -1.2:
        rest_grade = "High Fatigue Risk"
    elif adjustment < 0:
        rest_grade = "Minor Fatigue Risk"
    else:
        rest_grade = "Neutral Rest"

    return {
        "back_to_back": back_to_back,
        "three_in_four": three_in_four,
        "travel_spot": travel_spot,
        "rest_days": rest_days,
        "opponent_rest_days": opponent_rest_days,
        "rest_advantage": rest_advantage,
        "fatigue_adjustment": round(adjustment, 2),
        "rest_grade": rest_grade,
        "rest_notes": notes,
    }

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

def get_bullpen_availability_score(team, bullpen_data):
    fatigue = float(bullpen_data.get("fatigue", 0) or 0)
    bullpen_era = float(bullpen_data.get("bullpen_era", 0) or 0)
    status = bullpen_data.get("status", "Normal")

    availability_score = 75
    unavailable_arms = 0
    high_leverage_risk = "Low"

    innings_last_3_estimate = round(fatigue * 0.75, 1)

    closer_back_to_back_risk = False
    setup_back_to_back_risk = False
    multi_inning_relief_risk = False
    three_in_four_risk = False

    closer_available = True
    setup_available = True
    top_relievers_available = 3

    if fatigue >= 14:
        availability_score -= 24
        unavailable_arms = 4
        high_leverage_risk = "Extreme"
        closer_back_to_back_risk = True
        setup_back_to_back_risk = True
        multi_inning_relief_risk = True
        three_in_four_risk = True
        closer_available = False
        setup_available = False
        top_relievers_available = 0

    elif fatigue >= 12:
        availability_score -= 20
        unavailable_arms = 3
        high_leverage_risk = "High"
        closer_back_to_back_risk = True
        setup_back_to_back_risk = True
        multi_inning_relief_risk = True
        closer_available = False
        setup_available = False
        top_relievers_available = 1

    elif fatigue >= 8:
        availability_score -= 13
        unavailable_arms = 2
        high_leverage_risk = "Moderate"
        closer_back_to_back_risk = True
        setup_back_to_back_risk = True
        setup_available = False
        top_relievers_available = 2

    elif fatigue >= 4:
        availability_score -= 6
        unavailable_arms = 1
        high_leverage_risk = "Slight"
        setup_back_to_back_risk = True
        top_relievers_available = 2

    if innings_last_3_estimate >= 10:
        availability_score -= 8
        multi_inning_relief_risk = True
        three_in_four_risk = True
    elif innings_last_3_estimate >= 8:
        availability_score -= 5
        multi_inning_relief_risk = True
    elif innings_last_3_estimate >= 6:
        availability_score -= 3

    if bullpen_era >= 5.25:
        availability_score -= 10
    elif bullpen_era >= 4.75:
        availability_score -= 7
    elif bullpen_era >= 4.25:
        availability_score -= 4
    elif bullpen_era <= 3.25 and bullpen_era > 0:
        availability_score += 5

    if status == "Very Tired":
        availability_score -= 8
        three_in_four_risk = True
    elif status == "Tired":
        availability_score -= 4

    if not closer_available:
        availability_score -= 3

    if not setup_available:
        availability_score -= 2

    availability_score = max(35, min(95, availability_score))
    availability_adjustment = round((availability_score - 75) * 0.045, 2)

    return {
        "bullpen_availability_score": availability_score,
        "bullpen_availability_adjustment": availability_adjustment,
        "unavailable_arms_estimate": unavailable_arms,
        "high_leverage_risk": high_leverage_risk,
        "innings_last_3_estimate": innings_last_3_estimate,
        "closer_back_to_back_risk": closer_back_to_back_risk,
        "setup_back_to_back_risk": setup_back_to_back_risk,
        "multi_inning_relief_risk": multi_inning_relief_risk,
        "three_in_four_risk": three_in_four_risk,
        "closer_available": closer_available,
        "setup_available": setup_available,
        "top_relievers_available": top_relievers_available,
    }

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

def get_live_mlb_umpires():
    # Live Umpire Feed v1.
    # Uses MLB Stats API boxscore official data when available.
    # If umpires are not posted yet, safely returns {}.

    today = date.today().isoformat()

    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"

    try:
        schedule_response = requests.get(
            schedule_url,
            params={
                "sportId": 1,
                "date": today,
            },
            timeout=8
        )

        if schedule_response.status_code != 200:
            return {}

        schedule_data = schedule_response.json()
        umpire_map = {}

        for day in schedule_data.get("dates", []):
            for schedule_game in day.get("games", []):
                game_pk = schedule_game.get("gamePk")
                teams = schedule_game.get("teams", {})

                away_team = teams.get("away", {}).get("team", {}).get("name")
                home_team = teams.get("home", {}).get("team", {}).get("name")

                if not game_pk or not away_team or not home_team:
                    continue

                boxscore_url = (
                    f"https://statsapi.mlb.com/api/v1/game/"
                    f"{game_pk}/boxscore"
                )

                try:
                    boxscore_response = requests.get(
                        boxscore_url,
                        timeout=5
                    )

                    if boxscore_response.status_code != 200:
                        continue

                    boxscore = boxscore_response.json()
                    officials = boxscore.get("officials", [])

                    home_plate_umpire = None

                    for official in officials:
                        official_type = str(
                            official.get("officialType", "")
                        ).lower()

                        if "home" in official_type:
                            umpire_obj = official.get("official", {})
                            home_plate_umpire = umpire_obj.get("fullName")
                            break

                    if not home_plate_umpire:
                        continue

                    game_key = f"{away_team} vs {home_team}"

                    umpire_map[game_key] = home_plate_umpire

                except Exception:
                    continue

        return umpire_map

    except Exception as e:
        print("Live umpire feed error:", e)
        return {}

def get_umpire_engine_adjustment(game, market_key=None):
    # Umpire Engine v1.
    # Placeholder engine until live assigned umpire data is added.
    # Defaults to neutral when umpire is unknown.

    umpire_name = game.get("umpire") or game.get("home_plate_umpire") or "Unknown"

    umpire_profiles = {
        "Unknown": {
            "runs_rating": 75,
            "over_under_lean": "Neutral",
            "zone_rating": 75,
            "walk_boost": 0,
            "strikeout_boost": 0,
        }
    }

    profile = umpire_profiles.get(
        umpire_name,
        umpire_profiles["Unknown"]
    )

    runs_rating = profile.get("runs_rating", 75)
    zone_rating = profile.get("zone_rating", 75)

    umpire_adjustment = 0

    if runs_rating >= 85:
        umpire_adjustment += 1.2
    elif runs_rating >= 80:
        umpire_adjustment += 0.7
    elif runs_rating <= 65:
        umpire_adjustment -= 1.2
    elif runs_rating <= 70:
        umpire_adjustment -= 0.7

    if zone_rating >= 85:
        umpire_adjustment -= 0.6
    elif zone_rating <= 65:
        umpire_adjustment += 0.6

    return {
        "umpire": umpire_name,
        "umpire_adjustment": round(umpire_adjustment, 2),
        "umpire_runs_rating": runs_rating,
        "umpire_zone_rating": zone_rating,
        "umpire_lean": profile.get("over_under_lean", "Neutral"),
        "umpire_walk_boost": profile.get("walk_boost", 0),
        "umpire_strikeout_boost": profile.get("strikeout_boost", 0),
    }

def get_today_utc_window():
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    start = datetime.combine(
        today,
        datetime.min.time(),
        tzinfo=timezone.utc
    )

    end = start + timedelta(days=1)

    return (
        start.isoformat().replace("+00:00", "Z"),
        end.isoformat().replace("+00:00", "Z")
    )

def game_is_today(game):
    commence_time = game.get("commence_time")

    if not commence_time:
        return True

    try:
        start_time = datetime.fromisoformat(
            commence_time.replace("Z", "+00:00")
        )

        eastern_now = datetime.now(timezone.utc).astimezone()
        game_local_date = start_time.astimezone().date()

        return game_local_date == eastern_now.date()

    except Exception:
        return True

def game_has_started(game):
    commence_time = game.get("commence_time")

    if not commence_time:
        return False

    try:
        start_time = datetime.fromisoformat(
            commence_time.replace("Z", "+00:00")
        )

        now = datetime.now(timezone.utc)

        return now >= start_time

    except Exception:
        return False

def get_mlb_totals_engine_adjustment(game, team_hitting_stats=None):
    team_hitting_stats = team_hitting_stats or {}

    away_team = game.get("away_team")
    home_team = game.get("home_team")

    away_lineup = get_confirmed_lineup_strength(away_team)
    home_lineup = get_confirmed_lineup_strength(home_team)

    away_hitting = team_hitting_stats.get(away_team, {"hitting_rating": 75})
    home_hitting = team_hitting_stats.get(home_team, {"hitting_rating": 75})

    away_hitting_rating = away_hitting.get("hitting_rating", 75)
    home_hitting_rating = home_hitting.get("hitting_rating", 75)

    combined_lineup_strength = (
        away_lineup.get("lineup_strength", 75)
        + home_lineup.get("lineup_strength", 75)
    ) / 2

    combined_hitting_rating = (
        away_hitting_rating
        + home_hitting_rating
    ) / 2

    bullpen_adj = get_mlb_total_bullpen_adjustment(game)

    totals_adjustment = 0

    if combined_lineup_strength >= 85:
        totals_adjustment += 1.2
    elif combined_lineup_strength >= 80:
        totals_adjustment += 0.8
    elif combined_lineup_strength <= 70:
        totals_adjustment -= 0.8

    if combined_hitting_rating >= 85:
        totals_adjustment += 1.2
    elif combined_hitting_rating >= 80:
        totals_adjustment += 0.8
    elif combined_hitting_rating <= 70:
        totals_adjustment -= 0.8

    totals_adjustment += bullpen_adj

    return {
        "totals_engine_adjustment": round(totals_adjustment, 2),
        "combined_lineup_strength": round(combined_lineup_strength, 2),
        "combined_hitting_rating": round(combined_hitting_rating, 2),
        "combined_bullpen_adjustment": round(bullpen_adj, 2),
    }

def get_live_statcast_pitching_profiles():
    year = date.today().year

    urls = [
        f"https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=pitcher&year={year}&csv=true",
        f"https://baseballsavant.mlb.com/leaderboard/custom?type=pitcher&year={year}&csv=true",
    ]

    def clean_number(value, default=75):
        try:
            if value is None or value == "":
                return default
            return float(str(value).replace("%", "").strip())
        except Exception:
            return default

    def get_first(row, possible_keys, default=75):
        for key in possible_keys:
            if key in row and row.get(key) not in [None, ""]:
                return clean_number(row.get(key), default)
        return default

    try:
        import csv
        import io

        for url in urls:
            response = requests.get(url, timeout=4)

            if response.status_code != 200:
                continue

            text = response.text

            if "player" not in text.lower():
                continue

            reader = csv.DictReader(io.StringIO(text))
            profiles = {}

            for row in reader:
                pitcher_name = (
                    row.get("player_name")
                    or row.get("last_name, first_name")
                    or row.get("name")
                    or row.get("player")
                )

                if not pitcher_name:
                    continue

                xera_rating = get_first(
                    row,
                    ["xera_percentile", "xERA_percentile", "xera", "xERA"],
                    75
                )

                whiff_rating = get_first(
                    row,
                    ["whiff_percentile", "whiff_percent", "Whiff %", "whiff_percentile_rank"],
                    75
                )

                k_rating = get_first(
                    row,
                    ["k_percentile", "k_percent", "K%", "strikeout_percentile"],
                    75
                )

                hard_hit_allowed_rating = get_first(
                    row,
                    ["hard_hit_percentile", "hard_hit_percent", "Hard Hit %"],
                    75
                )

                barrel_allowed_rating = get_first(
                    row,
                    ["barrel_percentile", "barrel_percent", "Barrel %"],
                    75
                )

                statcast_pitching_rating = round(
                    (
                        xera_rating
                        + whiff_rating
                        + k_rating
                        + hard_hit_allowed_rating
                        + barrel_allowed_rating
                    ) / 5,
                    2
                )

                statcast_pitching_adjustment = round(
                    (statcast_pitching_rating - 75) * 0.05,
                    2
                )

                profiles[pitcher_name] = {
                    "xera_rating": xera_rating,
                    "whiff_rating": whiff_rating,
                    "k_rating": k_rating,
                    "hard_hit_allowed_rating": hard_hit_allowed_rating,
                    "barrel_allowed_rating": barrel_allowed_rating,
                    "statcast_pitching_rating": statcast_pitching_rating,
                    "statcast_pitching_adjustment": statcast_pitching_adjustment,
                    "statcast_source": "live",
                }

            if profiles:
                return profiles

        return {}

    except Exception as e:
        print("Live Statcast pitching profile error:", e)
        return {}

def get_statcast_pitching_profile(pitcher_name, live_profiles=None):
    # Statcast Pitching Engine v1.
    # Static baseline now; later replace with live Baseball Savant pitcher data.

    live_profiles = live_profiles or {}

    if pitcher_name in live_profiles:
        return live_profiles[pitcher_name]

    pitcher_profiles = {
        "Paul Skenes": {
            "xera_rating": 92,
            "whiff_rating": 94,
            "k_rating": 94,
            "hard_hit_allowed_rating": 88,
            "barrel_allowed_rating": 90,
        },
        "Chris Sale": {
            "xera_rating": 92,
            "whiff_rating": 93,
            "k_rating": 92,
            "hard_hit_allowed_rating": 89,
            "barrel_allowed_rating": 90,
        },
        "Zack Wheeler": {
            "xera_rating": 91,
            "whiff_rating": 88,
            "k_rating": 89,
            "hard_hit_allowed_rating": 90,
            "barrel_allowed_rating": 90,
        },
        "Tarik Skubal": {
            "xera_rating": 92,
            "whiff_rating": 91,
            "k_rating": 91,
            "hard_hit_allowed_rating": 90,
            "barrel_allowed_rating": 90,
        },
        "Garrett Crochet": {
            "xera_rating": 89,
            "whiff_rating": 91,
            "k_rating": 91,
            "hard_hit_allowed_rating": 85,
            "barrel_allowed_rating": 86,
        },
        "Nathan Eovaldi": {
            "xera_rating": 84,
            "whiff_rating": 78,
            "k_rating": 79,
            "hard_hit_allowed_rating": 84,
            "barrel_allowed_rating": 83,
        },
        "Spencer Arrighetti": {
            "xera_rating": 78,
            "whiff_rating": 82,
            "k_rating": 81,
            "hard_hit_allowed_rating": 75,
            "barrel_allowed_rating": 75,
        },
        "Jack Flaherty": {
            "xera_rating": 72,
            "whiff_rating": 77,
            "k_rating": 78,
            "hard_hit_allowed_rating": 68,
            "barrel_allowed_rating": 68,
        },
        "Colin Rea": {
            "xera_rating": 70,
            "whiff_rating": 68,
            "k_rating": 68,
            "hard_hit_allowed_rating": 70,
            "barrel_allowed_rating": 70,
        },
        "Patrick Corbin": {
            "xera_rating": 66,
            "whiff_rating": 62,
            "k_rating": 62,
            "hard_hit_allowed_rating": 64,
            "barrel_allowed_rating": 64,
        },
                "Carlos Rodón": {
            "xera_rating": 82,
            "whiff_rating": 87,
            "k_rating": 87,
            "hard_hit_allowed_rating": 74,
            "barrel_allowed_rating": 75,
        },
        "Lucas Giolito": {
            "xera_rating": 76,
            "whiff_rating": 78,
            "k_rating": 79,
            "hard_hit_allowed_rating": 70,
            "barrel_allowed_rating": 70,
        },
        "Grant Holmes": {
            "xera_rating": 74,
            "whiff_rating": 74,
            "k_rating": 74,
            "hard_hit_allowed_rating": 73,
            "barrel_allowed_rating": 73,
        },
        "Stephen Kolek": {
            "xera_rating": 73,
            "whiff_rating": 71,
            "k_rating": 71,
            "hard_hit_allowed_rating": 73,
            "barrel_allowed_rating": 72,
        },
        "Justin Wrobleski": {
            "xera_rating": 72,
            "whiff_rating": 73,
            "k_rating": 73,
            "hard_hit_allowed_rating": 71,
            "barrel_allowed_rating": 71,
        },
        "Troy Melton": {
            "xera_rating": 72,
            "whiff_rating": 72,
            "k_rating": 72,
            "hard_hit_allowed_rating": 72,
            "barrel_allowed_rating": 72,
        },
        "Kai-Wei Teng": {
            "xera_rating": 70,
            "whiff_rating": 71,
            "k_rating": 71,
            "hard_hit_allowed_rating": 69,
            "barrel_allowed_rating": 69,
        },
        "Adam Macko": {
            "xera_rating": 70,
            "whiff_rating": 72,
            "k_rating": 72,
            "hard_hit_allowed_rating": 69,
            "barrel_allowed_rating": 69,
        },
        "Tyler Samaniego": {
            "xera_rating": 68,
            "whiff_rating": 69,
            "k_rating": 69,
            "hard_hit_allowed_rating": 68,
            "barrel_allowed_rating": 68,
        },
    }

    default_profile = {
        "xera_rating": 75,
        "whiff_rating": 75,
        "k_rating": 75,
        "hard_hit_allowed_rating": 75,
        "barrel_allowed_rating": 75,
    }

    data = pitcher_profiles.get(pitcher_name, default_profile)

    statcast_pitching_rating = round(
        (
            data.get("xera_rating", 75)
            + data.get("whiff_rating", 75)
            + data.get("k_rating", 75)
            + data.get("hard_hit_allowed_rating", 75)
            + data.get("barrel_allowed_rating", 75)
        ) / 5,
        2
    )

    statcast_pitching_adjustment = round(
        (statcast_pitching_rating - 75) * 0.05,
        2
    )

    return {
        **data,
        "statcast_pitching_rating": statcast_pitching_rating,
        "statcast_pitching_adjustment": statcast_pitching_adjustment,
    }

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

def get_team_statcast_power_rating(team_name):
    # Statcast Power Engine v1.
    # Static baseline now; later replace with live Baseball Savant/Statcast data.

    team_power = {
        "Los Angeles Dodgers": {
            "hard_hit_rating": 90,
            "barrel_rating": 90,
            "xwoba_rating": 88,
            "xslg_rating": 89,
        },
        "New York Yankees": {
            "hard_hit_rating": 89,
            "barrel_rating": 91,
            "xwoba_rating": 86,
            "xslg_rating": 88,
        },
        "Atlanta Braves": {
            "hard_hit_rating": 87,
            "barrel_rating": 86,
            "xwoba_rating": 85,
            "xslg_rating": 86,
        },
        "Philadelphia Phillies": {
            "hard_hit_rating": 85,
            "barrel_rating": 84,
            "xwoba_rating": 84,
            "xslg_rating": 84,
        },
        "Houston Astros": {
            "hard_hit_rating": 83,
            "barrel_rating": 82,
            "xwoba_rating": 84,
            "xslg_rating": 83,
        },
        "Baltimore Orioles": {
            "hard_hit_rating": 84,
            "barrel_rating": 85,
            "xwoba_rating": 82,
            "xslg_rating": 84,
        },
        "Boston Red Sox": {
            "hard_hit_rating": 82,
            "barrel_rating": 81,
            "xwoba_rating": 82,
            "xslg_rating": 81,
        },
        "Chicago Cubs": {
            "hard_hit_rating": 81,
            "barrel_rating": 80,
            "xwoba_rating": 80,
            "xslg_rating": 80,
        },
        "Toronto Blue Jays": {
            "hard_hit_rating": 80,
            "barrel_rating": 79,
            "xwoba_rating": 80,
            "xslg_rating": 79,
        },
        "Texas Rangers": {
            "hard_hit_rating": 79,
            "barrel_rating": 78,
            "xwoba_rating": 78,
            "xslg_rating": 78,
        },
        "San Diego Padres": {
            "hard_hit_rating": 79,
            "barrel_rating": 78,
            "xwoba_rating": 79,
            "xslg_rating": 78,
        },
        "New York Mets": {
            "hard_hit_rating": 78,
            "barrel_rating": 77,
            "xwoba_rating": 78,
            "xslg_rating": 77,
        },
        "Milwaukee Brewers": {
            "hard_hit_rating": 77,
            "barrel_rating": 76,
            "xwoba_rating": 77,
            "xslg_rating": 76,
        },
        "Arizona Diamondbacks": {
            "hard_hit_rating": 77,
            "barrel_rating": 76,
            "xwoba_rating": 77,
            "xslg_rating": 76,
        },
        "Seattle Mariners": {
            "hard_hit_rating": 76,
            "barrel_rating": 77,
            "xwoba_rating": 75,
            "xslg_rating": 76,
        },
        "Tampa Bay Rays": {
            "hard_hit_rating": 76,
            "barrel_rating": 75,
            "xwoba_rating": 76,
            "xslg_rating": 75,
        },
        "Cincinnati Reds": {
            "hard_hit_rating": 76,
            "barrel_rating": 76,
            "xwoba_rating": 75,
            "xslg_rating": 76,
        },
        "Minnesota Twins": {
            "hard_hit_rating": 75,
            "barrel_rating": 76,
            "xwoba_rating": 75,
            "xslg_rating": 75,
        },
        "Detroit Tigers": {
            "hard_hit_rating": 74,
            "barrel_rating": 74,
            "xwoba_rating": 74,
            "xslg_rating": 74,
        },
        "Cleveland Guardians": {
            "hard_hit_rating": 73,
            "barrel_rating": 72,
            "xwoba_rating": 74,
            "xslg_rating": 72,
        },
        "St. Louis Cardinals": {
            "hard_hit_rating": 73,
            "barrel_rating": 72,
            "xwoba_rating": 73,
            "xslg_rating": 72,
        },
        "Kansas City Royals": {
            "hard_hit_rating": 72,
            "barrel_rating": 71,
            "xwoba_rating": 72,
            "xslg_rating": 71,
        },
        "San Francisco Giants": {
            "hard_hit_rating": 73,
            "barrel_rating": 74,
            "xwoba_rating": 73,
            "xslg_rating": 74,
        },
        "Los Angeles Angels": {
            "hard_hit_rating": 72,
            "barrel_rating": 72,
            "xwoba_rating": 71,
            "xslg_rating": 72,
        },
        "Colorado Rockies": {
            "hard_hit_rating": 71,
            "barrel_rating": 70,
            "xwoba_rating": 70,
            "xslg_rating": 70,
        },
        "Washington Nationals": {
            "hard_hit_rating": 70,
            "barrel_rating": 69,
            "xwoba_rating": 70,
            "xslg_rating": 69,
        },
        "Pittsburgh Pirates": {
            "hard_hit_rating": 69,
            "barrel_rating": 68,
            "xwoba_rating": 69,
            "xslg_rating": 68,
        },
        "Miami Marlins": {
            "hard_hit_rating": 68,
            "barrel_rating": 67,
            "xwoba_rating": 68,
            "xslg_rating": 67,
        },
        "Athletics": {
            "hard_hit_rating": 68,
            "barrel_rating": 68,
            "xwoba_rating": 67,
            "xslg_rating": 68,
        },
        "Chicago White Sox": {
            "hard_hit_rating": 66,
            "barrel_rating": 65,
            "xwoba_rating": 66,
            "xslg_rating": 65,
        },
    }

    data = team_power.get(
        team_name,
        {
            "hard_hit_rating": 75,
            "barrel_rating": 75,
            "xwoba_rating": 75,
            "xslg_rating": 75,
        }
    )

    statcast_power_rating = round(
        (
            data.get("hard_hit_rating", 75)
            + data.get("barrel_rating", 75)
            + data.get("xwoba_rating", 75)
            + data.get("xslg_rating", 75)
        ) / 4,
        2
    )

    statcast_power_adjustment = round(
        (statcast_power_rating - 75) * 0.05,
        2
    )

    return {
        **data,
        "statcast_power_rating": statcast_power_rating,
        "statcast_power_adjustment": statcast_power_adjustment,
    }

def calculate_team_hitting_rating(avg, ops, runs_per_game):
    try:
        avg = float(avg)
        ops = float(ops)
        runs_per_game = float(runs_per_game)
    except Exception:
        return 75

    rating = 75

    # Batting average
    if avg >= .275:
        rating += 8
    elif avg >= .265:
        rating += 5
    elif avg >= .255:
        rating += 2
    elif avg <= .230:
        rating -= 6
    elif avg <= .240:
        rating -= 3

    # OPS
    if ops >= .800:
        rating += 10
    elif ops >= .760:
        rating += 6
    elif ops >= .720:
        rating += 3
    elif ops <= .660:
        rating -= 7
    elif ops <= .700:
        rating -= 4

    # Runs per game
    if runs_per_game >= 5.5:
        rating += 8
    elif runs_per_game >= 4.8:
        rating += 5
    elif runs_per_game >= 4.3:
        rating += 2
    elif runs_per_game <= 3.5:
        rating -= 7
    elif runs_per_game <= 4.0:
        rating -= 4

    return max(50, min(95, rating))

def get_team_handedness_split_rating(team_name, pitcher_throws):
    # Temporary matchup layer.
    # Later this can be replaced with live Statcast / Baseball Savant split data.

    default_rating = 75

    team_splits = {
        "Los Angeles Dodgers": {"R": 86, "L": 84},
        "New York Yankees": {"R": 85, "L": 87},
        "Atlanta Braves": {"R": 84, "L": 82},
        "Philadelphia Phillies": {"R": 82, "L": 83},
        "Houston Astros": {"R": 81, "L": 84},
        "Boston Red Sox": {"R": 80, "L": 78},
        "Chicago Cubs": {"R": 79, "L": 77},
        "Toronto Blue Jays": {"R": 78, "L": 80},
        "Baltimore Orioles": {"R": 79, "L": 81},
        "Texas Rangers": {"R": 78, "L": 77},
        "San Diego Padres": {"R": 78, "L": 79},
        "New York Mets": {"R": 77, "L": 76},
        "Seattle Mariners": {"R": 75, "L": 76},
        "Tampa Bay Rays": {"R": 76, "L": 75},
        "Arizona Diamondbacks": {"R": 77, "L": 76},
        "Cincinnati Reds": {"R": 76, "L": 75},
        "Minnesota Twins": {"R": 75, "L": 77},
        "Detroit Tigers": {"R": 75, "L": 74},
        "Cleveland Guardians": {"R": 74, "L": 75},
        "St. Louis Cardinals": {"R": 74, "L": 73},
        "Kansas City Royals": {"R": 74, "L": 73},
        "Miami Marlins": {"R": 70, "L": 69},
        "Colorado Rockies": {"R": 72, "L": 71},
        "Pittsburgh Pirates": {"R": 70, "L": 69},
        "Washington Nationals": {"R": 70, "L": 69},
        "Chicago White Sox": {"R": 68, "L": 67},
        "Athletics": {"R": 69, "L": 68},
        "Los Angeles Angels": {"R": 72, "L": 71},
        "San Francisco Giants": {"R": 74, "L": 75},
        "Milwaukee Brewers": {"R": 76, "L": 75},
    }

    pitcher_side = str(pitcher_throws or "R").upper()

    if pitcher_side not in ["R", "L"]:
        pitcher_side = "R"

    return team_splits.get(team_name, {}).get(pitcher_side, default_rating)

def get_live_confirmed_lineups():
    # Live lineup feed v1.
    # Uses MLB Stats API schedule data as the source.
    # If official batting orders are unavailable, this safely returns {}.

    today = date.today().isoformat()

    url = "https://statsapi.mlb.com/api/v1/schedule"

    params = {
        "sportId": 1,
        "date": today,
        "hydrate": "lineups,probablePitcher",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {}

        data = response.json()
        confirmed_lineups = {}

        for day in data.get("dates", []):
            for game in day.get("games", []):
                teams = game.get("teams", {})

                for side in ["away", "home"]:
                    team_obj = teams.get(side, {}).get("team", {})
                    team_name = team_obj.get("name")

                    if not team_name:
                        continue

                    lineup_obj = teams.get(side, {}).get("lineup", [])
                    batting_order = []

                    if isinstance(lineup_obj, list):
                        for player in lineup_obj:
                            player_name = (
                                player.get("fullName")
                                or player.get("name")
                            )

                            if player_name:
                                batting_order.append(player_name)

                    if not batting_order:
                        continue

                    top_order_strength = 75

                    if len(batting_order) >= 3:
                        top_order_strength = 80

                    if len(batting_order) >= 9:
                        lineup_confirmed = True
                    else:
                        lineup_confirmed = False

                    confirmed_lineups[team_name] = {
                        "base_rating": 75,
                        "missing_stars": 0,
                        "top_order_strength": top_order_strength,
                        "backup_catcher": False,
                        "batting_order": batting_order,
                        "lineup_confirmed": lineup_confirmed,
                    }

        return confirmed_lineups

    except Exception as e:
        print("Live confirmed lineup error:", e)
        return {}

def get_confirmed_lineup_strength(team_name, confirmed_lineups=None):
    # Conservative placeholder engine.
    # Later we can replace this with live confirmed lineup/player-level data.
    
    confirmed_lineups = confirmed_lineups or {}

    confirmed_data = confirmed_lineups.get(team_name)

    if confirmed_data:
        base_rating = confirmed_data.get("base_rating", 75)
        missing_stars = confirmed_data.get("missing_stars", 0)
        top_order_strength = confirmed_data.get("top_order_strength", base_rating)
        backup_catcher = confirmed_data.get("backup_catcher", False)

        rating = base_rating

        rating -= missing_stars * 4

        if top_order_strength >= 85:
            rating += 3
        elif top_order_strength <= 70:
            rating -= 3

        if backup_catcher:
            rating -= 2

        rating = max(55, min(95, rating))

        if rating >= 84:
            status = "Strong Confirmed Lineup"
        elif rating >= 76:
            status = "Average Confirmed Lineup"
        elif rating >= 70:
            status = "Weak Confirmed Lineup"
        else:
            status = "Very Weak Confirmed Lineup"

        adjustment = round((rating - 75) * 0.04, 2)

        lineup_depth_score = len(
            confirmed_data.get("batting_order", [])
        )

        if lineup_depth_score >= 9:
            depth_adjustment = 2
        elif lineup_depth_score >= 6:
            depth_adjustment = 1
        else:
            depth_adjustment = -2

        star_power_score = top_order_strength + depth_adjustment

        lineup_confidence = 90 if confirmed_data.get(
            "lineup_confirmed"
        ) else 65

        return {
            "lineup_status": status,
            "lineup_strength": rating,
            "lineup_adjustment": adjustment,
            "lineup_confirmed": confirmed_data.get(
                "lineup_confirmed",
                False
            ),

            # Live Lineup Strength V2
            "lineup_version": "lineup_v2",
            "lineup_confidence": lineup_confidence,
            "lineup_depth_score": lineup_depth_score,
            "star_power_score": star_power_score,
            "missing_stars": missing_stars,
            "top_order_strength": top_order_strength,
            "backup_catcher": backup_catcher,
        }

    lineup_strength = {
        "Los Angeles Dodgers": 90,
        "New York Yankees": 88,
        "Atlanta Braves": 86,
        "Philadelphia Phillies": 85,
        "Houston Astros": 84,
        "Baltimore Orioles": 83,
        "Boston Red Sox": 82,
        "Chicago Cubs": 81,
        "Toronto Blue Jays": 80,
        "Texas Rangers": 79,
        "San Diego Padres": 79,
        "New York Mets": 78,
        "Milwaukee Brewers": 78,
        "Arizona Diamondbacks": 77,
        "Seattle Mariners": 76,
        "Tampa Bay Rays": 76,
        "Cincinnati Reds": 75,
        "Minnesota Twins": 75,
        "Detroit Tigers": 74,
        "Cleveland Guardians": 74,
        "St. Louis Cardinals": 73,
        "Kansas City Royals": 73,
        "San Francisco Giants": 73,
        "Los Angeles Angels": 72,
        "Colorado Rockies": 71,
        "Washington Nationals": 70,
        "Pittsburgh Pirates": 70,
        "Miami Marlins": 69,
        "Athletics": 68,
        "Chicago White Sox": 67,
    }

    rating = lineup_strength.get(team_name, 75)

    if rating >= 84:
        status = "Strong Lineup"
    elif rating >= 76:
        status = "Average Lineup"
    elif rating >= 70:
        status = "Weak Lineup"
    else:
        status = "Very Weak Lineup"

    adjustment = round((rating - 75) * 0.04, 2)

    lineup_confidence = 55

    lineup_depth_score = 9

    star_power_score = rating

    return {
        "lineup_status": status,
        "lineup_strength": rating,
        "lineup_adjustment": adjustment,
        "lineup_confirmed": False,

        # Live Lineup Strength V2 fallback
        "lineup_version": "lineup_v2_projected",
        "lineup_confidence": lineup_confidence,
        "lineup_depth_score": lineup_depth_score,
        "star_power_score": star_power_score,
        "missing_stars": 0,
        "top_order_strength": rating,
        "backup_catcher": False,
    }

def get_mlb_team_hitting_stats():
    url = "https://statsapi.mlb.com/api/v1/teams/stats"

    params = {
        "sportIds": 1,
        "stats": "season",
        "group": "hitting",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {}

        data = response.json()
        team_map = {}

        for stat_group in data.get("stats", []):
            for split in stat_group.get("splits", []):
                team = split.get("team", {})
                stat = split.get("stat", {})

                team_name = team.get("name")

                if not team_name:
                    continue

                avg = stat.get("avg", "0")
                ops = stat.get("ops", "0")
                runs = float(stat.get("runs", 0))
                games_played = max(float(stat.get("gamesPlayed", 1)), 1)

                runs_per_game = round(runs / games_played, 2)

                rating = calculate_team_hitting_rating(
                    avg,
                    ops,
                    runs_per_game
                )

                team_map[team_name] = {
                    "avg": avg,
                    "ops": ops,
                    "runs_per_game": runs_per_game,
                    "hitting_rating": rating,
                }

            return team_map

    except Exception as e:
            print("MLB hitting stats error:", e)
            return {}

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
    
def get_batter_vs_pitcher_matchup(
    team_name,
    opponent_pitcher,
    team_hitting_stats=None
):
    """
    Batter vs Pitcher Engine V1

    Measures offense matchup quality against today's starter.
    """

    team_hitting_stats = team_hitting_stats or {}

    hitting = team_hitting_stats.get(
        team_name,
        {}
    )

    hitting_rating = hitting.get(
        "hitting_rating",
        75
    )

    pitcher_rating = opponent_pitcher.get(
        "rating",
        75
    )

    matchup_score = (
        hitting_rating
        - pitcher_rating
        + 75
    )

    matchup_score = max(
        50,
        min(100, matchup_score)
    )

    if matchup_score >= 85:
        signal = "Elite Hitter Advantage"
        adjustment = 1.0

    elif matchup_score >= 78:
        signal = "Hitter Edge"
        adjustment = 0.5

    elif matchup_score <= 65:
        signal = "Pitcher Advantage"
        adjustment = -0.7

    else:
        signal = "Neutral Matchup"
        adjustment = 0


    return {
        "bvp_rating": round(matchup_score, 2),
        "bvp_adjustment": adjustment,
        "bvp_signal": signal,
    }

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

def get_market_consensus_data(game, market_key, pick_name):
    prices = []

    for bookmaker in game.get("bookmakers", []):
        sportsbook = bookmaker.get("title")

        for market in bookmaker.get("markets", []):
            if market.get("key") != market_key:
                continue

            for outcome in market.get("outcomes", []):
                if outcome.get("name") != pick_name:
                    continue

                price = outcome.get("price")

                if price is None:
                    continue

                prices.append({
                    "sportsbook": sportsbook,
                    "price": int(price),
                })

    if not prices:
        return {
            "consensus_price": None,
            "best_price": None,
            "worst_price": None,
            "best_book": None,
            "worst_book": None,
            "market_spread": 0,
            "market_disagreement": "Unknown",
            "stale_line_opportunity": False,
            "consensus_book_count": 0,
        }

    sorted_prices = sorted(prices, key=lambda x: x["price"])

    best = max(prices, key=lambda x: x["price"])
    worst = min(prices, key=lambda x: x["price"])

    consensus_price = round(
        sum(item["price"] for item in prices) / len(prices),
        2
    )

    market_spread = abs(best["price"] - worst["price"])

    if market_spread >= 35:
        disagreement = "High"
    elif market_spread >= 20:
        disagreement = "Moderate"
    elif market_spread >= 10:
        disagreement = "Low"
    else:
        disagreement = "Tight"

    stale_line_opportunity = market_spread >= 25

    return {
        "consensus_price": consensus_price,
        "best_price": best.get("price"),
        "worst_price": worst.get("price"),
        "best_book": best.get("sportsbook"),
        "worst_book": worst.get("sportsbook"),
        "market_spread": market_spread,
        "market_disagreement": disagreement,
        "stale_line_opportunity": stale_line_opportunity,
        "consensus_book_count": len(prices),
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

def get_nrfi_yrfi_projection(
    game,
    probable_pitchers,
    team_hitting_stats=None,
    confirmed_lineups=None,
    live_statcast_pitching=None
):
    
    away_team = game.get("away_team")
    home_team = game.get("home_team")
    
    team_hitting_stats = team_hitting_stats or {}
    live_statcast_pitching = live_statcast_pitching or {}

    away_lineup = get_confirmed_lineup_strength(
        away_team,
        confirmed_lineups
        )

    home_lineup = get_confirmed_lineup_strength(
            home_team,
            confirmed_lineups
        )

    away_hitting = team_hitting_stats.get(away_team, {"hitting_rating": 75})
    home_hitting = team_hitting_stats.get(home_team, {"hitting_rating": 75})

    away_hitting_rating = away_hitting.get("hitting_rating", 75)
    home_hitting_rating = home_hitting.get("hitting_rating", 75)

    combined_lineup_strength = (
        away_lineup.get("lineup_strength", 75)
        + home_lineup.get("lineup_strength", 75)
    ) / 2

    combined_hitting_rating = (
        away_hitting_rating
        + home_hitting_rating
    ) / 2

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

    away_statcast = get_statcast_pitching_profile(
        away_pitcher.get("pitcher"),
        live_statcast_pitching
    )

    home_statcast = get_statcast_pitching_profile(
        home_pitcher.get("pitcher"),
        live_statcast_pitching
    )

    away_statcast_rating = away_statcast.get(
        "statcast_pitching_rating",
        75
    )

    home_statcast_rating = home_statcast.get(
        "statcast_pitching_rating",
        75
    )

    combined_pitcher_rating = (
    away_rating
    + home_rating
    + away_statcast_rating
    + home_statcast_rating
) / 4

    weather_data = get_mlb_weather_adjustment(
        game,
        "totals",
        "Over"
    ) or {}

    weather_adj = weather_data.get("weather_adjustment", 0)

    umpire_data = get_umpire_engine_adjustment(
        game,
        "nrfi"
    )

    umpire_adjustment = umpire_data.get("umpire_adjustment", 0)

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

    if umpire_adjustment >= 1:
        nrfi_probability -= 2
    elif umpire_adjustment <= -1:
        nrfi_probability += 2


    if combined_lineup_strength >= 85:
        nrfi_probability -= 3
    elif combined_lineup_strength >= 80:
        nrfi_probability -= 2
    elif combined_lineup_strength <= 70:
        nrfi_probability += 2

    if combined_hitting_rating >= 85:
        nrfi_probability -= 3
    elif combined_hitting_rating >= 80:
        nrfi_probability -= 2
    elif combined_hitting_rating <= 70:
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
        f"Umpire adjustment: {umpire_adjustment}. "
        f"Combined lineup strength: {round(combined_lineup_strength, 1)}. "
        f"Combined hitting rating: {round(combined_hitting_rating, 1)}. "
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
                "combined_lineup_strength": round(
            combined_lineup_strength,
            2
        ),
        "combined_hitting_rating": round(
            combined_hitting_rating,
            2
        ),
        "ballpark": weather_data.get("park", "Unknown"),
        "weather_risk": weather_data.get("weather_risk", "Neutral"),
        "weather_adjustment": weather_adj,
        "umpire": umpire_data.get("umpire"),
        "umpire": umpire_data.get("umpire"),
        "umpire_adjustment": umpire_adjustment,
        "umpire_runs_rating": umpire_data.get("umpire_runs_rating"),
        "umpire_zone_rating": umpire_data.get("umpire_zone_rating"),
        "umpire_lean": umpire_data.get("umpire_lean"),
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
        entry = db.query(CacheEntry).filter(
            CacheEntry.cache_key == key
        ).first()

        if not entry or not entry.payload:
            return None

        cached = json.loads(entry.payload)

        # New cache format
        if isinstance(cached, dict) and "date" in cached and "payload" in cached:
            if cached.get("date") != str(date.today()):
                return None

            return cached.get("payload")

        # Old cache format should be treated as stale
        return None

    except Exception:
        return None
    finally:
        db.close()


def set_cache(key, payload):
    db = SessionLocal()
    try:
        payload_with_meta = {
            "date": str(date.today()),
            "payload": payload,
        }

        payload_json = json.dumps(payload_with_meta)

        entry = db.query(CacheEntry).filter(
            CacheEntry.cache_key == key
        ).first()

        if entry:
            entry.payload = payload_json
        else:
            entry = CacheEntry(
                cache_key=key,
                payload=payload_json
            )
            db.add(entry)

        db.commit()
    finally:
        db.close()


@app.get("/cached/mlb")
def cached_mlb_models():
    full_game = get_cache("mlb_model")
    f5 = get_cache("mlb_f5_model")
    nrfi = get_cache("mlb_nrfi_model")

    return {
        "full_game": full_game or [],
        "f5": f5 or [],
        "nrfi": nrfi or [],
        "cached": True,
        "cache_date": str(date.today()),
    }

@app.post("/refresh/mlb")
def refresh_mlb_models():
    results = {}

    try:
        full_game_response = model_mlb_today()
        results["full_game"] = {
            "success": True,
            "count": len(full_game_response.get("plays", [])),
        }
    except Exception as e:
        results["full_game"] = {
            "success": False,
            "error": str(e),
        }

    try:
        f5_response = model_mlb_f5_today()
        results["f5"] = {
            "success": True,
            "count": len(f5_response.get("plays", [])),
        }
    except Exception as e:
        results["f5"] = {
            "success": False,
            "error": str(e),
        }

    try:
        nrfi_response = model_mlb_nrfi_today()
        results["nrfi"] = {
            "success": True,
            "count": len(nrfi_response.get("plays", [])),
        }
    except Exception as e:
        results["nrfi"] = {
            "success": False,
            "error": str(e),
        }

    return {
        "success": True,
        "date": str(date.today()),
        "results": results,
    }

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

            # Performance dashboard tracking
            sport=str(data.get("sport", "")),
            sharp_signal=str(data.get("sharp_signal", "")),
            steam_strength=str(data.get("steam_strength", "")),
            line_disagreement=str(data.get("line_disagreement", "")),
            top_play_score=str(data.get("top_play_score", "")),
            line_shop_value=str(data.get("line_shop_value", "")),
            recommendation=str(data.get("recommendation", "")),
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

    def safe_float(value, default=0):
        try:
            if value in [None, ""]:
                return default
            return float(value)
        except Exception:
            return default

    def analyze_signal(records, field, positive_values=None):
        positive_values = positive_values or []

        buckets = {}

        for record in records:
            value = getattr(record, field, None)

            if value in [None, ""]:
                value = "Unknown"

            if positive_values:
                bucket = (
                    str(value)
                    if str(value) in positive_values
                    else "Other"
                )
            else:
                bucket = str(value)

            if bucket not in buckets:
                buckets[bucket] = {
                    "plays": 0,
                    "wins": 0,
                    "losses": 0,
                    "units": 0,
                }

            buckets[bucket]["plays"] += 1

            if record.result == "Win":
                buckets[bucket]["wins"] += 1
            elif record.result == "Loss":
                buckets[bucket]["losses"] += 1

            buckets[bucket]["units"] += safe_float(record.units_result)

        results = {}

        for bucket, data in buckets.items():
            graded = data["wins"] + data["losses"]

            if graded == 0:
                win_rate = 0
            else:
                win_rate = round((data["wins"] / graded) * 100, 2)

            results[bucket] = {
                "plays": data["plays"],
                "graded": graded,
                "wins": data["wins"],
                "losses": data["losses"],
                "win_rate": win_rate,
                "units": round(data["units"], 2),
            }

        return results

    try:
        records = db.query(ModelPlayHistory).filter(
            ModelPlayHistory.result.in_(["Win", "Loss"])
        ).all()

        if not records:
            return {
                "message": "No graded model history yet.",
                "signals": {},
            }

        actionable_records = [
            r for r in records
            if str(r.recommendation) in ["Play", "Lean"]
        ]

        pass_records = [
            r for r in records
            if str(r.recommendation) == "Pass"
        ]

        def summarize(records_to_summarize):
            wins = len([
                r for r in records_to_summarize
                if r.result == "Win"
            ])

            losses = len([
                r for r in records_to_summarize
                if r.result == "Loss"
            ])

            graded = wins + losses

            units = sum(
                safe_float(r.units_result)
                for r in records_to_summarize
            )

            win_rate = (
                round((wins / graded) * 100, 2)
                if graded > 0
                else 0
            )

            return {
                "graded_plays": graded,
                "wins": wins,
                "losses": losses,
                "win_rate": win_rate,
                "units": round(units, 2),
            }

        return {
            "summary": summarize(actionable_records),

            "pass_tracking": summarize(pass_records),

            "all_graded": summarize(records),

            "signals": {
                "recommendation": analyze_signal(records, "recommendation"),
                "market": analyze_signal(actionable_records, "market"),
                "sharp_signal": analyze_signal(actionable_records, "sharp_signal"),
                "steam_strength": analyze_signal(actionable_records, "steam_strength"),
                "clv_status": analyze_signal(actionable_records, "clv_status"),
                "live_clv_grade": analyze_signal(actionable_records, "live_clv_grade"),
                "market_disagreement": analyze_signal(actionable_records, "market_disagreement"),
                "high_leverage_risk": analyze_signal(actionable_records, "high_leverage_risk"),
                "stale_line_opportunity": analyze_signal(actionable_records, "stale_line_opportunity"),
                "model_validated_by_market": analyze_signal(actionable_records, "model_validated_by_market"),
            },
        }

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

                            injury_reaction = get_nba_injury_reaction(team_name)
                            injury_reaction_adj = injury_reaction.get("injury_adjustment", 0)

                            rotation_protection = get_nba_rotation_protection(team_name)
                            rotation_adj = rotation_protection.get("rotation_adjustment", 0)

                            rest_fatigue = get_nba_rest_fatigue(team_name)
                            fatigue_adj = rest_fatigue.get("fatigue_adjustment", 0)

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
                                + injury_reaction_adj
                                + rotation_adj
                                + fatigue_adj
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

                        if (
                            market_name == "Moneyline"
                            and odds <= -170
                            and edge < 4
                        ):
                            recommendation = "Pass"

                            reason_filter = (
                                "Filtered due to expensive favorite "
                                "without sufficient edge."
                            )
                        else:
                            reason_filter = ""

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
                    
                        play = {
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

                            "sport": "NBA",
                            "model_version": "nba_v2_market_engine",

                            "injury_status": injury_reaction.get("injury_status"),
                            "injury_adjustment": injury_reaction.get("injury_adjustment"),
                            "injury_score": injury_reaction.get("injury_score"),
                            "missing_players": injury_reaction.get("missing_players"),
                            "questionable_players": injury_reaction.get("questionable_players"),
                            "minutes_restrictions": injury_reaction.get("minutes_restrictions"),
                            "star_player_risk": injury_reaction.get("star_player_risk"),
                            "availability_grade": injury_reaction.get("availability_grade"),
                            "injury_notes": injury_reaction.get("injury_notes"),

                            "starter_status": rotation_protection.get("starter_status"),
                            "projected_starters": rotation_protection.get("projected_starters"),
                            "confirmed_starters": rotation_protection.get("confirmed_starters"),
                            "starter_changes": rotation_protection.get("starter_changes"),
                            "rotation_risk": rotation_protection.get("rotation_risk"),
                            "rotation_adjustment": rotation_protection.get("rotation_adjustment"),
                            "depth_score": rotation_protection.get("depth_score"),
                            "bench_depth_grade": rotation_protection.get("bench_depth_grade"),
                            "rotation_notes": rotation_protection.get("rotation_notes"),

                            "back_to_back": rest_fatigue.get("back_to_back"),
                            "three_in_four": rest_fatigue.get("three_in_four"),
                            "travel_spot": rest_fatigue.get("travel_spot"),
                            "rest_days": rest_fatigue.get("rest_days"),
                            "opponent_rest_days": rest_fatigue.get("opponent_rest_days"),
                            "rest_advantage": rest_fatigue.get("rest_advantage"),
                            "fatigue_adjustment": rest_fatigue.get("fatigue_adjustment"),
                            "rest_grade": rest_fatigue.get("rest_grade"),
                            "rest_notes": rest_fatigue.get("rest_notes"),

                            "playoff_mode": True,
                            "playoff_adjustment": playoff_adj,
                            "playoff_reasons": playoff_data.get(
                                "playoff_reasons",
                                []
                            ),

                            "reason": reason.strip()
                        }

                        # Sharp sportsbook weighting
                        book_data = get_sharp_sportsbook_weight(
                            sportsbook
                        )

                        play.update(book_data)


                        # Sharp market signal
                        sharp_data = get_sharp_market_signal(
                            edge,
                            odds,
                            recommendation
                        )

                        play.update(sharp_data)


                        # Line snapshot / CLV tracking
                        line_key = get_line_key(
                            game_name,
                            market_name,
                            pick_name,
                            sportsbook
                        )

                        snapshot = get_or_create_line_snapshot(
                            line_key,
                            game_name,
                            market_name,
                            pick_name,
                            sportsbook,
                            odds
                        )

                        opening_odds = snapshot.get(
                            "opening_odds",
                            odds
                        )

                        current_odds = snapshot.get(
                            "current_odds",
                            odds
                        )

                        play["opening_odds"] = opening_odds
                        play["current_odds"] = current_odds


                        # Steam / movement engine
                        movement_data = get_line_movement_signal(
                            opening_odds,
                            current_odds
                        )

                        play.update(movement_data)


                        # CLV engine
                        clv_data = get_clv_signal(
                            opening_odds,
                            current_odds
                        )

                        play.update(clv_data)


                        # Live CLV grading
                        live_clv = get_live_clv_tracker(
                            opening_odds,
                            current_odds,
                            edge,
                            recommendation
                        )

                        play.update(live_clv)


                        # Market timing
                        timing = get_market_timing_signal(play)

                        play.update(timing)


                        # Top play ranking
                        play["top_play_score"] = get_top_play_score(
                            play
                        )


                        plays.append(play)

        best_by_game_market = {}

        for play in plays:
            game = play.get("game")
            market = play.get("market")
            key = f"{game}|{market}"

            if key not in best_by_game_market:
                best_by_game_market[key] = play
            else:
                current_best = best_by_game_market[key]

                if play.get("edge", 0) > current_best.get("edge", 0):
                    best_by_game_market[key] = play

        final = list(best_by_game_market.values())

        for play in final:
            price_data = get_best_sportsbook_price(play, plays)

            play["best_sportsbook"] = price_data["best_sportsbook"]
            play["best_odds"] = price_data["best_odds"]
            play["worst_odds"] = price_data["worst_odds"]
            play["book_count"] = price_data["book_count"]
            play["line_shop_value"] = price_data["line_shop_value"]
            play["line_disagreement"] = price_data["line_disagreement"]
            play["sharpest_sportsbook"] = price_data["sharpest_sportsbook"]
            play["stale_line"] = price_data["stale_line"]
            play["sportsbook_note"] = price_data["sportsbook_note"]

            timing_data = get_market_timing_signal(play)
            play.update(timing_data)

            learning_boost = get_model_learning_boost(play)
            play["learning_boost"] = learning_boost

            play["top_play_score"] = get_top_play_score(play)
            play["auto_pod_score"] = get_auto_pod_score(play)

        final = sorted(
            final,
            key=lambda x: x.get("top_play_score", 0),
            reverse=True
        )

        top_play = final[0] if final else None

        final = sorted(
            final,
            key=lambda x: x["edge"],
            reverse=True
        )

        save_model_play_history("NBA", final)

        set_cache("nba_model", final)

        return {
            "top_play": top_play,
            "plays": final
        }

        return {"plays": final}

    except Exception as e:
        if cached:
            return {"plays": cached, "cached": True, "error": str(e)}
        return {"plays": [], "error": str(e)}
    
def get_sharp_sportsbook_weight(bookmaker):
    sharp_books = {
        "Pinnacle": 100,
        "Circa Sports": 95,
        "Bookmaker": 92,
        "BetOnline": 88,

        "DraftKings": 78,
        "FanDuel": 76,
        "Caesars": 74,
        "BetMGM": 72,

        "ESPN BET": 65,
        "Hard Rock Bet": 65,
    }

    score = sharp_books.get(bookmaker, 60)

    if score >= 90:
        signal = "Market Maker"
        adjustment = 0.6

    elif score >= 75:
        signal = "Sharp Influenced"
        adjustment = 0.3

    elif score >= 65:
        signal = "Neutral Book"
        adjustment = 0

    else:
        signal = "Recreational Lean"
        adjustment = -0.2


    return {
        "sharp_book_score": score,
        "sharp_book_signal": signal,
        "book_weight_adjustment": adjustment,
    }

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

    if movement <= -35:
        signal = "Heavy Steam"
        steam_strength = "High"
    elif movement <= -20:
        signal = "Steam Toward Pick"
        steam_strength = "Moderate"
    elif movement >= 35:
        signal = "Heavy Reverse Movement"
        steam_strength = "High"
    elif movement >= 20:
        signal = "Price Drift"
        steam_strength = "Moderate"
    else:
        signal = "Stable Market"
        steam_strength = "Low"

    reverse_line_movement = (
        movement <= -20 and current_odds < opening_odds
    )

    fake_steam_risk = (
        abs(movement) >= 40
    )

    late_sharp_action = (
        movement <= -25
    )

    if signal == "Heavy Steam":
        steam_note = (
            "Strong market steam detected toward this side across books."
        )
    elif signal == "Steam Toward Pick":
        steam_note = (
            "Consistent market support moving toward this play."
        )
    elif signal == "Heavy Reverse Movement":
        steam_note = (
            "Aggressive market movement against this side."
        )
    elif signal == "Price Drift":
        steam_note = (
            "Market drifting away from this side."
        )
    else:
        steam_note = (
            "No meaningful steam currently detected."
        )

    if fake_steam_risk:
        steam_note += (
            " Potential fake steam or unstable market conditions detected."
        )

    return {
        "opening_odds": opening_odds,
        "current_odds": current_odds,
        "line_movement": movement,
        "line_signal": signal,
        "steam_strength": steam_strength,
        "reverse_line_movement": reverse_line_movement,
        "fake_steam_risk": fake_steam_risk,
        "late_sharp_action": late_sharp_action,
        "steam_note": steam_note,
    }

def get_best_sportsbook_price(play, all_plays):
    target_books = [
        "FanDuel",
        "DraftKings",
        "Caesars",
        "BetMGM",
        "ESPN BET",
        "ESPNBet",
        "Fanatics",
    ]

    sharp_books = [
        "DraftKings",
        "FanDuel",
        "Circa",
        "Pinnacle",
    ]

    game = play.get("game")
    market = play.get("market")
    pick = play.get("pick")

    matching = [
        item for item in all_plays
        if item.get("game") == game
        and item.get("market") == market
        and item.get("pick") == pick
        and item.get("odds") is not None
        and item.get("sportsbook") in target_books
    ]

    if not matching:
        return {
            "best_sportsbook": play.get("sportsbook"),
            "best_odds": play.get("odds"),
            "worst_odds": play.get("odds"),
            "book_count": 1,
            "line_shop_value": 0,
            "line_disagreement": "Low",
            "sharpest_sportsbook": play.get("sportsbook"),
            "stale_line": False,
            "sportsbook_note": "Only one usable sportsbook price found.",
        }

    best = max(matching, key=lambda x: int(x.get("odds", -9999)))
    worst = min(matching, key=lambda x: int(x.get("odds", 9999)))

    best_odds = int(best.get("odds", 0))
    worst_odds = int(worst.get("odds", 0))
    line_shop_value = best_odds - worst_odds

    sharp_matches = [
        item for item in matching
        if item.get("sportsbook") in sharp_books
    ]

    if sharp_matches:
        sharpest = max(sharp_matches, key=lambda x: int(x.get("odds", -9999)))
    else:
        sharpest = best

    if line_shop_value >= 25:
        line_disagreement = "High"
    elif line_shop_value >= 10:
        line_disagreement = "Moderate"
    else:
        line_disagreement = "Low"

    stale_line = line_shop_value >= 20 and best.get("sportsbook") not in sharp_books

    if stale_line:
        sportsbook_note = (
            "Possible stale line detected. Best price is meaningfully better "
            "than the rest of the market."
        )
    elif line_shop_value >= 10:
        sportsbook_note = (
            "Line shopping value available. Best price offers a meaningful "
            "edge over the worst listed book."
        )
    else:
        sportsbook_note = "Market prices are mostly aligned across books."

    return {
        "best_sportsbook": best.get("sportsbook"),
        "best_odds": best.get("odds"),
        "worst_odds": worst.get("odds"),
        "book_count": len(matching),
        "line_shop_value": line_shop_value,
        "line_disagreement": line_disagreement,
        "sharpest_sportsbook": sharpest.get("sportsbook"),
        "stale_line": stale_line,
        "sportsbook_note": sportsbook_note,
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

def get_live_clv_tracker(opening_odds, current_odds, edge, recommendation):
    movement = american_odds_movement(opening_odds, current_odds)

    clv_direction = "Neutral"
    clv_grade = "C"
    clv_strength = 0

    if movement <= -30:
        clv_direction = "Strong Positive CLV"
        clv_grade = "A"
        clv_strength = abs(movement)
    elif movement <= -15:
        clv_direction = "Positive CLV"
        clv_grade = "B"
        clv_strength = abs(movement)
    elif movement >= 30:
        clv_direction = "Strong Negative CLV"
        clv_grade = "F"
        clv_strength = -abs(movement)
    elif movement >= 15:
        clv_direction = "Negative CLV"
        clv_grade = "D"
        clv_strength = -abs(movement)

    model_validated = False

    if clv_strength > 0 and edge >= 2 and recommendation in ["Play", "Lean"]:
        model_validated = True

    if clv_strength < 0 and recommendation == "Play":
        clv_grade = "Risk"

    return {
        "live_clv_direction": clv_direction,
        "live_clv_grade": clv_grade,
        "live_clv_strength": clv_strength,
        "model_validated_by_market": model_validated,
        "clv_movement": movement,
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


def get_top_play_score(play):
    score = 0

    try:
        score += float(play.get("edge", 0)) * 1.5
    except Exception:
        pass

    try:
        score += float(play.get("sharp_score", 0)) * 2
    except Exception:
        pass

    if play.get("recommendation") == "Play":
        score += 5
    elif play.get("recommendation") == "Lean":
        score += 2

    if play.get("clv_status") == "Positive CLV":
        score += 3
    elif play.get("clv_status") == "Negative CLV":
        score -= 3

    if play.get("line_signal") == "Steam Toward Pick":
        score += 2
    elif play.get("line_signal") == "Price Drift":
        score -= 2

    if play.get("market_strength") == "Strong":
        score += 3
    elif play.get("market_strength") == "Moderate":
        score += 1
    elif play.get("market_strength") == "Weak":
        score -= 2

    return round(score, 2)

def get_model_learning_boost(play):
    db = SessionLocal()

    def safe_float(value, default=0):
        try:
            if value in [None, ""]:
                return default
            return float(value)
        except Exception:
            return default

    def score_bucket(field, value):
        records = db.query(ModelPlayHistory).filter(
            ModelPlayHistory.sport == "MLB",
            ModelPlayHistory.result.in_(["Win", "Loss"]),
            getattr(ModelPlayHistory, field) == str(value),
        ).all()

        graded = len(records)

        if graded < 3:
            return 0

        wins = len([r for r in records if r.result == "Win"])
        units = sum(safe_float(r.units_result) for r in records)
        win_rate = wins / graded

        boost = 0

        if win_rate >= 0.60:
            boost += 2
        elif win_rate <= 0.45:
            boost -= 2

        if units >= 2:
            boost += 1
        elif units <= -2:
            boost -= 1

        return boost

    try:
        total_boost = 0

        total_boost += score_bucket(
            "market",
            play.get("market", "")
        )

        total_boost += score_bucket(
            "recommendation",
            play.get("recommendation", "")
        )

        total_boost += score_bucket(
            "sharp_signal",
            play.get("sharp_signal", "")
        )

        total_boost += score_bucket(
            "clv_status",
            play.get("clv_status", "")
        )

        total_boost += score_bucket(
            "steam_strength",
            play.get("steam_strength", "")
        )

        total_boost = max(-6, min(8, total_boost))

        return round(total_boost, 2)

    finally:
        db.close()

def get_pitcher_change_protection(play):
    probable_pitchers = get_mlb_probable_pitchers()

    game = str(play.get("game", ""))

    away_saved = play.get("away_starter")
    home_saved = play.get("home_starter")

    if " vs " not in game:
        return {
            "pitcher_status": "Unknown",
            "pitcher_change_detected": False,
        }

    away_team, home_team = game.split(" vs ")

    current_away = probable_pitchers.get(
        away_team,
        {}
    ).get("pitcher")

    current_home = probable_pitchers.get(
        home_team,
        {}
    ).get("pitcher")

    changes = []

    if (
        away_saved
        and current_away
        and away_saved != current_away
    ):
        changes.append(
            f"{away_team}: {away_saved} changed to {current_away}"
        )

    if (
        home_saved
        and current_home
        and home_saved != current_home
    ):
        changes.append(
            f"{home_team}: {home_saved} changed to {current_home}"
        )

    if changes:
        return {
            "pitcher_status": "Changed",
            "pitcher_change_detected": True,
            "pitcher_change_note": changes,
        }

    return {
        "pitcher_status": "Confirmed",
        "pitcher_change_detected": False,
        "pitcher_change_note": [],
    }

def get_lineup_reaction_signal(play):
    confirmed_lineups = get_live_confirmed_lineups()

    game = str(play.get("game", ""))

    if " vs " not in game:
        return {
            "lineup_reaction_signal": "Unknown",
            "lineup_reaction_score": 0,
            "lineup_reaction_note": [],
        }

    away_team, home_team = game.split(" vs ")

    saved_strength = play.get("lineup_strength")

    try:
        saved_strength = float(saved_strength)
    except Exception:
        saved_strength = None

    away_current = get_confirmed_lineup_strength(
        away_team,
        confirmed_lineups
    )

    home_current = get_confirmed_lineup_strength(
        home_team,
        confirmed_lineups
    )

    notes = []
    score = 0

    away_confirmed = away_current.get("lineup_confirmed", False)
    home_confirmed = home_current.get("lineup_confirmed", False)

    if not away_confirmed and not home_confirmed:
        return {
            "lineup_reaction_signal": "Projected",
            "lineup_reaction_score": 0,
            "lineup_reaction_note": [
                "Confirmed lineups not available yet."
            ],
        }

    current_strength = None

    pick = str(play.get("pick", ""))

    if away_team in pick:
        current_strength = away_current.get("lineup_strength", 75)
    elif home_team in pick:
        current_strength = home_current.get("lineup_strength", 75)
    else:
        current_strength = (
            away_current.get("lineup_strength", 75)
            + home_current.get("lineup_strength", 75)
        ) / 2

    if saved_strength is not None:
        diff = current_strength - saved_strength

        if diff <= -8:
            score -= 6
            notes.append(
                f"Confirmed lineup is much weaker than projection ({round(diff, 1)})."
            )
        elif diff <= -4:
            score -= 3
            notes.append(
                f"Confirmed lineup is weaker than projection ({round(diff, 1)})."
            )
        elif diff >= 6:
            score += 3
            notes.append(
                f"Confirmed lineup is stronger than projection (+{round(diff, 1)})."
            )
        else:
            notes.append("Confirmed lineup is close to projection.")

    if current_strength >= 84:
        signal = "Lineup Upgrade"
    elif current_strength <= 70:
        signal = "Lineup Downgrade"
        score -= 3
    else:
        signal = "Lineup Stable"

    return {
        "lineup_reaction_signal": signal,
        "lineup_reaction_score": score,
        "lineup_reaction_current_strength": round(current_strength, 2),
        "lineup_reaction_note": notes,
    }

def get_market_timing_signal(play):
    score = 0
    reasons = []

    clv_status = play.get("clv_status")
    steam_strength = play.get("steam_strength")
    line_signal = play.get("line_signal")
    sharp_signal = play.get("sharp_signal")
    market_disagreement = play.get("market_disagreement")
    stale_line = play.get("stale_line")
    late_sharp_action = play.get("late_sharp_action")
    reverse_line_movement = play.get("reverse_line_movement")
    fake_steam_risk = play.get("fake_steam_risk")

    if clv_status == "Positive CLV":
        score += 3
        reasons.append("Positive CLV supports entering now.")
    elif clv_status == "Negative CLV":
        score -= 3
        reasons.append("Negative CLV suggests the best number may be gone.")

    if steam_strength == "High":
        score += 2
        reasons.append("Strong steam detected.")
    elif steam_strength == "Low":
        score += 0

    if line_signal in ["Sharp Move", "Market Moving Toward Model"]:
        score += 2
        reasons.append("Line movement supports the model side.")
    elif line_signal in ["Market Moving Away", "Bad Move"]:
        score -= 2
        reasons.append("Line movement is working against the model side.")

    if sharp_signal in ["Sharp Play", "Value Watch"]:
        score += 2
        reasons.append("Sharp signal supports the play.")

    if market_disagreement in ["High", "Moderate"]:
        score += 1
        reasons.append("Sportsbooks show price disagreement; line shopping matters.")

    if stale_line:
        score += 2
        reasons.append("Potential stale line opportunity detected.")

    if late_sharp_action:
        score += 2
        reasons.append("Late sharp action supports quick entry.")

    if reverse_line_movement:
        score += 1
        reasons.append("Reverse line movement detected.")

    if fake_steam_risk:
        score -= 3
        reasons.append("Fake steam risk detected.")

    try:
        edge = float(play.get("edge", 0))
    except Exception:
        edge = 0

    if edge >= 5:
        score += 2
        reasons.append("Strong model edge.")
    elif edge < 2:
        score -= 2
        reasons.append("Limited model edge.")

    if score >= 5:
        timing = "Bet Now"
    elif score >= 1:
        timing = "Wait / Line Shop"
    else:
        timing = "Avoid / No Rush"

    return {
        "market_timing_signal": timing,
        "market_timing_score": score,
        "market_timing_reasons": reasons,
    }

def get_auto_pod_score(play):
    score = 0

    try:
        score += float(play.get("edge", 0)) * 2
    except Exception:
        pass

    try:
        score += float(play.get("confidence", 0)) * 0.35
    except Exception:
        pass

    recommendation = play.get("recommendation")

    if recommendation == "Play":
        score += 12
    elif recommendation == "Lean":
        score += 5
    elif recommendation == "Pass":
        score -= 20

    if play.get("sharp_signal") in ["Sharp Play", "Value Watch"]:
        score += 6

    if play.get("sharp_book_signal") == "Sharp Influenced":
        score += 3

    if play.get("clv_status") == "Positive CLV":
        score += 5
    elif play.get("clv_status") == "Negative CLV":
        score -= 4

    if play.get("steam_strength") == "High":
        score += 3

    if play.get("bvp_signal") in ["Elite Hitter Advantage", "Hitter Edge"]:
        score += 3

    if play.get("high_leverage_risk") in ["High", "Very High"]:
        score -= 3

    if play.get("weather_risk") in ["High wind risk", "Weather risk"]:
        score -= 3

    try:
        score += float(play.get("line_shop_value", 0)) * 0.25
    except Exception:
        pass

    market = play.get("market")

    if market == "Run Line":
        score += 1
    elif market == "Moneyline":
        score += 2
    elif market == "Total":
        score += 0.5
    elif market == "F5 Moneyline":
        score += 1.5
    elif market == "NRFI/YRFI":
        score += 1

    pitcher_check = get_pitcher_change_protection(play)
    play.update(pitcher_check)

    if pitcher_check.get("pitcher_change_detected"):
        score -= 50
        play["recommendation"] = "VOID - Pitcher Change"

    lineup_reaction = get_lineup_reaction_signal(play)
    play.update(lineup_reaction)
    score += lineup_reaction.get("lineup_reaction_score", 0)

    timing_data = get_market_timing_signal(play)
    play.update(timing_data)

    if timing_data.get("market_timing_signal") == "Bet Now":
        score += 4
    elif timing_data.get("market_timing_signal") == "Wait / Line Shop":
        score += 1
    else:
        score -= 4

    learning_boost = get_model_learning_boost(play)
    play["learning_boost"] = learning_boost
    score += learning_boost

    return round(score, 2)


@app.get("/model/mlb/play-of-the-day")
def model_mlb_play_of_the_day():
    candidates = []

    full_game = model_mlb_today()
    f5 = model_mlb_f5_today()
    nrfi = model_mlb_nrfi_today()

    for play in full_game.get("plays", []):
        if play.get("recommendation") in ["Play", "Lean"]:
            candidates.append(play)

    for play in f5.get("plays", []):
        if play.get("recommendation") in ["Play", "Lean"]:
            candidates.append(play)

    for play in nrfi.get("plays", []):
        if play.get("recommendation") in ["NRFI", "YRFI", "Play", "Lean"]:
            candidates.append(play)

    if not candidates:
        return {
            "play_of_the_day": None,
            "candidates": [],
            "message": "No qualified MLB play of the day found."
        }

    for play in candidates:
        play["auto_pod_score"] = get_auto_pod_score(play)

    candidates = sorted(
        candidates,
        key=lambda x: x.get("auto_pod_score", 0),
        reverse=True
    )

    top = candidates[0]

    return {
        "play_of_the_day": top,
        "candidates": candidates[:10],
        "count": len(candidates),
        "model_version": "mlb_auto_pod_v1"
    }

@app.get("/model/mlb/today")
def model_mlb_today():
    cached = get_cache("mlb_model_v2")

    if cached:
        return {"plays": cached}

    odds_api_key = os.getenv("ODDS_API_KEY")

    if not odds_api_key:
        return {"plays": [], "error": "Missing ODDS_API_KEY"}

    url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds"

    commence_from, commence_to = get_today_utc_window()

    params = {
        "apiKey": odds_api_key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
        "commenceTimeFrom": commence_from,
        "commenceTimeTo": commence_to,
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            if cached:
                return {"plays": cached, "cached": True}
            return {"plays": [], "error": response.text}

        games = response.json()

        probable_pitchers = get_mlb_probable_pitchers()
        team_hitting_stats = get_mlb_team_hitting_stats()
        confirmed_lineups = get_live_confirmed_lineups()
        live_statcast_pitching = get_live_statcast_pitching_profiles()
        live_umpires = get_live_mlb_umpires()
        auto_bullpen_data = get_auto_bullpen_data()
        plays = []

        for game in games:
            if game_has_started(game):
                continue
            
            if game_has_started(game):
                continue

            game_name = (
                f"{game.get('away_team')} vs "
                f"{game.get('home_team')}"
            )

            game["home_plate_umpire"] = live_umpires.get(game_name)
            game_name = f"{game.get('away_team')} vs {game.get('home_team')}"

            for bookmaker in game.get("bookmakers", []):
                sportsbook = bookmaker.get("title")

                sharp_book_data = get_sharp_sportsbook_weight(sportsbook)
                book_weight_adjustment = sharp_book_data.get(
                    "book_weight_adjustment",
                    0
                )
                
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
                        statcast_pitching = (
                            get_statcast_pitching_profile(
                            pitcher_name,
                            live_statcast_pitching
                        )
                        )

                        statcast_pitching_rating = (
                            statcast_pitching.get(
                                "statcast_pitching_rating",
                                75
                            )
                        )

                        statcast_pitching_adjustment = (
                            statcast_pitching.get(
                                "statcast_pitching_adjustment",
                                0
                            )
                        )
                        lineup_data = get_confirmed_lineup_strength(
                            team_name,
                            confirmed_lineups
                        )
                        lineup_adjustment = lineup_data.get("lineup_adjustment", 0)
                        pitcher_hand = "R"

                        if pitcher_name and pitcher_name != "TBD":
                            if "LHP" in pitcher_name.upper():
                                pitcher_hand = "L"

                        split_rating = get_team_handedness_split_rating(
                            team_name,
                            pitcher_hand
                        )

                        split_adjustment = round(
                            (split_rating - 75) * 0.05,
                            2
                        )

                        hitting_data = team_hitting_stats.get(
                            team_name,
                            {
                                "avg": "0",
                                "ops": "0",
                                "runs_per_game": 0,
                                "hitting_rating": 75
                            }
                        )

                        hitting_rating = hitting_data.get("hitting_rating", 75)
                        hitting_adjustment = round(
                            ((hitting_rating - 75) * 0.06)
                            + split_adjustment,
                            2
                        )

                        opponent_team = (
                            home_team if team_name == away_team else away_team
                        )

                        opponent_pitcher = probable_pitchers.get(
                            opponent_team,
                            {
                                "pitcher": "TBD",
                                "era": 0.00,
                                "whip": 0.00,
                                "rating": 75,
                            }
                        )

                        bvp_data = get_batter_vs_pitcher_matchup(
                            team_name,
                            opponent_pitcher,
                            team_hitting_stats
                        )

                        bvp_adjustment = bvp_data.get("bvp_adjustment", 0)

                        statcast_data = get_team_statcast_power_rating(
                            team_name
                        )

                        statcast_power_rating = (
                            statcast_data.get(
                                "statcast_power_rating",
                                75
                            )
                        )

                        statcast_power_adjustment = (
                            statcast_data.get(
                                "statcast_power_adjustment",
                                0
                            )
                        )

                        bullpen_data = auto_bullpen_data.get(
                            team_name,
                            get_mlb_bullpen_data(team_name)
                        )

                        bullpen_fatigue = bullpen_data.get("fatigue")
                        bullpen_era = bullpen_data.get("bullpen_era")
                        bullpen_status = bullpen_data.get("status")

                        bullpen_availability = get_bullpen_availability_score(
                            team_name,
                            bullpen_data
                        )

                        bullpen_availability_adjustment = (
                            bullpen_availability.get(
                                "bullpen_availability_adjustment",
                                0
                            )
                        )

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

                        umpire_data = get_umpire_engine_adjustment(
                            game,
                            market_key
                        )

                        umpire_adjustment = (
                            umpire_data.get(
                                "umpire_adjustment",
                                0
                            )
                        )

                        market_consensus = get_market_consensus_data(
                            game,
                            market_key,
                            outcome.get("name")
                        )

                        consensus_adjustment = 0

                        if market_consensus.get(
                            "stale_line_opportunity"
                        ):
                            consensus_adjustment += 0.4

                        if market_consensus.get(
                            "market_disagreement"
                        ) == "High":
                            consensus_adjustment += 0.3

                        totals_engine = get_mlb_totals_engine_adjustment(
                            game,
                            team_hitting_stats
                        )

                        totals_engine_adjustment = (
                            totals_engine.get(
                                "totals_engine_adjustment",
                                0
                            )
                        )

                        edge_boost = (
                            pitcher_diff.get("pitcher_diff_adj", 0)
                            + market_adj
                            + weather_adj
                            + umpire_adjustment
                            + hitting_adjustment
                            + bvp_adjustment
                            + statcast_power_adjustment
                            + statcast_pitching_adjustment
                            + lineup_adjustment
                            + bullpen_availability_adjustment
                            + consensus_adjustment
                            + book_weight_adjustment
                        )

                        if market_key in ["totals", "alternate_totals"]:
                            edge_boost += totals_engine_adjustment

                        if bullpen_fatigue >= 3:
                            edge_boost -= 0.5

                        market_name = ""
                        pick_name = ""

                        if market_key == "h2h":
                            market_name = "Moneyline"
                            pick_name = team_name

                        elif market_key in ["spreads", "alternate_spreads"]:
                            point = outcome.get("point")

                            if point is None:
                                continue

                            if abs(float(point)) > 1.5:
                                continue

                            # Require stronger value for run lines
                            market_adj -= 1.25

                            # Extra discipline on favorite -1.5
                            if float(point) < 0:
                                market_adj -= 1.25

                            market_name = "Run Line"
                            pick_name = f"{team_name} {float(point):+}"

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

                        clv_tracker = get_live_clv_tracker(
                            opening_odds,
                            current_odds,
                            edge,
                            recommendation
                        )

                        # CLV + sharp score combo filter
                        reason_filter = ""

                        if (
                            clv_data.get("clv_status") == "Negative CLV"
                            and sharp_data.get("sharp_score", 0) <= 2
                            and edge < 4
                        ):
                            recommendation = "Pass"

                            reason_filter = (
                                "Market signals are weak due to negative CLV, "
                                "limited sharp support, and low edge."
                            )

                        reason = (
                            f"Starting pitcher: {pitcher_name}. "
                            f"(ERA {pitcher_era}, WHIP {pitcher_whip}, Rating {pitcher_rating}). "
                            f"Bullpen: {bullpen_status}. "
                            f"Bullpen fatigue: {bullpen_fatigue}. "
                            f"Bullpen availability: {bullpen_availability.get('bullpen_availability_score')} "
                            f"({bullpen_availability.get('high_leverage_risk')} leverage risk). "
                            f"Pitcher rating differential: {pitcher_diff.get('rating_diff')}. "
                            f"Umpire adjustment ({umpire_adjustment}). "
                            f"Pitcher differential adjustment ({pitcher_diff.get('pitcher_diff_adj')}). "
                            f"Statcast pitching adjustment ({statcast_pitching_adjustment}). "
                            f"Market adjustment ({round(market_adj, 2)}). "
                            f"Consensus adjustment ({consensus_adjustment}). "
                            f"Market disagreement: {market_consensus.get('market_disagreement')}. "
                            f"Hitting adjustment ({hitting_adjustment}). "
                            f"Statcast power adjustment ({statcast_power_adjustment}). "
                            f"Lineup strength: {lineup_data.get('lineup_status')} "
                            f"({lineup_data.get('lineup_strength')}). "
                            f"Split rating vs {pitcher_hand}HP ({split_rating}). "
                            f"Weather/Park adjustment ({weather_adj}). "
                            f"Totals engine adjustment ({totals_engine_adjustment}). "
                            f"Ballpark: {weather_data.get('park')} - {weather_data.get('weather_risk')}."
                            f" {reason_filter}"
                        )

                        plays.append({
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "sharp_book_score": sharp_book_data.get("sharp_book_score"),
                            "sharp_book_signal": sharp_book_data.get("sharp_book_signal"),
                            "book_weight_adjustment": book_weight_adjustment,
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
                            "steam_strength": line_data.get("steam_strength"),
                            "reverse_line_movement": line_data.get("reverse_line_movement"),
                            "fake_steam_risk": line_data.get("fake_steam_risk"),
                            "late_sharp_action": line_data.get("late_sharp_action"),
                            "steam_note": line_data.get("steam_note"),
                            "clv_status": clv_data.get("clv_status"),
                            "clv_score": clv_data.get("clv_score"),
                            "clv_reason": clv_data.get("clv_reason"),
                            "live_clv_direction": clv_tracker.get("live_clv_direction"),
                            "live_clv_grade": clv_tracker.get("live_clv_grade"),
                            "live_clv_strength": clv_tracker.get("live_clv_strength"),
                            "model_validated_by_market": clv_tracker.get("model_validated_by_market"),
                            "clv_movement": clv_tracker.get("clv_movement"),
                            "model_version": "mlb_v3_pitcher_edge",
                            "umpire": umpire_data.get("umpire"),
                            "umpire_adjustment": umpire_adjustment,
                            "umpire_runs_rating": umpire_data.get("umpire_runs_rating"),
                            "umpire_zone_rating": umpire_data.get("umpire_zone_rating"),
                            "umpire_lean": umpire_data.get("umpire_lean"),
                            "starting_pitcher": pitcher_name,
                            "pitcher_era": pitcher_era,
                            "pitcher_whip": pitcher_whip,
                            "pitcher_rating": pitcher_rating,
                            "statcast_pitching_rating": statcast_pitching_rating,
                            "statcast_pitching_adjustment": statcast_pitching_adjustment,
                            "statcast_source": statcast_pitching.get("statcast_source", "static"),
                            "xera_rating": statcast_pitching.get("xera_rating"),
                            "whiff_rating": statcast_pitching.get("whiff_rating"),
                            "k_rating": statcast_pitching.get("k_rating"),
                            "hard_hit_allowed_rating": statcast_pitching.get("hard_hit_allowed_rating"),
                            "barrel_allowed_rating": statcast_pitching.get("barrel_allowed_rating"),
                            "hitting_avg": hitting_data.get("avg"),
                            "hitting_ops": hitting_data.get("ops"),
                            "runs_per_game": hitting_data.get("runs_per_game"),
                            "hitting_rating": hitting_rating,
                            "bvp_rating": bvp_data.get("bvp_rating"),
                            "bvp_adjustment": bvp_adjustment,
                            "bvp_signal": bvp_data.get("bvp_signal"),
                            "pitcher_hand": pitcher_hand,
                            "split_rating": split_rating,
                            "hitting_adjustment": hitting_adjustment,
                            "statcast_power_rating": statcast_power_rating,
                            "statcast_power_adjustment": statcast_power_adjustment,
                            "hard_hit_rating": statcast_data.get("hard_hit_rating"),
                            "barrel_rating": statcast_data.get("barrel_rating"),
                            "xwoba_rating": statcast_data.get("xwoba_rating"),
                            "xslg_rating": statcast_data.get("xslg_rating"),
                            "lineup_status": lineup_data.get("lineup_status"),
                            "lineup_strength": lineup_data.get("lineup_strength"),
                            "lineup_adjustment": lineup_adjustment,
                            "lineup_confirmed": lineup_data.get("lineup_confirmed"),
                            "lineup_version": lineup_data.get("lineup_version"),
                            "lineup_confidence": lineup_data.get("lineup_confidence"),
                            "lineup_depth_score": lineup_data.get("lineup_depth_score"),
                            "star_power_score": lineup_data.get("star_power_score"),
                            "missing_stars": lineup_data.get("missing_stars"),
                            "top_order_strength": lineup_data.get("top_order_strength"),
                            "backup_catcher": lineup_data.get("backup_catcher"),
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
                            "consensus_adjustment": consensus_adjustment,
                            "consensus_price": market_consensus.get("consensus_price"),
                            "best_price": market_consensus.get("best_price"),
                            "worst_price": market_consensus.get("worst_price"),
                            "best_book": market_consensus.get("best_book"),
                            "worst_book": market_consensus.get("worst_book"),
                            "market_spread": market_consensus.get("market_spread"),
                            "market_disagreement": market_consensus.get("market_disagreement"),
                            "stale_line_opportunity": market_consensus.get("stale_line_opportunity"),
                            "consensus_book_count": market_consensus.get("consensus_book_count"),
                            "weather_adjustment": weather_adj,
                            "totals_engine_adjustment": totals_engine_adjustment,
                            "combined_lineup_strength": totals_engine.get("combined_lineup_strength"),
                            "combined_hitting_rating": totals_engine.get("combined_hitting_rating"),
                            "combined_bullpen_adjustment": totals_engine.get("combined_bullpen_adjustment"),
                            "ballpark": weather_data.get("park"),
                            "run_factor": weather_data.get("run_factor"),
                            "hr_factor": weather_data.get("hr_factor"),
                            "weather_risk": weather_data.get("weather_risk"),
                            "bullpen_fatigue": bullpen_fatigue,
                            "bullpen_era": bullpen_era,
                            "bullpen_status": bullpen_status,
                            "bullpen_availability_score": bullpen_availability.get("bullpen_availability_score"),
                            "bullpen_availability_adjustment": bullpen_availability_adjustment,
                            "unavailable_arms_estimate": bullpen_availability.get("unavailable_arms_estimate"),
                            "high_leverage_risk": bullpen_availability.get("high_leverage_risk"),
                            "innings_last_3_estimate": bullpen_availability.get("innings_last_3_estimate"),
                            "closer_back_to_back_risk": bullpen_availability.get("closer_back_to_back_risk"),
                            "setup_back_to_back_risk": bullpen_availability.get("setup_back_to_back_risk"),
                            "closer_available": bullpen_availability.get("closer_available"),
                            "setup_available": bullpen_availability.get("setup_available"),
                            "top_relievers_available": bullpen_availability.get("top_relievers_available"),
                            "multi_inning_relief_risk": bullpen_availability.get("multi_inning_relief_risk"),
                            "three_in_four_risk": bullpen_availability.get("three_in_four_risk"),
                            "reason": reason
                        })

        best_by_game_market = {}

        for play in plays:
            game = play.get("game")
            market = play.get("market")

            key = f"{game}|{market}"

            if key not in best_by_game_market:
                best_by_game_market[key] = play
            else:
                current_best = best_by_game_market[key]

                if play.get("edge", 0) > current_best.get("edge", 0):
                    best_by_game_market[key] = play


        final = list(best_by_game_market.values())


        for play in final:
            price_data = get_best_sportsbook_price(play, plays)

            play["best_sportsbook"] = price_data["best_sportsbook"]
            play["best_odds"] = price_data["best_odds"]
            play["worst_odds"] = price_data["worst_odds"]
            play["book_count"] = price_data["book_count"]
            play["line_shop_value"] = price_data["line_shop_value"]
            play["line_disagreement"] = price_data["line_disagreement"]
            play["sharpest_sportsbook"] = price_data["sharpest_sportsbook"]
            play["stale_line"] = price_data["stale_line"]
            play["sportsbook_note"] = price_data["sportsbook_note"]

            play["top_play_score"] = get_top_play_score(play)


        final = sorted(
            final,
            key=lambda x: x.get("top_play_score", 0),
            reverse=True
        )

        top_play = final[0] if final else None

        final = sorted(
            final,
            key=lambda x: x["edge"],
            reverse=True
        )
    
        save_model_play_history("MLB", final)

        return {
            "top_play": top_play,
            "plays": final
        }

    
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
    if cached:
        return {
        "plays": cached,
        "cached": True
    }

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

    f5_markets = "h2h_1st_5_innings,h2h_3_way_1st_5_innings,spreads_1st_5_innings,totals_1st_5_innings"

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
        confirmed_lineups = get_live_confirmed_lineups()
        live_statcast_pitching = {}
        plays = []

        for game in games:
            if not game_is_today(game):
                continue

            if game_has_started(game):
                continue

            if game_has_started(game):
                continue

            game_name = (
                f"{game.get('away_team')} vs "
                f"{game.get('home_team')}"
            )

            for bookmaker in game.get("bookmakers", []):
                sportsbook = bookmaker.get("title")

                sharp_book_data = get_sharp_sportsbook_weight(sportsbook)
                book_weight_adjustment = sharp_book_data.get(
                    "book_weight_adjustment",
                    0
                )

                for market in bookmaker.get("markets", []):
                    market_key = market.get("key")

                    for outcome in market.get("outcomes", []):
                        odds = outcome.get("price")

                        if odds is None:
                            continue

                        implied = american_to_implied_probability(odds)

                        team_name = outcome.get("name")

                        if market_key in ["h2h_1st_5_innings", "h2h_3_way_1st_5_innings"]:
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
                        statcast_pitching = (
                            get_statcast_pitching_profile(
                                pitcher_name,
                                live_statcast_pitching
                            )
                        )

                        statcast_pitching_adjustment = (
                            statcast_pitching.get(
                                "statcast_pitching_adjustment",
                                0
                            )
                        )
                        lineup_data = get_confirmed_lineup_strength(
                            team_name,
                            confirmed_lineups
                        )
                        lineup_adjustment = lineup_data.get("lineup_adjustment", 0)

                        bullpen_data = get_mlb_bullpen_data(team_name)

                        bullpen_availability = get_bullpen_availability_score(
                            team_name,
                            bullpen_data
                        )

                        bullpen_availability_adjustment = (
                            bullpen_availability.get(
                                "bullpen_availability_adjustment",
                                0
                            )
                        )

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

                        umpire_data = get_umpire_engine_adjustment(
                            game,
                            "nrfi"
                        )

                        umpire_adjustment = umpire_data.get("umpire_adjustment", 0)

                        pitcher_adj = (
                            pitcher_diff.get(
                                "pitcher_diff_adj",
                                0
                            ) * 1.35
                        )

                        price_adj = get_price_adjustment(odds)

                        opponent_team = (
                            game.get("home_team")
                            if team_name == game.get("away_team")
                            else game.get("away_team")
                        )

                        opponent_pitcher = probable_pitchers.get(
                            opponent_team,
                            {
                                "pitcher": "TBD",
                                "era": 0.00,
                                "whip": 0.00,
                                "rating": 75,
                            }
                        )

                        bvp_data = get_batter_vs_pitcher_matchup(
                            team_name,
                            opponent_pitcher,
                            get_mlb_team_hitting_stats()
                        )

                        bvp_adjustment = bvp_data.get("bvp_adjustment", 0)

                        edge_boost = (
                                pitcher_adj
                                + bvp_adjustment
                                + statcast_pitching_adjustment
                                + price_adj
                                + (weather_adj * 0.5)
                                + lineup_adjustment
                                + bullpen_availability_adjustment
                                + book_weight_adjustment
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
                            f"Lineup strength: {lineup_data.get('lineup_status')} "
                            f"({lineup_data.get('lineup_strength')}). "
                            f"Bullpen availability: "
                            f"{bullpen_availability.get('bullpen_availability_score')} "
                            f"({bullpen_availability.get('high_leverage_risk')} risk). "
                            f"({round(price_adj, 2)}). "
                            f"Weather/Park adjustment "
                            f"({round(weather_adj * 0.5, 2)})."
                        )

                        plays.append({
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "sharp_book_score": sharp_book_data.get("sharp_book_score"),
                            "sharp_book_signal": sharp_book_data.get("sharp_book_signal"),
                            "book_weight_adjustment": book_weight_adjustment,
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
                            "bvp_rating": bvp_data.get("bvp_rating"),
                            "bvp_adjustment": bvp_adjustment,
                            "bvp_signal": bvp_data.get("bvp_signal"),
                            "lineup_status": lineup_data.get("lineup_status"),
                            "lineup_strength": lineup_data.get("lineup_strength"),
                            "lineup_adjustment": lineup_adjustment,
                            "lineup_confirmed": lineup_data.get("lineup_confirmed"),
                            "lineup_version": lineup_data.get("lineup_version"),
                            "lineup_confidence": lineup_data.get("lineup_confidence"),
                            "lineup_depth_score": lineup_data.get("lineup_depth_score"),
                            "star_power_score": lineup_data.get("star_power_score"),
                            "missing_stars": lineup_data.get("missing_stars"),
                            "top_order_strength": lineup_data.get("top_order_strength"),
                            "backup_catcher": lineup_data.get("backup_catcher"),
                            "bullpen_availability_score": bullpen_availability.get("bullpen_availability_score"),
                            "bullpen_availability_adjustment": bullpen_availability_adjustment,
                            "unavailable_arms_estimate": bullpen_availability.get("unavailable_arms_estimate"),
                            "high_leverage_risk": bullpen_availability.get("high_leverage_risk"),
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

        save_model_play_history("MLB", final)

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
    if cached:
        return {
            "plays": cached,
            "cached": True
        }

    try:
        today = date.today().isoformat()

        schedule_response = requests.get(
            "https://statsapi.mlb.com/api/v1/schedule",
            params={
                "sportId": 1,
                "date": today,
                "hydrate": "probablePitcher",
            },
            timeout=10
        )

        if schedule_response.status_code != 200:
            if cached:
                return {
                    "plays": cached,
                    "cached": True,
                    "error": schedule_response.text
                }

            return {
                "plays": [],
                "error": schedule_response.text
            }

        schedule_data = schedule_response.json()

        games = []

        for day in schedule_data.get("dates", []):
            for schedule_game in day.get("games", []):
                teams = schedule_game.get("teams", {})

                away_team = teams.get("away", {}).get("team", {}).get("name")
                home_team = teams.get("home", {}).get("team", {}).get("name")

                if not away_team or not home_team:
                    continue

                games.append({
                    "away_team": away_team,
                    "home_team": home_team,
                })

            probable_pitchers = get_mlb_probable_pitchers()
            team_hitting_stats = get_mlb_team_hitting_stats()
            confirmed_lineups = get_live_confirmed_lineups()
            live_statcast_pitching = {}
            live_umpires = get_live_mlb_umpires()

        plays = []

        for game in games:
            game_name = (
                f"{game.get('away_team')} vs "
                f"{game.get('home_team')}"
            )

            projection = get_nrfi_yrfi_projection(
                game,
                probable_pitchers,
                team_hitting_stats,
                confirmed_lineups,
                live_statcast_pitching
            )

            projection["market"] = "NRFI/YRFI"
            projection["pick"] = projection.get("recommendation", "Pass")
            projection["sportsbook"] = "Model"
            projection["odds"] = ""

            plays.append(projection)

        final = sorted(
            plays,
            key=lambda x: x["confidence"],
            reverse=True
        )

        save_model_play_history("MLB", final)

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
    
def save_model_play_history(sport, plays):
    db = SessionLocal()

    try:
        today = str(date.today())

        for play in plays:
            existing = db.query(ModelPlayHistory).filter(
                ModelPlayHistory.date == today,
                ModelPlayHistory.sport == sport,
                ModelPlayHistory.game == str(play.get("game", "")),
                ModelPlayHistory.pick == str(play.get("pick", "")),
                ModelPlayHistory.market == str(play.get("market", "")),
                ModelPlayHistory.sportsbook == str(play.get("sportsbook", "")),
            ).first()

            if existing:
                continue

            history = ModelPlayHistory(
                date=today,
                sport=sport,
                game=str(play.get("game", "")),
                pick=str(play.get("pick", "")),
                market=str(play.get("market", "")),
                sportsbook=str(play.get("sportsbook", "")),
                odds=str(play.get("odds", "")),
                edge=str(play.get("edge", "")),
                confidence=str(play.get("confidence", "")),
                recommendation=str(play.get("recommendation", "")),
                top_play_score=str(play.get("top_play_score", "")),
                sharp_signal=str(play.get("sharp_signal", "")),
                steam_strength=str(play.get("steam_strength", "")),
                line_disagreement=str(play.get("line_disagreement", "")),
                line_shop_value=str(play.get("line_shop_value", "")),
                clv_status=str(play.get("clv_status", "")),
                clv_score=str(play.get("clv_score", "")),
                live_clv_grade=str(play.get("live_clv_grade", "")),
                model_validated_by_market=str(play.get("model_validated_by_market", "")),

                pitcher_rating_diff=str(play.get("pitcher_rating_diff", "")),
                pitcher_diff_adjustment=str(play.get("pitcher_diff_adjustment", "")),
                statcast_pitching_rating=str(play.get("statcast_pitching_rating", "")),
                statcast_pitching_adjustment=str(play.get("statcast_pitching_adjustment", "")),

                statcast_power_rating=str(play.get("statcast_power_rating", "")),
                statcast_power_adjustment=str(play.get("statcast_power_adjustment", "")),
                hitting_rating=str(play.get("hitting_rating", "")),
                hitting_adjustment=str(play.get("hitting_adjustment", "")),

                bullpen_availability_score=str(play.get("bullpen_availability_score", "")),
                bullpen_availability_adjustment=str(play.get("bullpen_availability_adjustment", "")),
                high_leverage_risk=str(play.get("high_leverage_risk", "")),

                lineup_strength=str(play.get("lineup_strength", "")),
                lineup_adjustment=str(play.get("lineup_adjustment", "")),

                weather_adjustment=str(play.get("weather_adjustment", "")),
                umpire_adjustment=str(play.get("umpire_adjustment", "")),

                consensus_price=str(play.get("consensus_price", "")),
                market_spread=str(play.get("market_spread", "")),
                market_disagreement=str(play.get("market_disagreement", "")),
                stale_line_opportunity=str(play.get("stale_line_opportunity", "")),
                result="Pending",
                units_result="",
                closing_odds="",
                model_version=str(play.get("model_version", "")),
                injury_status=str(play.get("injury_status", "")),
                injury_adjustment=str(play.get("injury_adjustment", "")),
                injury_score=str(play.get("injury_score", "")),
                missing_players=str(play.get("missing_players", "")),
                questionable_players=str(play.get("questionable_players", "")),
                minutes_restrictions=str(play.get("minutes_restrictions", "")),
                star_player_risk=str(play.get("star_player_risk", "")),
                availability_grade=str(play.get("availability_grade", "")),
                injury_notes=str(play.get("injury_notes", "")),

            )

            db.add(history)

        db.commit()

    except Exception as e:
        db.rollback()
        print("Model history save error:", e)

    finally:
        db.close()

def get_mlb_final_scores(target_date):
    url = "https://statsapi.mlb.com/api/v1/schedule"

    params = {
        "sportId": 1,
        "date": target_date,
        "hydrate": "linescore",
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {}

        data = response.json()
        results = {}

        for date_block in data.get("dates", []):
            for game in date_block.get("games", []):
                status = game.get("status", {}).get("detailedState", "")

                if status != "Final":
                    continue

                away_team = game.get("teams", {}).get("away", {}).get("team", {}).get("name", "")
                home_team = game.get("teams", {}).get("home", {}).get("team", {}).get("name", "")
                away_score = game.get("teams", {}).get("away", {}).get("score", 0)
                home_score = game.get("teams", {}).get("home", {}).get("score", 0)

                linescore = game.get("linescore", {})
                innings = linescore.get("innings", [])

                away_f5 = 0
                home_f5 = 0
                away_1st = 0
                home_1st = 0

                for idx, inning in enumerate(innings[:5]):
                    away_runs = inning.get("away", {}).get("runs", 0) or 0
                    home_runs = inning.get("home", {}).get("runs", 0) or 0

                    away_f5 += away_runs
                    home_f5 += home_runs

                    if idx == 0:
                        away_1st = away_runs
                        home_1st = home_runs

                game_key_1 = f"{away_team} vs {home_team}"
                game_key_2 = f"{home_team} vs {away_team}"

                winner = away_team if away_score > home_score else home_team
                total_runs = away_score + home_score

                f5_winner = None

                if away_f5 > home_f5:
                    f5_winner = away_team
                elif home_f5 > away_f5:
                    f5_winner = home_team
                else:
                    f5_winner = "Tie"

                first_inning_runs = away_1st + home_1st

                results[game_key_1] = {
                    "winner": winner,
                    "away_score": away_score,
                    "home_score": home_score,
                    "total_runs": total_runs,

                    "away_f5": away_f5,
                    "home_f5": home_f5,
                    "f5_total_runs": away_f5 + home_f5,
                    "f5_winner": f5_winner,

                    "away_1st": away_1st,
                    "home_1st": home_1st,
                    "first_inning_runs": first_inning_runs,
                }

                results[game_key_2] = results[game_key_1]

        return results

    except Exception as e:
        print("MLB score fetch error:", e)
        return {}
    

@app.post("/grade/mlb/history")
def grade_mlb_history():
    db = SessionLocal()

    try:
        pending = db.query(ModelPlayHistory).filter(
            ModelPlayHistory.sport == "MLB",
            ModelPlayHistory.result == "Pending",
        ).all()

        if not pending:
            return {"message": "No pending MLB plays found."}

        dates = list(set([p.date for p in pending]))

        final_scores = {}

        for d in dates:
            scores = get_mlb_final_scores(d)
            final_scores.update(scores)

        graded_count = 0

        for play in pending:
            game_data = final_scores.get(play.game)

            if not game_data:
                continue

            winner = game_data.get("winner")
            total_runs = game_data.get("total_runs", 0)

            result = "Pending"

            pick_text = str(play.pick)

            if play.market == "Moneyline":
                result = "Win" if pick_text == winner else "Loss"

            elif play.market == "Run Line":
                try:
                    away_score = game_data.get("away_score", 0)
                    home_score = game_data.get("home_score", 0)

                    parts = pick_text.rsplit(" ", 1)

                    if len(parts) != 2:
                        continue

                    team = parts[0]
                    spread = float(parts[1])

                    if team not in play.game:
                        continue

                    if play.game.startswith(team):
                        team_score = away_score
                        opponent_score = home_score
                    else:
                        team_score = home_score
                        opponent_score = away_score

                    margin = team_score - opponent_score
                    adjusted_margin = margin + spread

                    if adjusted_margin > 0:
                        result = "Win"
                    elif adjusted_margin < 0:
                        result = "Loss"
                    else:
                        result = "Push"

                except Exception:
                    continue

            elif play.market == "Total":
                try:
                    if "Over" in pick_text:
                        target = float(
                            pick_text.replace("Over", "").strip()
                        )

                        if total_runs > target:
                            result = "Win"
                        elif total_runs < target:
                            result = "Loss"
                        else:
                            result = "Push"

                    elif "Under" in pick_text:
                        target = float(
                            pick_text.replace("Under", "").strip()
                        )

                        if total_runs < target:
                            result = "Win"
                        elif total_runs > target:
                            result = "Loss"
                        else:
                            result = "Push"

                except Exception:
                    continue

            elif play.market == "F5 Moneyline":
                f5_winner = game_data.get("f5_winner")

                if f5_winner == "Tie":
                    result = "Push"
                elif pick_text == f5_winner:
                    result = "Win"
                else:
                    result = "Loss"

            elif play.market in ["NRFI/YRFI", ""]:
                first_inning_runs = game_data.get("first_inning_runs", 0)
                recommendation = str(play.recommendation)

                if recommendation == "NRFI":
                    result = "Win" if first_inning_runs == 0 else "Loss"

                elif recommendation == "YRFI":
                    result = "Win" if first_inning_runs > 0 else "Loss"

                else:
                    result = "Pending"

            play.result = result

            try:
                units = float(play.confidence) / 100
            except Exception:
                units = 1

            if result == "Win":
                play.units_result = str(round(units, 2))
            elif result == "Loss":
                play.units_result = str(round(-units, 2))
            elif result == "Push":
                play.units_result = "0"

            graded_count += 1

        db.commit()

        return {
            "graded": graded_count,
            "pending_remaining": db.query(ModelPlayHistory).filter(
                ModelPlayHistory.result == "Pending"
            ).count()
        }

    except Exception as e:
        db.rollback()
        return {"error": str(e)}

    finally:
        db.close()
