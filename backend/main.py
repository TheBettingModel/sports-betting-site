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

# Manual injury adjustments
# Negative = downgrade team
NBA_INJURY_ADJUSTMENTS = {
    "Los Angeles Lakers": -2.0,
    "Boston Celtics": 0.0,
    "Philadelphia 76ers": 0.0,
    "Denver Nuggets": 0.0,
    "Milwaukee Bucks": 0.0,
}

# Manual team strength ratings
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

HOME_COURT_ADVANTAGE = 1.5


def american_to_implied_probability(odds):
    try:
        odds = float(odds)
    except Exception:
        return 0.0

    if odds > 0:
        return round((100 / (odds + 100)) * 100, 2)

    return round((abs(odds) / (abs(odds) + 100)) * 100, 2)


def get_injury_adjustment(team_name):
    return NBA_INJURY_ADJUSTMENTS.get(team_name, 0.0)


def get_team_rating(team_name):
    return NBA_TEAM_RATINGS.get(team_name, 75)


def get_opponent_team(game, team_name):
    away = game.get("away_team")
    home = game.get("home_team")

    if team_name == away:
        return home
    if team_name == home:
        return away

    return None


def get_home_court_adjustment(game, team_name):
    if team_name == game.get("home_team"):
        return HOME_COURT_ADVANTAGE
    if team_name == game.get("away_team"):
        return -HOME_COURT_ADVANTAGE
    return 0.0


def get_price_adjustment(odds):
    try:
        odds = float(odds)
    except Exception:
        return 0.0

    if odds >= 120:
        return 0.6
    elif odds >= 100:
        return 0.4
    elif odds >= -110:
        return 0.2
    elif odds >= -130:
        return 0.0
    elif odds >= -160:
        return -0.3
    else:
        return -0.6


def get_cache(cache_key: str):
    db: Session = SessionLocal()
    try:
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == cache_key).first()
        if not entry or not entry.payload:
            return None
        return json.loads(entry.payload)
    except Exception:
        return None
    finally:
        db.close()


def set_cache(cache_key: str, payload):
    db: Session = SessionLocal()
    try:
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == cache_key).first()
        payload_json = json.dumps(payload)

        if entry:
            entry.payload = payload_json
        else:
            entry = CacheEntry(cache_key=cache_key, payload=payload_json)
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
        raise HTTPException(status_code=500, detail="ODDS_API_KEY is missing")

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
    db: Session = SessionLocal()
    try:
        return db.query(Pick).order_by(Pick.id.desc()).all()
    finally:
        db.close()


@app.post("/save-pick")
def save_pick(data: dict):
    db: Session = SessionLocal()

    try:
        existing = db.query(Pick).filter(
            Pick.game == str(data.get("game", "")),
            Pick.pick == str(data.get("pick", "")),
            Pick.market == str(data.get("market", "")),
            Pick.sportsbook == str(data.get("sportsbook", "")),
            Pick.odds == str(data.get("odds", ""))
        ).first()

        if existing:
            return {
                "duplicate": True,
                "pick": existing.id
            }

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
            result=str(data.get("result", "Pending"))
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {
            "duplicate": False,
            "pick": new_pick.id
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/update-result/{pick_id}")
def update_result(pick_id: int, data: dict):
    db: Session = SessionLocal()
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
    db: Session = SessionLocal()
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
    db: Session = SessionLocal()
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
                    "units_won": p.units
                }
                for p in graded
            ]
        }
    finally:
        db.close()


@app.get("/play-of-the-day")
def get_play_of_the_day():
    db: Session = SessionLocal()
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


@app.get("/model/nba/today")
def model_nba_today():
    if not ODDS_API_KEY:
        cached = get_cache("nba_model_board")
        if cached:
            return {"plays": cached}
        raise HTTPException(status_code=500, detail="ODDS_API_KEY is missing")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code != 200:
        cached = get_cache("nba_model_board")
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
                key = market.get("key")

                for outcome in market.get("outcomes", []):
                    odds = outcome.get("price")
                    if odds is None:
                        continue

                    implied = american_to_implied_probability(odds)
                    model_prob = implied
                    market_name = key
                    pick_name = outcome.get("name")
                    reason = "Base model assessment"
                    injury_note = ""

                    if key == "h2h":
                        if implied >= 80:
                            model_prob = implied - 0.5
                            reason = "Heavy favorite looks more efficiently priced."
                        elif implied >= 70:
                            model_prob = implied + 0.2
                            reason = "Strong favorite with limited extra value."
                        elif implied >= 60:
                            model_prob = implied + 1.0
                            reason = "Moderate favorite with small pricing edge."
                        elif implied >= 52:
                            model_prob = implied + 1.8
                            reason = "Favorite in a competitive range with some value."
                        elif implied >= 48:
                            model_prob = implied + 2.5
                            reason = "Near coin-flip moneyline spot with pricing value."
                        elif implied >= 40:
                            model_prob = implied + 2.0
                            reason = "Live underdog range with upset potential."
                        else:
                            model_prob = implied + 0.5
                            reason = "Large underdog with limited pricing value."

                        team_name = outcome.get("name")
                        opponent_name = get_opponent_team(game, team_name)

                        team_rating = get_team_rating(team_name)
                        opponent_rating = get_team_rating(opponent_name)
                        rating_gap = team_rating - opponent_rating
                        rating_adjustment = rating_gap * 0.10

                        home_court_adjustment = get_home_court_adjustment(game, team_name)
                        injury_adjustment = get_injury_adjustment(team_name)
                        price_adjustment = get_price_adjustment(odds)

                        model_prob = (
                            model_prob
                            + rating_adjustment
                            + home_court_adjustment
                            + injury_adjustment
                            + price_adjustment
                        )

                        if abs(rating_adjustment) > 0:
                            reason += f" Team rating gap adjustment ({rating_adjustment:+.1f})."
                        if home_court_adjustment != 0:
                            reason += f" Home court adjustment ({home_court_adjustment:+.1f})."
                        if price_adjustment != 0:
                            reason += f" Price adjustment ({price_adjustment:+.1f})."
                        if injury_adjustment != 0:
                            injury_note = f" Injury adjustment applied ({injury_adjustment:+})."

                        market_name = "Moneyline"
                        pick_name = team_name

                    elif key == "spreads":
                        point = outcome.get("point")
                        if point is None:
                            continue

                        spread = float(point)
                        abs_spread = abs(spread)

                        if abs_spread <= 3:
                            base = 2.8
                            reason = "Short spread creates stronger cover value."
                        elif abs_spread <= 6:
                            base = 2.0
                            reason = "Mid-range spread offers moderate cover value."
                        elif abs_spread <= 9:
                            base = 1.3
                            reason = "Larger spread lowers confidence in margin."
                        else:
                            base = 0.7
                            reason = "Big spread is harder to trust for a cover."

                        model_prob = implied + base + (0.4 if spread > 0 else 0)

                        if spread > 0:
                            reason += " Underdog points add extra protection."

                        team_name = outcome.get("name")
                        opponent_name = get_opponent_team(game, team_name)

                        team_rating = get_team_rating(team_name)
                        opponent_rating = get_team_rating(opponent_name)
                        rating_gap = team_rating - opponent_rating
                        rating_adjustment = rating_gap * 0.08

                        home_court_adjustment = get_home_court_adjustment(game, team_name) * 0.6
                        injury_adjustment = get_injury_adjustment(team_name)
                        price_adjustment = get_price_adjustment(odds)

                        model_prob = (
                            model_prob
                            + rating_adjustment
                            + home_court_adjustment
                            + injury_adjustment
                            + price_adjustment
                        )

                        if abs(rating_adjustment) > 0:
                            reason += f" Team rating gap adjustment ({rating_adjustment:+.1f})."
                        if home_court_adjustment != 0:
                            reason += f" Home court adjustment ({home_court_adjustment:+.1f})."
                        if price_adjustment != 0:
                            reason += f" Price adjustment ({price_adjustment:+.1f})."
                        if injury_adjustment != 0:
                            injury_note = f" Injury adjustment applied ({injury_adjustment:+})."

                        market_name = "Spread"
                        pick_name = f"{team_name} {spread:+}"

                    elif key == "totals":
                        point = outcome.get("point")
                        side = outcome.get("name")

                        if point is None or side is None:
                            continue

                        total = float(point)
                        diff = total - 228

                        if abs(diff) <= 3:
                            adjustment = diff * 0.20
                            reason = "Total is near baseline, so edge stays smaller."
                        elif abs(diff) <= 7:
                            adjustment = diff * 0.30
                            reason = "Total is off baseline enough to create moderate value."
                        else:
                            adjustment = diff * 0.40
                            reason = "Extreme total creates stronger pricing opportunity."

                        if side == "Over":
                            model_prob = 50 - adjustment
                            reason += " Over gets stronger when the posted total is lower."
                        else:
                            model_prob = 50 + adjustment
                            reason += " Under gets stronger when the posted total is higher."

                        home_team = game.get("home_team")
                        home_team_rating = get_team_rating(home_team)
                        home_total_adjustment = (home_team_rating - 75) * 0.03

                        if side == "Over":
                            model_prob = model_prob + home_total_adjustment
                        else:
                            model_prob = model_prob - home_total_adjustment

                        if home_total_adjustment != 0:
                            reason += f" Home team total adjustment ({home_total_adjustment:+.1f})."

                        price_adjustment = get_price_adjustment(odds) * 0.5
                        model_prob = model_prob + price_adjustment

                        if price_adjustment != 0:
                            reason += f" Price adjustment ({price_adjustment:+.1f})."

                        model_prob = max(43, min(57, model_prob))

                        market_name = "Total"
                        pick_name = f"{side} {point}"

                    else:
                        continue

                    edge = round(model_prob - implied, 2)

                    if edge >= 4:
                        rec = "Play"
                    elif edge >= 2:
                        rec = "Lean"
                    else:
                        rec = "Pass"

                    if edge >= 5:
                        confidence = 90
                    elif edge >= 4:
                        confidence = 84
                    elif edge >= 3:
                        confidence = 78
                    elif edge >= 2:
                        confidence = 72
                    elif edge >= 1:
                        confidence = 64
                    else:
                        confidence = 58

                    plays.append({
                        "game": game_name,
                        "sportsbook": sportsbook,
                        "market": market_name,
                        "pick": pick_name,
                        "odds": odds,
                        "implied_probability": implied,
                        "model_probability": round(model_prob, 2),
                        "edge": edge,
                        "confidence": confidence,
                        "recommendation": rec,
                        "units": 1,
                        "reason": f"{reason}{injury_note}".strip()
                    })

    best = {}
    for play in plays:
        dedupe_key = f"{play['game']}__{play['market']}__{play['pick']}"
        if dedupe_key not in best or play["edge"] > best[dedupe_key]["edge"]:
            best[dedupe_key] = play

    final = list(best.values())
    final.sort(key=lambda x: x["edge"], reverse=True)

    set_cache("nba_model_board", final)

    return {"plays": final}
