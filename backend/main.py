from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os
import requests

from database import SessionLocal, engine
from models import Base, Pick

ODDS_BASE_URL = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"
LAST_GOOD_NBA_ODDS = []
LAST_GOOD_MODEL_PLAYS = []


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


@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/get-nba-odds")
def get_nba_odds():
    global LAST_GOOD_NBA_ODDS

    if not ODDS_API_KEY:
        if LAST_GOOD_NBA_ODDS:
            return LAST_GOOD_NBA_ODDS
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
        LAST_GOOD_NBA_ODDS = data
        return data

    if LAST_GOOD_NBA_ODDS:
        return LAST_GOOD_NBA_ODDS

    raise HTTPException(status_code=response.status_code, detail=response.text)



@app.get("/picks")
@app.get("/saved-picks")
def get_picks():
    db: Session = SessionLocal()
    try:
        return db.query(Pick).order_by(Pick.id.desc()).all()
    finally:
        db.close()


@app.post("/save-pick")
def save_pick(data: dict):
    db: Session = SessionLocal()

    try:
        units = data.get("units") or data.get("stake")

        new_pick = Pick(
            game=str(data.get("game", "")),
            pick=str(data.get("pick", "")),
            market=str(data.get("market", "")),
            sportsbook=str(data.get("sportsbook", "")),
            odds=str(data.get("odds", "")),
            confidence=str(data.get("confidence", "")),
            units=str(units or ""),
            model_probability=str(data.get("model_probability", "")),
            implied_probability=str(data.get("implied_probability", "")),
            edge=str(data.get("edge", "")),
            result=str(data.get("result", "Pending"))
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {"message": "Pick saved", "pick": new_pick.id}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

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
                return float(p.edge)
            except:
                return 0.0

        best = sorted(pending, key=edge_val, reverse=True)[0]

        return {"play_of_the_day": best}

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
        db.refresh(pick)

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
    global LAST_GOOD_MODEL_PLAYS

    if not ODDS_API_KEY:
        if LAST_GOOD_MODEL_PLAYS:
            return {"plays": LAST_GOOD_MODEL_PLAYS}
        raise HTTPException(status_code=500, detail="ODDS_API_KEY is missing")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code != 200:
        if LAST_GOOD_MODEL_PLAYS:
            return {"plays": LAST_GOOD_MODEL_PLAYS}
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

                    if key == "h2h":
                        if implied >= 80:
                            model_prob = implied + 0.3
                        elif implied >= 70:
                            model_prob = implied + 0.8
                        elif implied >= 60:
                            model_prob = implied + 1.4
                        elif implied >= 50:
                            model_prob = implied + 2.2
                        elif implied >= 40:
                            model_prob = implied + 2.8
                        elif implied >= 30:
                            model_prob = implied + 1.6
                        else:
                            model_prob = implied + 0.8

                        market_name = "Moneyline"
                        pick_name = outcome.get("name")

                    elif key == "spreads":
                        point = outcome.get("point")
                        if point is None:
                            continue

                        abs_spread = abs(float(point))

                        if abs_spread <= 2.5:
                            model_prob = implied + 3.0
                        elif abs_spread <= 5.5:
                            model_prob = implied + 2.2
                        elif abs_spread <= 8.5:
                            model_prob = implied + 1.5
                        elif abs_spread <= 11.5:
                            model_prob = implied + 1.0
                        else:
                            model_prob = implied + 0.5

                        market_name = "Spread"
                        pick_name = f"{outcome.get('name')} {'+' if point > 0 else ''}{point}"

                    elif key == "totals":
                        point = outcome.get("point")
                        side = outcome.get("name")

                        if point is None or side is None:
                            continue

                        baseline_total = 228
                        diff = float(point) - baseline_total

                        if side == "Over":
                            model_prob = 50 - (diff * 0.35)
                        elif side == "Under":
                            model_prob = 50 + (diff * 0.35)
                        else:
                            model_prob = 50

                        model_prob = max(44, min(56, model_prob))

                        market_name = "Total"
                        pick_name = f"{side} {point}"

                    else:
                        continue

                    edge = round(model_prob - implied, 2)

                    if edge >= 3:
                        rec = "Play"
                    elif edge >= 1:
                        rec = "Lean"
                    else:
                        rec = "Pass"

                    confidence = min(95, max(50, round(52 + (edge * 4), 1)))

                    if edge >= 4:
                        units = 2
                    elif edge >= 2:
                        units = 1.5
                    else:
                        units = 1

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
                        "recommendation": rec,
                        "units": units
                    })

    plays.sort(key=lambda x: x["edge"], reverse=True)
    LAST_GOOD_MODEL_PLAYS = plays

    return {"plays": plays}
