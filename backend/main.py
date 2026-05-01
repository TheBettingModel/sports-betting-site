from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os
import json
import requests

from database import SessionLocal, engine
from models import Base, Pick, CacheEntry

load_dotenv()

app = FastAPI()
Base.metadata.create_all(bind=engine)

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


# ---------------- HELPERS ---------------- #

def american_to_implied_probability(odds):
    try:
        odds = float(odds)
    except:
        return 0.0

    if odds > 0:
        return round((100 / (odds + 100)) * 100, 2)

    return round((abs(odds) / (abs(odds) + 100)) * 100, 2)


def calibrate_model_probability(prob):
    try:
        prob = float(prob)
    except:
        return prob

    if prob >= 65:
        return prob - 2.0
    elif prob >= 60:
        return prob - 1.5
    elif prob >= 55:
        return prob - 1.0
    else:
        return prob


def get_dynamic_units(edge, confidence, recommendation):
    try:
        edge = float(edge)
        confidence = float(confidence)
    except:
        return 0.5

    if recommendation == "Pass":
        return 0.5

    if edge >= 8 and confidence >= 90:
        return 3
    elif edge >= 6 and confidence >= 85:
        return 2
    elif edge >= 4 and confidence >= 75:
        return 1.5
    elif edge >= 2 and confidence >= 60:
        return 1
    else:
        return 0.5


def get_injury_adjustment(team):
    return NBA_INJURY_ADJUSTMENTS.get(team, 0.0)


def get_team_rating(team):
    return NBA_TEAM_RATINGS.get(team, 75)


def get_opponent_team(game, team):
    if team == game.get("home_team"):
        return game.get("away_team")
    return game.get("home_team")


def get_home_court_adjustment(game, team):
    if team == game.get("home_team"):
        return HOME_COURT_ADVANTAGE
    elif team == game.get("away_team"):
        return -HOME_COURT_ADVANTAGE
    return 0


def get_price_adjustment(odds):
    try:
        odds = float(odds)
    except:
        return 0

    if odds >= 120:
        return 0.6
    elif odds >= 100:
        return 0.4
    elif odds >= -110:
        return 0.2
    elif odds >= -130:
        return 0
    elif odds >= -160:
        return -0.3
    else:
        return -0.6


def get_cache(key):
    db = SessionLocal()
    try:
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == key).first()
        if not entry:
            return None
        return json.loads(entry.payload)
    except:
        return None
    finally:
        db.close()


def set_cache(key, payload):
    db = SessionLocal()
    try:
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == key).first()

        if entry:
            entry.payload = json.dumps(payload)
        else:
            db.add(
                CacheEntry(
                    cache_key=key,
                    payload=json.dumps(payload)
                )
            )

        db.commit()
    finally:
        db.close()


# ---------------- ROUTES ---------------- #

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
        "oddsFormat": "american"
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
            Pick.game == str(data.get("game")),
            Pick.pick == str(data.get("pick")),
            Pick.market == str(data.get("market")),
            Pick.odds == str(data.get("odds"))
        ).first()

        if existing:
            return {"duplicate": True, "pick": existing.id}

        new_pick = Pick(
            game=str(data.get("game")),
            pick=str(data.get("pick")),
            market=str(data.get("market")),
            sportsbook=str(data.get("sportsbook")),
            odds=str(data.get("odds")),
            confidence=str(data.get("confidence")),
            units=str(data.get("units")),
            model_probability=str(data.get("model_probability")),
            implied_probability=str(data.get("implied_probability")),
            edge=str(data.get("edge")),
            result="Pending"
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {"duplicate": False, "pick": new_pick.id}

    finally:
        db.close()


@app.put("/update-result/{pick_id}")
def update_result(pick_id: int, data: dict):
    db = SessionLocal()

    try:
        pick = db.query(Pick).filter(Pick.id == pick_id).first()

        if not pick:
            raise HTTPException(status_code=404, detail="Pick not found")

        pick.result = data.get("result")
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


@app.get("/model/performance")
def model_performance():
    db = SessionLocal()

    try:
        picks = db.query(Pick).all()

        graded = [
            p for p in picks
            if p.result in ["Win", "Loss"] and p.model_probability
        ]

        if not graded:
            return {}

        buckets = {
            "50-55": [],
            "55-60": [],
            "60-65": [],
            "65-70": [],
            "70+": []
        }

        for p in graded:
            try:
                prob = float(p.model_probability)
            except:
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

        for bucket, picks in buckets.items():
            if not picks:
                continue

            wins = len([p for p in picks if p.result == "Win"])
            total = len(picks)

            results[bucket] = {
                "plays": total,
                "win_rate": round((wins / total) * 100, 2)
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
        "oddsFormat": "american"
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
        game_name = f"{game['away_team']} vs {game['home_team']}"

        for bookmaker in game.get("bookmakers", []):
            sportsbook = bookmaker.get("title")

            for market in bookmaker.get("markets", []):
                market_key = market.get("key")

                for outcome in market.get("outcomes", []):
                    odds = outcome.get("price")
                    if odds is None:
                        continue

                    implied = american_to_implied_probability(odds)
                    model_prob = implied
                    pick_name = outcome.get("name")
                    reason = ""

                    team_name = outcome.get("name")
                    opponent = get_opponent_team(game, team_name)

                    rating_gap = (
                        get_team_rating(team_name)
                        - get_team_rating(opponent)
                    )

                    rating_adj = rating_gap * 0.1
                    home_adj = get_home_court_adjustment(game, team_name)
                    injury_adj = get_injury_adjustment(team_name)
                    price_adj = get_price_adjustment(odds)

                    model_prob += rating_adj
                    model_prob += home_adj
                    model_prob += injury_adj
                    model_prob += price_adj

                    reason += f"Team rating adjustment ({round(rating_adj,1)}). "
                    reason += f"Home court ({round(home_adj,1)}). "
                    reason += f"Price adjustment ({round(price_adj,1)}). "

                    original_prob = model_prob
                    model_prob = calibrate_model_probability(model_prob)

                    if original_prob != model_prob:
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

                    unit_size = get_dynamic_units(
                        edge,
                        confidence,
                        recommendation
                    )

                    reason += f"Recommended unit size: {unit_size}u."

                    plays.append({
                        "game": game_name,
                        "sportsbook": sportsbook,
                        "market": market_key,
                        "pick": pick_name,
                        "odds": odds,
                        "implied_probability": implied,
                        "model_probability": round(model_prob, 2),
                        "edge": edge,
                        "confidence": confidence,
                        "recommendation": recommendation,
                        "units": unit_size,
                        "reason": reason
                    })

    best = {}

best = {}

for play in plays:
    key = f"{play['game']}__{play['market']}__{play['pick']}"

    if key not in best or play["edge"] > best[key]["edge"]:
        best[key] = play

    final = list(best.values())
    final.sort(key=lambda x: x["edge"], reverse=True)

    set_cache("nba_model", final)

    return {"plays": final}
