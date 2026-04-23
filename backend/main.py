from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os
import requests
import json

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


def american_to_implied_probability(odds):
    try:
        odds = float(odds)
    except:
        return 0.0

    if odds > 0:
        return round((100 / (odds + 100)) * 100, 2)
    return round((abs(odds) / (abs(odds) + 100)) * 100, 2)


def get_cache(cache_key: str):
    db: Session = SessionLocal()
    try:
        entry = db.query(CacheEntry).filter(CacheEntry.cache_key == cache_key).first()
        if not entry or not entry.payload:
            return None
        return json.loads(entry.payload)
    except:
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
            return {"duplicate": True, "pick": existing.id}

        new_pick = Pick(
            game=str(data.get("game", "")),
            pick=str(data.get("pick", "")),
            market=str(data.get("market", "")),
            sportsbook=str(data.get("sportsbook", "")),
            odds=str(data.get("odds", "")),
            confidence=str(data.get("confidence", "")),
            units=str(data.get("units", "")),
            model_probability=str(data.get("model_probability", "")),
            implied_probability=str(data.get("implied_probability", "")),
            edge=str(data.get("edge", "")),
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
    db: Session = SessionLocal()
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

                    # MONEYLINE
                    if key == "h2h":
                        if implied >= 80:
                            model_prob = implied - 0.5
                        elif implied >= 70:
                            model_prob = implied + 0.2
                        elif implied >= 60:
                            model_prob = implied + 1.0
                        elif implied >= 52:
                            model_prob = implied + 1.8
                        elif implied >= 48:
                            model_prob = implied + 2.5
                        elif implied >= 40:
                            model_prob = implied + 2.0
                        else:
                            model_prob = implied + 0.5

                        market_name = "Moneyline"

                    # SPREAD
                    elif key == "spreads":
                        point = outcome.get("point")
                        if point is None:
                            continue

                        spread = float(point)
                        abs_spread = abs(spread)

                        if abs_spread <= 3:
                            base = 2.8
                        elif abs_spread <= 6:
                            base = 2.0
                        elif abs_spread <= 9:
                            base = 1.3
                        else:
                            base = 0.7

                        model_prob = implied + base + (0.4 if spread > 0 else 0)
                        market_name = "Spread"
                        pick_name = f"{outcome.get('name')} {spread:+}"

                    # TOTALS
                    elif key == "totals":
                        point = outcome.get("point")
                        side = outcome.get("name")
                        if point is None:
                            continue

                        total = float(point)
                        diff = total - 228

                        adjustment = diff * (0.25 if abs(diff) <= 5 else 0.4)

                        model_prob = 50 - adjustment if side == "Over" else 50 + adjustment
                        model_prob = max(43, min(57, model_prob))

                        market_name = "Total"
                        pick_name = f"{side} {point}"

                    else:
                        continue

                    edge = round(model_prob - implied, 2)

                    # TIGHTER LOGIC
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
                        "units": 1
                    })

    # DEDUPE
    best = {}
    for p in plays:
        key = f"{p['game']}__{p['market']}__{p['pick']}"
        if key not in best or p["edge"] > best[key]["edge"]:
            best[key] = p

    final = sorted(best.values(), key=lambda x: x["edge"], reverse=True)

    set_cache("nba_model_board", final)

    return {"plays": final}
