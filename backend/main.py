from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from dotenv import load_dotenv
import os
import json
import requests
from datetime import date


from database import SessionLocal, engine
from models import Base, Pick, CacheEntry

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
    if not ODDS_API_KEY:
        cached = get_cache("nba_odds")
        if cached:
            return cached
        raise HTTPException(status_code=500, detail="Missing API key")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code == 200:
        data = response.json()
        set_cache("nba_odds", data)
        return data

    cached = get_cache("nba_odds")
    if cached:
        return cached

    raise HTTPException(status_code=response.status_code, detail=response.text)


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
    if not ODDS_API_KEY:
        cached = get_cache("nba_model")
        if cached:
            return {"plays": cached}
        raise HTTPException(status_code=500, detail="Missing API key")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code != 200:
        cached = get_cache("nba_model")
        if cached:
            return {"plays": cached}
        raise HTTPException(status_code=response.status_code, detail=response.text)

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

                        model_prob = (
                            implied
                            + base_adj
                            + rating_adj
                            + home_adj
                            + injury_adj
                            + price_adj
                        )

                        reason += f"Team rating adjustment ({round(rating_adj, 1)}). "
                        reason += f"Home court ({round(home_adj, 1)}). "
                        reason += f"Price adjustment ({round(price_adj, 1)}). "

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

                        model_prob = max(43, min(57, model_prob))

                        market_name = "Total"
                        pick_name = f"{side} {point}"

                        reason += f"Home team total adjustment ({round(home_total_adj, 1)}). "
                        reason += f"Price adjustment ({round(price_adj, 1)}). "

                    else:
                        continue

                    original_prob = model_prob
                    model_prob = calibrate_model_probability(model_prob)

                    if round(original_prob, 2) != round(model_prob, 2):
                        reason += "Calibration applied. "

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

                    unit_size = get_dynamic_units(edge, confidence, recommendation)
                    reason += f"Recommended unit size: {unit_size}u."

                    plays.append(
                        {
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "market": market_name,
                            "pick": pick_name,
                            "odds": odds,
                            "implied_probability": implied,
                            "model_probability": round(model_prob, 2),
                            "edge": edge,
                            "confidence": confidence,
                            "recommendation": recommendation,
                            "units": unit_size,
                            "reason": reason.strip(),
                        }
                    )

    best = {}

    for play in plays:
        key = f"{play['game']}__{play['market']}"

        if key not in best or play["edge"] > best[key]["edge"]:
            best[key] = play

    final = list(best.values())
    final.sort(
        key=lambda x: (
            x["recommendation"] == "Play",
            x["edge"],
        ),
        reverse=True,
    )

    set_cache("nba_model", final)

    return {"plays": final}


@app.get("/model/mlb/today")
def model_mlb_today():
    cached = get_cache("mlb_model")
    if cached:
        return {"plays": cached}

    odds_api_key = os.getenv("ODDS_API_KEY")

    if not odds_api_key:
        return {"plays": []}

    url = f"https://api.the-odds-api.com/v4/sports/baseball_mlb/odds"

    params = {
        "apiKey": odds_api_key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american"
    }

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code != 200:
            return {"plays": []}

        games = response.json()
        plays = []

        probable_pitchers = get_mlb_probable_pitchers()

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

                        market_name = ""
                        pick_name = ""
                        reason = ""
                        model_prob = implied

                        # MONEYLINE
                        if market_key == "h2h":
                            base_adj = 0.3

                            if odds >= 120:
                                base_adj = 0.6
                                reason = "Underdog range with upset potential. "
                            elif odds <= -180:
                                base_adj = -0.8
                                reason = "Heavy MLB favorite is priced more efficiently. "
                            else:
                                reason = "Competitive moneyline range creates value opportunity. "

                            pitcher_adj = get_mlb_pitcher_adjustment(game, outcome.get("name"))
                            bullpen_adj = get_mlb_bullpen_adjustment(game, outcome.get("name"))
                            price_adj = get_price_adjustment(odds)

                            model_prob = implied + base_adj + pitcher_adj + bullpen_adj + price_adj

                            team_pitcher = get_mlb_pitcher_data(outcome.get("name"))

                            starter_data = probable_pitchers.get(
                                outcome.get("name"),
                                team_pitcher
                            )

                            starter_name = starter_data.get("pitcher")

                            reason += f"Starting pitcher: {starter_name}. "
                            reason += f"Pitcher adjustment ({pitcher_adj}). "

                            team_bullpen = get_mlb_bullpen_data(outcome.get("name"))
                            reason += f"Bullpen status: {team_bullpen.get('status')}. "
                            reason += f"Bullpen adjustment ({bullpen_adj}). "
                            reason += f"Price adjustment ({round(price_adj,1)}). "

                            market_name = "Moneyline"
                            pick_name = outcome.get("name")

                        # RUN LINE
                        elif market_key == "spreads":
                            point = outcome.get("point")

                            if point is None:
                                continue

                            runline = float(point)

                            if abs(runline) > 2.5:
                                continue

                            base_adj = 1.5
                            reason = "Standard MLB run line with moderate value. "

                            if runline > 0:
                                base_adj += 0.5
                                reason += "Taking runs adds protection. "

                            pitcher_adj = get_mlb_pitcher_adjustment(game, outcome.get("name"))
                            bullpen_adj = get_mlb_bullpen_adjustment(game, outcome.get("name"))
                            price_adj = get_price_adjustment(odds)

                            model_prob = implied + base_adj + pitcher_adj + bullpen_adj + price_adj

                            team_pitcher = get_mlb_pitcher_data(outcome.get("name"))

                            starter_data = probable_pitchers.get(
                                outcome.get("name"),
                                team_pitcher
                            )

                            starter_name = starter_data.get("pitcher")
                            )

                            reason += f"Starting pitcher: {starter_name}. "
                            reason += f"(ERA {starter_data.get('era')}, WHIP {starter_data.get('whip')}, Rating {starter_data.get('rating')}). "
                            reason += f"Pitcher adjustment ({pitcher_adj}). "

                            team_bullpen = get_mlb_bullpen_data(outcome.get("name"))
                            reason += f"Bullpen status: {team_bullpen.get('status')}. "
                            reason += f"Bullpen adjustment ({bullpen_adj}). "
                            reason += f"Price adjustment ({round(price_adj,1)}). "

                            market_name = "Run Line"
                            pick_name = f"{outcome.get('name')} {runline:+}"

                        # TOTALS
                        elif market_key == "totals":
                            point = outcome.get("point")
                            side = outcome.get("name")

                            if point is None:
                                continue

                            total = float(point)

                            # Remove weird alt totals
                            if total < 7 or total > 11:
                                continue

                            baseline_total = 8.5
                            diff = total - baseline_total

                            if abs(diff) <= 0.5:
                                total_adj = diff * 0.5
                                reason = "Total is near MLB baseline. "
                            else:
                                total_adj = diff * 0.8
                                reason = "Total moved away from baseline. "

                            if side == "Over":
                                model_prob += abs(total_adj)
                            else:
                                model_prob -= abs(total_adj)

                            bullpen_total_adj = get_mlb_total_bullpen_adjustment(game)

                            if side == "Over":
                                model_prob += bullpen_total_adj
                            else:
                                model_prob -= bullpen_total_adj

                            price_adj = get_price_adjustment(odds) * 0.5
                            model_prob += price_adj

                            reason += f"Bullpen total adjustment ({bullpen_total_adj}). "
                            reason += f"Price adjustment ({round(price_adj,1)}). "

                            market_name = "Total"
                            pick_name = f"{side} {total}"

                        else:
                            continue

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

                        unit_size = get_dynamic_units(edge, confidence, recommendation)



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
                            "model_version": "mlb_auto_starters_v2",

                            "starting_pitcher": probable_pitchers.get(
                                outcome.get("name"),
                                get_mlb_pitcher_data(outcome.get("name"))
                            ).get("pitcher"),

                            "pitcher_era": probable_pitchers.get(
                                outcome.get("name"),
                                get_mlb_pitcher_data(outcome.get("name"))
                            ).get("era"),

                            "pitcher_whip": probable_pitchers.get(
                                outcome.get("name"),
                                get_mlb_pitcher_data(outcome.get("name"))
                            ).get("whip"),

                            "pitcher_rating": probable_pitchers.get(
                                outcome.get("name"),
                                get_mlb_pitcher_data(outcome.get("name"))
                            ).get("rating"),

                            "bullpen_fatigue": get_mlb_bullpen_data(
                                outcome.get("name")
                            ).get("fatigue"),

                            "bullpen_era": get_mlb_bullpen_data(
                                outcome.get("name")
                            ).get("bullpen_era"),

                            "bullpen_status": get_mlb_bullpen_data(
                                outcome.get("name")
                            ).get("status"),

                            "reason": reason.strip()
                        })

        final = sorted(
            plays,
            key=lambda x: x["edge"],
            reverse=True
        )[:40]

        return {"plays": final}

    except Exception as e:
        print("MLB model error:", str(e))
        return {"plays": []}